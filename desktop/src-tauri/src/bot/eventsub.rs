// Twitch EventSub WebSocket client — ONE session, subscribed to the UNION of
// every enabled module's declared `twitch_events` (plus the built-in
// channel-point redemption feature), rather than one connection/subscription
// per consumer. Two modules both wanting "channel.follow" cost exactly one
// Helix subscription between them; events get fanned out to every module
// that asked for that type (see `ModuleState::find_twitch_event_handlers`).
//
// Protocol notes (Twitch EventSub WebSocket, not the old webhook transport):
//   1. Connect to wss://eventsub.wss.twitch.tv/ws
//   2. First frame is always a "session_welcome" carrying payload.session.id.
//   3. Within ~10s, create each subscription via Helix POST /eventsub/subscriptions
//      with transport {method: "websocket", session_id}. Until that call succeeds,
//      no notifications will arrive for that type.
//   4. "session_keepalive" frames arrive periodically — no action needed, they just
//      prove the connection is alive.
//   5. "notification" frames carry the actual event under payload.event, with
//      payload.subscription.type identifying which subscription it's for.
//   6. "session_reconnect" carries a payload.session.reconnect_url — a graceful
//      migration Twitch asks for occasionally; this client just does a fresh
//      reconnect via the normal retry loop rather than the two-connection handoff
//      dance (simpler, and the resulting few-second gap is not meaningful here).
//   7. On any disconnect/error, retry with backoff.
//   8. Every RESYNC_INTERVAL, re-check which event types are actually wanted
//      (modules can be installed/enabled/disabled while the session is up) —
//      subscribe to newly-wanted types on the SAME session (no reconnect
//      needed to add a subscription) and unsubscribe types nothing wants
//      anymore, rather than only ever computing the set once at connect time.
//
// This has not been exercised against live Twitch traffic in this environment
// (no network access during development) — verify on first real run. Per-type
// EventSub versions/conditions are filled in from Twitch's public docs for the
// common cases (see `subscription_spec`); an event type needing a condition
// shape not covered there will fail to subscribe (logged, non-fatal) rather
// than guess wrong.

use crate::bot::dev::DevLogger;
use crate::bot::twitch_api::TwitchApiClient;
use crate::modules::ModuleState;
use anyhow::{anyhow, Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, watch};
use tokio_tungstenite::tungstenite::Message;
use tracing::{info, warn};

const EVENTSUB_WS_URL: &str = "wss://eventsub.wss.twitch.tv/ws";
const REDEMPTION_EVENT_TYPE: &str = "channel.channel_points_custom_reward_redemption.add";
const RESYNC_INTERVAL: Duration = Duration::from_secs(60);

