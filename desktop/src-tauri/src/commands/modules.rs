use crate::bot::ChatMessage;
use crate::modules::{ModuleManifest, ModuleState, PreflightIssue};
use crate::queue::QueueState;
use crate::scripting::context::ScriptCtx;
use crate::scripting::execute::{run_script_eval, run_script_full};
use std::sync::Arc;
use tauri::{AppHandle, State};

/// Run preflight checks on all scripts in a module.
///
/// - **Bot command scripts** (keys in `manifest.commands[].builtin_key`) are fully executed.
///   Runtime errors are collected and returned as `PreflightIssue`s.
/// - **UI action scripts** are compile-checked only (execution would cause side effects).
/// - **GDUI page/settings expressions** (every `*Expr="…"` attribute in `.gdui` files) are
///   each executed standalone, catching unimplemented/misspelled functions and methods —
///   the class of bug that only otherwise surfaces once a user actually opens that tab.
///
/// Errors are also emitted as `bot-runtime-error` events for the debug console.
/// Returns the collected issues so callers can surface them in the UI.
pub async fn run_scripts_preflight(
    module_id: &str,
    modules: &Arc<ModuleState>,
    queue: &Arc<QueueState>,
    app_handle: AppHandle,
) -> Vec<PreflightIssue> {
    use crate::scripting::engine::get_engine;

    let Some(manifest) = modules.get_module(module_id).await else { return vec![]; };

    let bot_keys: std::collections::HashSet<&str> = manifest.commands.iter()
        .map(|c| c.builtin_key.as_str())
        .collect();

    let sys_msg = ChatMessage {
        text: String::new(),
        username: "preflight".into(),
        platform: "system".into(),
        is_mod: true,
        is_broadcaster: true,
        is_subscriber: false,
    };

    let engine = get_engine();
    let mut issues: Vec<PreflightIssue> = Vec::new();

    for (key, rel_path) in &manifest.scripts {
        let Some((src, _)) = modules.read_script(module_id, key).await else { continue; };

        if bot_keys.contains(key.as_str()) {
            let ctx = ScriptCtx {
                msg: &sys_msg,
                args: vec![],
                queue: queue.clone(),
                config: None,
                command_name: key.clone(),
                command_trigger: String::new(),
                command_counter: 0,
                sub_mode: false,
                viewer_limit: 1,
                sub_limit: 2,
                queue_size: 0,
                platform: "system".into(),
                shell_enabled: false,
                module_id: Some(module_id.to_string()),
                script_file: Some(rel_path.clone()),
                twitch: None,
                youtube: None,
                event_chain: vec![],
                redemption_id: None,
                reward_id: None,
            };
            let result = run_script_full(&src, &ctx, app_handle.clone()).await;
            for err in result.errors {
                issues.push(PreflightIssue {
                    severity: "error".into(),
                    kind: "script".into(),
                    file: Some(rel_path.clone()),
                    message: err,
                });
            }
        } else {
            if let Err(e) = engine.compile(&src) {
                let msg = format!("Compile error: {e}");
                #[derive(serde::Serialize, Clone)]
                struct RuntimeError { message: String, file: Option<String>, command: String }
                app_handle.emit("bot-runtime-error", RuntimeError {
                    message: msg.clone(),
                    file: Some(rel_path.clone()),
                    command: key.clone(),
                }).ok();
                issues.push(PreflightIssue {
                    severity: "error".into(),
                    kind: "script".into(),
                    file: Some(rel_path.clone()),
                    message: msg,
                });
            }
        }
    }

    // GDUI files: every declared page, plus the settings page.
    let mut gdui_files: Vec<String> = manifest.pages.iter().map(|p| p.file.clone()).collect();
    if let Some(ref settings) = manifest.settings_page {
        gdui_files.push(settings.clone());
    }
    for file in gdui_files {
        issues.extend(
            check_gdui_expressions(module_id, modules, queue, app_handle.clone(), &file).await
        );
    }

    issues
}

