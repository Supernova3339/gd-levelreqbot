use crate::auth::{twitch, youtube};
use crate::config::AppConfig;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use tracing::{info, warn};

// ─── Connection commands ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn connect_twitch(_config: State<'_, Arc<RwLock<AppConfig>>>) -> Result<(), String> {
    twitch::start_auth_flow()
        .await
        .map_err(|e| format!("Failed to start Twitch auth: {e}"))
}

/// Check whether the stored Twitch access token is valid.
/// If it isn't and we have a refresh token, attempt a silent refresh first.
/// Returns true if a valid token is now in place.
#[tauri::command]
pub async fn check_twitch_token(config: State<'_, Arc<RwLock<AppConfig>>>) -> Result<bool, String> {
    let (access, refresh) = {
        let cfg = config.read().await;
        (cfg.auth.twitch_access_token.clone(), cfg.auth.twitch_refresh_token.clone())
    };

    if twitch::validate_token(&access).await {
        return Ok(true);
    }

    if refresh.is_empty() {
        return Ok(false);
    }

    warn!("Twitch access token expired — attempting silent refresh");
    match twitch::refresh_access_token(&refresh).await {
        Ok(new) => {
            let mut cfg = config.write().await;
            cfg.auth.twitch_access_token  = new.access_token;
            cfg.auth.twitch_refresh_token = new.refresh_token;
            cfg.save().await.map_err(|e| e.to_string())?;
            info!("Twitch token silently refreshed");
            Ok(true)
        }
        Err(e) => {
            warn!("Twitch silent refresh failed: {e}");
            Ok(false)
        }
    }
}

/// Explicitly trigger a Twitch token refresh (e.g. from the Settings UI).
#[tauri::command]
pub async fn refresh_twitch_token(config: State<'_, Arc<RwLock<AppConfig>>>) -> Result<(), String> {
    let refresh = config.read().await.auth.twitch_refresh_token.clone();
    let new = twitch::refresh_access_token(&refresh).await.map_err(|e| e.to_string())?;
    let mut cfg = config.write().await;
    cfg.auth.twitch_access_token  = new.access_token;
    cfg.auth.twitch_refresh_token = new.refresh_token;
    cfg.save().await.map_err(|e| e.to_string())?;
    info!("Twitch token manually refreshed");
    Ok(())
}

