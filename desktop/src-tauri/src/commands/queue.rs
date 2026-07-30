use crate::bot::platform::ChatPlatform;
use crate::bot::{BotState, BotStatus};
use crate::config::AppConfig;
use crate::queue::{HistoryPage, NextLevel, QueuePage, QueueState};
use std::sync::Arc;
use tauri::{Emitter, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::sync::RwLock;
use tracing::warn;

#[tauri::command]
pub async fn get_queue(
    queue_type: String,
    page: Option<u32>,
    per_page: Option<u32>,
    queue: State<'_, Arc<QueueState>>,
) -> Result<QueuePage, String> {
    queue
        .get_page(&queue_type, page.unwrap_or(1), per_page.unwrap_or(15))
        .await
        .map_err(|e| e.to_string())
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
    if !cfg.queue_open {
        return Ok("Queue is currently closed.".into());
    }
    queue
        .add_level_from(
            level_id, &username, is_subscriber, cfg.modes.sub,
            cfg.limits.viewer_request_limit, cfg.limits.subscriber_request_limit,
            "manual", cfg.limits.max_queue_size,
        )
        .await
        .map_err(|e| e.to_string())
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
/// GD metadata is fetched in the background so the command returns immediately.
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
        // Announce in Twitch chat if the bot is connected
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

        // Auto-copy level ID to clipboard
        if auto_copy {
            let level_id_str = next.level_id.to_string();
            if let Err(e) = bot.app_handle.clipboard().write_text(level_id_str.clone()) {
                warn!("Clipboard write failed: {e}");
            }
            bot.app_handle.emit("level-copied", &level_id_str).ok();
        }

        // Notify frontend immediately
        bot.app_handle.emit("queue-updated", ()).ok();
        bot.app_handle.emit("level-nexted", serde_json::json!({
            "level_id":   next.level_id,
            "username":   next.username,
            "queue_type": next.queue_type,
            "auto_copied": auto_copy,
        })).ok();

        // Fetch GD metadata in background; update overlay content without re-showing
        let app      = bot.app_handle.clone();
        let level_id = next.level_id;
        tokio::spawn(async move {
            if let Ok(Some(info)) = crate::gd::get_level_by_id(level_id, None).await {
                app.emit("level-nexted-gd", serde_json::json!({
                    "level_id": level_id,
                    "gd_name":  info.level_name,
                    "gd_diff":  info.difficulty,
                    "gd_stars": info.stars,
                })).ok();
            }
        });
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

#[tauri::command]
pub async fn promote_level(
    level_id: i64,
    queue: State<'_, Arc<QueueState>>,
    bot: State<'_, Arc<BotState>>,
) -> Result<String, String> {
    let msg = queue.promote_level(level_id).await.map_err(|e| e.to_string())?;
    bot.app_handle.emit("queue-updated", ()).ok();
    Ok(msg)
}

#[tauri::command]
pub async fn shuffle_queue(
    queue: State<'_, Arc<QueueState>>,
    bot: State<'_, Arc<BotState>>,
) -> Result<String, String> {
    let msg = queue.shuffle_viewer_queue().await.map_err(|e| e.to_string())?;
    bot.app_handle.emit("queue-updated", ()).ok();
    Ok(msg)
}

#[tauri::command]
pub async fn open_queue(
    config: State<'_, Arc<RwLock<AppConfig>>>,
    bot: State<'_, Arc<BotState>>,
) -> Result<(), String> {
    let mut cfg = config.write().await;
    cfg.queue_open = true;
    cfg.save().await.map_err(|e| e.to_string())?;
    bot.app_handle.emit("queue-status-changed", true).ok();
    Ok(())
}

#[tauri::command]
pub async fn close_queue(
    config: State<'_, Arc<RwLock<AppConfig>>>,
    bot: State<'_, Arc<BotState>>,
) -> Result<(), String> {
    let mut cfg = config.write().await;
    cfg.queue_open = false;
    cfg.save().await.map_err(|e| e.to_string())?;
    bot.app_handle.emit("queue-status-changed", false).ok();
    Ok(())
}

#[tauri::command]
pub async fn get_queue_history(
    page: Option<u32>,
    per_page: Option<u32>,
    queue: State<'_, Arc<QueueState>>,
) -> Result<HistoryPage, String> {
    queue
        .get_history(page.unwrap_or(1), per_page.unwrap_or(30))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_queue_history(queue: State<'_, Arc<QueueState>>) -> Result<(), String> {
    queue.clear_history().await.map_err(|e| e.to_string())
}
