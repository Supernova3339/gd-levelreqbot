// Twitch EventSub WebSocket client — currently used only for channel-point
// reward redemptions ("channel.channel_points_custom_reward_redemption.add").
//
// Protocol notes (Twitch EventSub WebSocket, not the old webhook transport):
//   1. Connect to wss://eventsub.wss.twitch.tv/ws
//   2. First frame is always a "session_welcome" carrying payload.session.id.
//   3. Within ~10s, create the subscription via Helix POST /eventsub/subscriptions
//      with transport {method: "websocket", session_id}. Until that call succeeds,
//      no notifications will arrive.
//   4. "session_keepalive" frames arrive periodically — no action needed, they just
//      prove the connection is alive.
//   5. "notification" frames carry the actual event under payload.event.
//   6. "session_reconnect" carries a payload.session.reconnect_url — a graceful
//      migration Twitch asks for occasionally; this client just does a fresh
//      reconnect via the normal retry loop rather than the two-connection handoff
//      dance (simpler, and the resulting few-second gap is not meaningful here).
//   7. On any disconnect/error, retry with backoff — redemptions matter but this
//      is not a hard-realtime system.
//
// This has not been exercised against live Twitch traffic in this environment
// (no network access during development) — verify on first real run.

use crate::bot::dev::DevLogger;
use crate::bot::twitch_api::TwitchApiClient;
use anyhow::{anyhow, Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, watch};
use tokio_tungstenite::tungstenite::Message;
use tracing::{info, warn};

const EVENTSUB_WS_URL: &str = "wss://eventsub.wss.twitch.tv/ws";
const REDEMPTION_EVENT_TYPE: &str = "channel.channel_points_custom_reward_redemption.add";

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
    event: RawRedemptionEvent,
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

/// Runs the EventSub connection loop until `shutdown` fires. Reconnects with
/// backoff on any error. Each successfully-parsed redemption is broadcast on `tx`.
pub async fn run(
    api: TwitchApiClient,
    broadcaster_id: String,
    tx: broadcast::Sender<RedemptionEvent>,
    dev: Arc<DevLogger>,
    mut shutdown: watch::Receiver<bool>,
) {
    let mut backoff = Duration::from_secs(2);
    const MAX_BACKOFF: Duration = Duration::from_secs(60);

    loop {
        if *shutdown.borrow() { return; }

        match connect_and_listen(&api, &broadcaster_id, &tx, &dev, &mut shutdown).await {
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

async fn connect_and_listen(
    api: &TwitchApiClient,
    broadcaster_id: &str,
    tx: &broadcast::Sender<RedemptionEvent>,
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

    dev.log(format!("EventSub session established ({session_id}) — subscribing to redemptions"));

    api.create_eventsub_subscription(
        REDEMPTION_EVENT_TYPE,
        "1",
        serde_json::json!({ "broadcaster_user_id": broadcaster_id }),
        &session_id,
    ).await.context("failed to create EventSub redemption subscription")?;

    info!("Twitch EventSub: subscribed to channel-point redemptions");
    dev.log("EventSub: redemption subscription active".to_string());

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
                                let ev = RedemptionEvent {
                                    redemption_id: n.event.id,
                                    reward_id:     n.event.reward.id,
                                    reward_title:  n.event.reward.title,
                                    reward_cost:   n.event.reward.cost,
                                    user_id:       n.event.user_id,
                                    user_login:    n.event.user_login,
                                    user_input:    n.event.user_input,
                                };
                                dev.log(format!(
                                    "← EventSub redemption: {} redeemed \"{}\"",
                                    ev.user_login, ev.reward_title
                                ));
                                let _ = tx.send(ev);
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
