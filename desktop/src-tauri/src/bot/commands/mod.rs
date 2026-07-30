pub mod general;
pub mod info;

use crate::bot::ChatMessage;
use crate::bot::twitch::TwitchBot;
use crate::bot::youtube::YouTubeBot;
use crate::config::AppConfig;
use crate::queue::QueueState;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::RwLock;

/// Everything a command handler needs, passed by reference.
#[allow(dead_code)]
pub struct Ctx<'a> {
    pub msg:               &'a ChatMessage,
    pub args:              &'a str,
    pub queue:             &'a Arc<QueueState>,
    pub config:            &'a Arc<RwLock<AppConfig>>,
    pub client:            &'a Arc<TwitchBot>,
    pub youtube:           &'a Option<Arc<YouTubeBot>>,
    pub app_handle:        &'a AppHandle,
    pub sub_mode:          bool,
    pub viewer_limit:      u32,
    pub subscriber_limit:  u32,
    pub queue_size:        i64,
    pub queue_open:        bool,
    pub max_queue_size:    u32,
    /// Set when this invocation came from a Twitch channel-point redemption —
    /// forwarded into custom scripts' `redemption_id`/`reward_id` globals so
    /// they can call `twitch.cancel_redemption(...)` to auto-refund on failure.
    pub redemption_id:     Option<&'a str>,
    pub reward_id:         Option<&'a str>,
}

/// Parse the first 3-9 digit level ID from a string.
pub fn parse_level_id(text: &str) -> Option<i64> {
    let mut digits = String::new();
    for ch in text.chars() {
        if ch.is_ascii_digit() {
            digits.push(ch);
            if digits.len() == 9 { break; }
        } else if !digits.is_empty() {
            break;
        }
    }
    if digits.len() >= 3 { digits.parse().ok() } else { None }
}
