//! Orchestration of full install / uninstall runs.

use std::fs;
use std::path::Path;

use super::record::write_record;
use super::{bench, dry_run, payload, read_record, seed, uninstaller_name, InstallOptions, InstallRecord, Progress, RECORD_FILE};
use crate::manifest::Manifest;
use crate::platform;
use crate::sys;

/// Perform a full install (or in-place update).
pub fn run_install(manifest: &Manifest, opts: &InstallOptions, progress: Progress) -> Result<(), String> {
    if opts.dry_run {
        return dry_run::simulate_install(manifest, opts, progress);
    }

    progress(0.0, "Benchmarking your computer…");
    progress(0.0, &bench::benchmark_cpu());
    progress(0.0, &bench::benchmark_disk(&opts.dir));
    progress(0.01, "Testing your connection…");
    progress(0.01, &bench::speedtest_network());

    progress(0.02, "Preparing…");
    fs::create_dir_all(&opts.dir).map_err(|e| format!("Cannot create {}: {e}", opts.dir.display()))?;

    // Nothing touches the disk until every payload file checks out.
    progress(0.04, "Validating installation files…");
    payload::validate(manifest, &|frac, name| {
        progress(0.04 + frac * 0.14, name);
    })?;

    // If updating, unregister the previous version first (stale shortcuts,
    // PATH entries and registry data get rewritten below).
    if let Some(old) = read_record(&opts.dir) {
        progress(0.20, "Removing previous version registration…");
        let _ = platform::unregister(manifest, &old.options, &opts.dir);
    }

    progress(0.22, "Extracting files…");
    let files = payload::extract(&opts.dir, opts, &|frac, name| {
        progress(0.22 + frac * 0.48, &format!("Extracting {name}"));
    })?;

    progress(0.72, "Installing uninstaller…");
    let self_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let uninst = opts.dir.join(uninstaller_name());
    if self_exe != uninst {
        fs::copy(&self_exe, &uninst).map_err(|e| format!("Cannot write uninstaller: {e}"))?;
    }

    progress(0.78, "Registering with the system…");
    platform::register(manifest, opts)?;

    progress(0.90, "Writing configuration…");
    seed::write_install_json(manifest, opts)?;

    write_record(
        &opts.dir,
        &InstallRecord {
            product_name: manifest.product_name.clone(),
            identifier: manifest.identifier.clone(),
            version: manifest.version.clone(),
            installed_at: chrono::Local::now().to_rfc3339(),
            options: opts.clone(),
            files,
        },
    )?;

    progress(1.0, "Done");
    Ok(())
}

/// Remove an installed copy. `purge` also deletes the app data directory.
pub fn run_uninstall(
    manifest: &Manifest,
    dir: &Path,
    purge: bool,
    dry: bool,
    progress: Progress,
) -> Result<(), String> {
    if dry {
        return dry_run::simulate_uninstall(manifest, dir, purge, progress);
    }

    let record = read_record(dir)
        .ok_or_else(|| format!("No install record found in {}", dir.display()))?;

    progress(0.05, "Removing system registration…");
    let _ = platform::unregister(manifest, &record.options, dir);

    progress(0.25, "Removing files…");
    let total = record.files.len().max(1);
    for (i, rel) in record.files.iter().enumerate() {
        let _ = fs::remove_file(dir.join(rel));
        progress(0.25 + 0.55 * (i as f32 / total as f32), rel);
    }
    let _ = fs::remove_file(dir.join(RECORD_FILE));

    if purge {
        // Everything Tauri may have created: roaming data, local data
        // (WebView2 cache), config, caches, logs.
        progress(0.85, "Removing app data…");
        for d in sys::all_app_data_dirs(manifest) {
            let _ = fs::remove_dir_all(d);
        }
    } else {
        // Leave settings, but drop install.json's dev/cli claims.
        seed::remove_install_json(manifest);
    }

    progress(0.92, "Cleaning up…");
    remove_empty_tree(dir);

    // Deliberately NOT scheduling self-delete here — see `finalize_uninstall`.
    // In a GUI run this function returns while the window is still showing
    // the (artificially paced) progress bar and then the Done screen; the
    // caller decides when we're actually about to exit.
    progress(1.0, "Done");
    Ok(())
}

/// The uninstaller's own cleanup: its webview cache, the setup log, and
/// finally the install directory itself (which, in a GUI run, still
/// contains this very process's running exe). Call this immediately before
/// the process actually exits — not from inside `run_uninstall` — since the
/// detached retry script's budget (~12s) starts ticking the moment this is
/// called, and it can only succeed at deleting our own exe once we've
/// genuinely exited. Scheduling it early (e.g. mid-`run_uninstall`, while a
/// GUI is still showing progress and waiting on the user to click Finish)
/// lets that whole budget expire before the exe ever releases its lock.
pub fn finalize_uninstall(manifest: &Manifest, dir: &Path) {
    let mut leftover_paths = sys::installer_data_dirs();
    let log_path = sys::setup_log_path(&sys::slug(&manifest.product_name));
    if log_path.exists() {
        leftover_paths.push(log_path);
    }
    // Best-effort now — harmless if it mostly fails (a GUI run's own webview
    // cache is still in use at this exact moment); the detached script's
    // retries are what actually clean up once we've exited.
    for d in &leftover_paths {
        if d.is_dir() {
            let _ = fs::remove_dir_all(d);
        }
    }
    platform::schedule_self_delete(dir, &leftover_paths);
}

/// Delete now-empty directories bottom-up; the dir itself may survive until
/// the running uninstaller exe inside it is deleted (handled per-platform).
fn remove_empty_tree(dir: &Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            if e.path().is_dir() {
                remove_empty_tree(&e.path());
            }
        }
    }
    let _ = fs::remove_dir(dir);
}

pub fn launch_app(manifest: &Manifest, dir: &Path) {
    #[cfg(target_os = "macos")]
    {
        let app = dir.join("app").join(&manifest.exe_name);
        let _ = std::process::Command::new("open").arg(app).spawn();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let exe = super::app_exe_path(manifest, dir);
        let _ = std::process::Command::new(exe).current_dir(dir).spawn();
    }
}
