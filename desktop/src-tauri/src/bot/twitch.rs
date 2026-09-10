#![allow(dead_code)]

use crate::bot::dev::DevLogger;
use crate::bot::eventsub::{self, RedemptionEvent, TwitchEventSubEvent};
use crate::bot::platform::ChatPlatform;
use crate::bot::twitch_api::{CustomReward, TwitchApiClient, TwitchUser};
use crate::bot::ChatMessage;
use crate::modules::ModuleState;
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{broadcast, watch, RwLock};
use tracing::{error, info, warn};
use twitch_irc::{
    login::StaticLoginCredentials,
    message::ServerMessage,
    ClientConfig, SecureTCPTransport, TwitchIRCClient,
};

/// Resolved once per connection: the Helix client plus the IDs it needs on
/// every call (both come from the same token — moderator_id is the token
/// owner, broadcaster_id is the channel being connected to).
struct TwitchApiHandle {
    client:         TwitchApiClient,
    broadcaster_id: String,
    moderator_id:   String,
}

pub struct TwitchBot {
    username: String,
    token: String,
    channel: String,
    client: RwLock<Option<TwitchIRCClient<SecureTCPTransport, StaticLoginCredentials>>>,
    /// Helix API access — None until resolved post-connect, and stays None
    /// (non-fatally) if the token predates the Helix scope set. Everything
    /// that depends on it must degrade gracefully rather than error out.
    api: RwLock<Option<Arc<TwitchApiHandle>>>,
    message_tx: broadcast::Sender<ChatMessage>,
    /// Channel-point redemption events from EventSub. Populated regardless of
    /// whether anything is currently subscribed — subscribers just call
    /// `.subscribe()` before or after `connect()`, broadcast channels don't
    /// care which came first as long as they're listening by the time an
    /// event actually arrives.
    redemption_tx: broadcast::Sender<RedemptionEvent>,
    /// Generic EventSub fan-out — every subscribed type, not just redemptions.
    /// See `bot::eventsub`'s module doc for the one-session/one-subscription-
    /// per-type design this backs.
    twitch_event_tx: broadcast::Sender<TwitchEventSubEvent>,
    /// Signals the EventSub background task to stop. `true` = shut down.
    eventsub_shutdown: RwLock<Option<watch::Sender<bool>>>,
    /// Needed at EventSub-connect time to compute which event types are
    /// actually wanted (the union of every enabled module's `twitch_events`)
    /// — see `eventsub::run`.
    modules: Arc<ModuleState>,
    dev: Arc<DevLogger>,
    pub suppress_watermark: bool,
}

impl TwitchBot {
    pub fn new(
        username: String,
        token: String,
        channel: String,
        message_tx: broadcast::Sender<ChatMessage>,
        modules: Arc<ModuleState>,
        dev: Arc<DevLogger>,
        suppress_watermark: bool,
    ) -> Self {
        let (redemption_tx, _) = broadcast::channel(64);
        let (twitch_event_tx, _) = broadcast::channel(128);
        Self {
            username, token, channel,
            client: RwLock::new(None),
            api: RwLock::new(None),
            redemption_tx,
            twitch_event_tx,
            eventsub_shutdown: RwLock::new(None),
            message_tx, modules, dev, suppress_watermark,
        }
    }

    /// True once the Helix handle has been resolved (announcements, user lookup, etc. available).
    pub async fn helix_ready(&self) -> bool {
        self.api.read().await.is_some()
    }

    /// Subscribe to channel-point redemption events. Safe to call at any time,
    /// including before `connect()` — events just won't arrive until EventSub
    /// has actually established a session (see `resolve_helix`).
    pub fn subscribe_redemptions(&self) -> broadcast::Receiver<RedemptionEvent> {
        self.redemption_tx.subscribe()
    }

    /// Subscribe to every EventSub notification, regardless of type — the
    /// generic fan-out `bot::twitch_events_handler` dispatches to modules
    /// via their declared `twitch_events`. Same "safe before connect()"
    /// property as `subscribe_redemptions`.
    pub fn subscribe_twitch_events(&self) -> broadcast::Receiver<TwitchEventSubEvent> {
        self.twitch_event_tx.subscribe()
    }

    /// Subscribe to raw incoming chat messages (both platforms — filter on
    /// `ChatMessage::platform` if you only want one). Used by chat.poll()'s
    /// fallback vote tally, which needs to watch chat independently of the
    /// normal command dispatcher.
    pub fn subscribe_chat(&self) -> broadcast::Receiver<ChatMessage> {
        self.message_tx.subscribe()
    }

