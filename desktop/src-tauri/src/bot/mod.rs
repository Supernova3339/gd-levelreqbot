pub mod cmd_cache;
pub mod commands;
pub mod dev;
pub mod handler;
pub mod platform;
pub mod twitch;
pub mod youtube;

use crate::bot::twitch::TwitchBot;
use crate::bot::youtube::YouTubeBot;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::{broadcast, RwLock};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BotStatus {
    Stopped,
    Connecting,
    Connected,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub platform:       String,
    pub username:       String,
    pub text:           String,
    pub is_subscriber:  bool,
    pub is_mod:         bool,
    pub is_broadcaster: bool,
}

/// Shared bot state managed across Tauri commands.
pub struct BotState {
    pub status:         RwLock<BotStatus>,
    pub message_tx:     broadcast::Sender<ChatMessage>,
    pub client:         RwLock<Option<Arc<TwitchBot>>>,
    pub youtube_client: RwLock<Option<Arc<YouTubeBot>>>,
    pub app_handle:     AppHandle,
}

impl BotState {
    pub fn new(app_handle: AppHandle) -> Arc<Self> {
        let (tx, _) = broadcast::channel(256);
        Arc::new(Self {
            status:         RwLock::new(BotStatus::Stopped),
            message_tx:     tx,
            client:         RwLock::new(None),
            youtube_client: RwLock::new(None),
            app_handle,
        })
    }
}
