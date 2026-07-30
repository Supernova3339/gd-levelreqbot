// Script execution entry point.
// Builds the Scope with all per-call proxy objects, then runs the script.
//
// Performance:
//   - Engine is built ONCE and cached (see engine.rs) — zero type-registration cost per call
//   - per-command script ASTs are cached by source hash
//   - library sources are loaded from DB on each call (but compiled & cached by hash)

use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::{Arc, Mutex, OnceLock};

use rhai::AST;
use tauri::{AppHandle, Emitter};
use tracing::error;

use super::context::{ScriptCtx, ScriptOutput};
use super::engine::get_engine;
use super::stdlib::load_stdlib_from_db;
use super::proxy::{
    chat::ChatProxy, console::ConsoleProxy, queue::QueueProxy, user::UserProxy,
    store::StoreProxy, data::DataProxy, db::DbProxy,
    gd::GdProxy, rand::RandProxy, time::TimeProxy,
    event::EventProxy, web::WebProxy, io::IoProxy, shell::ShellProxy,
    module_store::ModuleStoreProxy, twitch::TwitchProxy, youtube::YouTubeProxy,
};

// ─── AST cache ────────────────────────────────────────────────────────────────

static AST_CACHE: OnceLock<Mutex<HashMap<u64, AST>>> = OnceLock::new();

fn ast_cache() -> &'static Mutex<HashMap<u64, AST>> {
    AST_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn hash_src(src: &str) -> u64 {
    let mut h = DefaultHasher::new();
    src.hash(&mut h);
    h.finish()
}

// perf: returns Result so callers can distinguish compile errors without re-compiling.
// Uses String for the error so we avoid bringing ParseError's trait bounds into scope.
fn compile_or_cached(engine: &rhai::Engine, src: &str) -> Result<AST, String> {
    let hash = hash_src(src);
    {
        let cache = ast_cache().lock().unwrap();
        if let Some(ast) = cache.get(&hash) {
            return Ok(ast.clone());
        }
    }
    let ast = engine.compile(src).map_err(|e| e.to_string())?;
    ast_cache().lock().unwrap().insert(hash, ast.clone());
    Ok(ast)
}

// ─── Result type for test mode ────────────────────────────────────────────────

pub struct RunResult {
    pub output:     Vec<String>,   // chat.say / chat.reply — goes to chat
    pub console:    Vec<String>,   // console.log/warn/error — dev only, never to chat
    pub errors:     Vec<String>,
    pub elapsed_ms: u64,
}

// ─── Public entry points ──────────────────────────────────────────────────────

pub async fn run_script(
    script:     &str,
    ctx:        &ScriptCtx<'_>,
    app_handle: AppHandle,
) -> Vec<String> {
    run_script_inner(script, ctx, app_handle, true).await.output
}

pub async fn run_script_full(
    script:     &str,
    ctx:        &ScriptCtx<'_>,
    app_handle: AppHandle,
) -> RunResult {
    run_script_inner(script, ctx, app_handle, true).await
}

/// Like `run_script_full` but suppresses `bot-runtime-error` event emission.
/// Use for panel data evaluation where errors are expected (e.g. unset state vars)
/// and should not appear in the console.
pub async fn run_script_eval(
    script:     &str,
    ctx:        &ScriptCtx<'_>,
    app_handle: AppHandle,
) -> RunResult {
    run_script_inner(script, ctx, app_handle, false).await
}

