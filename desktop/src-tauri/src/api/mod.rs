pub mod preview;
pub use preview::PreviewBroadcast;

use crate::bot::{BotState, BotStatus};
use crate::commands::modules::run_scripts_preflight;
use crate::config::AppConfig;
use crate::modules::ModuleState;
use crate::queue::QueueState;
use crate::urls::MARKETPLACE_BASE;
use anyhow::Result;
use axum::{
    extract::{Path, Query, State as AxumState},
    http::StatusCode,
    response::{Html, Json},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};

#[derive(Clone)]
pub struct ApiState {
    pub config: Arc<RwLock<AppConfig>>,
    pub app_handle: AppHandle,
}

#[derive(Deserialize)]
struct TokenQuery {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "refreshToken", default)]
    refresh_token: String,
}

async fn twitch_callback(
    AxumState(state): AxumState<ApiState>,
    Query(q): Query<TokenQuery>,
) -> Html<&'static str> {
    if q.access_token.is_empty() {
        error!("Twitch callback received empty access token");
        return Html("<h2>Authentication failed — no token received.</h2>");
    }

    let mut cfg = state.config.write().await;
    cfg.auth.twitch_access_token  = q.access_token;
    cfg.auth.twitch_refresh_token = q.refresh_token;
    if let Err(e) = cfg.save_tokens().await {
        error!("Failed to save Twitch token: {e}");
        return Html("<h2>Authentication failed — could not save token.</h2>");
    }

    state.app_handle.emit("twitch-token-saved", ()).ok();
    info!("Twitch access token received and saved");

    Html("<h2 style='font-family:sans-serif;text-align:center;margin-top:80px'>Twitch connected. You can close this tab.</h2>")
}

async fn twitch_bot_callback(
    AxumState(state): AxumState<ApiState>,
    Query(q): Query<TokenQuery>,
) -> Html<&'static str> {
    if q.access_token.is_empty() {
        error!("Twitch bot callback received empty access token");
        return Html("<h2>Authentication failed — no token received.</h2>");
    }
    let mut cfg = state.config.write().await;
    cfg.auth.bot_access_token  = q.access_token;
    cfg.auth.bot_refresh_token = q.refresh_token;
    if let Err(e) = cfg.save_tokens().await {
        error!("Failed to save Twitch bot token: {e}");
        return Html("<h2>Authentication failed — could not save token.</h2>");
    }
    state.app_handle.emit("twitch-bot-token-saved", ()).ok();
    info!("Twitch bot access token received and saved");
    Html("<html><head><title>Authenticated</title>\
                   <style>body{font-family:sans-serif;background:#0f0f0f;color:#e0e0e0;\
                   display:flex;align-items:center;justify-content:center;height:100vh;margin:0}\
                   div{text-align:center}h2{color:#f1f1f1}p{color:#555}</style></head>\
                   <body><div><h2>You're all set!</h2>\
                   <p>Authentication complete. You can close this tab and return to the app.</p>\
                   </div></body></html>")
}

/// GET /license/callback?token=...&state=...
/// Called by the browser after the external licensing server completes GitHub OAuth.
/// The token is forwarded to the frontend via a Tauri event; the browser gets a
/// human-readable confirmation page.
async fn license_callback(
    AxumState(state): AxumState<ApiState>,
    Query(q):         Query<LicenseCallbackQuery>,
) -> Html<String> {
    if q.token.is_empty() {
        return Html("<h2 style='font-family:sans-serif;text-align:center;margin-top:80px;color:#ef4444'>Authentication failed — no token received.</h2>".to_string());
    }

    // Forward token to the frontend; the state string is passed through for CSRF validation
    state.app_handle.emit("license-token-received", serde_json::json!({
        "token": q.token,
        "state": q.state,
    })).ok();

    Html(
        "<html><head><title>Authenticated</title>\
         <style>body{font-family:sans-serif;background:#0f0f0f;color:#e0e0e0;\
         display:flex;align-items:center;justify-content:center;height:100vh;margin:0}\
         div{text-align:center}h2{color:#f1f1f1}p{color:#555}</style></head>\
         <body><div><h2>You're all set!</h2>\
         <p>Authentication complete. You can close this tab and return to the app.</p>\
         </div></body></html>".to_string(),
    )
}

