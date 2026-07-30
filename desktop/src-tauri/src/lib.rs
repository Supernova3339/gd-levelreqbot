#![recursion_limit = "512"]
mod api;
mod auth;
mod bot;
mod commands;
mod config;
mod gd;
mod integrations;
mod modules;
mod queue;
mod scripting;
mod urls;
mod ws;

use std::sync::Arc;
use tauri::{Emitter, Listener, Manager};
use commands::update::{PendingUpdate, DownloadHandle};
use tokio::sync::{watch, RwLock};
use tracing::{error, info};

use api::PreviewBroadcast;
use bot::cmd_cache::CommandCache;
use bot::dev::DevLogger;

const MODULE_FILE_EXTS: &[&str] = &["gdmod", "gdpck", "gdlib"];

fn is_module_package_path(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| MODULE_FILE_EXTS.iter().any(|x| x.eq_ignore_ascii_case(e)))
        .unwrap_or(false)
}

/// Shared state: a .gdmod/.gdpck/.gdlib file the OS opened via this app's
/// file associations, queued until the frontend asks for it. Queueing rather
/// than acting immediately (or showing a native OS dialog) matters because
/// the file can arrive before the React frontend has even mounted — on a
/// cold start, this fires from within `.setup()` while the webview is still
/// loading. The frontend polls for this once on mount (picking up anything
/// queued before it was ready) and again on the `opened-file-pending` event
/// (for the case where the app was already running and a second launch
/// attempt got redirected here by the single-instance plugin).
pub struct PendingOpenedFile(pub tokio::sync::Mutex<Option<std::path::PathBuf>>);

