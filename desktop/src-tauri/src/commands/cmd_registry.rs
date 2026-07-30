use crate::bot::cmd_cache::CommandCache;
use crate::modules::ModuleState;
use crate::queue::QueueState;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::State;
use tracing::error;

pub const CMD_SELECT: &str =
    "SELECT id, trigger, aliases, enabled, description, builtin_key, response, \
     required_badges, cooldown_seconds, user_cooldown_seconds, platform, counter, script, script_mode, sort_order, \
     chat_enabled, listeners \
     FROM bot_commands";

/// One entry in `BotCommand.listeners`. `kind` matches `listener_type` values
/// used throughout dispatch ("twitch_redemption", "event"); `config` is the
/// reward title or event name to match. Serializes as `{"type": ..., "config": ...}`
/// to match what the frontend sends (`type` is a reserved word in Rust).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListenerDef {
    #[serde(rename = "type")]
    pub kind: String,
    pub config: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct BotCommand {
    pub id: i64,
    pub trigger: String,
    pub aliases: String,              // JSON array
    pub enabled: i64,
    pub description: String,
    pub builtin_key: Option<String>,
    pub response: Option<String>,
    pub required_badges: String,      // JSON array
    pub cooldown_seconds: i64,        // global cooldown
    pub user_cooldown_seconds: i64,   // per-user cooldown
    pub platform: String,             // 'all' | 'twitch' | 'youtube'
    pub counter: i64,
    pub script: Option<String>,       // Rhai script text — takes precedence over response
    pub script_mode: String,          // "text" | "visual" — locked at creation
    pub sort_order: i64,
    /// Whether this command's chat trigger/aliases are active at all — off lets
    /// a command exist purely as a listener (bound below), invisible to chat.
    pub chat_enabled: i64,
    /// JSON array of `ListenerDef` — zero or more additional ways (beyond
    /// chat, if chat_enabled) this command can fire: a Twitch redemption, an
    /// internal event name, or several of either.
    pub listeners: String,
}

impl BotCommand {
    pub fn listener_defs(&self) -> Vec<ListenerDef> {
        serde_json::from_str(&self.listeners).unwrap_or_default()
    }

    #[allow(dead_code)]
    pub fn is_enabled(&self) -> bool { self.enabled != 0 }
}

async fn pool(q: &State<'_, Arc<QueueState>>) -> SqlitePool {
    q.db.read().await.clone()
}

#[derive(Debug, Clone, Serialize)]
pub struct ModuleEventOption {
    pub full_name: String,
    pub label: String,
    pub module_name: String,
}

/// Data source for the "Internal event" listener picker — every event declared
/// by an enabled module's manifest, resolved to the namespaced form dispatch
/// actually matches against (see `EventProxy`).
#[tauri::command]
pub async fn list_module_events(modules: State<'_, Arc<ModuleState>>) -> Result<Vec<ModuleEventOption>, String> {
    Ok(modules.list_declared_events().await.into_iter()
        .map(|(full_name, label, module_name)| ModuleEventOption { full_name, label, module_name })
        .collect())
}

async fn reload_cache(cache: &State<'_, Arc<CommandCache>>, pool: &SqlitePool) {
    if let Err(e) = cache.reload(pool).await {
        error!("Failed to reload command cache: {e}");
    }
}

