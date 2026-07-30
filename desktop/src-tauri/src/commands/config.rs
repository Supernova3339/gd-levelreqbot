use crate::config::AppConfig;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

#[tauri::command]
pub async fn get_config(
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<AppConfig, String> {
    Ok(config.read().await.clone())
}

#[tauri::command]
pub async fn save_config(
    new_config: AppConfig,
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<(), String> {
    let mut cfg = config.write().await;
    // Preserve all tokens managed by the auth flow — the frontend never sets or clears these
    // (OAuth callbacks write them directly; disconnect commands clear them).
    // Access tokens are included here so the setup wizard calling saveConfig() with its
    // empty default state doesn't wipe tokens that were just saved by the OAuth callback.
    let twitch_access   = cfg.auth.twitch_access_token.clone();
    let twitch_refresh  = cfg.auth.twitch_refresh_token.clone();
    let bot_access      = cfg.auth.bot_access_token.clone();
    let bot_refresh     = cfg.auth.bot_refresh_token.clone();
    let youtube_access  = cfg.auth.youtube_access_token.clone();
    let youtube_refresh = cfg.auth.youtube_refresh_token.clone();
    // Merge all user-facing fields — pool is #[serde(skip)] so it's None from frontend
    cfg.auth               = new_config.auth;
    cfg.auth.twitch_access_token   = twitch_access;
    cfg.auth.twitch_refresh_token  = twitch_refresh;
    cfg.auth.bot_access_token      = bot_access;
    cfg.auth.bot_refresh_token     = bot_refresh;
    cfg.auth.youtube_access_token  = youtube_access;
    cfg.auth.youtube_refresh_token = youtube_refresh;
    cfg.modes              = new_config.modes;
    cfg.limits             = new_config.limits;
    cfg.auto_copy_level_id = new_config.auto_copy_level_id;
    cfg.level_thumbnails   = new_config.level_thumbnails;
    cfg.thumbnail_quality  = new_config.thumbnail_quality;
    // GD account is managed by gd_login / gd_logout — never overwrite from frontend
    // setup_complete is only written by mark_setup_complete, not here
    cfg.save().await.map_err(|e| e.to_string())
}

/// Returns true if the user has completed the setup wizard.
/// Reads from the SQLite config row, not from credential presence.
#[tauri::command]
pub async fn is_setup_complete(
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<bool, String> {
    Ok(config.read().await.setup_complete)
}

/// Called by the setup wizard after saving — persists the flag to SQLite.
#[tauri::command]
pub async fn mark_setup_complete(
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<(), String> {
    let mut cfg = config.write().await;
    cfg.setup_complete = true;
    cfg.save().await.map_err(|e| e.to_string())
}
