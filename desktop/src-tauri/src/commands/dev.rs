use crate::bot::dev::DevLogger;
use crate::modules::ModuleState;
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

/// Save a PNG screenshot for a module's store listing.
/// Writes to `{modules_dir}/{module_id}/store/screenshots/{filename}`.
/// `png_bytes` is raw PNG data as a Vec<u8> sent from the frontend.
#[tauri::command]
pub async fn save_module_screenshot(
    module_id: String,
    filename: String,
    png_bytes: Vec<u8>,
    modules: State<'_, Arc<ModuleState>>,
) -> Result<String, String> {
    // Basic sanitisation — only allow simple filenames, no path traversal
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".to_string());
    }
    let name = if filename.ends_with(".png") {
        filename.clone()
    } else {
        format!("{filename}.png")
    };

    let dir = modules.modules_dir.join(&module_id).join("store").join("screenshots");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create screenshots dir: {e}"))?;

    let path = dir.join(&name);
    std::fs::write(&path, &png_bytes).map_err(|e| format!("Failed to write screenshot: {e}"))?;

    Ok(path.to_string_lossy().to_string())
}

/// Find the gdlqbot-cli binary and return the directory it lives in.
/// Checks (in order): next to the current exe, Tauri resource dir.
fn find_cli_dir(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();

    #[cfg(target_os = "windows")]
    let name = "gdlqbcli.exe";
    #[cfg(not(target_os = "windows"))]
    let name = "gdlqbcli";

    // Same directory as the running app (production install or dev target/ dir)
    if exe_dir.join(name).exists() {
        return Some(exe_dir);
    }

    // Tauri resource directory (bundled resource path)
    if let Ok(res) = app.path().resource_dir() {
        if res.join(name).exists() {
            return Some(res);
        }
    }

    None
}

#[derive(serde::Serialize)]
pub struct CliInstallResult {
    pub installed: bool,
    pub dir: Option<String>,
    pub already_in_path: bool,
    pub binary_found: bool,
}

/// Check whether the CLI is already findable and whether its directory is in PATH.
#[tauri::command]
pub fn cli_install_status(app: tauri::AppHandle) -> CliInstallResult {
    let dir = find_cli_dir(&app);
    let binary_found = dir.is_some();
    let dir_str = dir.as_ref().map(|d| d.to_string_lossy().to_string());

    let already_in_path = dir_str.as_deref()
        .map(|d| is_dir_in_user_path(d))
        .unwrap_or(false);

    CliInstallResult {
        installed: already_in_path,
        dir: dir_str,
        already_in_path,
        binary_found,
    }
}

/// Add the directory containing gdlqbot-cli to the user's PATH.
#[tauri::command]
pub fn install_cli_to_path(app: tauri::AppHandle) -> Result<CliInstallResult, String> {
    let dir = find_cli_dir(&app)
        .ok_or_else(|| "gdlqbcli binary not found. Run `cargo build -p gdlqbot-cli` to build it.".to_string())?;
    let dir_str = dir.to_string_lossy().to_string();

    if is_dir_in_user_path(&dir_str) {
        return Ok(CliInstallResult {
            installed: true,
            dir: Some(dir_str),
            already_in_path: true,
            binary_found: true,
        });
    }

    add_dir_to_user_path(&dir_str)
        .map_err(|e| format!("Failed to update PATH: {e}"))?;

    Ok(CliInstallResult {
        installed: true,
        dir: Some(dir_str),
        already_in_path: false,
        binary_found: true,
    })
}

/// Remove the CLI directory from the user's PATH.
#[tauri::command]
pub fn uninstall_cli_from_path(app: tauri::AppHandle) -> Result<(), String> {
    let dir = find_cli_dir(&app)
        .ok_or_else(|| "gdlqbot-cli binary not found".to_string())?;
    let dir_str = dir.to_string_lossy().to_string();
    remove_dir_from_user_path(&dir_str)
        .map_err(|e| format!("Failed to update PATH: {e}"))
}

// ── Platform PATH helpers ─────────────────────────────────────────────────────

fn is_dir_in_user_path(dir: &str) -> bool {
    let dir_lower = dir.to_lowercase().trim_end_matches(['/', '\\']).to_string();
    // On Windows, read from the registry so this stays in sync with add/remove operations.
    // The process PATH env var is frozen at launch and would always be stale.
    #[cfg(target_os = "windows")]
    let path_str = read_user_path().unwrap_or_default();
    #[cfg(not(target_os = "windows"))]
    let path_str = std::env::var("PATH").unwrap_or_default();

    let sep = if cfg!(windows) { ';' } else { ':' };
    path_str.split(sep)
        .any(|p| p.to_lowercase().trim_end_matches(['/', '\\']).to_string() == dir_lower)
}

#[cfg(target_os = "windows")]
fn read_user_path() -> Result<String, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let env  = hkcu.open_subkey("Environment").map_err(|e| e.to_string())?;
    env.get_value::<String, _>("Path").map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn write_user_path(new_path: &str) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (env, _) = hkcu.create_subkey("Environment").map_err(|e| e.to_string())?;
    env.set_value("Path", &new_path.to_string()).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn add_dir_to_user_path(dir: &str) -> Result<(), String> {
    let current = read_user_path().unwrap_or_default();
    let dir_lower = dir.to_lowercase().trim_end_matches(['/', '\\']).to_string();
    // Already present?
    if current.split(';').any(|p| p.to_lowercase().trim_end_matches(['/', '\\']).to_string() == dir_lower) {
        return Ok(());
    }
    let new_path = if current.is_empty() {
        dir.to_string()
    } else {
        format!("{};{}", current.trim_end_matches(';'), dir)
    };
    write_user_path(&new_path)
}

#[cfg(target_os = "windows")]
fn remove_dir_from_user_path(dir: &str) -> Result<(), String> {
    let current = read_user_path().unwrap_or_default();
    let dir_lower = dir.to_lowercase().trim_end_matches(['/', '\\']).to_string();
    let filtered: Vec<&str> = current.split(';')
        .filter(|p| p.to_lowercase().trim_end_matches(['/', '\\']).to_string() != dir_lower)
        .collect();
    write_user_path(&filtered.join(";"))
}

#[cfg(not(target_os = "windows"))]
fn add_dir_to_user_path(_dir: &str) -> Result<(), String> {
    Err("PATH editing is only supported on Windows from within the app. Add the directory to your shell profile manually.".into())
}
#[cfg(not(target_os = "windows"))]
fn remove_dir_from_user_path(_dir: &str) -> Result<(), String> {
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