    /// List this app's manageable custom channel-point rewards.
    pub async fn list_rewards(&self) -> Result<Vec<CustomReward>> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.list_custom_rewards(&handle.broadcaster_id).await
    }

    /// Create a new custom channel-point reward. Requires `channel:manage:redemptions`.
    pub async fn create_reward(&self, title: &str, cost: i64, prompt: &str) -> Result<CustomReward> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.create_custom_reward(&handle.broadcaster_id, title, cost, prompt).await
    }

    /// The connected channel's broadcaster user ID, once Helix is ready. Used to
    /// resolve `is_broadcaster` for events (like redemptions) that only carry a
    /// user_id, not IRC badges.
    pub async fn broadcaster_id(&self) -> Option<String> {
        self.api.read().await.as_ref().map(|h| h.broadcaster_id.clone())
    }

    /// True if `user_id` currently subscribes to the connected channel.
    /// Requires `channel:read:subscriptions` — degrades to `false` (not an
    /// error) if Helix isn't ready, same as the rest of this API surface.
    pub async fn is_subscriber(&self, user_id: &str) -> Result<bool> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.check_subscription(&handle.broadcaster_id, user_id).await
    }

    /// Update an existing custom reward's title/cost/prompt/enabled state.
    /// Icons can't be set through this API — Twitch dashboard only.
    pub async fn update_reward(
        &self, reward_id: &str,
        title: Option<&str>, cost: Option<i64>, prompt: Option<&str>, is_enabled: Option<bool>,
    ) -> Result<CustomReward> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.update_custom_reward(&handle.broadcaster_id, reward_id, title, cost, prompt, is_enabled).await
    }

    /// Delete a custom reward (must have been created by this app).
    pub async fn delete_reward(&self, reward_id: &str) -> Result<()> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.delete_custom_reward(&handle.broadcaster_id, reward_id).await
    }

    /// Mark a redemption fulfilled (accepted) or canceled (refunded to the viewer).
    pub async fn set_redemption_status(&self, reward_id: &str, redemption_id: &str, fulfilled: bool) -> Result<()> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.update_redemption_status(&handle.broadcaster_id, reward_id, redemption_id, fulfilled).await
    }

    /// Look up a user by login via Helix. Requires `helix_ready()`.
    pub async fn get_user(&self, login: &str) -> Result<Option<TwitchUser>> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.get_user_by_login(login).await
    }

    /// Post a chat announcement (highlighted, colored message) via Helix.
    /// Requires `helix_ready()` and the `moderator:manage:announcements` scope.
    pub async fn send_announcement(&self, message: &str, color: Option<&str>) -> Result<()> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.send_announcement(&handle.broadcaster_id, &handle.moderator_id, message, color).await
    }

    /// Send a chat message via Helix (not IRC) with Twitch's own 20-minute
    /// pin applied. Requires `helix_ready()` and `moderator:manage:chat_messages`
    /// — callers should treat any error here as "pin unavailable" and fall
    /// back to a normal chat.say(), not surface it as a hard failure. Returns
    /// the sent message's id, needed to unpin it later (see `unpin_message`).
    pub async fn send_pinned_message(&self, message: &str) -> Result<String> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.send_chat_message(&handle.broadcaster_id, &handle.moderator_id, message, true).await
    }

    /// Unpin a specific message previously pinned via `send_pinned_message`.
    /// Requires `helix_ready()` and `moderator:manage:chat_messages`.
    pub async fn unpin_message(&self, message_id: &str) -> Result<()> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.unpin_message(&handle.broadcaster_id, &handle.moderator_id, message_id).await
    }

    /// Attempt to create a native Twitch poll. Requires `helix_ready()`, the
    /// `channel:manage:polls` scope, AND that this connection's token belongs
    /// to the broadcaster (not a separate bot account) — Twitch itself
    /// enforces the last one. Callers should treat any error here as "not
    /// eligible" and fall back to a chat-vote poll rather than surfacing it
    /// as a hard failure.
    pub async fn create_poll(&self, title: &str, options: &[String], duration_secs: i32) -> Result<String> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.create_poll(&handle.broadcaster_id, title, options, duration_secs).await
    }

    /// Fetch a native poll's current state (including vote counts) by id.
    pub async fn get_poll(&self, poll_id: &str) -> Result<crate::bot::twitch_api::TwitchPoll> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.get_poll(&handle.broadcaster_id, poll_id).await
    }

    /// End a native poll early. Same broadcaster-token requirement as `create_poll`.
    pub async fn end_poll(&self, poll_id: &str) -> Result<()> {
        let guard = self.api.read().await;
        let handle = guard.as_ref().context(
            "Twitch Helix API not available — reconnect in Settings → Twitch to refresh scopes."
        )?;
        handle.client.end_poll(&handle.broadcaster_id, poll_id).await
    }

    /// Resolve the Helix handle (token owner + broadcaster IDs) after IRC connects.
    /// Non-fatal on any failure — announcements etc. just stay unavailable.
    async fn resolve_helix(&self) {
        let raw_token = self.token.trim_start_matches("oauth:").to_string();
        let api_client = TwitchApiClient::new(raw_token);

        let self_user: TwitchUser = match api_client.get_self().await {
            Ok(u) => u,
            Err(e) => {
                warn!("Twitch Helix: could not resolve token owner (non-fatal, missing scopes?): {e}");
                return;
            }
        };

        let broadcaster: TwitchUser = match api_client.get_user_by_login(&self.channel).await {
            Ok(Some(u)) => u,
            Ok(None) => {
                warn!("Twitch Helix: channel '{}' not found — Helix features unavailable", self.channel);
                return;
            }
            Err(e) => {
                warn!("Twitch Helix: failed to resolve broadcaster id (non-fatal): {e}");
                return;
            }
        };

        self.dev.log("Twitch Helix API ready (announcements, user lookup available)".to_string());
        let broadcaster_id = broadcaster.id.clone();
        let moderator_id = self_user.id.clone();
        *self.api.write().await = Some(Arc::new(TwitchApiHandle {
            client:         api_client.clone(),
            broadcaster_id: broadcaster_id.clone(),
            moderator_id:   self_user.id,
        }));

        // EventSub: subscribes to redemptions (this app's own built-in
        // feature) plus whatever the union of enabled modules' `twitch_events`
        // wants — non-fatal to skip any given type if the token lacks the
        // scope it needs, same degrade-gracefully approach as the rest of
        // Helix here (see eventsub::run for the per-type handling).
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        *self.eventsub_shutdown.write().await = Some(shutdown_tx);
        let redemption_tx = self.redemption_tx.clone();
        let twitch_event_tx = self.twitch_event_tx.clone();
        let modules = Arc::clone(&self.modules);
        let dev = Arc::clone(&self.dev);
        tokio::spawn(eventsub::run(api_client, broadcaster_id, moderator_id, redemption_tx, twitch_event_tx, modules, dev, shutdown_rx));
    }
}

