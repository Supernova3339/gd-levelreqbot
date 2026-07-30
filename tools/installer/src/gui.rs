//! Tauri shell for the wizard. The actual UI lives in ui/ (plain HTML/CSS/JS,
//! embedded at build time); all logic goes through the commands in ipc.rs.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use crate::args::Args;
use crate::devauth::DevAuthState;
use crate::ipc::{self, SetupCtx};
use crate::manifest::Manifest;

pub fn run(manifest: Manifest, args: Args, forced_dry: bool) -> Result<(), String> {
    let ctx = SetupCtx {
        manifest,
        args,
        forced_dry,
        busy: Arc::new(AtomicBool::new(false)),
    };

    tauri::Builder::default()
        .manage(ctx)
        .manage(Arc::new(DevAuthState::new()))
        .invoke_handler(tauri::generate_handler![
            ipc::get_setup_state,
            ipc::record_quiz_passed,
            ipc::check_app_running,
            ipc::close_running_app,
            ipc::start_install,
            ipc::open_dev_login,
            ipc::verify_dev_token,
            ipc::start_uninstall,
            ipc::launch_app_now,
            ipc::finalize_uninstall_now,
            ipc::default_install_dir,
            ipc::exit_installer,
            ipc::restart_machine,
        ])
        .run(tauri::generate_context!())
        .map_err(|e| format!("Failed to start the setup window: {e}"))
}
