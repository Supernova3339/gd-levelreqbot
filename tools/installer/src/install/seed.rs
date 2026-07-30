//! `install.json` — the file the installer leaves in the app's data dir so
//! the app knows how it was installed. Carries the dev-options flag, CLI
//! presence, preset settings, and accepted marketplace offers.

use std::fs;

use super::InstallOptions;
use crate::manifest::Manifest;
use crate::sys;

pub fn write_install_json(manifest: &Manifest, opts: &InstallOptions) -> Result<(), String> {
    let data_dir = sys::app_data_dir(manifest);
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let path = data_dir.join("install.json");

    // Preserve one-shot consumption flags across updates.
    let previous = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    let preset_applied = previous
        .as_ref()
        .and_then(|v| v.get("preset_applied").and_then(|b| b.as_bool()))
        .unwrap_or(false);

    // Developer options carry a machine-bound blessing the app verifies;
    // without it a hand-edited `dev_enabled: true` is ignored.
    let dev_blessing = opts
        .enable_dev
        .then(|| sys::dev_blessing(&manifest.identifier));

    let info = serde_json::json!({
        "version": manifest.version,
        "installed_at": chrono::Local::now().to_rfc3339(),
        "install_dir": opts.dir,
        "dev_enabled": opts.enable_dev,
        "dev_blessing": dev_blessing,
        "cli_installed": opts.install_cli,
        "preset": manifest.preset,
        "preset_applied": preset_applied,
        // Consumed (and cleared) by the app on next launch.
        "pending_modules": opts.selected_offers,
    });
    fs::write(&path, serde_json::to_string_pretty(&info).unwrap()).map_err(|e| e.to_string())
}

pub fn remove_install_json(manifest: &Manifest) {
    let _ = fs::remove_file(sys::app_data_dir(manifest).join("install.json"));
}
