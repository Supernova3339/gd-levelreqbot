use crate::config::AppConfig;
use anyhow::Result;
use axum::{
    extract::{Query, State as AxumState},
    response::Html,
    routing::get,
    Router,
};
use serde::Deserialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tracing::{error, info};

#[derive(Clone)]
pub struct ApiState {
    pub config: Arc<RwLock<AppConfig>>,
    pub app_handle: AppHandle,
}

#[derive(Deserialize)]
struct TokenQuery {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "refreshToken", default)]
    refresh_token: String,
}

async fn twitch_callback(
    AxumState(state): AxumState<ApiState>,
    Query(q): Query<TokenQuery>,
) -> Html<&'static str> {
    if q.access_token.is_empty() {
        error!("Twitch callback received empty access token");
        return Html("<h2>Authentication failed — no token received.</h2>");
    }

    let mut cfg = state.config.write().await;
    cfg.auth.twitch_access_token  = q.access_token;
    cfg.auth.twitch_refresh_token = q.refresh_token;
    if let Err(e) = cfg.save_tokens().await {
        error!("Failed to save Twitch token: {e}");
        return Html("<h2>Authentication failed — could not save token.</h2>");
    }

    state.app_handle.emit("twitch-token-saved", ()).ok();
    info!("Twitch access token received and saved");

    Html("<h2 style='font-family:sans-serif;text-align:center;margin-top:80px'>Twitch connected. You can close this tab.</h2>")
}

async fn twitch_bot_callback(
    AxumState(state): AxumState<ApiState>,
    Query(q): Query<TokenQuery>,
) -> Html<&'static str> {
    if q.access_token.is_empty() {
        error!("Twitch bot callback received empty access token");
        return Html("<h2>Authentication failed — no token received.</h2>");
    }
    let mut cfg = state.config.write().await;
    cfg.auth.bot_access_token  = q.access_token;
    cfg.auth.bot_refresh_token = q.refresh_token;
    if let Err(e) = cfg.save_tokens().await {
        error!("Failed to save Twitch bot token: {e}");
        return Html("<h2>Authentication failed — could not save token.</h2>");
    }
    state.app_handle.emit("twitch-bot-token-saved", ()).ok();
    info!("Twitch bot access token received and saved");
    Html("<h2 style='font-family:sans-serif;text-align:center;margin-top:80px'>Bot account connected. You can close this tab.</h2>")
}

/// GET /license/callback?token=...&state=...
/// Called by the browser after the external licensing server completes GitHub OAuth.
/// The token is forwarded to the frontend via a Tauri event; the browser gets a
/// human-readable confirmation page.
async fn license_callback(
    AxumState(state): AxumState<ApiState>,
    Query(q):         Query<LicenseCallbackQuery>,
) -> Html<String> {
    if q.token.is_empty() {
        return Html("<h2 style='font-family:sans-serif;text-align:center;margin-top:80px;color:#ef4444'>Authentication failed — no token received.</h2>".to_string());
    }

    // Forward token to the frontend; the state string is passed through for CSRF validation
    state.app_handle.emit("license-token-received", serde_json::json!({
        "token": q.token,
        "state": q.state,
    })).ok();

    Html(
        "<html><head><title>Authenticated</title>\
         <style>body{font-family:sans-serif;background:#0f0f0f;color:#e0e0e0;\
         display:flex;align-items:center;justify-content:center;height:100vh;margin:0}\
         div{text-align:center}h2{color:#f1f1f1}p{color:#555}</style></head>\
         <body><div><h2>You're all set!</h2>\
         <p>Authentication complete. You can close this tab and return to the app.</p>\
         </div></body></html>".to_string(),
    )
}

#[derive(Deserialize)]
struct LicenseCallbackQuery {
    #[serde(default)]
    token: String,
    #[serde(default)]
    state: String,
}

async fn youtube_callback(
    AxumState(state): AxumState<ApiState>,
    Query(q): Query<TokenQuery>,
) -> Html<&'static str> {
    if q.access_token.is_empty() {
        error!("YouTube callback received empty access token");
        return Html("<h2>Authentication failed — no token received.</h2>");
    }

    let mut cfg = state.config.write().await;
    cfg.auth.youtube_access_token  = q.access_token;
    cfg.auth.youtube_refresh_token = q.refresh_token;
    if let Err(e) = cfg.save_tokens().await {
        error!("Failed to save YouTube token: {e}");
        return Html("<h2>Authentication failed — could not save token.</h2>");
    }

    state.app_handle.emit("youtube-token-saved", ()).ok();
    info!("YouTube access token received and saved");

    Html("<h2 style='font-family:sans-serif;text-align:center;margin-top:80px'>YouTube connected. You can close this tab.</h2>")
}

/// Start the Axum REST API on port 24363.
/// Handles OAuth callbacks from the hosted auth service and exposes queue/system routes.
/// `shutdown_rx` is a watch channel — the server stops when it receives `true`.
pub async fn start(
    config: Arc<RwLock<AppConfig>>,
    app_handle: AppHandle,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
) -> Result<()> {
    let state = ApiState { config, app_handle };

    let app = Router::new()
        .route("/twitch/auth/token",  get(twitch_callback))
        .route("/twitch/bot/token",   get(twitch_bot_callback))
        .route("/youtube/auth/token", get(youtube_callback))
        .route("/license/callback",   get(license_callback))
        .with_state(state);

    // Kill any process currently holding port 24363, then bind.
    kill_port_holder(24363).await;

    let listener = {
        let mut last_err = None;
        let mut result   = None;
        for attempt in 0..5u32 {
            match tokio::net::TcpListener::bind("0.0.0.0:24363").await {
                Ok(l)  => { result = Some(l); break; }
                Err(e) => {
                    last_err = Some(e);
                    if attempt < 4 {
                        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                    }
                }
            }
        }
        result.ok_or_else(|| anyhow::anyhow!(
            "Failed to bind API server on port 24363 after 5 attempts: {}",
            last_err.unwrap()
        ))?
    };
    info!("API server listening on 0.0.0.0:24363");

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.wait_for(|v| *v).await;
            info!("API server shutting down");
        })
        .await?;
    Ok(())
}

/// Find and kill any process holding the given port so we can bind cleanly.
async fn kill_port_holder(port: u16) {
    #[cfg(target_os = "windows")]
    {
        // netstat -ano lists TCP connections with PIDs; find LISTENING on our port
        if let Ok(out) = tokio::process::Command::new("netstat")
            .args(["-ano", "-p", "TCP"])
            .output()
            .await
        {
            let text = String::from_utf8_lossy(&out.stdout);
            let target = format!(":{port}");
            for line in text.lines() {
                if line.contains(&target) && line.contains("LISTENING") {
                    if let Some(pid) = line.split_whitespace().last() {
                        if pid != "0" {
                            info!("Killing process {pid} holding port {port}");
                            let _ = tokio::process::Command::new("taskkill")
                                .args(["/F", "/PID", pid])
                                .output()
                                .await;
                            // Give the OS a moment to release the socket
                            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                        }
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = tokio::process::Command::new("fuser")
            .args(["-k", &format!("{port}/tcp")])
            .output()
            .await;
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}
