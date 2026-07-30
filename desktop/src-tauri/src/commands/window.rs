use tauri::{AppHandle, Manager};

/// Called by level-copy.html when the user clicks the dismiss button.
#[tauri::command]
pub async fn dismiss_level_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("level-copy") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Opens (or focuses) the floating debug console window.
#[tauri::command]
pub async fn open_debug_console(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("debug-console") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "debug-console",
        tauri::WebviewUrl::App("debug-console.html".into()),
    )
    .title("Debug Console")
    .inner_size(960.0, 580.0)
    .min_inner_size(520.0, 320.0)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
