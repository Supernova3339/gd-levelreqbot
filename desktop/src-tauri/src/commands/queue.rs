use crate::bot::platform::ChatPlatform;
use crate::bot::{BotState, BotStatus};
use crate::config::AppConfig;
use crate::queue::{NextLevel, QueuePage, QueueState};
use std::sync::Arc;
use tauri::{Emitter, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::sync::RwLock;
use tracing::warn;

#[tauri::command]
pub async fn get_viewer_queue(
    page: Option<u32>,
    per_page: Option<u32>,
    queue: State<'_, Arc<QueueState>>,
) -> Result<QueuePage, String> {
    queue.get_page("viewer", page.unwrap_or(1), per_page.unwrap_or(10))
        .await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_subscriber_queue(
    page: Option<u32>,
    per_page: Option<u32>,
    queue: State<'_, Arc<QueueState>>,
) -> Result<QueuePage, String> {
    queue.get_page("subscriber", page.unwrap_or(1), per_page.unwrap_or(10))
        .await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_to_queue(
    level_id: i64,
    username: String,
    is_subscriber: bool,
    queue: State<'_, Arc<QueueState>>,
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<String, String> {
    let cfg = config.read().await;
    queue.add_level(level_id, &username, is_subscriber, cfg.modes.sub,
        cfg.limits.viewer_request_limit, cfg.limits.subscriber_request_limit)
        .await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_from_queue(
    level_id: i64,
    queue: State<'_, Arc<QueueState>>,
) -> Result<String, String> {
    queue.remove_level(level_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_queue(queue: State<'_, Arc<QueueState>>) -> Result<String, String> {
    queue.clear().await.map_err(|e| e.to_string())
}

/// Pop the next level, announce in chat, optionally copy to clipboard, and show overlay.
#[tauri::command]
pub async fn next_level(
    queue:  State<'_, Arc<QueueState>>,
    config: State<'_, Arc<RwLock<AppConfig>>>,
    bot:    State<'_, Arc<BotState>>,
) -> Result<Option<NextLevel>, String> {
    let (sub_mode, auto_copy) = {
        let cfg = config.read().await;
        (cfg.modes.sub, cfg.auto_copy_level_id)
    };

    let result = queue.next_level(sub_mode).await.map_err(|e| e.to_string())?;

    if let Some(ref next) = result {
        // ── Announce in Twitch chat if the bot is connected ──────────────────
        {
            let status = bot.status.read().await.clone();
            if status == BotStatus::Connected {
                let client_guard = bot.client.read().await;
                if let Some(ref twitch_bot) = *client_guard {
                    let msg = format!(
                        "Next level: {} (requested by @{})",
                        next.level_id, next.username
                    );
                    if let Err(e) = twitch_bot.send_message(&msg).await {
                        warn!("Failed to announce next level in chat: {e}");
                    }
                }
            }
        }

        // ── Auto-copy level ID to clipboard ───────────────────────────────────
        if auto_copy {
            let level_id_str = next.level_id.to_string();
            if let Err(e) = bot.app_handle.clipboard().write_text(level_id_str.clone()) {
                warn!("Clipboard write failed: {e}");
            }

            // Notify the frontend so it can show the overlay
            bot.app_handle
                .emit("level-copied", &level_id_str)
                .ok();
        }

        // ── Fetch GD metadata for the overlay (best-effort, non-blocking) ───────
        let gd_info = crate::gd::get_level_by_id(next.level_id).await.ok().flatten();

        // ── Notify dashboard + overlay ────────────────────────────────────────
        bot.app_handle.emit("queue-updated", ()).ok();
        bot.app_handle.emit("level-nexted", serde_json::json!({
            "level_id":   next.level_id,
            "username":   next.username,
            "queue_type": next.queue_type,
            "auto_copied": auto_copy,
            "gd_name":    gd_info.as_ref().map(|l| &l.level_name),
            "gd_diff":    gd_info.as_ref().map(|l| &l.difficulty),
            "gd_stars":   gd_info.as_ref().map(|l| l.stars),
        })).ok();
    }

    Ok(result)
}

#[tauri::command]
pub async fn get_queue_position(
    level_id: i64,
    queue: State<'_, Arc<QueueState>>,
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<Option<(i64, String)>, String> {
    let sub_mode = config.read().await.modes.sub;
    queue.get_position(level_id, sub_mode).await.map_err(|e| e.to_string())
}