async fn run_script_inner(
    script:      &str,
    ctx:         &ScriptCtx<'_>,
    app_handle:  AppHandle,
    emit_errors: bool,
) -> RunResult {
    let output:  ScriptOutput = Arc::new(Mutex::new(Vec::new()));
    let console: ScriptOutput = Arc::new(Mutex::new(Vec::new()));
    let errors:  Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

    let script_owned  = script.to_string();
    let output_ref    = Arc::clone(&output);
    let console_ref   = Arc::clone(&console);
    let errors_ref    = Arc::clone(&errors);
    let shell_enabled = ctx.shell_enabled;

    let start = std::time::Instant::now();

    let result = tokio::task::block_in_place(|| {
        // perf: reuse the globally cached Engine (no per-call type registrations)
        let engine = get_engine();
        let mut scope = rhai::Scope::new();

        // ── Per-call proxy objects ─────────────────────────────────────────
        let is_module_script = ctx.module_id.is_some();

        scope.push("chat", ChatProxy {
            output:   Arc::clone(&output_ref),
            username: ctx.msg.username.clone(),
            platform: ctx.platform.clone(),
            twitch:   ctx.twitch.clone(),
        });
        scope.push("console", ConsoleProxy {
            output:          Arc::clone(&console_ref),
            app_handle:      Arc::new(app_handle.clone()),
            command_trigger: ctx.command_trigger.clone(),
        });
        scope.push("user",  UserProxy::from_msg(ctx.msg));
        scope.push("rand",  RandProxy::new());
        scope.push("time",  TimeProxy);
        scope.push("event", EventProxy {
            app_handle: app_handle.clone(),
            module_id: ctx.module_id.clone(),
            chain: ctx.event_chain.clone(),
        });
        scope.push("io",    IoProxy);

        // Module store: injected when running a module's script
        if let Some(ref mid) = ctx.module_id {
            scope.push("ms", ModuleStoreProxy::new(mid.clone(), ctx.queue.clone()));
        }

        // GD proxy: available to all scripts (including module panel data expressions)
        scope.push("gd", GdProxy);

        // Twitch/YouTube proxies: available to all scripts, same as `gd`. Both degrade
        // gracefully (unit/false) when the bot isn't connected on that platform.
        scope.push("twitch", TwitchProxy { bot: ctx.twitch.clone() });
        scope.push("youtube", YouTubeProxy { bot: ctx.youtube.clone() });

        // `web` is intentionally NOT given to module scripts (see stock-scripts
        // policy: modules only ever get ms/chat/user/event/time/rand/io) — a
        // marketplace module is third-party code, and unrestricted outbound
        // HTTP from it is an SSRF/exfiltration vector (attacker-controlled
        // module could read local network services or phone home with data
        // pulled from `ms`/`chat`). Only the streamer's own trusted
        // command/library scripts get it.
        if !is_module_script {
            scope.push("web", WebProxy);
        }

        // Legacy proxies — only for non-module scripts (backward compat)
        if !is_module_script {
            scope.push("queue", QueueProxy {
                queue:        ctx.queue.clone(),
                config:       ctx.config.clone(),
                username:     ctx.msg.username.clone(),
                is_sub:       ctx.msg.is_subscriber,
                sub_mode:     ctx.sub_mode,
                viewer_limit: ctx.viewer_limit,
                sub_limit:    ctx.sub_limit,
                app_handle:   app_handle.clone(),
                platform:     ctx.platform.clone(),
            });
            scope.push("store", StoreProxy { queue: ctx.queue.clone() });
            scope.push("data",  DataProxy  { queue: ctx.queue.clone() });
            scope.push("db",    DbProxy    { queue: ctx.queue.clone() });
            scope.push("username",   ctx.msg.username.clone());
            scope.push("platform",   ctx.platform.clone());
            scope.push("sub_mode",   ctx.sub_mode);
            scope.push("queue_size", ctx.queue_size);
        }

        // Shell proxy is only injected when explicitly enabled in script settings,
        // and NEVER for module scripts — shell_enabled is a global setting the
        // streamer flips on for their OWN command scripts; it must not also
        // hand raw process-execution to third-party marketplace module code
        // they never reviewed line-by-line.
        if shell_enabled && !is_module_script {
            scope.push("shell", ShellProxy);
        }

        // ── Primitive context variables (always available) ─────────────────
        scope.push("command_trigger", ctx.command_trigger.clone());

        // Empty string (not unit) when this run wasn't triggered by a
        // redemption — keeps scripts simple (`if redemption_id != ""`)
        // without needing to handle an optional/unit type in Rhai.
        scope.push("redemption_id", ctx.redemption_id.clone().unwrap_or_default());
        scope.push("reward_id", ctx.reward_id.clone().unwrap_or_default());

        // args as a Rhai array so scripts can do args[0], args.len(), etc.
        let args_vec: Vec<rhai::Dynamic> = ctx.args.iter()
            .map(|s| rhai::Dynamic::from(s.clone()))
            .collect();
        scope.push("args", args_vec);

        // ── Load enabled libraries from DB into scope ──────────────────────
        {
            let pool = tokio::runtime::Handle::current().block_on(async {
                ctx.queue.db.read().await.clone()
            });
            load_stdlib_from_db(&mut scope, &pool);
        }

        // ── Compile (cached by source hash) ───────────────────────────────
        // perf: compile_or_cached now returns Result — no second compile pass needed
        let ast = match compile_or_cached(engine, &script_owned) {
            Ok(ast) => ast,
            Err(e) => {
                let msg = format!("Compile error: {e}");
                if emit_errors { error!("{msg}"); } else { tracing::debug!("{msg}"); }
                errors_ref.lock().unwrap().push(msg);
                return Ok(());
            }
        };

        engine.run_ast_with_scope(&mut scope, &ast)
    });

    let elapsed_ms = start.elapsed().as_millis() as u64;

    if let Err(e) = result {
        let msg = format!("Runtime error: {e}");
        if emit_errors { error!("{msg}"); } else { tracing::debug!("{msg}"); }
        errors.lock().unwrap().push(msg);
    }

    let output_lines = match Arc::try_unwrap(output) {
        Ok(m)    => m.into_inner().unwrap_or_default(),
        Err(arc) => arc.lock().unwrap().clone(),
    };
    let console_lines = match Arc::try_unwrap(console) {
        Ok(m)    => m.into_inner().unwrap_or_default(),
        Err(arc) => arc.lock().unwrap().clone(),
    };
    let error_lines = match Arc::try_unwrap(errors) {
        Ok(m)    => m.into_inner().unwrap_or_default(),
        Err(arc) => arc.lock().unwrap().clone(),
    };

    // Emit script errors to the debug console window (fire-and-forget)
    if emit_errors {
        for err in &error_lines {
            #[derive(serde::Serialize, Clone)]
            struct RuntimeError<'a> {
                message: &'a str,
                file: Option<&'a str>,
                command: &'a str,
            }
            app_handle.emit("bot-runtime-error", RuntimeError {
                message: err,
                file: ctx.script_file.as_deref(),
                command: &ctx.command_trigger,
            }).ok();
        }
    }

    RunResult { output: output_lines, console: console_lines, errors: error_lines, elapsed_ms }
}
