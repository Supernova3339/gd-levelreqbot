//! Bridge to the custom installer: reads `install.json` from the app data
//! dir, which the installer writes at install/update time. It records how the
//! app was installed (developer options, CLI presence) and carries preset
//! settings chosen at install time.

use std::path::PathBuf;
use tauri::Manager;

fn install_json_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("install.json"))
        .map_err(|e| e.to_string())
}

/// Full install info as written by the installer, or `null` when the app was
/// not installed through it (dev builds, portable copies).
#[tauri::command]
pub fn get_install_info(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = install_json_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw).map_err(|e| format!("Corrupt install.json: {e}")),
        Err(_) => Ok(serde_json::Value::Null),
    }
}

/// Whether the installer enabled developer options. Debug builds always
/// report true so the Development tab stays available while developing.
///
/// Release builds require the installer's "blessing": a machine-bound hash
/// written next to `dev_enabled`. Editing `dev_enabled: true` into
/// install.json by hand (or copying a blessed file from another machine)
/// fails verification — dev options can only be granted by running the
/// installer with the developer component selected.
#[tauri::command]
pub fn is_dev_install(app: tauri::AppHandle) -> bool {
    if cfg!(debug_assertions) {
        return true;
    }
    let Ok(info) = get_install_info(app) else { return false };
    let enabled = info.get("dev_enabled").and_then(|b| b.as_bool()).unwrap_or(false);
    let blessing = info.get("dev_blessing").and_then(|b| b.as_str()).unwrap_or("");
    enabled && !blessing.is_empty() && blessing == expected_dev_blessing()
}

// ── Dev blessing verification ─────────────────────────────────────────────────
// KEEP IN SYNC with `tools/installer/src/sys/blessing.rs`.

const BLESSING_DOMAIN: &str = "gdlqb.dev.blessing.v1";
const APP_IDENTIFIER: &str = "com.supersoft.gdlqb";

fn expected_dev_blessing() -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(BLESSING_DOMAIN.as_bytes());
    h.update(b":");
    h.update(APP_IDENTIFIER.as_bytes());
    h.update(b":");
    h.update(machine_id().as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// A stable per-machine identifier. Not secret — an anchor tying the
/// blessing to this OS install.
#[cfg(target_os = "windows")]
fn machine_id() -> String {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Cryptography")
        .and_then(|k| k.get_value::<String, _>("MachineGuid"))
        .unwrap_or_else(|_| fallback_machine_id())
}

#[cfg(target_os = "linux")]
fn machine_id() -> String {
    std::fs::read_to_string("/etc/machine-id")
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| fallback_machine_id())
}

#[cfg(target_os = "macos")]
fn machine_id() -> String {
    std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()
        .and_then(|o| {
            let text = String::from_utf8_lossy(&o.stdout).to_string();
            text.lines()
                .find(|l| l.contains("IOPlatformUUID"))
                .and_then(|l| l.split('"').nth(3).map(String::from))
        })
        .unwrap_or_else(fallback_machine_id)
}

fn fallback_machine_id() -> String {
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_default();
    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_default();
    format!("{user}@{host}")
}

/// Preset settings baked in by the installer, or `null` once consumed.
/// The setup flow reads this on first run and then marks it applied.
#[tauri::command]
pub fn get_install_preset(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let info = get_install_info(app)?;
    let applied = info
        .get("preset_applied")
        .and_then(|b| b.as_bool())
        .unwrap_or(false);
    if applied {
        return Ok(serde_json::Value::Null);
    }
    Ok(info.get("preset").cloned().unwrap_or(serde_json::Value::Null))
}

/// Marketplace module ids the user accepted on the installer's "optional
/// extras" page. Returns the list and clears it, so each accepted offer is
/// only ever installed once. The frontend calls this on startup and installs
/// each id through the normal marketplace flow.
#[tauri::command]
pub fn take_pending_module_installs(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let path = install_json_path(&app)?;
    let raw = match std::fs::read_to_string(&path) {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()),
    };
    let mut v: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Corrupt install.json: {e}"))?;
    let pending: Vec<String> = v
        .get("pending_modules")
        .and_then(|p| p.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect())
        .unwrap_or_default();
    if !pending.is_empty() {
        v["pending_modules"] = serde_json::json!([]);
        std::fs::write(&path, serde_json::to_string_pretty(&v).unwrap())
            .map_err(|e| e.to_string())?;
    }
    Ok(pending)
}

/// Flag the preset as consumed so it is only applied once.
#[tauri::command]
pub fn mark_preset_applied(app: tauri::AppHandle) -> Result<(), String> {
    let path = install_json_path(&app)?;
    let raw = match std::fs::read_to_string(&path) {
        Ok(r) => r,
        Err(_) => return Ok(()), // no install.json — nothing to mark
    };
    let mut v: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Corrupt install.json: {e}"))?;
    v["preset_applied"] = serde_json::Value::Bool(true);
    std::fs::write(&path, serde_json::to_string_pretty(&v).unwrap()).map_err(|e| e.to_string())
}
