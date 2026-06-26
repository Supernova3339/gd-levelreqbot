use crate::commands::cmd_registry::BotCommand;
use anyhow::Result;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, RwLock};

pub struct CommandCache {
    pub commands: RwLock<Vec<BotCommand>>,
    /// Global last-used: command_id → Instant
    global_cd: Mutex<HashMap<i64, Instant>>,
    /// Per-user last-used: (command_id, username) → Instant
    user_cd: Mutex<HashMap<(i64, String), Instant>>,
}

impl CommandCache {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            commands: RwLock::new(Vec::new()),
            global_cd: Mutex::new(HashMap::new()),
            user_cd: Mutex::new(HashMap::new()),
        })
    }

    pub async fn reload(&self, pool: &SqlitePool) -> Result<()> {
        let cmds = sqlx::query_as::<_, BotCommand>(
            "SELECT id, trigger, aliases, enabled, description, builtin_key, response,
             required_badges, cooldown_seconds, user_cooldown_seconds, platform, counter, script,
             script_mode
             FROM bot_commands WHERE enabled != 0 ORDER BY id ASC",
        )
        .fetch_all(pool)
        .await?;
        *self.commands.write().await = cmds;
        Ok(())
    }

    /// Find a command whose trigger or alias matches the first word of `text`.
    pub async fn find(&self, text: &str) -> Option<BotCommand> {
        let first = text.split_whitespace().next().unwrap_or("");
        let commands = self.commands.read().await;
        for cmd in commands.iter() {
            if cmd.trigger == first {
                return Some(cmd.clone());
            }
            if let Ok(aliases) = serde_json::from_str::<Vec<String>>(&cmd.aliases) {
                if aliases.iter().any(|a| a == first) {
                    return Some(cmd.clone());
                }
            }
        }
        None
    }

    /// Returns `true` if the command is off global cooldown for this user.
    /// Updates the timestamps if allowed.
    pub async fn check_and_update_cooldown(&self, cmd: &BotCommand, username: &str) -> bool {
        let now = Instant::now();

        // Global cooldown check
        if cmd.cooldown_seconds > 0 {
            let mut global = self.global_cd.lock().await;
            if let Some(last) = global.get(&cmd.id) {
                if now.duration_since(*last) < Duration::from_secs(cmd.cooldown_seconds as u64) {
                    return false;
                }
            }
            global.insert(cmd.id, now);
        }

        // Per-user cooldown check
        if cmd.user_cooldown_seconds > 0 {
            let key = (cmd.id, username.to_string());
            let mut user = self.user_cd.lock().await;
            if let Some(last) = user.get(&key) {
                if now.duration_since(*last) < Duration::from_secs(cmd.user_cooldown_seconds as u64) {
                    return false;
                }
            }
            user.insert(key, now);
        }

        true
    }

    /// Remaining global cooldown in seconds, or 0 if ready.
    pub async fn global_cooldown_remaining(&self, cmd: &BotCommand) -> u64 {
        if cmd.cooldown_seconds <= 0 { return 0; }
        let global = self.global_cd.lock().await;
        match global.get(&cmd.id) {
            Some(last) => {
                let elapsed = Instant::now().duration_since(*last).as_secs();
                (cmd.cooldown_seconds as u64).saturating_sub(elapsed)
            }
            None => 0,
        }
    }
}
