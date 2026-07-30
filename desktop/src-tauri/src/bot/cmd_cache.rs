use crate::commands::cmd_registry::{BotCommand, CMD_SELECT};
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
            &format!("{CMD_SELECT} WHERE enabled != 0 ORDER BY sort_order ASC, id ASC"),
        )
        .fetch_all(pool)
        .await?;
        *self.commands.write().await = cmds;
        Ok(())
    }

    /// Find a command whose trigger or alias matches the first word of `text`.
    /// Commands with chat_enabled off don't participate at all — they exist
    /// only for whatever listener(s) they're bound to below.
    pub async fn find(&self, text: &str) -> Option<BotCommand> {
        let first = text.split_whitespace().next().unwrap_or("");
        let commands = self.commands.read().await;
        for cmd in commands.iter() {
            if cmd.chat_enabled == 0 { continue; }
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

    /// Find an enabled command with a listener of `listener_type` (e.g.
    /// "twitch_redemption", "event") whose config matches `config`
    /// (case-insensitive). A command can have more than one listener; any
    /// match is enough.
    pub async fn find_by_listener(&self, listener_type: &str, config: &str) -> Option<BotCommand> {
        let needle = config.to_lowercase();
        let commands = self.commands.read().await;
        commands.iter()
            .find(|c| c.listener_defs().iter().any(|l| l.kind == listener_type && l.config.to_lowercase() == needle))
            .cloned()
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
    #[allow(dead_code)]
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
