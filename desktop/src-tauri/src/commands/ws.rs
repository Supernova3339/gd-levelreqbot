use crate::config::AppConfig;
use crate::ws::WsState;
use serde::Serialize;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

#[derive(Serialize)]
pub struct WsStatus {
    pub running:  bool,
    pub clients:  usize,
    pub port:     u16,
    pub url:      String,
}

#[tauri::command]
pub async fn get_ws_status(
    ws: State<'_, Arc<WsState>>,
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<WsStatus, String> {
    let port = config.read().await.ws.port;
    let url  = format!("ws://127.0.0.1:{}/ws", port);
    Ok(WsStatus {
        running: ws.is_running(),
        clients: ws.client_count(),
        port,
        url,
    })
}

#[tauri::command]
pub async fn get_ws_config(
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<crate::config::WsConfig, String> {
    Ok(config.read().await.ws.clone())
}

#[tauri::command]
pub async fn save_ws_config(
    ws:      State<'_, Arc<WsState>>,
    config:  State<'_, Arc<RwLock<AppConfig>>>,
    enabled: bool,
    port:    u16,
    secret:  String,
) -> Result<(), String> {
    // Persist to DB
    {
        let mut cfg = config.write().await;
        cfg.ws.enabled = enabled;
        cfg.ws.port    = port;
        cfg.ws.secret  = secret.clone();
        cfg.save().await.map_err(|e| e.to_string())?;
    }

    // Start/stop server to match new enabled state
    if enabled && !ws.is_running() {
        ws.start(port, secret);
    } else if !enabled && ws.is_running() {
        ws.stop();
    } else if enabled && ws.is_running() {
        // Port or secret changed — restart
        ws.stop();
        ws.start(port, secret);
    }

    Ok(())
}
