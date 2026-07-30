use crate::bot::platform::ChatPlatform;
use crate::bot::ChatMessage;
use anyhow::{Context, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use tokio::sync::{broadcast, RwLock};
use tracing::{error, info, warn};

const POLL_INTERVAL_SECS: u64 = 5;

#[derive(Debug, Clone)]
pub struct YouTubeChannel {
    pub id:    String,
    pub title: String,
}

#[allow(dead_code)]
pub struct YouTubeBot {
    access_token:       RwLock<String>,
    live_chat_id:       RwLock<Option<String>>,
    next_page_token:    RwLock<Option<String>>,
    http:               Client,
    message_tx:         broadcast::Sender<ChatMessage>,
    running:            RwLock<bool>,
    pub suppress_watermark: bool,
}

impl YouTubeBot {
    pub fn new(access_token: String, message_tx: broadcast::Sender<ChatMessage>, suppress_watermark: bool) -> Self {
        Self {
            access_token:    RwLock::new(access_token),
            live_chat_id:    RwLock::new(None),
            next_page_token: RwLock::new(None),
            http:            Client::new(),
            message_tx,
            running:         RwLock::new(false),
            suppress_watermark,
        }
    }

    async fn find_live_chat_id(&self) -> Result<String> {
        #[derive(Deserialize)]
        struct Resp { items: Vec<Item> }
        #[derive(Deserialize)]
        struct Item { snippet: Snippet }
        #[derive(Deserialize)]
        struct Snippet {
            #[serde(rename = "liveChatId")]
            live_chat_id: String,
        }

        let token = self.access_token.read().await.clone();
        let resp: Resp = self.http
            .get("https://www.googleapis.com/youtube/v3/liveBroadcasts")
            .bearer_auth(&token)
            .query(&[("part", "snippet"), ("broadcastStatus", "active")])
            .send().await?
            .json().await
            .context("failed to parse YouTube live broadcasts")?;

        resp.items.into_iter().next()
            .map(|i| i.snippet.live_chat_id)
            .context("no active YouTube live broadcast found")
    }

    /// General-purpose Data API lookup: the connected account's own channel.
    /// Useful outside the live-chat flow (e.g. scripts wanting the channel name/id).
    pub async fn get_channel(&self) -> Result<YouTubeChannel> {
        #[derive(Deserialize)] struct Resp { items: Vec<Item> }
        #[derive(Deserialize)] struct Item { id: String, snippet: Snippet }
        #[derive(Deserialize)] struct Snippet { title: String }

        let token = self.access_token.read().await.clone();
        let resp: Resp = self.http
            .get("https://www.googleapis.com/youtube/v3/channels")
            .bearer_auth(&token)
            .query(&[("part", "snippet"), ("mine", "true")])
            .send().await?
            .error_for_status()?
            .json().await
            .context("failed to parse YouTube channel response")?;

        let item = resp.items.into_iter().next().context("no channel found for this token")?;
        Ok(YouTubeChannel { id: item.id, title: item.snippet.title })
    }
}

#[async_trait]
impl ChatPlatform for YouTubeBot {
    async fn connect(&self) -> Result<()> {
        let chat_id = self.find_live_chat_id().await?;
        info!("YouTube: connected to live chat {}", chat_id);
        *self.live_chat_id.write().await = Some(chat_id.clone());
        *self.running.write().await = true;

        let access_token = self.access_token.read().await.clone();
        let http         = self.http.clone();
        let tx           = self.message_tx.clone();
        let chat_id_poll = chat_id.clone();

        tokio::spawn(async move {
            let mut page_token: Option<String> = None;
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(POLL_INTERVAL_SECS)).await;

                let mut req = http
                    .get("https://www.googleapis.com/youtube/v3/liveChat/messages")
                    .bearer_auth(&access_token)
                    .query(&[
                        ("liveChatId", chat_id_poll.as_str()),
                        ("part", "snippet,authorDetails"),
                    ]);
                if let Some(ref t) = page_token {
                    req = req.query(&[("pageToken", t.as_str())]);
                }

                let Ok(resp) = req.send().await else { continue };
                let Ok(body) = resp.text().await else { continue };
                let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) else { continue };

                if let Some(next) = json["nextPageToken"].as_str() {
                    page_token = Some(next.to_string());
                }

                if let Some(items) = json["items"].as_array() {
                    for item in items {
                        let details = &item["authorDetails"];
                        let username = details["displayName"].as_str().unwrap_or("unknown").to_string();
                        let text     = item["snippet"]["displayMessage"].as_str().unwrap_or("").to_string();
                        if !text.is_empty() {
                            let _ = tx.send(ChatMessage {
                                platform:       "youtube".to_string(),
                                username,
                                text,
                                is_broadcaster: details["isChatOwner"].as_bool().unwrap_or(false),
                                is_mod:         details["isChatModerator"].as_bool().unwrap_or(false),
                                is_subscriber:  details["isChatSponsor"].as_bool().unwrap_or(false),
                            });
                        }
                    }
                }
            }
        });

        if !self.suppress_watermark {
            if let Err(e) = self.send_message(
                "Thank you for using GD Level Request Bot! - To remove this message, sponsor us on GitHub!"
            ).await {
                warn!("Failed to send YouTube startup message: {e}");
            }
        }

        Ok(())
    }

    async fn disconnect(&self) -> Result<()> {
        *self.running.write().await = false;
        *self.live_chat_id.write().await = None;
        info!("YouTube: disconnected");
        Ok(())
    }

    async fn send_message(&self, message: &str) -> Result<()> {
        let chat_id = {
            let guard = self.live_chat_id.read().await;
            match guard.as_ref() {
                Some(id) => id.clone(),
                None => {
                    warn!("YouTube send_message: not connected (no live_chat_id)");
                    return Ok(());
                }
            }
        };

        let token = self.access_token.read().await.clone();

        let body = serde_json::json!({
            "snippet": {
                "liveChatId": chat_id,
                "type": "textMessageEvent",
                "textMessageDetails": { "messageText": message }
            }
        });

        let resp = self.http
            .post("https://www.googleapis.com/youtube/v3/liveChat/messages")
            .bearer_auth(&token)
            .query(&[("part", "snippet")])
            .json(&body)
            .send().await
            .context("YouTube send_message: HTTP request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text   = resp.text().await.unwrap_or_default();
            error!("YouTube send_message failed ({status}): {text}");
        }

        Ok(())
    }

    fn platform_name(&self) -> &'static str { "youtube" }

    async fn is_connected(&self) -> bool {
        *self.running.read().await
    }
}
