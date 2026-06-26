use tauri::{AppHandle, Manager};

/// Called by the frontend once React has mounted.
/// Closes the splashscreen and reveals the main window.
#[tauri::command]
pub async fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(splash) = app.get_webview_window("splashscreen") {
        splash.close().map_err(|e| e.to_string())?;
    }
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|e| e.to_string())?;
        main.set_focus().ok();
    }
    Ok(())
}

/// Called by level-copy.html when the user clicks the dismiss button.
#[tauri::command]
pub async fn dismiss_level_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("level-copy") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
