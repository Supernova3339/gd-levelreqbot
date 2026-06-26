mod api;
mod auth;
mod bot;
mod commands;
mod config;
mod gd;
mod integrations;
mod queue;
mod scripting;
mod ws;

use std::sync::Arc;
use tauri::{Emitter, Listener, Manager};
use tokio::sync::{watch, RwLock};
use tracing::{error, info};

use bot::cmd_cache::CommandCache;
use bot::dev::DevLogger;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // A second launch attempt was blocked — focus the existing window instead
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
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

            tauri::async_runtime::block_on(async {
                splash!("Initializing database…");
                let pool = queue::db::init(&app_handle)
                    .await.expect("failed to initialize database");

                splash!("Loading configuration…");
                let cfg = config::AppConfig::load(&pool)
                    .await.expect("failed to load config");

                let queue_state = Arc::new(queue::QueueState::new(pool));
                let bot_state   = bot::BotState::new(app_handle.clone());
                let cfg_arc     = Arc::new(RwLock::new(cfg));
                let cmd_cache   = CommandCache::new();
                let dev_logger  = DevLogger::new(app_handle.clone());

                splash!("Loading commands…");
                {
                    let pool = queue_state.db.read().await;
                    if let Err(e) = cmd_cache.reload(&*pool).await {
                        error!("Failed to load command cache: {e}");
                    }
                    // Seed stdlib libraries (only inserts if not already present)
                    seed_stdlib_libraries(&pool).await;
                }

                let api_cfg    = Arc::clone(&cfg_arc);
                let api_handle = app_handle.clone();
                let api_shutdown_rx = shutdown_rx;
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = api::start(api_cfg, api_handle, api_shutdown_rx).await {
                        error!("API server error: {e}");
                    }
                });

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
                app_handle.manage(bot_state);
                app_handle.manage(cmd_cache);
                app_handle.manage(dev_logger);
                app_handle.manage(ws_state);
                app_handle.manage(shutdown_tx);
            });

            info!("GD Level Request Bot started");

            // ── Level-copy overlay ────────────────────────────────────────────────
            // Hidden by default; shown on `level-nexted` / `level-copied` events.
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

                // Forward `level-nexted` / `level-copied` events to the overlay window.
                // We clone the AppHandle so the closures can look up the window by label.
                let ah1 = app.handle().clone();
                app.handle().listen("level-nexted", move |event| {
                    use tauri::Emitter;
                    if let Some(win) = ah1.get_webview_window("level-copy") {
                        let payload = event.payload().to_string();
                        tauri::async_runtime::spawn(async move {
                            let _ = win.show();
                            let _ = win.set_focus();
                            let _ = win.emit("show-level-nexted", payload);
                        });
                    }
                });

                let ah2 = app.handle().clone();
                app.handle().listen("level-copied", move |event| {
                    use tauri::Emitter;
                    if let Some(win) = ah2.get_webview_window("level-copy") {
                        let payload = event.payload().to_string();
                        tauri::async_runtime::spawn(async move {
                            let _ = win.show();
                            let _ = win.set_focus();
                            let _ = win.emit("show-level-copied", payload);
                        });
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Config
            commands::config::get_config,
            commands::config::save_config,
            commands::config::is_setup_complete,
            commands::config::mark_setup_complete,
            // Queue
            commands::queue::get_viewer_queue,
            commands::queue::get_subscriber_queue,
            commands::queue::add_to_queue,
            commands::queue::remove_from_queue,
            commands::queue::clear_queue,
            commands::queue::next_level,
            commands::queue::get_queue_position,
            // Bot
            commands::bot::start_bot,
            commands::bot::stop_bot,
            commands::bot::get_bot_status,
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
            // Licensing
            commands::licensing::get_license_token,
            commands::licensing::set_license_token,
            commands::licensing::clear_license_token,
            commands::licensing::verify_license_token,
            commands::licensing::open_github_login,
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
            // Window management
            commands::window::dismiss_level_overlay,
            // Dev
            commands::dev::set_dev_logging,
            commands::dev::get_dev_logs,
            commands::dev::clear_dev_logs,
            commands::dev::is_dev_logging,
            commands::dev::open_devtools,
            commands::dev::restart_app,
            // Keybinds
            commands::keybinds::get_keybinds,
            commands::keybinds::set_keybind,
            // GD API
            commands::gd::search_gd_level,
            commands::gd::search_gd_levels,
            commands::gd::get_gd_user,
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
            commands::templates::load_user_templates,
            commands::templates::save_user_templates,
            // Scripting libraries
            scripting::commands::libraries::get_libraries,
            scripting::commands::libraries::save_library,
            scripting::commands::libraries::delete_library,
            scripting::commands::libraries::get_library_code,
            // WebSocket server
            commands::ws::get_ws_config,
            commands::ws::save_ws_config,
            commands::ws::get_ws_status,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app, event| {
            if let tauri::RunEvent::Exit = event {
                let _ = shutdown_tx_for_run.send(true);
            }
        });
}

async fn seed_stdlib_libraries(pool: &sqlx::SqlitePool) {
    for (name, src) in scripting::stdlib::stdlib_sources() {
        let description = match name {
            "arr"     => "Array utilities: page, find, unique, sum, min_by, max_by, chunk, zip, sort, rotate, etc.",
            "fmt"     => "Formatting: compact numbers, duration, ordinal, bytes, pad, truncate, title_case, etc.",
            "queue"   => "Queue library: add, remove, next, list, position, size, format_page, summary, etc.",
            "counter" => "Named persistent counters: inc, decr, get, set, reset, format.",
            "str"     => "String utilities: parse_int, parse_float, is_number, words, lines, pad, truncate.",
            "io"      => "Data I/O: format_table, kv_parse (uses io proxy for JSON, CSV, splits).",
            _         => "",
        };
        let _ = sqlx::query(
            "INSERT OR IGNORE INTO libraries (name, description, code, is_stdlib, enabled)
             VALUES (?, ?, ?, 1, 1)"
        )
        .bind(name)
        .bind(description)
        .bind(src)
        .execute(pool)
        .await;
    }
}
