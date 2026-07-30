//! Tauri commands bridging the wizard UI (ui/) to the install engine.
//! Long-running work happens on a worker thread and streams `progress`
//! events ({fraction, message}) followed by a `finished` event.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::install::{self, InstallOptions};
use crate::manifest::Manifest;
use crate::quiz;
use crate::sys;

/// Immutable context shared with the UI process.
pub struct SetupCtx {
    pub manifest: Manifest,
    pub args: crate::args::Args,
    /// Built without a payload (installer development) — dry-run is forced.
    pub forced_dry: bool,
    pub busy: Arc<AtomicBool>,
}

/// Everything the wizard needs to render itself, in one call.
#[tauri::command]
pub fn get_setup_state(ctx: State<'_, SetupCtx>) -> serde_json::Value {
    let existing = install::find_existing(&ctx.manifest);
    let mut opts = existing
        .as_ref()
        .map(|r| {
            let mut o = r.options.clone();
            // Fresh defaults for one-shot fields; keep the user's components.
            o.selected_offers = InstallOptions::from_defaults(&ctx.manifest).selected_offers;
            o
        })
        .unwrap_or_else(|| InstallOptions::from_defaults(&ctx.manifest));
    opts.apply_args(&ctx.args);
    if ctx.forced_dry {
        opts.dry_run = true;
    }

    serde_json::json!({
        "manifest": ctx.manifest,
        "mode": if ctx.args.uninstall { "uninstall" } else { "install" },
        "existing": existing,
        "options": opts,
        "unattended": ctx.args.unattended,
        "kill_running": ctx.args.kill_running,
        "purge": ctx.args.purge,
        "forced_dry": ctx.forced_dry,
        "dev_build": cfg!(debug_assertions),
        "quiz_required": !quiz::already_passed(&ctx.manifest.license),
    })
}

/// Called once the wizard's terms-comprehension quiz is passed, so the
/// user isn't asked again next run unless the terms text itself changes.
#[tauri::command]
pub fn record_quiz_passed(ctx: State<'_, SetupCtx>) {
    quiz::record_passed(&ctx.manifest.license);
}

#[tauri::command]
pub fn check_app_running(ctx: State<'_, SetupCtx>) -> bool {
    sys::app_is_running(&ctx.manifest)
}

#[tauri::command]
pub fn close_running_app(ctx: State<'_, SetupCtx>) -> Result<(), String> {
    sys::close_running_app(&ctx.manifest)
}

#[tauri::command]
pub fn start_install(
    app: AppHandle,
    ctx: State<'_, SetupCtx>,
    options: InstallOptions,
) -> Result<(), String> {
    let mut options = options;
    if ctx.forced_dry {
        options.dry_run = true; // never trust the UI to keep this on
    }
    spawn_worker(app, ctx, move |manifest, progress| {
        install::run_install(manifest, &options, progress)
    })
}

#[tauri::command]
pub fn start_uninstall(
    app: AppHandle,
    ctx: State<'_, SetupCtx>,
    purge: bool,
    dry_run: bool,
    reason: Option<String>,
) -> Result<(), String> {
    let dry = dry_run || ctx.forced_dry;
    let dir = install::find_existing(&ctx.manifest)
        .map(|r| r.options.dir)
        .unwrap_or_else(|| sys::default_install_dir(&ctx.manifest));
    spawn_worker(app, ctx, move |manifest, progress| {
        if let Some(r) = &reason {
            // Exit-survey answer — lands in the details log for posterity.
            progress(0.0, &format!("Reason given: {r}"));
        }
        install::run_uninstall(manifest, &dir, purge, dry, progress)
    })
}

fn spawn_worker<F>(app: AppHandle, ctx: State<'_, SetupCtx>, work: F) -> Result<(), String>
where
    F: FnOnce(&Manifest, install::Progress) -> Result<(), String> + Send + 'static,
{
    if ctx.busy.swap(true, Ordering::SeqCst) {
        return Err("An operation is already in progress".into());
    }
    let manifest = ctx.manifest.clone();
    let busy = ctx.busy.clone();
    std::thread::spawn(move || {
        let emit_progress = |frac: f32, msg: &str| {
            let _ = app.emit("progress", serde_json::json!({ "fraction": frac, "message": msg }));
        };
        let result = work(&manifest, &emit_progress);
        busy.store(false, Ordering::SeqCst);
        let _ = app.emit(
            "finished",
            serde_json::json!({
                "ok": result.is_ok(),
                "error": result.err(),
            }),
        );
    });
    Ok(())
}

/// Launch the freshly installed app (Finish page, "launch when done").
#[tauri::command]
pub fn launch_app_now(ctx: State<'_, SetupCtx>, dir: String) {
    install::launch_app(&ctx.manifest, std::path::Path::new(&dir));
}

/// The uninstaller's self-cleanup (its own webview cache, the install dir,
/// and — in a GUI run — its own running exe), deliberately deferred until
/// the frontend calls this right before actually exiting: see
/// `install::finalize_uninstall` for why doing it any earlier loses the
/// race against however long the user lingers on the Done screen.
#[tauri::command]
pub fn finalize_uninstall_now(ctx: State<'_, SetupCtx>, dir: String) {
    install::finalize_uninstall(&ctx.manifest, std::path::Path::new(&dir));
}

#[tauri::command]
pub fn default_install_dir(ctx: State<'_, SetupCtx>) -> String {
    sys::default_install_dir(&ctx.manifest).to_string_lossy().to_string()
}

#[tauri::command]
pub fn exit_installer(app: AppHandle, code: i32) {
    app.exit(code);
}

/// Restart the machine (offered when the CLI was added to PATH). Best-effort;
/// a short delay lets the installer window close first.
#[tauri::command]
pub fn restart_machine(app: AppHandle) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("shutdown")
            .args(["/r", "/t", "5", "/c", "Restarting to finish GD Level Request Bot setup"])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("osascript")
            .args(["-e", "tell app \"System Events\" to restart"])
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("systemctl").arg("reboot").spawn();
    }
    app.exit(0);
}
