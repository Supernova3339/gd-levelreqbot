use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
}

pub struct PendingUpdate(pub Mutex<Option<tauri_plugin_updater::Update>>);

/// Holds the in-flight download task so it can be aborted by `cancel_update`.
pub struct DownloadHandle(pub Mutex<Option<JoinHandle<()>>>);

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    pending: State<'_, Arc<PendingUpdate>>,
) -> Result<Option<UpdateInfo>, String> {
    let result = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await;

    let update = match result {
        Ok(u) => u,
        Err(e) => {
            let msg = e.to_string().to_lowercase();
            // No releases published yet — treat as up to date.
            if msg.contains("release json") || msg.contains("404") || msg.contains("no releases") {
                return Ok(None);
            }
            return Err(e.to_string());
        }
    };

    match update {
        Some(u) => {
            let info = UpdateInfo {
                version: u.version.clone(),
                current_version: u.current_version.clone(),
                notes: u.body.clone(),
            };
            *pending.0.lock().await = Some(u);
            Ok(Some(info))
        }
        None => Ok(None),
    }
}

/// Spawns the download in a background task and returns immediately.
/// Progress is reported via `update-progress` events.
/// Completion is reported via `update-installed` or `update-error` events.
/// The task handle is stored in `DownloadHandle` so `cancel_update` can abort it.
#[tauri::command]
pub async fn download_and_install_update(
    app: AppHandle,
    pending: State<'_, Arc<PendingUpdate>>,
    dl_handle: State<'_, Arc<DownloadHandle>>,
) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .await
        .take()
        .ok_or_else(|| "No pending update — call check_for_update first".to_string())?;

    let downloaded    = Arc::new(AtomicU64::new(0));
    let dl            = Arc::clone(&downloaded);
    let app_progress  = app.clone();
    let app_complete  = app.clone();
    let handle_arc    = Arc::clone(&*dl_handle);

    let task = tokio::spawn(async move {
        let result = update
            .download_and_install(
                move |chunk_len, content_len| {
                    let cumulative =
                        dl.fetch_add(chunk_len as u64, Ordering::Relaxed) + chunk_len as u64;
                    app_progress
                        .emit(
                            "update-progress",
                            serde_json::json!({ "downloaded": cumulative, "total": content_len }),
                        )
                        .ok();
                },
                || {},
            )
            .await;

        // Release the handle slot — if we got here the task wasn't aborted.
        *handle_arc.0.lock().await = None;

        match result {
            Ok(_) => { app_complete.emit("update-installed", ()).ok(); }
            Err(e) => { app_complete.emit("update-error", e.to_string()).ok(); }
        }
    });

    *dl_handle.0.lock().await = Some(task);
    Ok(())
}

/// Aborts the in-flight download task. No-op if no download is running.
#[tauri::command]
pub async fn cancel_update(
    dl_handle: State<'_, Arc<DownloadHandle>>,
) -> Result<(), String> {
    if let Some(handle) = dl_handle.0.lock().await.take() {
        handle.abort();
    }
    Ok(())
}
