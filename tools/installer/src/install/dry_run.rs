//! Dry-run simulation: walks through every step an install/uninstall would
//! take, reports it via progress, and guarantees nothing is written. Used
//! while developing the installer (forced when built without a payload) and
//! available behind a checkbox in dev builds.

use std::path::Path;
use std::thread;
use std::time::Duration;

use super::{payload, read_record, InstallOptions, Progress};
use crate::manifest::{Manifest, PAYLOAD};
use crate::sys;

const STEP_DELAY: Duration = Duration::from_millis(30);

pub fn simulate_install(manifest: &Manifest, opts: &InstallOptions, progress: Progress) -> Result<(), String> {
    progress(0.0, "[dry run] would benchmark this computer");
    thread::sleep(STEP_DELAY);
    progress(0.01, "[dry run] would test connection speed");
    thread::sleep(STEP_DELAY);
    progress(0.02, "[dry run] Preparing — nothing will be written");
    thread::sleep(STEP_DELAY);

    // Validation is read-only, so dry runs do it for real when possible.
    if PAYLOAD.is_empty() {
        progress(0.04, "[dry run] would validate installation files (no payload in this build)");
        thread::sleep(STEP_DELAY);
    } else {
        payload::validate(manifest, &|f, name| {
            progress(0.03 + f * 0.10, &format!("[dry run] {name}"));
        })?;
    }

    let entries = if PAYLOAD.is_empty() {
        // Installer-dev build: fake a plausible payload.
        vec![
            format!("app/{}", manifest.exe_name),
            manifest.cli_name.as_deref().map(|c| format!("cli/{c}")).unwrap_or_default(),
        ]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect()
    } else {
        payload::list_entries()?
    };

    let total = entries.len().max(1);
    for (i, rel) in entries.iter().enumerate() {
        if !opts.install_cli && payload::is_cli_entry(rel) {
            continue;
        }
        progress(
            0.05 + 0.60 * (i as f32 / total as f32),
            &format!("[dry run] would extract {rel} → {}", opts.dir.display()),
        );
        thread::sleep(STEP_DELAY);
    }

    progress(0.70, &format!("[dry run] would write uninstaller → {}", opts.dir.join(super::uninstaller_name()).display()));
    thread::sleep(STEP_DELAY);

    for step in registration_steps(manifest, opts) {
        progress(0.78, &format!("[dry run] would {step}"));
        thread::sleep(STEP_DELAY);
    }

    progress(
        0.92,
        &format!(
            "[dry run] would write install.json (dev={}, cli={}, offers={:?})",
            opts.enable_dev, opts.install_cli, opts.selected_offers
        ),
    );
    thread::sleep(STEP_DELAY);
    progress(1.0, "[dry run] complete — no changes were made");
    Ok(())
}

pub fn simulate_uninstall(manifest: &Manifest, dir: &Path, purge: bool, progress: Progress) -> Result<(), String> {
    progress(0.05, "[dry run] Preparing — nothing will be removed");
    thread::sleep(STEP_DELAY);

    let files = read_record(dir)
        .map(|r| r.files)
        .unwrap_or_else(|| vec![format!("app/{}", manifest.exe_name)]);
    let total = files.len().max(1);
    for (i, rel) in files.iter().enumerate() {
        progress(
            0.10 + 0.65 * (i as f32 / total as f32),
            &format!("[dry run] would delete {}", dir.join(rel).display()),
        );
        thread::sleep(STEP_DELAY);
    }
    progress(0.80, "[dry run] would remove shortcuts, registry entries, autostart and PATH changes");
    thread::sleep(STEP_DELAY);
    if purge {
        for d in sys::all_app_data_dirs(manifest) {
            progress(0.88, &format!("[dry run] would purge {}", d.display()));
            thread::sleep(STEP_DELAY);
        }
    }
    for d in sys::installer_data_dirs() {
        progress(0.92, &format!("[dry run] would remove installer residue {}", d.display()));
        thread::sleep(STEP_DELAY);
    }
    progress(1.0, "[dry run] complete — no changes were made");
    Ok(())
}

fn registration_steps(manifest: &Manifest, opts: &InstallOptions) -> Vec<String> {
    let mut steps = Vec::new();
    if cfg!(windows) {
        steps.push("create Add/Remove Programs entry (HKCU Uninstall key)".to_string());
        steps.push(format!("register App Paths entry for {}", manifest.exe_name));
    }
    if opts.file_assoc {
        for a in &manifest.file_associations {
            steps.push(format!("associate .{} files with {}", a.ext, manifest.product_name));
        }
    }
    if opts.start_menu {
        steps.push("create application menu shortcut".to_string());
    }
    if opts.desktop_shortcut {
        steps.push("create desktop shortcut".to_string());
    }
    if opts.install_cli {
        steps.push("add CLI directory to user PATH".to_string());
    }
    steps
}
