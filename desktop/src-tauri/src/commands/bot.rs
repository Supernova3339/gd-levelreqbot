use base64::Engine as _;
use crate::bot::cmd_cache::CommandCache;
use crate::bot::dev::DevLogger;
use crate::bot::{handler, BotState, BotStatus};
use crate::bot::platform::ChatPlatform;
use crate::bot::twitch::TwitchBot;
use crate::bot::youtube::YouTubeBot;
use crate::config::AppConfig;
use crate::queue::QueueState;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio::sync::RwLock;
use tracing::{error, warn};

#[derive(Serialize)]
pub struct BotStatusResponse {
    pub status: BotStatus,
    pub twitch_connected: bool,
    pub youtube_connected: bool,
}

#[tauri::command]
pub async fn get_bot_status(bot: State<'_, Arc<BotState>>) -> Result<BotStatusResponse, String> {
    let status           = bot.status.read().await.clone();
    let twitch_connected = status == BotStatus::Connected;
    let youtube_connected = {
        let yc = bot.youtube_client.read().await;
        if let Some(ref yb) = *yc { yb.is_connected().await } else { false }
    };
    Ok(BotStatusResponse { status, twitch_connected, youtube_connected })
}

#[tauri::command]
pub async fn start_bot(
    config: State<'_, Arc<RwLock<AppConfig>>>,
    bot: State<'_, Arc<BotState>>,
    queue: State<'_, Arc<QueueState>>,
    cache: State<'_, Arc<CommandCache>>,
    dev: State<'_, Arc<DevLogger>>,
) -> Result<(), String> {
    if !config.read().await.setup_complete {
        return Err("Setup is not complete. Please configure the bot first.".to_string());
    }

    // Prevent double-start
    {
        let status = bot.status.read().await;
        if *status == BotStatus::Connected || *status == BotStatus::Connecting {
            return Err("Bot is already running.".to_string());
        }
    }

    *bot.status.write().await = BotStatus::Connecting;
    bot.app_handle.emit("bot-status-changed", BotStatus::Connecting).ok();

    // Pick IRC credentials:
    // 1. bot_access_token — dedicated bot account (preferred when set)
    // 2. twitch_access_token — channel account (fallback)
    //
    // IMPORTANT: the IRC username MUST match the account the token belongs to.
    // We always fetch it from the validate endpoint — never trust the stored bot_username
    // to be correct, because it may be stale or belong to a different account.
    let (username, token, channel) = {
        let cfg = config.read().await;

        let (raw_token, label) = if !cfg.auth.bot_access_token.is_empty() {
            (cfg.auth.bot_access_token.clone(), "bot_access_token")
        } else if !cfg.auth.twitch_access_token.is_empty() {
            (cfg.auth.twitch_access_token.clone(), "twitch_access_token")
        } else {
            let msg = "No Twitch token found. Connect your account in Settings → Platforms → Twitch.".to_string();
            *bot.status.write().await = BotStatus::Error(msg.clone());
            bot.app_handle.emit("bot-status-changed", BotStatus::Error(msg.clone())).ok();
            return Err(msg);
        };

        dev.log(format!("  using {label} for IRC"));

        // Silently refresh the token if it's expired before attempting to validate.
        // This mirrors what check_twitch_token does, so the bot can start even after
        // the access token has expired — as long as the refresh token is still valid.
        let refresh = if label == "bot_access_token" {
            cfg.auth.bot_refresh_token.clone()
        } else {
            cfg.auth.twitch_refresh_token.clone()
        };
        drop(cfg); // release the read lock before the async refresh call

        let raw_token = if !refresh.is_empty()
            && crate::auth::twitch::validate_token(&raw_token).await == false
        {
            dev.log("  access token expired — attempting silent refresh before connect".to_string());
            match crate::auth::twitch::refresh_access_token(&refresh).await {
                Ok(new) => {
                    let mut cfg = config.write().await;
                    if label == "bot_access_token" {
                        cfg.auth.bot_access_token  = new.access_token.clone();
                        cfg.auth.bot_refresh_token = new.refresh_token;
                    } else {
                        cfg.auth.twitch_access_token  = new.access_token.clone();
                        cfg.auth.twitch_refresh_token = new.refresh_token;
                    }
                    cfg.save_tokens().await.map_err(|e| e.to_string())?;
                    dev.log("  token refreshed successfully".to_string());
                    new.access_token
                }
                Err(e) => {
                    let msg = format!(
                        "Twitch token is expired and silent refresh failed: {e}. \
                         Reconnect in Settings → Twitch."
                    );
                    *bot.status.write().await = BotStatus::Error(msg.clone());
                    bot.app_handle.emit("bot-status-changed", BotStatus::Error(msg.clone())).ok();
                    return Err(msg);
                }
            }
        } else {
            raw_token
        };

        // Fetch the real username from the validate endpoint.
        // This guarantees the IRC NICK matches the token's account.
        let actual_username = match fetch_token_username(&raw_token).await {
            Ok(u) => {
                dev.log(format!("  validate → login: {u}"));
                u
            }
            Err(e) => {
                let msg = format!(
                    "Twitch token validation failed: {e}. \
                     Reconnect in Settings → Twitch."
                );
                *bot.status.write().await = BotStatus::Error(msg.clone());
                bot.app_handle.emit("bot-status-changed", BotStatus::Error(msg.clone())).ok();
                return Err(msg);
            }
        };

        let cfg     = config.read().await;
        let irc_token = format!("oauth:{}", raw_token);
        let channel   = cfg.auth.channel.clone();
        (actual_username, irc_token, channel)
    };

    // Check if the sponsor watermark should be suppressed.
    // Requires both: a stored license token with sp=true, AND the user's suppress preference.
    let suppress_watermark = {
        let pool = queue.db.read().await;
        let token_opt: Option<String> = sqlx::query_scalar(
            "SELECT value FROM kv_store WHERE key = 'sys:license_token'"
        ).fetch_optional(&*pool).await.unwrap_or(None);

        let is_sponsor = token_opt.as_deref().and_then(|t| {
            let b64 = t.split('.').next()?;
            let json = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
            let v: serde_json::Value = serde_json::from_slice(&json).ok()?;
            v.get("sp")?.as_bool()
        }).unwrap_or(false);

        let suppress_flag: Option<String> = sqlx::query_scalar(
            "SELECT value FROM kv_store WHERE key = 'sys:suppress_startup_msg'"
        ).fetch_optional(&*pool).await.unwrap_or(None);

        is_sponsor && suppress_flag.as_deref() == Some("1")
    };

    // Build TwitchBot and connect
    let twitch_bot = Arc::new(TwitchBot::new(
        username,
        token,
        channel,
        bot.message_tx.clone(),
        Arc::clone(&dev),
        suppress_watermark,
    ));

    if let Err(e) = twitch_bot.connect().await {
        let err_msg = format!("Failed to connect to Twitch: {}", e);
        error!("{}", err_msg);
        *bot.status.write().await = BotStatus::Error(err_msg.clone());
        bot.app_handle.emit("bot-status-changed", BotStatus::Error(err_msg.clone())).ok();
        return Err(err_msg);
    }

    // Store the connected client
    *bot.client.write().await = Some(Arc::clone(&twitch_bot));

    // Reload the command cache before spawning the handler
    {
        let pool = queue.db.read().await;
        if let Err(e) = cache.reload(&*pool).await {
            error!("Failed to reload command cache on start: {e}");
        }
    }

    // Connect YouTube if an access token is available (non-blocking — failure just skips YT).
    let youtube_token = config.read().await.auth.youtube_access_token.clone();
    let youtube_bot_arc: Option<Arc<YouTubeBot>> = if !youtube_token.is_empty() {
        let yb = Arc::new(YouTubeBot::new(youtube_token, bot.message_tx.clone(), suppress_watermark));
        match yb.connect().await {
            Ok(()) => {
                *bot.youtube_client.write().await = Some(Arc::clone(&yb));
                Some(yb)
            }
            Err(e) => {
                warn!("YouTube bot failed to connect (non-fatal): {e}");
                None
            }
        }
    } else {
        None
    };

    // Spawn the chat command processor
    let rx         = bot.message_tx.subscribe();
    let queue_arc  = Arc::clone(&queue);
    let config_arc = Arc::clone(&config);
    let client_arc = Arc::clone(&twitch_bot);
    let yt_arc     = youtube_bot_arc;
    let app_handle = bot.app_handle.clone();
    let cache_arc  = Arc::clone(&cache);

    tokio::spawn(async move {
        handler::process_messages(rx, queue_arc, config_arc, client_arc, yt_arc, app_handle, cache_arc).await;
    });

    *bot.status.write().await = BotStatus::Connected;
    bot.app_handle.emit("bot-status-changed", BotStatus::Connected).ok();

    Ok(())
}

