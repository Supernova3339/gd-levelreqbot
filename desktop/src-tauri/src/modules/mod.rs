// Module system — all manifests and scripts come from the marketplace.
// Scripts live on disk at {marketplace_dir}/{author}/{package_type}/{module_id}/scripts/*.rhai
// The DB stores metadata (id, author, package_type, enabled, manifest).

use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

// ── Manifest types ────────────────────────────────────────────────────────────

/// A single bot command registered by a module.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandDef {
    pub trigger: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub description: String,
    /// Key into the module's `scripts` map — used for dispatch.
    pub builtin_key: String,
    #[serde(default)]
    pub required_badges: Vec<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub cooldown_seconds: i64,
    #[serde(default)]
    pub user_cooldown_seconds: i64,
}

fn default_true() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub min_app_version: String,
    #[serde(default)]
    pub builtin: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub description: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub panels: Vec<PanelDef>,
    /// Commands registered by this module (trigger + script key + permissions).
    #[serde(default)]
    pub commands: Vec<CommandDef>,
    /// script_key → relative path within the module directory (e.g. "scripts/request.rhai")
    /// Scripts are never stored inline in the DB — they always live on disk.
    #[serde(default)]
    pub scripts: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelDef {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub widgets: Vec<serde_json::Value>,
}

// ── Module state ──────────────────────────────────────────────────────────────

pub struct ModuleState {
    pub db: Arc<RwLock<SqlitePool>>,
    /// Root marketplace directory: {data}/marketplace/
    pub modules_dir: PathBuf,
}

impl ModuleState {
    pub fn new(db: Arc<RwLock<SqlitePool>>, modules_dir: PathBuf) -> Self {
        Self { db, modules_dir }
    }

    /// Returns the install directory for a module: {marketplace}/{author}/{package_type}/{id}
    pub async fn module_dir(&self, id: &str) -> PathBuf {
        let pool = self.db.read().await;
        let row: Option<(String, String)> = sqlx::query_as(
            "SELECT author, package_type FROM modules WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&*pool)
        .await
        .ok()
        .flatten();
        drop(pool);
        match row {
            Some((author, pkg_type)) => self.modules_dir.join(author).join(pkg_type).join(id),
            None => self.modules_dir.join("unknown").join("module").join(id),
        }
    }

    /// Returns all installed modules (those with a stored manifest in the DB).
    pub async fn list_modules(&self) -> Vec<ModuleManifest> {
        let pool = self.db.read().await;
        let rows: Vec<(String, i64, Option<String>)> = sqlx::query_as(
            "SELECT id, enabled, manifest FROM modules ORDER BY installed_at ASC"
        )
        .fetch_all(&*pool)
        .await
        .unwrap_or_default();

        rows.into_iter()
            .filter_map(|(id, enabled, manifest_json)| {
                let json = manifest_json?;
                if json.is_empty() || json == "{}" {
                    return None;
                }
                let mut m: ModuleManifest = serde_json::from_str(&json).ok()?;
                m.id = id;
                m.enabled = enabled != 0;
                Some(m)
            })
            .collect()
    }

    pub async fn get_module(&self, id: &str) -> Option<ModuleManifest> {
        self.list_modules().await.into_iter().find(|m| m.id == id)
    }

    pub async fn toggle_module(&self, id: &str, enabled: bool) -> Result<()> {
        let pool = self.db.read().await;
        sqlx::query("UPDATE modules SET enabled = ? WHERE id = ?")
            .bind(enabled as i64)
            .bind(id)
            .execute(&*pool)
            .await?;
        Ok(())
    }

    pub async fn install_module(&self, manifest_json: &str, author: &str, package_type: &str) -> Result<()> {
        let manifest: ModuleManifest = serde_json::from_str(manifest_json)?;
        let pool = self.db.read().await;
        sqlx::query(
            "INSERT INTO modules (id, enabled, manifest, min_app_version, download_url, author, package_type)
             VALUES (?, 1, ?, ?, '', ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                manifest = excluded.manifest,
                min_app_version = excluded.min_app_version,
                author = excluded.author,
                package_type = excluded.package_type,
                enabled = 1"
        )
        .bind(&manifest.id)
        .bind(manifest_json)
        .bind(&manifest.min_app_version)
        .bind(author)
        .bind(package_type)
        .execute(&*pool)
        .await?;

        // Register the module's commands in bot_commands (upsert by trigger)
        for cmd in &manifest.commands {
            let aliases = serde_json::to_string(&cmd.aliases).unwrap_or_else(|_| "[]".into());
            let badges  = serde_json::to_string(&cmd.required_badges).unwrap_or_else(|_| "[]".into());
            sqlx::query(
                "INSERT INTO bot_commands
                    (trigger, aliases, enabled, description, builtin_key, required_badges, cooldown_seconds, user_cooldown_seconds)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(trigger) DO UPDATE SET
                    description          = excluded.description,
                    builtin_key          = excluded.builtin_key,
                    required_badges      = excluded.required_badges,
                    cooldown_seconds     = excluded.cooldown_seconds,
                    user_cooldown_seconds = excluded.user_cooldown_seconds"
            )
            .bind(&cmd.trigger)
            .bind(&aliases)
            .bind(cmd.enabled as i64)
            .bind(&cmd.description)
            .bind(&cmd.builtin_key)
            .bind(&badges)
            .bind(cmd.cooldown_seconds)
            .bind(cmd.user_cooldown_seconds)
            .execute(&*pool)
            .await?;
        }

        Ok(())
    }

    pub async fn uninstall_module(&self, id: &str) -> Result<()> {
        // Fetch manifest first so we can remove its commands
        let manifest = self.get_module(id).await;

        let pool = self.db.read().await;
        sqlx::query("DELETE FROM modules WHERE id = ?")
            .bind(id)
            .execute(&*pool)
            .await?;

        // Remove this module's commands from bot_commands (only if still owned by this module)
        if let Some(m) = manifest {
            for cmd in &m.commands {
                sqlx::query(
                    "DELETE FROM bot_commands WHERE trigger = ? AND builtin_key = ?"
                )
                .bind(&cmd.trigger)
                .bind(&cmd.builtin_key)
                .execute(&*pool)
                .await?;
            }
        }

        // Remove module files from disk
        let dir = self.module_dir(id).await;
        if dir.exists() {
            std::fs::remove_dir_all(&dir).ok();
        }
        Ok(())
    }

    pub async fn is_enabled(&self, module_id: &str) -> bool {
        self.list_modules().await.iter()
            .find(|m| m.id == module_id)
            .map(|m| m.enabled)
            .unwrap_or(false)
    }

    /// Find the Rhai script source for a given builtin_key across all enabled modules.
    /// Reads from disk — scripts are never stored in the DB.
    pub async fn get_command_script(&self, builtin_key: &str) -> Option<(String, String)> {
        for module in self.list_modules().await {
            if !module.enabled { continue; }
            let Some(rel_path) = module.scripts.get(builtin_key) else { continue };
            let script_path = self.module_dir(&module.id).await.join(rel_path);
            if let Ok(src) = std::fs::read_to_string(&script_path) {
                return Some((module.id.clone(), src));
            }
        }
        None
    }

    /// Read a script source by module ID and script key. Used by execute_module_action.
    pub async fn read_script(&self, module_id: &str, script_key: &str) -> Option<String> {
        let manifest = self.get_module(module_id).await?;
        let rel_path = manifest.scripts.get(script_key)?;
        let path = self.module_dir(module_id).await.join(rel_path);
        std::fs::read_to_string(&path).ok()
    }
}
