#![allow(dead_code)]

use anyhow::Result;
use async_trait::async_trait;

/// Abstraction over a streaming chat platform (Twitch, YouTube, etc.)
#[async_trait]
pub trait ChatPlatform: Send + Sync {
    /// Connect to the platform using credentials from config
    async fn connect(&self) -> Result<()>;

    /// Disconnect cleanly
    async fn disconnect(&self) -> Result<()>;

    /// Send a chat message to the channel/stream
    async fn send_message(&self, message: &str) -> Result<()>;

    /// Platform identifier string e.g. "twitch", "youtube"
    fn platform_name(&self) -> &'static str;

    /// Whether the platform is currently connected
    async fn is_connected(&self) -> bool;
}