/// Queues a .gdmod/.gdpck/.gdlib file for the frontend to present an install
/// confirmation for. Whether it's actually installable (developer options
/// enabled) is decided when the frontend asks for it, not here — this just
/// records that *something* was opened.
fn queue_opened_module_file(app: &tauri::AppHandle, path: std::path::PathBuf) {
    if let Some(state) = app.try_state::<Arc<PendingOpenedFile>>() {
        let state = Arc::clone(state.inner());
        tauri::async_runtime::spawn(async move {
            *state.0.lock().await = Some(path);
        });
    }
    let _ = app.emit("opened-file-pending", ());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // GTK reads `gtk-modules` out of ~/.config/gtk-3.0/settings.ini (commonly
    // `colorreload-gtk-module:window-decorations-gtk-module`), but those
    // modules only ship with a full desktop environment (GNOME/Pantheon).
    // On a bare-WM setup (Hyprland, sway, i3, ...) — or any of our own Linux
    // bundles run outside a DE — GTK's module loader fails to find them, and
    // webkit2gtk's shared GL/GTK init never completes: the window opens but
    // the webview stays solid black instead of showing the UI. Clearing
    // GTK_MODULES before GTK initializes anywhere in this process skips that
    // lookup entirely, regardless of what the user's settings.ini says.
    #[cfg(target_os = "linux")]
    unsafe {
        std::env::set_var("GTK_MODULES", "");
    }

    // WebKitGTK's DMA-BUF renderer (default since 2.42) has a long-standing
    // rendering regression under Wayland compositors (Hyprland, sway, ...) —
    // hits NVIDIA and some Mesa/AMD/Intel stacks too — where the webview
    // renders solid black instead of the page. This is the other half of the
    // "black window on Linux" failure mode alongside the GTK_MODULES issue
    // above; Tauri's own docs recommend disabling it via this env var. Only
    // set it if the user hasn't already opted into a value themselves.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    // Same symptom, X11-side cause: WebKitGTK's accelerated compositing mode
    // renders blank on certain GPU drivers, VMs, and X11-forwarded/remote
    // sessions (unrelated to the Wayland DMA-BUF path above — this hits
    // X11/XWayland regardless of compositor). Disabling it is the standard
    // workaround. Same opt-out: skip if the user already set a value.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "gdlqbot=info".into()),
        )
        .init();

    // Shutdown channel: send `true` on app exit to stop the API server gracefully,
    // so port 24363 is released before the OS would time it out.
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let shutdown_tx = Arc::new(shutdown_tx);
    let shutdown_tx_for_run = Arc::clone(&shutdown_tx);

    // Readiness channel: flips true the moment the API server's listener
    // actually binds. Managed as state so the OAuth login command can await
    // a real confirmation instead of a fixed sleep before opening the
    // browser to a callback server that might not be up yet.
    let (api_ready_tx, _api_ready_rx) = watch::channel(false);

    tauri::Builder::default()
        .manage(Arc::new(PendingUpdate(tokio::sync::Mutex::new(None))))
        .manage(Arc::new(DownloadHandle(tokio::sync::Mutex::new(None))))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // A second launch attempt was blocked — focus the existing window instead
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
            // The OS launched a new process because the user double-clicked a
            // file association (.gdmod/.gdpck/.gdlib) while we were already
            // running — that new process immediately exits and hands its argv
            // to us here instead.
            for arg in argv.iter().skip(1) {
                let path = std::path::PathBuf::from(arg);
                if is_module_package_path(&path) {
                    queue_opened_module_file(app, path);
                }
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // Helper: send a status message to the in-app loading screen
            macro_rules! splash {
                ($msg:expr) => { app_handle.emit("splash-status", $msg).ok(); };
            }

            // Show the window now, before the (potentially multi-second) backend
            // init below runs. The webview is a separate process — it's already
            // loading index.html/React and will render the LoadingScreen spinner
            // immediately regardless of Rust-side progress, so there's no reason
            // to make the user stare at nothing while we wait for it. The window's
            // `backgroundColor` (tauri.conf.json) avoids the WebView2 white-flash
            // that hiding-until-ready used to work around, so this is safe.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
            }

            tauri::async_runtime::block_on(async {
                splash!("Initializing database…");
                let pool = queue::db::init(&app_handle)
                    .await.expect("failed to initialize database");

                // One-time carryover from the old single listener_type/listener_config
                // columns (migration 0033/0034) into the new multi-listener `listeners`
                // JSON array (0035) — done here in Rust rather than in the SQL migration
                // itself since building the JSON correctly is simpler this way. Only
                // touches rows that still have the pre-0035 default ('[]') and had an
                // old-style listener set, so it's a no-op after the first run.
                {
                    let rows: Vec<(i64, String, String)> = sqlx::query_as(
                        "SELECT id, listener_type, listener_config FROM bot_commands \
                         WHERE listener_type != '' AND listeners = '[]'"
                    ).fetch_all(&pool).await.unwrap_or_default();
                    for (id, listener_type, listener_config) in rows {
                        let json = serde_json::json!([{"type": listener_type, "config": listener_config}]).to_string();
                        let _ = sqlx::query("UPDATE bot_commands SET listeners = ? WHERE id = ?")
                            .bind(json).bind(id).execute(&pool).await;
                    }
                }

                splash!("Loading configuration…");
                let cfg = config::AppConfig::load(&pool)
                    .await.expect("failed to load config");

                let queue_state  = Arc::new(queue::QueueState::new(pool));
                let modules_dir = app_handle.path().app_data_dir()
                    .expect("no app data dir")
                    .join("marketplace");
                std::fs::create_dir_all(&modules_dir).ok();
                let cmd_cache    = CommandCache::new();
                let module_state = Arc::new(modules::ModuleState::new(Arc::clone(&queue_state.db), modules_dir.clone(), Arc::clone(&cmd_cache)));
                let bot_state    = bot::BotState::new(app_handle.clone());
                let cfg_arc      = Arc::new(RwLock::new(cfg));
                let dev_logger   = DevLogger::new(app_handle.clone());

                splash!("Loading commands…");
                {
                    let pool = queue_state.db.read().await;
                    if let Err(e) = cmd_cache.reload(&*pool).await {
                        error!("Failed to load command cache: {e}");
                    }
                }

                // Restore module libraries into the Rhai import registry so scripts
                // can `import "queue-core" as q;` immediately on startup.
                module_state.restore_library_registry().await;

                splash!("Starting local API server…");
                let api_cfg    = Arc::clone(&cfg_arc);
                let api_handle = app_handle.clone();
                let api_shutdown_rx = shutdown_rx;
                let api_ready_for_start = api_ready_tx.clone();
                app_handle.manage(api::ApiReady(api_ready_tx.clone()));
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = api::start(api_cfg, api_handle, api_shutdown_rx, api_ready_for_start).await {
                        error!("API server error: {e}");
                    }
                });

                // Confirmed, not fire-and-forget: wait here (bounded) for the
                // server to actually report itself bound, so a boot-time
                // failure is loud and immediate in the log — not something
                // that only ever surfaces later as a silent dead port when
                // some unrelated feature (e.g. GitHub login) needs it.
                {
                    let mut rx = api_ready_tx.subscribe();
                    match tokio::time::timeout(std::time::Duration::from_secs(5), rx.wait_for(|v| *v)).await {
                        Ok(_)  => info!("API server confirmed up on port 24363"),
                        Err(_) => error!("API server did not confirm startup within 5s — it may still come up late, or may be stuck (see any warnings above)"),
                    }
                }

                // WebSocket server — start immediately if enabled in config
                let ws_state = ws::WsState::new();
                {
                    let cfg = cfg_arc.read().await;
                    if cfg.ws.enabled {
                        splash!("Starting WebSocket server…");
                        ws_state.start(cfg.ws.port, cfg.ws.secret.clone());
                    }
                }

                app_handle.manage(cfg_arc);
                app_handle.manage(queue_state);
                app_handle.manage(module_state);
                app_handle.manage(bot_state);
                app_handle.manage(cmd_cache);
                app_handle.manage(dev_logger);
                app_handle.manage(ws_state);
                app_handle.manage(shutdown_tx);
                app_handle.manage(Arc::new(commands::marketplace::DevWatchRegistry::new()));
                app_handle.manage(Arc::new(PendingOpenedFile(tokio::sync::Mutex::new(None))));

                // Console event buffer — receives console-log and bot-runtime-error events
                // so the CLI `console` command and the indicator dot can read them.
                let console_buf = api::ConsoleBuf::new();
                {
                    let buf = Arc::clone(&console_buf);
                    app_handle.listen("console-log", move |e| {
                        if let Ok(p) = serde_json::from_str::<serde_json::Value>(e.payload()) {
                            buf.push(
                                p["level"].as_str().unwrap_or("log"),
                                p["message"].as_str().unwrap_or(""),
                                p["command"].as_str().unwrap_or(""),
                            );
                        }
                    });
                }
                {
                    let buf = Arc::clone(&console_buf);
                    app_handle.listen("bot-runtime-error", move |e| {
                        if let Ok(p) = serde_json::from_str::<serde_json::Value>(e.payload()) {
                            buf.push(
                                "error",
                                p["message"].as_str().unwrap_or(""),
                                p["command"].as_str().unwrap_or(""),
                            );
                        }
                    });
                }
                app_handle.manage(console_buf);

                // Preview broadcast state — used by GET /preview/stream
                let preview_broadcast = PreviewBroadcast::new();
                app_handle.manage(Arc::clone(&preview_broadcast));

                // Screenshot capture loop: grab the main webview at up to ~20fps
                // and push JPEG frames to any connected /preview/stream WS clients.
                // Unchanged frames are detected by a cheap sampled hash and skipped
                // before encoding, so an idle app costs almost nothing. Encoding
                // runs on a blocking thread to keep the async runtime responsive.
                let capture_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let mut interval = tokio::time::interval(
                        std::time::Duration::from_millis(40)
                    );
                    #[allow(unused_mut, unused_variables)]
                    let mut last_hash: u64 = 0;
                    loop {
                        // Wake on the timer OR immediately after an input event
                        // (kicked by the /preview/input handler), so interactions
                        // stream their visual result with minimal latency.
                        tokio::select! {
                            _ = interval.tick() => {}
                            _ = preview_broadcast.kick.notified() => {
                                // give the webview one frame to paint the change
                                tokio::time::sleep(std::time::Duration::from_millis(16)).await;
                                interval.reset();
                            }
                        }
                        if !preview_broadcast.has_listeners() {
                            // Reset so the first frame after a client connects
                            // always broadcasts, even if content didn't change.
                            #[cfg(target_os = "windows")]
                            { last_hash = 0; }
                            continue;
                        }
                        #[cfg(target_os = "windows")]
                        {
                            // Capture inside a closure so the non-Send HWND is
                            // dropped before the await below.
                            let captured = capture_handle
                                .get_webview_window("main")
                                .and_then(|win| win.hwnd().ok())
                                .and_then(api::preview::capture_window_raw);
                            if let Some((w, h, pixels)) = captured {
                                // FNV-1a over every 64th chunk — fast change detector
                                let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
                                for c in pixels.chunks_exact(64) {
                                    hash ^= u64::from_ne_bytes(c[..8].try_into().unwrap());
                                    hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
                                }
                                if hash == last_hash {
                                    continue;
                                }
                                last_hash = hash;
                                let encoded = tauri::async_runtime::spawn_blocking(move || {
                                    api::preview::encode_jpeg(w, h, pixels)
                                }).await;
                                if let Ok(frame) = encoded {
                                    preview_broadcast.send_frame(frame);
                                }
                            }
                        }
                    }
                });
            });

            info!("GD Level Request Bot started");

            // ── Level-copy overlay ────────────────────────────────────────────────
            // Hidden by default; shown on `level-copied` events (clipboard auto-copy
            // confirmation). It used to also pop up a transient "Now Playing" toast on
            // `level-nexted` — removed as redundant with the in-app UI, which now
            // (queue.gdui) shows the nexted level persistently in its own Level Info
            // panel instead of a toast that disappears in a few seconds.
            if let Ok(overlay) = tauri::WebviewWindowBuilder::new(
                app,
                "level-copy",
                tauri::WebviewUrl::App("level-copy.html".into()),
            )
            .title("Level")
            .inner_size(360.0, 110.0)
            .always_on_top(true)
            .decorations(false)
            .transparent(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .build()
            {
                // Explicitly hide immediately — visible(false) is not always honoured on all platforms
                let _ = overlay.hide();

                let ah2 = app.handle().clone();
                app.handle().listen("level-copied", move |event| {
                    use tauri::Emitter;
                    if let Some(win) = ah2.get_webview_window("level-copy") {
                        let payload = event.payload().to_string();
                        tauri::async_runtime::spawn(async move {
                            let _ = win.show();
                            let _ = win.emit("show-level-copied", payload);
                        });
                    }
                });
            }

            // Fresh launch (not a single-instance relaunch) opened via a file
            // association — same handling as the single-instance argv path above.
            for arg in std::env::args().skip(1) {
                let path = std::path::PathBuf::from(&arg);
                if is_module_package_path(&path) {
                    queue_opened_module_file(&app_handle, path);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Config
            commands::config::get_config,
            commands::config::save_config,
            commands::config::is_setup_complete,
            commands::config::mark_setup_complete,
            // Modules
            commands::modules::list_modules,
            commands::modules::toggle_module,
            commands::modules::install_module,
            commands::modules::uninstall_module,
            commands::modules::eval_module_panel_data,
            commands::modules::execute_module_action,
            commands::modules::read_module_page,
            commands::modules::read_module_script_for_builtin,
            commands::modules::preflight_module,
            commands::modules::eval_rhai_repl,
            // Marketplace
            commands::marketplace::fetch_marketplace,
            commands::marketplace::install_marketplace_module,
            commands::marketplace::install_gdmod_bytes,
            commands::marketplace::install_local_package,
            commands::marketplace::peek_pending_opened_file,
            commands::marketplace::install_pending_opened_file,
            commands::marketplace::get_installed_packages,
            commands::marketplace::uninstall_package,
            commands::marketplace::fetch_marketplace_me,
            commands::marketplace::fetch_marketplace_admin_list,
            // Module developer tools
            commands::marketplace::install_module_from_dir,
            commands::marketplace::hard_refresh_module,
            commands::marketplace::start_module_dev_watch,
            commands::marketplace::stop_module_dev_watch,
            commands::marketplace::list_dev_watches,
            commands::marketplace::restore_dev_watches,
            // Bot
            commands::bot::start_bot,
            commands::bot::stop_bot,
            commands::bot::get_bot_status,
            commands::bot::list_twitch_rewards,
            commands::bot::create_twitch_reward,
            commands::bot::update_twitch_reward,
            commands::bot::delete_twitch_reward,
            // Auth
            commands::auth::connect_twitch,
            commands::auth::check_twitch_token,
            commands::auth::refresh_twitch_token,
            commands::auth::save_twitch_token,
            commands::auth::disconnect_twitch,
            commands::auth::get_twitch_user_info,
            commands::auth::connect_bot_account,
            commands::auth::save_bot_access_token,
            commands::auth::disconnect_bot_account,
            commands::auth::get_bot_account_info,
            commands::auth::connect_youtube,
            commands::auth::check_youtube_token,
            commands::auth::refresh_youtube_token,
            commands::auth::save_youtube_token,
            commands::auth::disconnect_youtube,
            commands::auth::get_youtube_user_info,
            // Bot commands registry
            commands::cmd_registry::get_commands,
            commands::cmd_registry::update_command,
            commands::cmd_registry::create_command,
            commands::cmd_registry::delete_command,
            commands::cmd_registry::reset_counter,
            commands::cmd_registry::save_script,
            commands::cmd_registry::toggle_command_enabled,
            commands::cmd_registry::duplicate_command,
            commands::cmd_registry::reorder_commands,
            commands::cmd_registry::sort_section_commands,
            commands::cmd_registry::list_module_events,
            // Licensing
            commands::licensing::get_license_token,
            commands::licensing::set_license_token,
            commands::licensing::clear_license_token,
            commands::licensing::verify_license_token,
            commands::licensing::open_github_login,
            commands::licensing::gdpr_export,
            commands::licensing::gdpr_erase,
            // Script testing + settings
            commands::scripting::test_script,
            commands::scripting::get_script_settings,
            commands::scripting::save_script_settings,
            commands::scripting::get_last_seen_version,
            commands::scripting::set_last_seen_version,
            commands::scripting::get_suppress_startup_msg,
            commands::scripting::set_suppress_startup_msg,
            commands::scripting::fetch_changelog,
            commands::scripting::fetch_changelog_entry,
            // Updates
            commands::update::check_for_update,
            commands::update::download_and_install_update,
            commands::update::cancel_update,
            // Window management
            commands::window::dismiss_level_overlay,
            commands::window::open_debug_console,
            // Dev
            commands::dev::set_dev_logging,
            commands::dev::get_dev_logs,
            commands::dev::clear_dev_logs,
            commands::dev::is_dev_logging,
            commands::dev::open_devtools,
            commands::dev::restart_app,
            commands::dev::save_module_screenshot,
            commands::dev::cli_install_status,
            commands::dev::install_cli_to_path,
            commands::dev::uninstall_cli_from_path,
            // Installer bridge
            commands::install_info::get_install_info,
            commands::install_info::is_dev_install,
            commands::install_info::get_install_preset,
            commands::install_info::take_pending_module_installs,
            commands::install_info::mark_preset_applied,
            // Keybinds
            commands::keybinds::get_keybinds,
            commands::keybinds::set_keybind,
            // GD API + account integration
            commands::gd::search_gd_level,
            commands::gd::search_gd_levels,
            commands::gd::get_gd_user,
            commands::gd::gd_login,
            commands::gd::gd_logout,
            commands::gd::get_gd_account,
            // Integrations
            commands::integrations::get_integrations,
            commands::integrations::create_integration,
            commands::integrations::update_integration,
            commands::integrations::delete_integration,
            commands::integrations::fetch_integration_value,
            // Script file I/O (native file dialog)
            commands::script_file::save_script_file,
            commands::script_file::save_library_file,
            commands::script_file::load_script_file,
            commands::script_file::load_module_file,
            commands::script_file::pick_directory,
            commands::templates::load_user_templates,
            commands::templates::save_user_templates,
            // Scripting libraries
            scripting::commands::libraries::get_libraries,
            scripting::commands::libraries::save_library,
            scripting::commands::libraries::delete_library,
            scripting::commands::libraries::get_library_code,
            scripting::commands::libraries::uninstall_library,
            // WebSocket server
            commands::ws::get_ws_config,
            commands::ws::save_ws_config,
            commands::ws::get_ws_status,
        ])
        .on_window_event(|window, event| {
            // Intercept close on the main window so we can stop the API server
            // (and release port 24363) before the process exits.
            if window.label() != "main" { return; }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    // Signal API server and other services to stop
                    if let Some(tx) = app.try_state::<Arc<tokio::sync::watch::Sender<bool>>>() {
                        let _ = tx.send(true);
                    }
                    // Brief grace period for graceful shutdown before exiting
                    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                    app.exit(0);
                });
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app, event| {
            // Safety-net: also send shutdown on Exit (e.g. app.exit() path or system termination)
            if let tauri::RunEvent::Exit = event {
                let _ = shutdown_tx_for_run.send(true);
            }
            // NOTE: macOS delivers file-association opens via a RunEvent
            // variant this Tauri version (2.11) doesn't expose the way other
            // versions/docs describe — the Windows/Linux argv paths above
            // (single-instance callback + initial std::env::args()) are the
            // only ones wired up. macOS file-association opens are a known
            // gap, not silently broken — this app's installer tooling is
            // Windows-primary, so left unaddressed for now.
        });
}

