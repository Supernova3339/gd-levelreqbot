use crate::bot::cmd_cache::CommandCache;
use crate::queue::QueueState;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::State;
use tracing::error;

const SELECT: &str =
    "SELECT id, trigger, aliases, enabled, description, builtin_key, response, \
     required_badges, cooldown_seconds, user_cooldown_seconds, platform, counter, script, script_mode \
     FROM bot_commands";

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
}

impl BotCommand {
    pub fn is_enabled(&self) -> bool { self.enabled != 0 }
}

async fn pool(q: &State<'_, Arc<QueueState>>) -> SqlitePool {
    q.db.read().await.clone()
}

async fn reload_cache(cache: &State<'_, Arc<CommandCache>>, pool: &SqlitePool) {
    if let Err(e) = cache.reload(pool).await {
        error!("Failed to reload command cache: {e}");
    }
}

#[tauri::command]
pub async fn get_commands(queue: State<'_, Arc<QueueState>>) -> Result<Vec<BotCommand>, String> {
    sqlx::query_as::<_, BotCommand>(&format!("{SELECT} ORDER BY id ASC"))
        .fetch_all(&pool(&queue).await)
        .await
        .map_err(|e| e.to_string())
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
) -> Result<(), String> {
    let p = pool(&queue).await;
    sqlx::query(
        "UPDATE bot_commands SET
            trigger = ?, aliases = ?, enabled = ?, description = ?, response = ?,
            required_badges = ?, cooldown_seconds = ?, user_cooldown_seconds = ?, platform = ?
         WHERE id = ?",
    )
    .bind(&trigger).bind(&aliases).bind(enabled as i64).bind(&description).bind(&response)
    .bind(&required_badges).bind(cooldown_seconds).bind(user_cooldown_seconds).bind(&platform)
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
    let id = sqlx::query(
        "INSERT INTO bot_commands (trigger, response, description, script_mode) VALUES (?, ?, ?, ?)",
    )
    .bind(&trigger).bind(&response).bind(&description).bind(&mode)
    .execute(&p).await.map_err(|e| e.to_string())?.last_insert_rowid();

    let cmd = sqlx::query_as::<_, BotCommand>(&format!("{SELECT} WHERE id = ?"))
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
    let src = sqlx::query_as::<_, BotCommand>(&format!("{SELECT} WHERE id = ?"))
        .bind(id).fetch_optional(&p).await.map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Command {id} not found."))?;

    let new_trigger = format!("{}_copy", src.trigger);
    let new_id = sqlx::query(
        "INSERT INTO bot_commands \
         (trigger, aliases, enabled, description, response, required_badges, \
          cooldown_seconds, user_cooldown_seconds, platform, script, script_mode) \
         VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&new_trigger)
    .bind(&src.aliases)
    .bind(&src.description)
    .bind(&src.response)
    .bind(&src.required_badges)
    .bind(src.cooldown_seconds)
    .bind(src.user_cooldown_seconds)
    .bind(&src.platform)
    .bind(&src.script)
    .bind(&src.script_mode)
    .execute(&p).await.map_err(|e| e.to_string())?.last_insert_rowid();

    let cmd = sqlx::query_as::<_, BotCommand>(&format!("{SELECT} WHERE id = ?"))
        .bind(new_id).fetch_one(&p).await.map_err(|e| e.to_string())?;
    reload_cache(&cache, &p).await;
    Ok(cmd)
}

/// Save a block-based script to a command. Pass null to clear it.
#[tauri::command]
pub async fn save_script(
    queue: State<'_, Arc<QueueState>>,
    cache: State<'_, Arc<CommandCache>>,
    id: i64,
    script: Option<String>,
) -> Result<(), String> {
    let p = pool(&queue).await;
    sqlx::query("UPDATE bot_commands SET script = ? WHERE id = ?")
        .bind(&script).bind(id)
        .execute(&p).await.map_err(|e| e.to_string())?;
    reload_cache(&cache, &p).await;
    Ok(())
}