#[tauri::command]
pub async fn save_twitch_token(
    access_token: String,
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<(), String> {
    let mut cfg = config.write().await;
    cfg.auth.twitch_access_token = access_token;
    cfg.save().await.map_err(|e| e.to_string())?;
    info!("Twitch access token saved");
    Ok(())
}

#[tauri::command]
pub async fn disconnect_twitch(config: State<'_, Arc<RwLock<AppConfig>>>) -> Result<(), String> {
    let mut cfg = config.write().await;
    cfg.auth.twitch_access_token = String::new();
    cfg.save().await.map_err(|e| e.to_string())
}

/// Opens browser for the bot's Twitch account OAuth (different from the channel account).
/// Auth service redirects to /twitch/bot/token on completion.
#[tauri::command]
pub async fn connect_bot_account(_config: State<'_, Arc<RwLock<AppConfig>>>) -> Result<(), String> {
    opener::open("http://gdlqbot.superdev.one/auth/twitch?target=bot")
        .map_err(|e| format!("Failed to open browser: {e}"))
}

#[tauri::command]
pub async fn save_bot_access_token(
    access_token: String,
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<(), String> {
    let mut cfg = config.write().await;
    cfg.auth.bot_access_token = access_token;
    cfg.save().await.map_err(|e| e.to_string())?;
    info!("Twitch bot access token saved");
    Ok(())
}

#[tauri::command]
pub async fn disconnect_bot_account(config: State<'_, Arc<RwLock<AppConfig>>>) -> Result<(), String> {
    let mut cfg = config.write().await;
    cfg.auth.bot_access_token = String::new();
    cfg.save().await.map_err(|e| e.to_string())
}

/// Fetch the Twitch identity for the bot account (if separate from the channel).
#[tauri::command]
pub async fn get_bot_account_info(
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<TwitchUserInfo, String> {
    let token = config.read().await.auth.bot_access_token.clone();
    if token.is_empty() {
        return Err("No bot account token stored.".into());
    }
    let resp = Client::new()
        .get("https://id.twitch.tv/oauth2/validate")
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Token invalid or expired ({})", resp.status()));
    }

    #[derive(Deserialize)]
    struct ValidateResponse { login: String }
    let info = resp.json::<ValidateResponse>().await.map_err(|e| format!("Parse failed: {e}"))?;
    Ok(TwitchUserInfo { display_name: info.login.clone(), login: info.login, profile_image_url: String::new() })
}

// ─── YouTube ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn connect_youtube(_config: State<'_, Arc<RwLock<AppConfig>>>) -> Result<(), String> {
    youtube::start_auth_flow()
        .await
        .map_err(|e| format!("Failed to start YouTube auth: {e}"))
}

/// Check whether the stored YouTube access token is valid.
/// If it isn't and we have a refresh token, attempt a silent refresh first.
#[tauri::command]
pub async fn check_youtube_token(config: State<'_, Arc<RwLock<AppConfig>>>) -> Result<bool, String> {
    let (access, refresh) = {
        let cfg = config.read().await;
        (cfg.auth.youtube_access_token.clone(), cfg.auth.youtube_refresh_token.clone())
    };

    if youtube::validate_token(&access).await {
        return Ok(true);
    }

    if refresh.is_empty() {
        return Ok(false);
    }

    warn!("YouTube access token expired — attempting silent refresh");
    match youtube::refresh_access_token(&refresh).await {
        Ok(new) => {
            let mut cfg = config.write().await;
            cfg.auth.youtube_access_token  = new.access_token;
            cfg.auth.youtube_refresh_token = new.refresh_token;
            cfg.save().await.map_err(|e| e.to_string())?;
            info!("YouTube token silently refreshed");
            Ok(true)
        }
        Err(e) => {
            warn!("YouTube silent refresh failed: {e}");
            Ok(false)
        }
    }
}

/// Explicitly trigger a YouTube token refresh (e.g. from the Settings UI).
#[tauri::command]
pub async fn refresh_youtube_token(config: State<'_, Arc<RwLock<AppConfig>>>) -> Result<(), String> {
    let refresh = config.read().await.auth.youtube_refresh_token.clone();
    let new = youtube::refresh_access_token(&refresh).await.map_err(|e| e.to_string())?;
    let mut cfg = config.write().await;
    cfg.auth.youtube_access_token  = new.access_token;
    cfg.auth.youtube_refresh_token = new.refresh_token;
    cfg.save().await.map_err(|e| e.to_string())?;
    info!("YouTube token manually refreshed");
    Ok(())
}

#[tauri::command]
pub async fn save_youtube_token(
    access_token: String,
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<(), String> {
    let mut cfg = config.write().await;
    cfg.auth.youtube_access_token = access_token;
    cfg.save().await.map_err(|e| e.to_string())?;
    info!("YouTube access token saved");
    Ok(())
}

#[tauri::command]
pub async fn disconnect_youtube(config: State<'_, Arc<RwLock<AppConfig>>>) -> Result<(), String> {
    let mut cfg = config.write().await;
    cfg.auth.youtube_access_token = String::new();
    cfg.save().await.map_err(|e| e.to_string())
}

// ─── User info ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct TwitchUserInfo {
    pub login: String,
    pub display_name: String,
    pub profile_image_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YouTubeUserInfo {
    pub name: String,
    pub picture: String,
    pub email: String,
}

/// Fetch the currently connected Twitch account identity via the validate endpoint.
/// Does not require a Client-ID — works with any valid user access token.
#[tauri::command]
pub async fn get_twitch_user_info(
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<TwitchUserInfo, String> {
    let token = config.read().await.auth.twitch_access_token.clone();
    if token.is_empty() {
        return Err("No Twitch token stored.".into());
    }

    #[derive(Deserialize)]
    struct ValidateResponse {
        login: String,
    }

    let resp = Client::new()
        .get("https://id.twitch.tv/oauth2/validate")
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Token invalid or expired ({}). Reconnect in Settings → Twitch.", resp.status()));
    }

    let info = resp.json::<ValidateResponse>()
        .await
        .map_err(|e| format!("Parse failed: {e}"))?;

    Ok(TwitchUserInfo {
        display_name: info.login.clone(),
        login: info.login,
        profile_image_url: String::new(),
    })
}

/// Fetch the currently connected Google account's profile.
#[tauri::command]
pub async fn get_youtube_user_info(
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<YouTubeUserInfo, String> {
    let token = config.read().await.auth.youtube_access_token.clone();
    if token.is_empty() {
        return Err("No YouTube token stored.".into());
    }

    #[derive(Deserialize)]
    struct GoogleUserInfo {
        name: Option<String>,
        picture: Option<String>,
        email: Option<String>,
    }

    let info = Client::new()
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?
        .json::<GoogleUserInfo>()
        .await
        .map_err(|e| format!("Parse failed: {e}"))?;

    Ok(YouTubeUserInfo {
        name:    info.name.unwrap_or_default(),
        picture: info.picture.unwrap_or_default(),
        email:   info.email.unwrap_or_default(),
    })
}
