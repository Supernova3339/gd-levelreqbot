//! Well-known locations: install target, app data dir, name slugs.

use std::path::PathBuf;

use crate::manifest::Manifest;

/// Per-user app data directory — must match Tauri's `app_data_dir()`.
pub fn app_data_dir(manifest: &Manifest) -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(&manifest.identifier)
}

/// The installer's own Tauri identity (webview cache etc. accumulate here).
const INSTALLER_IDENTIFIER: &str = "com.supersoft.gdlqb-installer";

/// Every directory Tauri (and its webview) may have created for an
/// identifier: data, local data/webview cache, config, caches, logs.
/// Used by `--purge` so an uninstall really leaves nothing behind.
pub fn identifier_data_dirs(identifier: &str) -> Vec<PathBuf> {
    let mut dirs_out = Vec::new();
    let mut push = |base: Option<PathBuf>| {
        if let Some(b) = base {
            let p = b.join(identifier);
            if !dirs_out.contains(&p) {
                dirs_out.push(p);
            }
        }
    };
    // Roaming data / Application Support / ~/.local/share
    push(dirs::data_dir());
    // %LOCALAPPDATA% (WebView2 EBWebView cache lives here on Windows)
    push(dirs::data_local_dir());
    // ~/.config / Preferences
    push(dirs::config_dir());
    // ~/.cache / ~/Library/Caches
    push(dirs::cache_dir());
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            push(Some(home.join("Library/Logs")));
            push(Some(home.join("Library/WebKit")));
        }
    }
    dirs_out
}

/// All data dirs of the app itself (for `--purge`).
pub fn all_app_data_dirs(manifest: &Manifest) -> Vec<PathBuf> {
    identifier_data_dirs(&manifest.identifier)
}

/// The installer's own residue (webview cache) — removed on uninstall so the
/// uninstaller doesn't leave its *own* litter behind.
pub fn installer_data_dirs() -> Vec<PathBuf> {
    identifier_data_dirs(INSTALLER_IDENTIFIER)
}

/// Where the installer keeps its own small bits of persisted state (e.g.
/// terms-quiz completion) between runs. Lives under the same identifier as
/// the installer's webview data, so it's already covered by the cleanup in
/// `installer_data_dirs()` above — nothing extra to purge on uninstall.
pub fn installer_state_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(INSTALLER_IDENTIFIER)
}

/// Default install location (per-user, no elevation required).
pub fn default_install_dir(manifest: &Manifest) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Programs")
            .join(&manifest.product_name)
    }
    #[cfg(target_os = "macos")]
    {
        let _ = manifest;
        let apps = PathBuf::from("/Applications");
        if is_writable(&apps) {
            apps
        } else {
            dirs::home_dir().unwrap_or_default().join("Applications")
        }
    }
    #[cfg(target_os = "linux")]
    {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(slug(&manifest.product_name))
    }
}

#[cfg(target_os = "macos")]
fn is_writable(p: &std::path::Path) -> bool {
    let probe = p.join(".gdlqb-write-probe");
    match std::fs::write(&probe, b"") {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Where `Log` writes for a given product slug — shared so cleanup code
/// (run_uninstall) can find the exact same path without duplicating the
/// filename format.
pub fn setup_log_path(product_slug: &str) -> PathBuf {
    std::env::temp_dir().join(format!("{product_slug}-setup.log"))
}

pub fn slug(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}