#[derive(Deserialize)]
struct LicenseCallbackQuery {
    #[serde(default)]
    token: String,
    #[serde(default)]
    state: String,
}

async fn youtube_callback(
    AxumState(state): AxumState<ApiState>,
    Query(q): Query<TokenQuery>,
) -> Html<&'static str> {
    if q.access_token.is_empty() {
        error!("YouTube callback received empty access token");
        return Html("<h2>Authentication failed — no token received.</h2>");
    }

    let mut cfg = state.config.write().await;
    cfg.auth.youtube_access_token  = q.access_token;
    cfg.auth.youtube_refresh_token = q.refresh_token;
    if let Err(e) = cfg.save_tokens().await {
        error!("Failed to save YouTube token: {e}");
        return Html("<h2>Authentication failed — could not save token.</h2>");
    }

    state.app_handle.emit("youtube-token-saved", ()).ok();
    info!("YouTube access token received and saved");

    Html("<html><head><title>Authenticated</title>\
                  <style>body{font-family:sans-serif;background:#0f0f0f;color:#e0e0e0;\
                  display:flex;align-items:center;justify-content:center;height:100vh;margin:0}\
                  div{text-align:center}h2{color:#f1f1f1}p{color:#555}</style></head>\
                  <body><div><h2>You're all set!</h2>\
                  <p>Authentication complete. You can close this tab and return to the app.</p>\
                  </div></body></html>")
}

// ── Console event buffer ───────���──────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct ConsoleEvent {
    pub seq:     u64,
    pub level:   String,
    pub message: String,
    pub command: String,
    pub ts:      String,
}

pub struct ConsoleBuf {
    seq:    std::sync::atomic::AtomicU64,
    events: std::sync::Mutex<std::collections::VecDeque<ConsoleEvent>>,
}

impl ConsoleBuf {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            seq:    std::sync::atomic::AtomicU64::new(0),
            events: std::sync::Mutex::new(std::collections::VecDeque::new()),
        })
    }

    pub fn push(&self, level: &str, message: &str, command: &str) {
        let seq = self.seq.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let ts  = chrono::Local::now().format("%H:%M:%S").to_string();
        let mut ev = self.events.lock().unwrap();
        if ev.len() >= 2000 { ev.pop_front(); }
        ev.push_back(ConsoleEvent {
            seq,
            level:   level.into(),
            message: message.into(),
            command: command.into(),
            ts,
        });
    }

    pub fn since(&self, after: u64) -> Vec<ConsoleEvent> {
        self.events.lock().unwrap()
            .iter().filter(|e| e.seq > after).cloned().collect()
    }
}

fn console_buf(h: &tauri::AppHandle) -> Arc<ConsoleBuf> {
    Arc::clone(h.state::<Arc<ConsoleBuf>>().inner())
}

