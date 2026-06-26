#![allow(dead_code)]

use crate::bot::dev::DevLogger;
use crate::bot::platform::ChatPlatform;
use crate::bot::ChatMessage;
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{broadcast, RwLock};
use tracing::{error, info, warn};
use twitch_irc::{
    login::StaticLoginCredentials,
    message::ServerMessage,
    ClientConfig, SecureTCPTransport, TwitchIRCClient,
};

pub struct TwitchBot {
    username: String,
    token: String,
    channel: String,
    client: RwLock<Option<TwitchIRCClient<SecureTCPTransport, StaticLoginCredentials>>>,
    message_tx: broadcast::Sender<ChatMessage>,
    dev: Arc<DevLogger>,
    pub suppress_watermark: bool,
}

impl TwitchBot {
    pub fn new(
        username: String,
        token: String,
        channel: String,
        message_tx: broadcast::Sender<ChatMessage>,
        dev: Arc<DevLogger>,
        suppress_watermark: bool,
    ) -> Self {
        Self { username, token, channel, client: RwLock::new(None), message_tx, dev, suppress_watermark }
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