/// Checks a proposed trigger + alias set against every *other* command for a
/// collision (same trigger, same alias, or a trigger/alias already claimed
/// by a different command). `CommandCache::find` matches on a first-hit
/// basis in sort order, so a silent collision doesn't error at dispatch —
/// it just makes the shadowed command's token permanently unreachable,
/// which looks exactly like "this alias never registers." Catching it here,
/// at save time, turns that into a clear error instead.
async fn check_alias_collision(
    pool: &SqlitePool,
    exclude_id: Option<i64>,
    trigger: &str,
    aliases: &[String],
) -> Result<(), String> {
    let mut mine: Vec<&str> = Vec::with_capacity(1 + aliases.len());
    if !trigger.is_empty() {
        mine.push(trigger);
    }
    mine.extend(aliases.iter().map(|s| s.as_str()));

    let rows: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT id, trigger, aliases FROM bot_commands WHERE id != ?",
    )
    .bind(exclude_id.unwrap_or(-1))
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    for (_, other_trigger, other_aliases_json) in rows {
        let other_aliases: Vec<String> = serde_json::from_str(&other_aliases_json).unwrap_or_default();
        let mut theirs: Vec<&str> = Vec::with_capacity(1 + other_aliases.len());
        theirs.push(other_trigger.as_str());
        theirs.extend(other_aliases.iter().map(|s| s.as_str()));

        for m in &mine {
            if theirs.contains(m) {
                return Err(format!(
                    "'{m}' is already used by the '{other_trigger}' command. Commands are matched \
                     first-registered-wins, so this would silently never reach the one you're editing — \
                     remove it from '{other_trigger}' first, or pick a different trigger/alias."
                ));
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn get_commands(queue: State<'_, Arc<QueueState>>) -> Result<Vec<BotCommand>, String> {
    sqlx::query_as::<_, BotCommand>(&format!("{CMD_SELECT} ORDER BY sort_order ASC, id ASC"))
        .fetch_all(&pool(&queue).await)
        .await
        .map_err(|e| e.to_string())
}

/// Sort a subset of commands by a named strategy, then write sort_order back to DB.
/// `ids` = the command IDs in the section (any order).
/// `strategy` = "alpha" | "register"
/// For "register" the caller passes `register_order` — the manifest declaration order of those IDs.
/// For "alpha" the backend re-sorts by trigger name.
#[tauri::command]
pub async fn sort_section_commands(
    queue: State<'_, Arc<QueueState>>,
    cache: State<'_, Arc<CommandCache>>,
    ids:              Vec<i64>,
    strategy:         String,
    register_order:   Option<Vec<i64>>,
) -> Result<(), String> {
    let p = pool(&queue).await;

    let sorted: Vec<i64> = if strategy == "alpha" {
        // Fetch triggers for the requested IDs, sort alphabetically.
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("SELECT id, trigger FROM bot_commands WHERE id IN ({placeholders})");
        let mut q = sqlx::query_as::<_, (i64, String)>(&sql);
        for id in &ids { q = q.bind(id); }
        let mut rows: Vec<(i64, String)> = q.fetch_all(&p).await.map_err(|e| e.to_string())?;
        rows.sort_by(|(_, a), (_, b)| a.to_lowercase().cmp(&b.to_lowercase()));
        rows.into_iter().map(|(id, _)| id).collect()
    } else {
        // "register" — use the caller-supplied manifest order, fall back to current DB order.
        register_order.unwrap_or(ids)
    };

    for (idx, id) in sorted.iter().enumerate() {
        sqlx::query("UPDATE bot_commands SET sort_order = ? WHERE id = ?")
            .bind((idx as i64) * 10)
            .bind(id)
            .execute(&p)
            .await
            .map_err(|e| e.to_string())?;
    }
    reload_cache(&cache, &p).await;
    Ok(())
}

/// Persist the user's preferred display order for commands.
/// `ids` is the full ordered list of command IDs; each gets sort_order = index * 10.
#[tauri::command]
pub async fn reorder_commands(
    queue: State<'_, Arc<QueueState>>,
    ids:   Vec<i64>,
) -> Result<(), String> {
    let p = pool(&queue).await;
    for (idx, id) in ids.iter().enumerate() {
        sqlx::query("UPDATE bot_commands SET sort_order = ? WHERE id = ?")
            .bind((idx as i64) * 10)
            .bind(id)
            .execute(&p)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn update_command(
    queue: State<'_, Arc<QueueState>>,
    cache: State<'_, Arc<CommandCache>>,
    id: i64,
    trigger: String,
    aliases: String,
    enabled: bool,
    description: String,
    response: Option<String>,
    required_badges: String,
    cooldown_seconds: i64,
    user_cooldown_seconds: i64,
    platform: String,
    chat_enabled: Option<bool>,
    listeners: Option<String>,
) -> Result<(), String> {
    let p = pool(&queue).await;
    // Validate before writing — a malformed listeners payload should fail loudly
    // rather than silently store garbage that then never matches anything.
    let listeners_json = listeners.unwrap_or_else(|| "[]".to_string());
    if serde_json::from_str::<Vec<ListenerDef>>(&listeners_json).is_err() {
        return Err("Invalid listeners payload (expected a JSON array of {type, config}).".to_string());
    }
    let alias_list: Vec<String> = serde_json::from_str(&aliases).unwrap_or_default();
    check_alias_collision(&p, Some(id), &trigger, &alias_list).await?;
    sqlx::query(
        "UPDATE bot_commands SET
            trigger = ?, aliases = ?, enabled = ?, description = ?, response = ?,
            required_badges = ?, cooldown_seconds = ?, user_cooldown_seconds = ?, platform = ?,
            chat_enabled = ?, listeners = ?
         WHERE id = ?",
    )
    .bind(&trigger).bind(&aliases).bind(enabled as i64).bind(&description).bind(&response)
    .bind(&required_badges).bind(cooldown_seconds).bind(user_cooldown_seconds).bind(&platform)
    .bind(chat_enabled.unwrap_or(true) as i64)
    .bind(listeners_json)
    .bind(id)
    .execute(&p).await.map_err(|e| e.to_string())?;
    // Note: script is updated separately via save_script
    reload_cache(&cache, &p).await;
    Ok(())
}

#[tauri::command]
pub async fn create_command(
    queue: State<'_, Arc<QueueState>>,
    cache: State<'_, Arc<CommandCache>>,
    trigger: String,
    response: String,
    description: String,
    script_mode: Option<String>,
) -> Result<BotCommand, String> {
    let p    = pool(&queue).await;
    let mode = script_mode.unwrap_or_else(|| "text".to_string());
    check_alias_collision(&p, None, &trigger, &[]).await?;
    let id = sqlx::query(
        "INSERT INTO bot_commands (trigger, response, description, script_mode) VALUES (?, ?, ?, ?)",
    )
    .bind(&trigger).bind(&response).bind(&description).bind(&mode)
    .execute(&p).await.map_err(|e| e.to_string())?.last_insert_rowid();

    let cmd = sqlx::query_as::<_, BotCommand>(&format!("{CMD_SELECT} WHERE id = ?"))
        .bind(id).fetch_one(&p).await.map_err(|e| e.to_string())?;
    reload_cache(&cache, &p).await;
    Ok(cmd)
}

#[tauri::command]
pub async fn delete_command(
    queue: State<'_, Arc<QueueState>>,
    cache: State<'_, Arc<CommandCache>>,
    id: i64,
) -> Result<(), String> {
    let p = pool(&queue).await;
    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT builtin_key FROM bot_commands WHERE id = ?")
            .bind(id).fetch_optional(&p).await.map_err(|e| e.to_string())?;

    match row {
        None          => return Err(format!("Command {id} not found.")),
        Some((Some(_),)) => return Err("Cannot delete a built-in command.".into()),
        Some((None,)) => {}
    }

    sqlx::query("DELETE FROM bot_commands WHERE id = ?")
        .bind(id).execute(&p).await.map_err(|e| e.to_string())?;
    reload_cache(&cache, &p).await;
    Ok(())
}

/// Increment the counter column for a command and return the new value.
pub async fn increment_counter(pool: &SqlitePool, id: i64) -> i64 {
    let _ = sqlx::query("UPDATE bot_commands SET counter = counter + 1 WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await;

    sqlx::query_scalar::<_, i64>("SELECT counter FROM bot_commands WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap_or(0)
}

/// Reset the counter for a command to 0.
#[tauri::command]
pub async fn reset_counter(queue: State<'_, Arc<QueueState>>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE bot_commands SET counter = 0 WHERE id = ?")
        .bind(id)
        .execute(&pool(&queue).await)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Toggle the enabled state of a command.
#[tauri::command]
pub async fn toggle_command_enabled(
    queue:   State<'_, Arc<QueueState>>,
    cache:   State<'_, Arc<CommandCache>>,
    id:      i64,
    enabled: bool,
) -> Result<(), String> {
    let p = pool(&queue).await;
    sqlx::query("UPDATE bot_commands SET enabled = ? WHERE id = ?")
        .bind(enabled as i64).bind(id)
        .execute(&p).await.map_err(|e| e.to_string())?;
    reload_cache(&cache, &p).await;
    Ok(())
}

/// Duplicate a command — copies trigger, script, script_mode; new command is disabled.
#[tauri::command]
pub async fn duplicate_command(
    queue: State<'_, Arc<QueueState>>,
    cache: State<'_, Arc<CommandCache>>,
    id:    i64,
) -> Result<BotCommand, String> {
    let p = pool(&queue).await;
    let src = sqlx::query_as::<_, BotCommand>(&format!("{CMD_SELECT} WHERE id = ?"))
        .bind(id).fetch_optional(&p).await.map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Command {id} not found."))?;

    let new_trigger = format!("{}_copy", src.trigger);
    let new_id = sqlx::query(
        "INSERT INTO bot_commands \
         (trigger, aliases, enabled, description, response, required_badges, \
          cooldown_seconds, user_cooldown_seconds, platform, script, script_mode, \
          chat_enabled, listeners) \
         VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&new_trigger)
    // Not src.aliases: those are still claimed by the original command, and
    // copying them verbatim would collide the instant this duplicate is
    // enabled (see check_alias_collision) — start with none instead.
    .bind("[]")
    .bind(&src.description)
    .bind(&src.response)
    .bind(&src.required_badges)
    .bind(src.cooldown_seconds)
    .bind(src.user_cooldown_seconds)
    .bind(&src.platform)
    .bind(&src.script)
    .bind(&src.script_mode)
    .bind(src.chat_enabled)
    .bind(&src.listeners)
    .execute(&p).await.map_err(|e| e.to_string())?.last_insert_rowid();

    let cmd = sqlx::query_as::<_, BotCommand>(&format!("{CMD_SELECT} WHERE id = ?"))
        .bind(new_id).fetch_one(&p).await.map_err(|e| e.to_string())?;
    reload_cache(&cache, &p).await;
    Ok(cmd)
}

/// Save a block-based script to a command. Pass null to clear it.
#[tauri::command]
pub async fn save_script(
    queue:   State<'_, Arc<QueueState>>,
    cache:   State<'_, Arc<CommandCache>>,
    modules: State<'_, Arc<ModuleState>>,
    id: i64,
    script: Option<String>,
) -> Result<(), String> {
    let p = pool(&queue).await;

    // Server-side half of `// @lock` / `// @unlock` enforcement — the frontend
    // already checks this for UX (a clear error before the round-trip), but this
    // is the part that actually matters: it holds even if that check is bypassed.
    if let Some(new_body) = &script {
        let builtin_key: Option<String> = sqlx::query_scalar("SELECT builtin_key FROM bot_commands WHERE id = ?")
            .bind(id).fetch_optional(&p).await.map_err(|e| e.to_string())?.flatten();
        if let Some(builtin_key) = builtin_key {
            if let Some((_, module_src, _)) = modules.get_command_script(&builtin_key).await {
                let violations = find_lock_violations(&module_src, new_body);
                if let Some(first) = violations.first() {
                    return Err(format!(
                        "This module locks part of this script (line {}) — that part was changed or removed, so the save was blocked.",
                        first.0
                    ));
                }
            }
        }
    }

    sqlx::query("UPDATE bot_commands SET script = ? WHERE id = ?")
        .bind(&script).bind(id)
        .execute(&p).await.map_err(|e| e.to_string())?;
    reload_cache(&cache, &p).await;
    Ok(())
}

const LOCK_START: &str = "// @lock";
const LOCK_END: &str = "// @unlock";

/// Extract `// @lock` ... `// @unlock` blocks (marker lines included) from
/// `original`, then return the (start_line, end_line) of any that no longer
/// appear verbatim, as an exact substring, in `edited`. Mirrors
/// `lib/scripting/lockRegions.ts` — keep both in sync if this changes.
fn find_lock_violations(original: &str, edited: &str) -> Vec<(usize, usize)> {
    let lines: Vec<&str> = original.lines().collect();
    let mut violations = Vec::new();
    let mut open_at: Option<usize> = None;
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed == LOCK_START && open_at.is_none() {
            open_at = Some(i);
        } else if trimmed == LOCK_END {
            if let Some(start) = open_at.take() {
                let block = lines[start..=i].join("\n");
                if !edited.contains(&block) {
                    violations.push((start + 1, i + 1));
                }
            }
        }
    }
    violations
}