#[derive(serde::Deserialize)]
struct ConsoleQuery { #[serde(default)] after: u64 }

async fn dev_console_events(
    AxumState(s): AxumState<ApiState>,
    Query(q): Query<ConsoleQuery>,
) -> Json<serde_json::Value> {
    let events = console_buf(&s.app_handle).since(q.after);
    Json(serde_json::json!(events))
}

/// Set once this server's TCP listener has actually bound successfully —
/// lets other code (the GitHub OAuth login command, in particular) wait for
/// a real "it's listening" confirmation instead of guessing with a fixed
/// sleep after firing off a restart attempt.
#[derive(Clone)]
pub struct ApiReady(pub tokio::sync::watch::Sender<bool>);

/// Start the Axum REST API on port 24363.
/// Handles OAuth callbacks from the hosted auth service and exposes queue/system routes.
/// `shutdown_rx` is a watch channel — the server stops when it receives `true`.
/// `ready` is signalled `true` right after the listener binds, before serving begins.
pub async fn start(
    config: Arc<RwLock<AppConfig>>,
    app_handle: AppHandle,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
    ready: tokio::sync::watch::Sender<bool>,
) -> Result<()> {
    let state = ApiState { config, app_handle };

    // Only /preview* gets permissive CORS — it's meant to be embedded
    // cross-origin from the JetBrains plugin's webview. Everything else here
    // (OAuth callbacks, and especially the Developer CLI API below) must NOT
    // get Access-Control-Allow-Origin: * — dev_eval runs arbitrary Rhai,
    // dev_marketplace echoes back the live marketplace bearer token, and
    // dev_install/dev_watch_start install modules from a filesystem path.
    // Without permissive CORS, a malicious webpage open in the user's own
    // browser can't read the response to (or, for JSON POSTs, even get past
    // preflight to send) a cross-origin request to these routes. This is
    // defense-in-depth alongside the loopback-only bind below — CORS alone
    // doesn't stop non-browser callers on the same machine or LAN, and the
    // bind alone doesn't stop a malicious page open in the user's own browser.
    let preview_cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let preview_routes = Router::new()
        // IDE preview stream (JetBrains plugin + any browser)
        .route("/preview",         get(preview::preview_page))
        .route("/preview/stream",  get(preview::preview_stream))
        .route("/preview/input",   get(preview::preview_input))
        .layer(preview_cors);

    let other_routes = Router::new()
        .route("/twitch/auth/token",  get(twitch_callback))
        .route("/twitch/bot/token",   get(twitch_bot_callback))
        .route("/youtube/auth/token", get(youtube_callback))
        .route("/license/callback",   get(license_callback))
        // Developer CLI API
        .route("/api/dev/status",             get(dev_status))
        .route("/api/dev/marketplace",        get(dev_marketplace))
        .route("/api/dev/modules",            get(dev_modules))
        .route("/api/dev/commands",           get(dev_commands))
        .route("/api/dev/preflight/{id}",     get(dev_preflight))
        .route("/api/dev/watch",              post(dev_watch_start))
        .route("/api/dev/watch/{id}",         axum::routing::delete(dev_watch_stop))
        .route("/api/dev/install",            post(dev_install))
        .route("/api/dev/eval",               post(dev_eval))
        .route("/api/dev/console/events",     get(dev_console_events));

    let app = Router::new()
        .merge(preview_routes)
        .merge(other_routes)
        .with_state(state);

    // Kill any process currently holding port 24363, then bind. Bounded by a
    // timeout: this shells out to netstat/taskkill (Windows) or fuser (Unix),
    // and if that subprocess ever stalls — AV/EDR software intercepting and
    // hanging child-process spawns from a dev build is a real thing — this
    // whole server would otherwise sit here forever, never reaching the bind
    // or logging anything, with no error either. A stuck cleanup attempt
    // should never be able to block startup outright; if it can't finish in
    // time, just proceed to bind — that fails on its own (with a normal,
    // visible error) if the port's genuinely still held by something.
    if tokio::time::timeout(std::time::Duration::from_secs(3), kill_port_holder(24363))
        .await
        .is_err()
    {
        tracing::warn!("Timed out trying to free port 24363 before bind — proceeding anyway");
    }

    // Loopback-only: this API (especially /api/dev/*) has no auth of its own,
    // so it must never be reachable from other machines on the network.
    // Binding 0.0.0.0 here previously meant anyone on the same LAN/Wi-Fi could
    // hit dev_eval (arbitrary Rhai execution) or dev_marketplace (which
    // returns the live marketplace bearer token) with a plain HTTP request.
    let listener = {
        let mut last_err = None;
        let mut result   = None;
        for attempt in 0..5u32 {
            match tokio::net::TcpListener::bind("127.0.0.1:24363").await {
                Ok(l)  => { result = Some(l); break; }
                Err(e) => {
                    last_err = Some(e);
                    if attempt < 4 {
                        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                    }
                }
            }
        }
        result.ok_or_else(|| anyhow::anyhow!(
            "Failed to bind API server on port 24363 after 5 attempts: {}",
            last_err.unwrap()
        ))?
    };
    info!("API server listening on 127.0.0.1:24363");
    ready.send(true).ok();

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.wait_for(|v| *v).await;
            info!("API server shutting down");
        })
        .await?;
    Ok(())
}

// ── Developer CLI API ─────────────────────────────────────────────────────────
// All handlers pull managed state via app_handle.state() so ApiState stays minimal.

fn modules(h: &tauri::AppHandle) -> std::sync::Arc<ModuleState> {
    Arc::clone(h.state::<std::sync::Arc<ModuleState>>().inner())
}
fn queue(h: &tauri::AppHandle) -> std::sync::Arc<QueueState> {
    Arc::clone(h.state::<std::sync::Arc<QueueState>>().inner())
}

const LICENSE_KV_KEY: &str = "sys:license_token";