/// Validate a raw token (without "oauth:" prefix) and return the Twitch login name.
/// Fails if the token is invalid, expired, or missing required IRC scopes.
async fn fetch_token_username(token: &str) -> Result<String, String> {
    #[derive(Deserialize)]
    struct ValidateResp {
        login:  String,
        scopes: Vec<String>,
    }

    let resp = Client::new()
        .get("https://id.twitch.tv/oauth2/validate")
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Token rejected by Twitch (HTTP {}). Get a fresh token in Settings → Twitch.",
            resp.status()
        ));
    }

    let info = resp.json::<ValidateResp>()
        .await
        .map_err(|e| format!("Parse error: {e}"))?;

    // Check IRC scopes are present
    let required = ["chat:read", "chat:edit"];
    let missing: Vec<&str> = required.iter()
        .filter(|&&s| !info.scopes.iter().any(|sc| sc == s))
        .copied()
        .collect();

    if !missing.is_empty() {
        return Err(format!(
            "Token for '{}' is missing IRC scopes: {}. \
             Deploy the auth service, then reconnect in Settings → Twitch.",
            info.login,
            missing.join(", ")
        ));
    }

    Ok(info.login)
}

#[tauri::command]
pub async fn stop_bot(bot: State<'_, Arc<BotState>>) -> Result<(), String> {
    let client = bot.client.read().await.clone();
    if let Some(twitch_bot) = client {
        if let Err(e) = twitch_bot.disconnect().await {
            error!("Error disconnecting Twitch bot: {}", e);
        }
    }
    *bot.client.write().await = None;

    let yt = bot.youtube_client.read().await.clone();
    if let Some(yt_bot) = yt {
        if let Err(e) = yt_bot.disconnect().await {
            error!("Error disconnecting YouTube bot: {}", e);
        }
    }
    *bot.youtube_client.write().await = None;

    *bot.status.write().await = BotStatus::Stopped;
    bot.app_handle.emit("bot-status-changed", BotStatus::Stopped).ok();
    Ok(())
}