/// Extract every `xxxExpr="…"` attribute from a `.gdui` file and execute each one
/// standalone (with `ms` and the other module-scoped proxies available, mirroring
/// what the widget that owns the attribute does at runtime). Flags anything that
/// fails for a reason OTHER than a missing page-state variable (e.g. `selected`,
/// which legitimately doesn't exist outside a real user interaction and can't be
/// simulated here) — so this specifically catches broken/misspelled function and
/// method calls, not "this expression needs state preflight can't provide".
///
/// Known limitation: if a broken call appears *after* a state-variable reference
/// in the same expression (e.g. `ms.bad_fn(selected.level_id)`), Rhai errors on
/// the state variable first and the broken call is never reached — such cases
/// aren't caught. Expressions with no state dependency (the common case for
/// `defaultExpr`, most `dataExpr`, etc.) are checked in full.
async fn check_gdui_expressions(
    module_id: &str,
    modules: &Arc<ModuleState>,
    queue: &Arc<QueueState>,
    app_handle: AppHandle,
    file: &str,
) -> Vec<PreflightIssue> {
    let mut issues = Vec::new();

    let module_dir = modules.module_dir(module_id).await;
    let Ok(xml) = std::fs::read_to_string(module_dir.join(file)) else {
        return issues; // missing-file is already reported by ModuleState::preflight()
    };

    let sys_msg = ChatMessage {
        text: String::new(),
        username: "preflight".into(),
        platform: "system".into(),
        is_mod: true,
        is_broadcaster: true,
        is_subscriber: false,
    };

    for (attr, expr) in extract_gdui_expressions(&xml) {
        // GDUI expressions use single-quoted string literals (XML-safe); the
        // runtime eval path normalises these to Rhai's double-quoted strings
        // before running — mirror that here or every such expression would
        // fail to even parse.
        let normalized = expr.replace('\'', "\"");

        let ctx = ScriptCtx {
            msg: &sys_msg,
            args: vec![],
            queue: queue.clone(),
            config: None,
            command_name: String::new(),
            command_trigger: String::new(),
            command_counter: 0,
            sub_mode: false,
            viewer_limit: 1,
            sub_limit: 2,
            queue_size: 0,
            platform: "system".into(),
            shell_enabled: false,
            module_id: Some(module_id.to_string()),
            script_file: Some(file.to_string()),
            twitch: None,
            youtube: None,
            event_chain: vec![],
            redemption_id: None,
            reward_id: None,
        };

        let result = run_script_eval(&normalized, &ctx, app_handle.clone()).await;
        for err in &result.errors {
            if err.contains("Variable not found") {
                continue; // expected — page state isn't available statically
            }
            issues.push(PreflightIssue {
                severity: "error".into(),
                kind: "ui-expr".into(),
                file: Some(file.to_string()),
                message: format!("{attr}=\"{expr}\": {err}"),
            });
        }
    }

    issues
}

/// Scan raw `.gdui` XML text for every `someExpr="…"` attribute (dataExpr, showExpr,
/// defaultExpr, valueExpr, labelExpr, disabledExpr, etc.) without needing a full XML
/// parser — GDUI's Rhai-expression attributes all follow this naming convention.
/// Returns (attribute_name, unescaped_expression) pairs in document order.
fn extract_gdui_expressions(xml: &str) -> Vec<(String, String)> {
    let mut results = Vec::new();
    let mut search_from = 0usize;

    while let Some(rel_pos) = xml[search_from..].find("Expr=\"") {
        let match_start = search_from + rel_pos; // index of the 'E' in "Expr=\""

        // Walk backward over identifier chars to find the attribute name's start.
        let mut name_start = match_start;
        for (idx, ch) in xml[..match_start].char_indices().rev() {
            if ch.is_ascii_alphanumeric() || ch == '_' {
                name_start = idx;
            } else {
                break;
            }
        }
        let attr_name = xml[name_start..match_start + "Expr".len()].to_string();

        let value_start = match_start + "Expr=\"".len();
        let Some(end_rel) = xml[value_start..].find('"') else { break; };
        let value_end = value_start + end_rel;

        results.push((attr_name, unescape_xml_attr(&xml[value_start..value_end])));
        search_from = value_end + 1;
    }

    results
}