/// GET /api/dev/marketplace — lets local dev tooling (the JetBrains plugin's
/// Settings panel) pull the signed-in marketplace token straight from the
/// running app instead of the user copy-pasting it from Development Settings.
/// Loopback-only (see `start`, binds 127.0.0.1:24363); same trust boundary
/// as the OAuth callback routes above, which already hand back live tokens.
async fn dev_marketplace(
    AxumState(s): AxumState<ApiState>,
) -> Json<serde_json::Value> {
    let q = queue(&s.app_handle);
    let pool = q.db.read().await;
    let token: Option<String> = sqlx::query_scalar("SELECT value FROM kv_store WHERE key = ?")
        .bind(LICENSE_KV_KEY)
        .fetch_optional(&*pool)
        .await
        .ok()
        .flatten();
    Json(serde_json::json!({
        "signed_in": token.is_some(),
        "token": token,
        "marketplace_url": MARKETPLACE_BASE,
    }))
}

async fn dev_status(
    AxumState(s): AxumState<ApiState>,
) -> Json<serde_json::Value> {
    let bot: tauri::State<'_, Arc<BotState>> = s.app_handle.state();
    let bot_status = bot.status.read().await.clone();
    let bot_running = bot_status == BotStatus::Connected;
    let cfg = s.config.read().await;
    Json(serde_json::json!({
        "bot_running": bot_running,
        "bot_status": format!("{:?}", bot_status),
        "twitch_connected": !cfg.auth.twitch_access_token.is_empty(),
        "youtube_connected": !cfg.auth.youtube_access_token.is_empty(),
        "api_version": "1",
    }))
}

async fn dev_modules(
    AxumState(s): AxumState<ApiState>,
) -> Json<serde_json::Value> {
    let mods = modules(&s.app_handle).list_modules().await;
    Json(serde_json::json!(mods))
}

async fn dev_commands(
    AxumState(s): AxumState<ApiState>,
) -> Json<serde_json::Value> {
    let q = queue(&s.app_handle);
    let pool = q.db.read().await;
    let rows: Vec<serde_json::Value> = sqlx::query_as::<_, (i64, String, String, i64, String, Option<String>)>(
        "SELECT id, trigger, aliases, enabled, description, builtin_key FROM bot_commands ORDER BY trigger ASC"
    )
    .fetch_all(&*pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(id, trigger, aliases, enabled, description, builtin_key)| serde_json::json!({
        "id": id,
        "trigger": trigger,
        "aliases": aliases,
        "enabled": enabled != 0,
        "description": description,
        "builtin_key": builtin_key,
    }))
    .collect();
    Json(serde_json::json!(rows))
}

async fn dev_preflight(
    AxumState(s): AxumState<ApiState>,
    Path(id): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    let mods = modules(&s.app_handle);
    if mods.get_module(&id).await.is_none() {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": format!("Module '{}' not found", id)})));
    }
    let q = queue(&s.app_handle);
    // Structural checks (file existence, page/library refs, command triggers)…
    let mut issues = mods.preflight(&id).await;
    // …plus runtime checks (execute bot scripts, compile-check UI scripts, run
    // every GDUI *Expr="…" standalone to catch broken function/method calls).
    let script_issues = run_scripts_preflight(&id, &mods, &q, s.app_handle.clone()).await;
    issues.extend(script_issues);
    (StatusCode::OK, Json(serde_json::json!(issues)))
}

#[derive(serde::Deserialize)]
struct WatchBody { source_dir: String }

async fn dev_watch_start(
    AxumState(s): AxumState<ApiState>,
    Json(body): Json<WatchBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    use crate::commands::marketplace::{install_module_from_dir_inner};
    match install_module_from_dir_inner(&body.source_dir, &modules(&s.app_handle), &queue(&s.app_handle), &s.app_handle).await {
        Ok(id) => (StatusCode::OK, Json(serde_json::json!({"module_id": id, "watching": true}))),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": e}))),
    }
}

async fn dev_watch_stop(
    AxumState(s): AxumState<ApiState>,
    Path(id): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    use crate::commands::marketplace::DevWatchRegistry;
    let reg: tauri::State<'_, std::sync::Arc<DevWatchRegistry>> = s.app_handle.state();
    reg.stop(&id).await;
    s.app_handle.emit("module-updated", &id).ok();
    (StatusCode::OK, Json(serde_json::json!({"stopped": true})))
}