#[async_trait]
impl ChatPlatform for TwitchBot {
    async fn connect(&self) -> Result<()> {
        let dev = &self.dev;

        dev.log(format!("=== Twitch IRC connection starting ==="));
        dev.log(format!("  username : {}", self.username));
        dev.log(format!("  channel  : #{}", self.channel));
        dev.log(format!("  token    : {}... ({} chars)",
            &self.token[..self.token.len().min(12)],
            self.token.len()
        ));

        if self.username.is_empty() {
            return Err(anyhow!("No Twitch token available — this should have been caught earlier."));
        }
        if self.token.is_empty() {
            return Err(anyhow!("No Twitch token available — this should have been caught earlier."));
        }
        if self.channel.is_empty() {
            return Err(anyhow!("Channel name is not set. Configure it in Settings → Twitch."));
        }

        let token_for_irc = self.token.trim_start_matches("oauth:").to_string();
        dev.log(format!("  token (IRC, after stripping oauth:) length: {}", token_for_irc.len()));

        let credentials = StaticLoginCredentials::new(
            self.username.clone(),
            Some(token_for_irc),
        );

        dev.log("Creating IRC client config...".to_string());
        let config = ClientConfig::new_simple(credentials);

        dev.log("Connecting to Twitch IRC...".to_string());
        let (mut incoming, client) =
            TwitchIRCClient::<SecureTCPTransport, StaticLoginCredentials>::new(config);

        dev.log(format!("Queuing JOIN #{}", self.channel));
        client.join(self.channel.clone()).context("failed to queue channel join")?;

        let (joined_tx, joined_rx) =
            tokio::sync::oneshot::channel::<Result<(), String>>();
        let joined_tx = Arc::new(Mutex::new(Some(joined_tx)));

        let tx         = self.message_tx.clone();
        let channel    = self.channel.clone();
        let joined_sig = Arc::clone(&joined_tx);
        let dev_clone  = Arc::clone(dev);

        tokio::spawn(async move {
            while let Some(msg) = incoming.recv().await {
                match &msg {
                    ServerMessage::Join(j) if j.channel_login == channel => {
                        dev_clone.log(format!("← JOIN #{}", j.channel_login));
                        info!("Twitch IRC: joined #{}", j.channel_login);
                        if let Ok(mut guard) = joined_sig.lock() {
                            if let Some(tx) = guard.take() {
                                let _ = tx.send(Ok(()));
                            }
                        }
                    }
                    ServerMessage::Notice(n) => {
                        dev_clone.log(format!("← NOTICE [{:?}] {}", n.message_id, n.message_text));
                        warn!("Twitch notice [{:?}]: {}", n.message_id, n.message_text);

                        let text_lower = n.message_text.to_lowercase();
                        let is_auth_failure =
                            text_lower.contains("login unsuccessful") ||
                            text_lower.contains("authentication failed") ||
                            text_lower.contains("improperly formatted auth") ||
                            matches!(n.message_id.as_deref(),
                                Some("msg_banned") | Some("msg_channel_suspended") | Some("authentication_failed"));

                        if is_auth_failure {
                            dev_clone.log(format!("! Auth failure detected — reconnect via Settings → Twitch → Connect"));
                            if let Ok(mut guard) = joined_sig.lock() {
                                if let Some(tx) = guard.take() {
                                    let _ = tx.send(Err(format!(
                                        "{} — go to Settings → Twitch → Connect to get a fresh token.",
                                        n.message_text
                                    )));
                                }
                            }
                        }
                    }
                    ServerMessage::Privmsg(pm) => {
                        let is_mod         = pm.badges.iter().any(|b| b.name == "moderator");
                        let is_broadcaster = pm.badges.iter().any(|b| b.name == "broadcaster");
                        let is_subscriber  = pm.badges.iter().any(|b| b.name == "subscriber" || b.name == "founder");
                        let _ = tx.send(ChatMessage {
                            platform: "twitch".to_string(),
                            username: pm.sender.login.clone(),
                            text: pm.message_text.clone(),
                            is_subscriber,
                            is_mod,
                            is_broadcaster,
                        });
                    }
                    ServerMessage::RoomState(_) => {
                        dev_clone.log("← ROOMSTATE (room config received)".to_string());
                    }
                    ServerMessage::GlobalUserState(_) => {
                        dev_clone.log("← GLOBALUSERSTATE (auth confirmed)".to_string());
                    }
                    ServerMessage::UserState(u) => {
                        dev_clone.log(format!("← USERSTATE #{}", u.channel_login));
                    }
                    ServerMessage::Ping(_) => {
                        dev_clone.log("← PING".to_string());
                    }
                    ServerMessage::Pong(_) => {
                        dev_clone.log("← PONG".to_string());
                    }
                    other => {
                        dev_clone.log(format!("← {:?}", other));
                    }
                }
            }
            error!("Twitch IRC incoming loop ended (connection dropped)");
            dev_clone.log("! Incoming loop ended — connection dropped".to_string());
        });

        dev.log(format!("Waiting up to 10s for JOIN confirmation on #{}...", self.channel));

        match tokio::time::timeout(Duration::from_secs(10), joined_rx).await {
            Ok(Ok(Ok(()))) => {
                info!("Twitch: connected to #{}", self.channel);
                dev.log(format!("=== Connected to #{} ===", self.channel));
            }
            Ok(Ok(Err(e))) => {
                dev.log(format!("! Connection failed: {e}"));
                return Err(anyhow!("Twitch connection failed: {e}"));
            }
            Ok(Err(_)) => {
                dev.log("! Connection task exited before confirming join".to_string());
                return Err(anyhow!("Twitch connection task exited before confirming join"));
            }
            Err(_) => {
                dev.log(format!("! Timed out after 10s — no JOIN or auth failure received for #{}", self.channel));
                return Err(anyhow!(
                    "Timed out connecting to #{}. Check the dev log for details.",
                    self.channel
                ));
            }
        }

        *self.client.write().await = Some(client);

        self.resolve_helix().await;

        if !self.suppress_watermark {
            if let Err(e) = self.send_message(
                "Thank you for using GD Level Request Bot! - To remove this message, sponsor us on GitHub!"
            ).await {
                warn!("Failed to send startup message: {e}");
            }
        }

        Ok(())
    }

    async fn disconnect(&self) -> Result<()> {
        *self.client.write().await = None;
        *self.api.write().await = None;
        if let Some(tx) = self.eventsub_shutdown.write().await.take() {
            let _ = tx.send(true);
        }
        self.dev.log("Disconnected from Twitch IRC".to_string());
        info!("Twitch: disconnected");
        Ok(())
    }

    async fn send_message(&self, message: &str) -> Result<()> {
        let guard = self.client.read().await;
        if let Some(client) = guard.as_ref() {
            client
                .say(self.channel.clone(), message.to_string())
                .await
                .context("failed to send Twitch message")?;
        } else {
            warn!("send_message called but Twitch client is not connected");
        }
        Ok(())
    }

    fn platform_name(&self) -> &'static str { "twitch" }
    async fn is_connected(&self) -> bool { self.client.read().await.is_some() }
}