/// Fired for every EventSub notification, regardless of type — modules
/// declare which `event_type`s they want via manifest `twitch_events` and
/// get the raw event body back to interpret themselves (see
/// `bot::twitch_events_handler`).
#[derive(Debug, Clone, serde::Serialize)]
pub struct TwitchEventSubEvent {
    pub event_type: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RedemptionEvent {
    pub redemption_id: String,
    pub reward_id:     String,
    pub reward_title:  String,
    pub reward_cost:   i64,
    pub user_id:       String,
    pub user_login:    String,
    pub user_input:    String,
}

#[derive(Deserialize)]
struct Envelope {
    metadata: Metadata,
    payload:  serde_json::Value,
}

#[derive(Deserialize)]
struct Metadata {
    message_type: String,
}

#[derive(Deserialize)]
struct WelcomePayload {
    session: SessionInfo,
}

#[derive(Deserialize)]
struct SessionInfo {
    id: String,
}

#[derive(Deserialize)]
struct NotificationPayload {
    subscription: NotificationSubscription,
    event: serde_json::Value,
}

#[derive(Deserialize)]
struct NotificationSubscription {
    #[serde(rename = "type")]
    event_type: String,
}

#[derive(Deserialize)]
struct RawRedemptionEvent {
    id:          String,
    user_id:     String,
    user_login:  String,
    #[serde(default)]
    user_input:  String,
    reward:      RawReward,
}

#[derive(Deserialize)]
struct RawReward {
    id:    String,
    title: String,
    cost:  i64,
}

/// (version, condition-builder) for event types worth knowing a non-default
/// shape for. Anything not listed here falls back to the common
/// `{"broadcaster_user_id": ...}` / version "1" shape, which covers most
/// channel.* events — only the exceptions need an entry.
fn subscription_spec(event_type: &str, broadcaster_id: &str, moderator_id: &str) -> (&'static str, serde_json::Value) {
    match event_type {
        // Follow requires v2 and a moderator id (the acting account must be
        // a moderator of the channel, or the broadcaster itself) — a known
        // exception to the plain broadcaster-only condition shape.
        "channel.follow" => (
            "2",
            serde_json::json!({ "broadcaster_user_id": broadcaster_id, "moderator_user_id": moderator_id }),
        ),
        "channel.raid" => (
            "1",
            serde_json::json!({ "to_broadcaster_user_id": broadcaster_id }),
        ),
        _ => (
            "1",
            serde_json::json!({ "broadcaster_user_id": broadcaster_id }),
        ),
    }
}

/// Runs the EventSub connection loop until `shutdown` fires. Reconnects with
/// backoff on any error. Redemptions are always subscribed (the app's own
/// built-in feature); everything else comes from `modules`' declared wants.
pub async fn run(
    api: TwitchApiClient,
    broadcaster_id: String,
    moderator_id: String,
    redemption_tx: broadcast::Sender<RedemptionEvent>,
    event_tx: broadcast::Sender<TwitchEventSubEvent>,
    modules: Arc<ModuleState>,
    dev: Arc<DevLogger>,
    mut shutdown: watch::Receiver<bool>,
) {
    let mut backoff = Duration::from_secs(2);
    const MAX_BACKOFF: Duration = Duration::from_secs(60);

    loop {
        if *shutdown.borrow() { return; }

        match connect_and_listen(&api, &broadcaster_id, &moderator_id, &redemption_tx, &event_tx, &modules, &dev, &mut shutdown).await {
            Ok(()) => {
                // Clean shutdown requested mid-listen.
                if *shutdown.borrow() { return; }
                backoff = Duration::from_secs(2);
            }
            Err(e) => {
                warn!("Twitch EventSub connection error (will retry): {e}");
                dev.log(format!("! EventSub error: {e} — retrying in {}s", backoff.as_secs()));
            }
        }

        tokio::select! {
            _ = tokio::time::sleep(backoff) => {}
            _ = shutdown.changed() => { if *shutdown.borrow() { return; } }
        }
        backoff = (backoff * 2).min(MAX_BACKOFF);
    }
}

async fn desired_types(modules: &Arc<ModuleState>) -> HashSet<String> {
    let mut set = modules.desired_twitch_event_types().await;
    set.insert(REDEMPTION_EVENT_TYPE.to_string());
    set
}

async fn subscribe_one(
    api: &TwitchApiClient,
    broadcaster_id: &str,
    moderator_id: &str,
    session_id: &str,
    event_type: &str,
    dev: &Arc<DevLogger>,
) -> Option<String> {
    let (version, condition) = subscription_spec(event_type, broadcaster_id, moderator_id);
    match api.create_eventsub_subscription(event_type, version, condition, session_id).await {
        Ok(id) => {
            dev.log(format!("EventSub: subscribed to '{event_type}'"));
            Some(id)
        }
        Err(e) => {
            warn!("EventSub: failed to subscribe to '{event_type}': {e}");
            dev.log(format!("! EventSub: couldn't subscribe to '{event_type}': {e}"));
            None
        }
    }
}

async fn connect_and_listen(
    api: &TwitchApiClient,
    broadcaster_id: &str,
    moderator_id: &str,
    redemption_tx: &broadcast::Sender<RedemptionEvent>,
    event_tx: &broadcast::Sender<TwitchEventSubEvent>,
    modules: &Arc<ModuleState>,
    dev: &Arc<DevLogger>,
    shutdown: &mut watch::Receiver<bool>,
) -> Result<()> {
    let (ws_stream, _) = tokio_tungstenite::connect_async(EVENTSUB_WS_URL)
        .await
        .context("failed to open EventSub WebSocket")?;
    let (mut write, mut read) = ws_stream.split();

    // Wait for session_welcome before subscribing — Twitch requires the session_id.
    let session_id = loop {
        let frame = tokio::select! {
            f = read.next() => f,
            _ = shutdown.changed() => {
                if *shutdown.borrow() {
                    let _ = write.close().await;
                    return Ok(());
                }
                continue;
            }
        };
        let Some(frame) = frame else { return Err(anyhow!("EventSub connection closed before welcome")); };
        let msg = frame.context("EventSub WebSocket read error (pre-welcome)")?;
        let Message::Text(text) = msg else { continue };
        let Ok(env) = serde_json::from_str::<Envelope>(&text) else { continue };
        if env.metadata.message_type == "session_welcome" {
            let welcome: WelcomePayload = serde_json::from_value(env.payload)
                .context("malformed session_welcome payload")?;
            break welcome.session.id;
        }
    };

    dev.log(format!("EventSub session established ({session_id})"));

    // subscription_ids tracks event_type -> Helix subscription id, so a
    // later resync knows what to tear down once nothing wants a type anymore.
    let mut subscription_ids: HashMap<String, String> = HashMap::new();
    for event_type in desired_types(modules).await {
        if let Some(id) = subscribe_one(api, broadcaster_id, moderator_id, &session_id, &event_type, dev).await {
            subscription_ids.insert(event_type, id);
        }
    }
    info!("Twitch EventSub: subscribed to {} event type(s)", subscription_ids.len());

    let mut resync = tokio::time::interval(RESYNC_INTERVAL);
    resync.tick().await; // first tick fires immediately — subscriptions above already cover "now"

    loop {
        let frame = tokio::select! {
            f = read.next() => f,
            _ = shutdown.changed() => {
                if *shutdown.borrow() {
                    let _ = write.close().await;
                    return Ok(());
                }
                continue;
            }
            _ = resync.tick() => {
                let wanted = desired_types(modules).await;

                let to_add: Vec<String> = wanted.iter()
                    .filter(|t| !subscription_ids.contains_key(*t))
                    .cloned().collect();
                for event_type in to_add {
                    if let Some(id) = subscribe_one(api, broadcaster_id, moderator_id, &session_id, &event_type, dev).await {
                        subscription_ids.insert(event_type, id);
                    }
                }

                let to_remove: Vec<String> = subscription_ids.keys()
                    .filter(|t| !wanted.contains(*t))
                    .cloned().collect();
                for event_type in to_remove {
                    if let Some(id) = subscription_ids.remove(&event_type) {
                        if let Err(e) = api.delete_eventsub_subscription(&id).await {
                            warn!("EventSub: failed to unsubscribe from '{event_type}': {e}");
                        } else {
                            dev.log(format!("EventSub: unsubscribed from '{event_type}' (no module wants it anymore)"));
                        }
                    }
                }
                continue;
            }
        };

        let Some(frame) = frame else {
            return Err(anyhow!("EventSub connection closed"));
        };
        let msg = frame.context("EventSub WebSocket read error")?;

        match msg {
            Message::Text(text) => {
                let Ok(env) = serde_json::from_str::<Envelope>(&text) else {
                    warn!("EventSub: unparseable frame, ignoring");
                    continue;
                };
                match env.metadata.message_type.as_str() {
                    "session_keepalive" => { /* connection alive, nothing to do */ }
                    "notification" => {
                        match serde_json::from_value::<NotificationPayload>(env.payload) {
                            Ok(n) => {
                                let event_type = n.subscription.event_type;

                                // Built-in redemption path — unchanged shape/consumer,
                                // just now sourced from the same shared session.
                                if event_type == REDEMPTION_EVENT_TYPE {
                                    if let Ok(raw) = serde_json::from_value::<RawRedemptionEvent>(n.event.clone()) {
                                        let ev = RedemptionEvent {
                                            redemption_id: raw.id,
                                            reward_id:     raw.reward.id,
                                            reward_title:  raw.reward.title,
                                            reward_cost:   raw.reward.cost,
                                            user_id:       raw.user_id,
                                            user_login:    raw.user_login,
                                            user_input:    raw.user_input,
                                        };
                                        dev.log(format!("← EventSub redemption: {} redeemed \"{}\"", ev.user_login, ev.reward_title));
                                        let _ = redemption_tx.send(ev);
                                    }
                                }

                                // Generic fan-out for every type, redemptions included —
                                // a module can declare interest in the redemption type
                                // too without needing the dedicated redemption_handler path.
                                dev.log(format!("← EventSub '{event_type}'"));
                                let _ = event_tx.send(TwitchEventSubEvent { event_type, payload: n.event });
                            }
                            Err(e) => warn!("EventSub: notification parse failed: {e}"),
                        }
                    }
                    "session_reconnect" => {
                        info!("Twitch EventSub asked for reconnect");
                        return Err(anyhow!("EventSub requested reconnect"));
                    }
                    "session_revoked" => {
                        return Err(anyhow!("EventSub subscription revoked (scope removed or auth changed)"));
                    }
                    other => {
                        dev.log(format!("EventSub: unhandled message_type {other}"));
                    }
                }
            }
            Message::Close(frame) => {
                return Err(anyhow!("EventSub server closed connection: {:?}", frame));
            }
            _ => {}
        }
    }
}