#[derive(serde::Deserialize)]
struct InstallBody { source_dir: String }

async fn dev_install(
    AxumState(s): AxumState<ApiState>,
    Json(body): Json<InstallBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    use crate::commands::marketplace::install_module_from_dir_inner;
    match install_module_from_dir_inner(&body.source_dir, &modules(&s.app_handle), &queue(&s.app_handle), &s.app_handle).await {
        Ok(id) => (StatusCode::OK, Json(serde_json::json!({"module_id": id}))),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": e}))),
    }
}

#[derive(serde::Deserialize)]
struct EvalBody { code: String, module_id: Option<String> }

async fn dev_eval(
    AxumState(s): AxumState<ApiState>,
    Json(body): Json<EvalBody>,
) -> (StatusCode, Json<serde_json::Value>) {
    use crate::bot::ChatMessage;
    use crate::scripting::context::ScriptCtx;
    use crate::scripting::execute::run_script_full;

    let q = queue(&s.app_handle);
    let sys_msg = ChatMessage {
        text: String::new(), username: "cli".into(), platform: "system".into(),
        is_mod: true, is_broadcaster: true, is_subscriber: false,
    };
    let ctx = ScriptCtx {
        msg: &sys_msg, args: vec![], queue: q.clone(), config: None,
        command_name: String::new(), command_trigger: String::new(),
        command_counter: 0, sub_mode: false, viewer_limit: 1, sub_limit: 2,
        queue_size: 0, platform: "system".into(), shell_enabled: false,
        module_id: body.module_id.clone(), script_file: None,
        twitch: None, youtube: None, event_chain: vec![],
        redemption_id: None, reward_id: None,
    };
    let eval_src = format!("chat.say(io.encode_json({{ {} }}));", body.code);
    let result = run_script_full(&eval_src, &ctx, s.app_handle.clone()).await;

    if !result.errors.is_empty() {
        return (StatusCode::OK, Json(serde_json::json!({"error": result.errors.join("\n")})));
    }
    let out = result.output.into_iter().next().unwrap_or_else(|| "null".into());
    (StatusCode::OK, Json(serde_json::json!({"result": out})))
}

/// Find and kill any process holding the given port so we can bind cleanly.
///
/// This whole app is one OS process — a redundant/racy call into `start()`
/// (e.g. the OAuth login command's fallback firing while the boot-time
/// server is still mid-bind) would find *our own* PID listed as the port
/// holder here, since it's the same process, just a different task. Without
/// the self-PID check below this used to `taskkill /F`/`fuser -k` the
/// entire running app to "free" a port it already owned — the actual root
/// cause of the server intermittently vanishing instead of ever properly
/// mounting.
async fn kill_port_holder(port: u16) {
    let own_pid = std::process::id();
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        // netstat -ano lists TCP connections with PIDs; find LISTENING on our port
        if let Ok(out) = tokio::process::Command::new("netstat")
            .args(["-ano", "-p", "TCP"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .await
        {
            let text = String::from_utf8_lossy(&out.stdout);
            let target = format!(":{port}");
            for line in text.lines() {
                if line.contains(&target) && line.contains("LISTENING") {
                    if let Some(pid) = line.split_whitespace().last() {
                        if pid != "0" && pid.parse() != Ok(own_pid) {
                            info!("Killing process {pid} holding port {port}");
                            let _ = tokio::process::Command::new("taskkill")
                                .args(["/F", "/PID", pid])
                                .creation_flags(CREATE_NO_WINDOW)
                                .output()
                                .await;
                            // Give the OS a moment to release the socket
                            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                        }
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Plain `fuser -k` kills every PID on the port indiscriminately —
        // list them first (no -k) so our own PID can be filtered out before
        // killing the rest individually.
        if let Ok(out) = tokio::process::Command::new("fuser")
            .args([format!("{port}/tcp")])
            .output()
            .await
        {
            let text = String::from_utf8_lossy(&out.stdout);
            for pid in text.split_whitespace() {
                if pid.parse() == Ok(own_pid) { continue; }
                info!("Killing process {pid} holding port {port}");
                let _ = tokio::process::Command::new("kill")
                    .args(["-9", pid])
                    .output()
                    .await;
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
    }
}