fn unescape_xml_attr(s: &str) -> String {
    s.replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

/// A synthetic "system" chat message used for panel data evaluation and UI actions.
fn system_msg() -> ChatMessage {
    ChatMessage {
        text: String::new(),
        username: "system".into(),
        platform: "system".into(),
        is_mod: true,
        is_broadcaster: true,
        is_subscriber: false,
    }
}

#[tauri::command]
pub async fn list_modules(
    modules: State<'_, Arc<ModuleState>>,
) -> Result<Vec<ModuleManifest>, String> {
    Ok(modules.list_modules().await)
}

#[tauri::command]
pub async fn toggle_module(
    id: String,
    enabled: bool,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    modules.toggle_module(&id, enabled).await.map_err(|e| e.to_string())?;
    app_handle.emit("module-updated", &id).ok();
    Ok(())
}

#[tauri::command]
pub async fn install_module(
    manifest_json: String,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    modules.install_module(&manifest_json, "local", "module").await.map_err(|e| e.to_string())?;
    app_handle.emit("module-updated", ()).ok();
    Ok(())
}

#[tauri::command]
pub async fn uninstall_module(
    id: String,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    modules.uninstall_module(&id).await.map_err(|e| e.to_string())?;
    app_handle.emit("module-updated", ()).ok();
    Ok(())
}

/// Evaluate a Rhai snippet with `ms`, `gd`, and other proxies injected, for panel data bindings.
/// `extra_vars_json` is an optional JSON object whose keys are injected as Rhai scope variables
/// (used to pass panel selection state to DetailCard data expressions).
/// Returns the last expression value serialised as JSON.
#[tauri::command]
pub async fn eval_module_panel_data(
    module_id: String,
    rhai_snippet: String,
    extra_vars_json: Option<String>,
    queue: State<'_, Arc<QueueState>>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let msg = system_msg();
    let ctx = ScriptCtx {
        msg: &msg,
        args: vec![],
        queue: queue.inner().clone(),
        config: None,
        command_name: String::new(),
        command_trigger: String::new(),
        command_counter: 0,
        sub_mode: false,
        viewer_limit: 1,
        sub_limit: 2,
        queue_size: 0,
        platform: "system".into(),
        shell_enabled: false,
        module_id: Some(module_id.clone()),
        script_file: None,
        twitch: None,
        youtube: None,
        event_chain: vec![],
        redemption_id: None,
        reward_id: None,
    };

    // GDUI expressions use single quotes for string literals (XML-safe), but Rhai requires double
    // quotes. Normalise here so authors don't need &quot; escapes in their .gdui files.
    let rhai_snippet = rhai_snippet.replace('\'', "\"");
    let prefix = build_extra_vars_prefix(extra_vars_json.as_deref());
    // run_script_eval suppresses bot-runtime-error events, so errors from missing state vars
    // (e.g. `selected` before first selection) are silently swallowed and we return null.
    let wrapped = format!(
        "{}chat.say(io.encode_json({{ {} }}));",
        prefix, rhai_snippet
    );
    let result = run_script_eval(&wrapped, &ctx, app_handle).await;

    // Return null on any error (missing var, type error, etc.) rather than propagating.
    if !result.errors.is_empty() {
        return Ok("null".into());
    }

    Ok(result.output.into_iter().next().unwrap_or_else(|| "null".into()))
}

/// Build a Rhai prefix that injects a JSON object's keys as scope variables.
fn build_extra_vars_prefix(json: Option<&str>) -> String {
    let Some(json) = json else { return String::new() };
    let Ok(obj) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(json) else {
        return String::new();
    };
    if obj.is_empty() { return String::new(); }

    // Escape the raw JSON for embedding as a Rhai string literal
    let escaped = json.replace('\\', "\\\\").replace('"', "\\\"");
    let mut prefix = format!("let __ev = parse_json(\"{escaped}\");\n");
    for key in obj.keys() {
        if key.chars().all(|c| c.is_alphanumeric() || c == '_') {
            prefix.push_str(&format!("let {key} = __ev[\"{key}\"];\n"));
        }
    }
    prefix
}

/// Execute a module script by action key, optionally with a row JSON context.
/// Returns any chat messages the script produced (can be forwarded to bot).
#[tauri::command]
pub async fn execute_module_action(
    module_id: String,
    action_key: String,
    args: Option<Vec<String>>,
    modules: State<'_, Arc<ModuleState>>,
    queue: State<'_, Arc<QueueState>>,
    app_handle: AppHandle,
) -> Result<Vec<String>, String> {
    let Some((script_src, script_rel)) = modules.read_script(&module_id, &action_key).await else {
        return Err(format!("Script '{}' not found for module '{}'", action_key, module_id));
    };

    let msg = system_msg();
    let ctx = ScriptCtx {
        msg: &msg,
        args: args.unwrap_or_default(),
        queue: queue.inner().clone(),
        config: None,
        command_name: action_key.clone(),
        command_trigger: action_key,
        command_counter: 0,
        sub_mode: false,
        viewer_limit: 1,
        sub_limit: 2,
        queue_size: 0,
        platform: "system".into(),
        shell_enabled: false,
        module_id: Some(module_id),
        script_file: Some(script_rel),
        twitch: None,
        youtube: None,
        event_chain: vec![],
        redemption_id: None,
        reward_id: None,
    };

    let result = run_script_full(&script_src, &ctx, app_handle).await;

    if !result.errors.is_empty() {
        return Err(result.errors.join("; "));
    }
    Ok(result.output)
}

/// Return the Rhai source for the module command that owns the given builtin_key.
/// Used by the Commands editor to show the module's default script content.
#[tauri::command]
pub async fn read_module_script_for_builtin(
    builtin_key: String,
    modules: State<'_, Arc<ModuleState>>,
) -> Result<Option<String>, String> {
    Ok(modules.get_command_script(&builtin_key).await.map(|(_, src, _)| src))
}

/// Read a module's UI page file (e.g. "ui/queue.gdui") from disk as raw XML.
/// The frontend parses the returned XML into a LayoutNode tree for rendering.
#[tauri::command]
pub async fn read_module_page(
    module_id: String,
    path: String,
    modules: State<'_, Arc<ModuleState>>,
) -> Result<String, String> {
    // Sanitise path — prevent directory traversal
    if path.contains("..") || path.starts_with('/') || path.starts_with('\\') {
        return Err("Invalid path".to_string());
    }
    let file_path = modules.module_dir(&module_id).await.join(&path);
    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Could not read module page '{}': {}", path, e))
}

use tauri::Emitter;

/// Evaluate a Rhai snippet in the debug console REPL.
/// Returns a JSON-encoded result value, or an error string.
/// Optionally scoped to a module (injects `ms`).
#[tauri::command]
pub async fn eval_rhai_repl(
    code: String,
    module_id: Option<String>,
    queue: State<'_, Arc<QueueState>>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let msg = system_msg();
    let ctx = ScriptCtx {
        msg: &msg,
        args: vec![],
        queue: queue.inner().clone(),
        config: None,
        command_name: String::new(),
        command_trigger: String::new(),
        command_counter: 0,
        sub_mode: false,
        viewer_limit: 1,
        sub_limit: 2,
        queue_size: 0,
        platform: "system".into(),
        shell_enabled: false,
        module_id: module_id.clone(),
        script_file: None,
        twitch: None,
        youtube: None,
        event_chain: vec![],
        redemption_id: None,
        reward_id: None,
    };

    // Wrap so the last expression value is JSON-encoded and returned via chat.say
    let wrapped = format!("chat.say(io.encode_json({{ {} }}));", code);
    let result = run_script_full(&wrapped, &ctx, app_handle).await;

    if !result.errors.is_empty() {
        return Err(result.errors.join("\n"));
    }
    Ok(result.output.into_iter().next().unwrap_or_else(|| "null".into()))
}

#[tauri::command]
pub async fn preflight_module(
    id: String,
    modules: State<'_, Arc<ModuleState>>,
    queue: State<'_, Arc<QueueState>>,
    app: AppHandle,
) -> Result<Vec<PreflightIssue>, String> {
    // Structural checks: file existence, page refs, library refs, command triggers
    let mut issues = modules.preflight(&id).await;
    // Runtime checks: execute bot command scripts, compile-check UI scripts
    let script_issues = run_scripts_preflight(&id, &modules, &queue, app).await;
    issues.extend(script_issues);
    Ok(issues)
}
