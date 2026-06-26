use crate::bot::dev::DevLogger;
use std::sync::{atomic::Ordering, Arc};
use tauri::{Manager, State};
use tokio::sync::watch;

#[tauri::command]
pub async fn set_dev_logging(
    enabled: bool,
    dev: State<'_, Arc<DevLogger>>,
) -> Result<(), String> {
    dev.enabled.store(enabled, Ordering::Relaxed);
    if enabled {
        dev.log("=== Development logging enabled ===".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_dev_logs(dev: State<'_, Arc<DevLogger>>) -> Result<Vec<String>, String> {
    Ok(dev.get_logs())
}

#[tauri::command]
pub async fn clear_dev_logs(dev: State<'_, Arc<DevLogger>>) -> Result<(), String> {
    dev.clear();
    Ok(())
}

#[tauri::command]
pub async fn is_dev_logging(dev: State<'_, Arc<DevLogger>>) -> Result<bool, String> {
    Ok(dev.is_enabled())
}

#[tauri::command]
pub async fn open_devtools(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.open_devtools();
    }
    Ok(())
}

/// Calm restart: gracefully shut down the API server first (releasing port 24363),
/// then spawn a fresh copy and exit.
#[tauri::command]
pub async fn restart_app(
    app: tauri::AppHandle,
    shutdown: State<'_, Arc<watch::Sender<bool>>>,
) -> Result<(), String> {
    // Signal the API server to stop so port 24363 is free before the new process starts
    let _ = shutdown.send(true);
    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    std::process::Command::new(&exe)
        .spawn()
        .map_err(|e| format!("Failed to spawn new instance: {e}"))?;

    tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
    app.exit(0);
    Ok(())
}
