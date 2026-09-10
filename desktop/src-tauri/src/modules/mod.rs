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
use crate::bot::cmd_cache::CommandCache;

/// Guards a single filesystem path segment built from manifest-supplied data
/// (author, package_type, module id) against path traversal. Never fails —
/// callers here build a PathBuf, not a Result — so an unsafe value falls back
/// to a fixed placeholder rather than being allowed through.
fn safe_component(s: &str) -> &str {
    if s.is_empty() || s == "." || s == ".." || s.contains(['/', '\\']) {
        "_invalid_"
    } else {
        s
    }
}

/// Lowercase, replace anything not alphanumeric with `-`, collapse repeats.
/// Used to build the namespaced form of a module-emitted event name
/// (`<author-slug>.<module_id>.<event-key>`) — shared by `EventProxy`'s
/// dispatch matching and by `list_module_events` (the picker's data source).
pub fn slugify(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last_dash = false;
    for c in s.chars() {
        if c.is_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

// ── Dependency / bundle types ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleDependency {
    pub id: String,
    /// "library" | "module" (default: "library")
    #[serde(default = "default_dep_type")]
    pub dep_type: String,
    #[serde(default)]
    pub optional: bool,
}

fn default_dep_type() -> String { "library".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundledLibraryDef {
    /// Import name used in Rhai scripts (e.g. "queue-core")
    pub name: String,
    /// Relative path within the module directory to the .rhai source file
    pub file: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModuleBundle {
    #[serde(default)]
    pub libraries: Vec<BundledLibraryDef>,
}

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

/// Reference to a UI page file bundled with a module.
/// The actual layout is defined in a .gdui XML file inside the module's `ui/` folder.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModulePageRef {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub icon: String,
    /// Relative path within the module directory, e.g. "ui/queue.gdui"
    pub file: String,
}

/// Reference to a static browser-source overlay page bundled with a module —
/// served read-only at `/overlay/{module_id}/{id}` (see `api::overlay_file`).
/// Deliberately a STATIC file, not a Rhai-backed route: module code today
/// only ever runs in response to something already-trusted (a chat message,
/// a UI click); an HTTP route reachable by anyone who can hit the port is a
/// different, inbound trust boundary this does not open. Live data reaches
/// the page via the existing WS event bus (`event.emit`), not server-side
/// logic per request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleOverlayRef {
    pub id: String,
    pub label: String,
    /// Relative path within the module directory, e.g. "overlay/results.html"
    pub file: String,
}

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
    /// Marketplace author display name — not currently shown much in-app, but
    /// used e.g. to namespace module-emitted event names (see `EventProxy`).
    #[serde(default)]
    pub author: String,
    /// Sidebar page entries — each references a .gdui XML file in the module's `ui/` folder.
    #[serde(default)]
    pub pages: Vec<ModulePageRef>,
    /// Static browser-source overlay pages — each served read-only at
    /// `/overlay/{id}/{overlay.id}`. See `ModuleOverlayRef`.
    #[serde(default)]
    pub overlays: Vec<ModuleOverlayRef>,
    /// Commands registered by this module (trigger + script key + permissions).
    #[serde(default)]
    pub commands: Vec<CommandDef>,
    /// script_key → relative path within the module directory (e.g. "scripts/request.rhai")
    #[serde(default)]
    pub scripts: HashMap<String, String>,
    /// Libraries and modules required by this module (auto-installed on install).
    #[serde(default)]
    pub dependencies: Vec<ModuleDependency>,
    /// Libraries shipped inside this module's .gdmod package.
    #[serde(default)]
    pub bundle: ModuleBundle,
    /// Relative path to a .gdui settings page (shown under Settings > Modules).
    #[serde(default)]
    pub settings_page: Option<String>,
    /// script_key (looked up in `scripts`) run for every Twitch channel-point
    /// redemption while this module is enabled. The script decides for itself
    /// (via `ms`-stored config) whether a given redemption is one it cares
    /// about, and fulfills/cancels it via the `twitch` proxy — there's no
    /// static reward-title binding in the manifest since reward titles are
    /// user-editable in Settings, not fixed at install time.
    #[serde(default)]
    pub redemption_handler: Option<String>,
    /// Internal events this module's scripts call `event.emit(key, ...)` for,
    /// declared so the command-listener UI can offer them in a picker instead
    /// of requiring users to know/type the exact key. Purely descriptive —
    /// scripts still just call `event.emit("the-key", ...)`, this doesn't
    /// register or validate anything at runtime.
    #[serde(default)]
    pub events: Vec<ModuleEventDef>,
    /// Initial sort applied when the module is first installed.
    /// "alpha" = alphabetical by trigger; "register" = manifest declaration order (default).
    #[serde(default)]
    pub default_sort: Option<String>,
    /// Opt-in capabilities beyond the default module sandbox (ms/chat/user/
    /// event/time/rand/io — see execute.rs's stock-scripts policy). Currently
    /// only `"web"` is recognized (grants the `web` HTTP proxy). Declaring
    /// one here is a claim the install/update UI should show the user before
    /// they install, same idea as an app permission prompt — a marketplace
    /// module is third-party code, so this is opt-in per module, not a
    /// global unlock.
    #[serde(default)]
    pub permissions: Vec<String>,
    /// Twitch EventSub event types (e.g. "channel.follow") this module wants
    /// delivered to `twitch_event_handler`. The app subscribes to the UNION
    /// of every enabled module's list ONCE per distinct type — two modules
    /// both wanting "channel.follow" still only cost one Helix subscription
    /// and one EventSub session, see `bot::eventsub`. Purely a data want;
    /// the module has no say over transport/session details.
    #[serde(default)]
    pub twitch_events: Vec<String>,
    /// script_key (looked up in `scripts`) run for every subscribed event
    /// this module declared interest in, via `twitch_events` above. Runs
    /// with args `[event_type, payload_json]` — one handler for every type
    /// the module asked for, same "the script itself decides what it cares
    /// about" shape as `redemption_handler`, rather than one script per type.
    #[serde(default)]
    pub twitch_event_handler: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleEventDef {
    /// The bare key a script passes to `event.emit(key, ...)`.
    pub key: String,
    pub label: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
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
    /// Shared command cache — reloaded whenever commands are installed/removed.
    pub cmd_cache: Arc<CommandCache>,
}

impl ModuleState {
    pub fn new(db: Arc<RwLock<SqlitePool>>, modules_dir: PathBuf, cmd_cache: Arc<CommandCache>) -> Self {
        Self { db, modules_dir, cmd_cache }
    }

    /// Returns the install directory for a module: {marketplace}/{author}/{package_type}/{id}
    ///
    /// `author`/`package_type` come from the DB, and `id` from the caller — both
    /// ultimately trace back to a manifest.json a module author wrote, so neither
    /// is trusted to be a safe single path segment. `safe_component` guards every
    /// call site through this one chokepoint rather than relying on every caller
    /// (marketplace install, dev-watch, hard-refresh, uninstall…) to remember to
    /// check it themselves.
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
            Some((author, pkg_type)) => self.modules_dir
                .join(safe_component(&author))
                .join(safe_component(&pkg_type))
                .join(safe_component(id)),
            None => self.modules_dir.join("unknown").join("module").join(safe_component(id)),
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
            // Remove stale rows that share the same builtin_key under a different trigger
            // (e.g. an old "request" row that predates the "!r" trigger rename).
            if !cmd.builtin_key.is_empty() {
                sqlx::query("DELETE FROM bot_commands WHERE builtin_key = ? AND trigger != ?")
                    .bind(&cmd.builtin_key)
                    .bind(&cmd.trigger)
                    .execute(&*pool)
                    .await?;
            }
            sqlx::query(
                "INSERT INTO bot_commands
                    (trigger, aliases, enabled, description, builtin_key, required_badges, cooldown_seconds, user_cooldown_seconds)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(trigger) DO UPDATE SET
                    aliases              = excluded.aliases,
                    description          = excluded.description,
                    builtin_key          = excluded.builtin_key,
                    required_badges      = excluded.required_badges,
                    cooldown_seconds     = excluded.cooldown_seconds,
                    user_cooldown_seconds = excluded.user_cooldown_seconds,
                    script               = NULL"
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

        // Apply default_sort: seed initial sort_order for this module's commands.
        // "register" (or unset) = manifest declaration order (already written in loop above).
        // "alpha" = alphabetical by trigger.
        {
            let builtin_keys: Vec<&str> = manifest.commands.iter()
                .map(|c| c.builtin_key.as_str())
                .collect();
            if !builtin_keys.is_empty() {
                let placeholders = builtin_keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
                let sql = format!("SELECT id, trigger FROM bot_commands WHERE builtin_key IN ({placeholders}) ORDER BY trigger ASC");
                let mut q = sqlx::query_as::<_, (i64, String)>(&sql);
                for k in &builtin_keys { q = q.bind(k); }
                let rows: Vec<(i64, String)> = q.fetch_all(&*pool).await.unwrap_or_default();

                let sorted_ids: Vec<i64> = if manifest.default_sort.as_deref() == Some("alpha") {
                    rows.iter().map(|(id, _)| *id).collect()
                } else {
                    // "register" order: sort by position in manifest.commands
                    let pos: std::collections::HashMap<&str, usize> = manifest.commands.iter()
                        .enumerate()
                        .map(|(i, c)| (c.trigger.as_str(), i))
                        .collect();
                    let mut ordered: Vec<(i64, usize)> = rows.iter()
                        .map(|(id, trig)| (*id, pos.get(trig.as_str()).copied().unwrap_or(usize::MAX)))
                        .collect();
                    ordered.sort_by_key(|(_, p)| *p);
                    ordered.into_iter().map(|(id, _)| id).collect()
                };

                for (idx, id) in sorted_ids.iter().enumerate() {
                    sqlx::query("UPDATE bot_commands SET sort_order = ? WHERE id = ?")
                        .bind((idx as i64) * 10)
                        .bind(id)
                        .execute(&*pool)
                        .await
                        .ok();
                }
            }
        }

        // Reload the in-memory cache so the bot picks up the new commands immediately
        let _ = self.cmd_cache.reload(&*pool).await;

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

        // Reload the in-memory cache so removed commands are no longer recognized
        let _ = self.cmd_cache.reload(&*pool).await;

        // Remove module files from disk
        let dir = self.module_dir(id).await;
        if dir.exists() {
            std::fs::remove_dir_all(&dir).ok();
        }
        Ok(())
    }

    /// Compile a bundled library source and register it in the Rhai module registry.
    /// Libraries are processed in manifest order so dependencies resolve correctly.
    pub fn compile_library_to_registry(name: &str, code: &str) {
        use crate::scripting::engine::{get_engine, register_library};
        let engine = get_engine();
        match engine.compile(code) {
            Ok(ast) => match rhai::Module::eval_ast_as_new(rhai::Scope::new(), &ast, engine) {
                Ok(module) => register_library(name, module),
                Err(e) => tracing::warn!("Failed to eval library '{}' as module: {e}", name),
            },
            Err(e) => tracing::warn!("Failed to compile library '{}': {e}", name),
        }
    }

    /// Re-register all enabled module libraries from disk into the Rhai registry.
    /// Called on app startup so scripts can `import "queue-core" as q;` immediately.
    /// Reads the manifest from disk (not the DB snapshot) so library changes take
    /// effect without requiring a full module reinstall.
    pub async fn restore_library_registry(&self) {
        let pool = self.db.read().await;
        let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM modules WHERE enabled = 1")
            .fetch_all(&*pool)
            .await
            .unwrap_or_default();
        drop(pool);

        for id in ids {
            let module_dir = self.module_dir(&id).await;
            let manifest_path = module_dir.join("manifest.json");
            let manifest: ModuleManifest = match std::fs::read_to_string(&manifest_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
            {
                Some(m) => m,
                None    => continue,
            };
            for lib in &manifest.bundle.libraries {
                let src_path = module_dir.join(&lib.file);
                match std::fs::read_to_string(&src_path) {
                    Ok(code) => Self::compile_library_to_registry(&lib.name, &code),
                    Err(e)   => tracing::warn!("Library '{}' missing at {:?}: {e}", lib.name, src_path),
                }
            }
        }
    }

    /// Extract and register all libraries bundled inside a module's package.
    /// Reads each .rhai file from disk, upserts it into the `libraries` table,
    /// and compiles it into the Rhai module registry so `import` works immediately.
    pub async fn install_bundled_libraries(&self, module_id: &str) -> Result<()> {
        let manifest = match self.get_module(module_id).await {
            Some(m) => m,
            None    => return Ok(()),
        };
        if manifest.bundle.libraries.is_empty() { return Ok(()); }

        let module_dir = self.module_dir(module_id).await;
        let pool       = self.db.read().await;

        // Every bundled library — including stdlib's own — is scoped to its
        // owning module (source_module = module_id), never NULL. Nothing
        // gets ambient global/bare-method-call treatment; a script that
        // wants stdlib's functions imports it explicitly like it would
        // import anything else: `import "str" as str;` then `str::replace(...)`.
        for lib in &manifest.bundle.libraries {
            let src_path = module_dir.join(&lib.file);
            let code = match std::fs::read_to_string(&src_path) {
                Ok(s)  => s,
                Err(e) => {
                    tracing::warn!(
                        "Bundled library '{}' not found at {:?}: {e}",
                        lib.name, src_path
                    );
                    continue;
                }
            };
            let desc = if lib.description.is_empty() {
                format!("Bundled with {}", manifest.name)
            } else {
                lib.description.clone()
            };

            let exists: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM libraries WHERE name = ?"
            )
            .bind(&lib.name)
            .fetch_one(&*pool)
            .await
            .unwrap_or(0);

            if exists == 0 {
                sqlx::query(
                    "INSERT INTO libraries (name, description, code, enabled, source_module) VALUES (?, ?, ?, 1, ?)"
                )
                .bind(&lib.name).bind(&desc).bind(&code).bind(module_id)
                .execute(&*pool).await
                .map_err(|e| anyhow::anyhow!("Failed to install bundled library '{}': {e}", lib.name))?;
            } else {
                // `is_stdlib = 0` alone would also block the stdlib PACKAGE
                // from ever updating its own libraries once first installed —
                // is_stdlib exists to stop a *different*, unrelated module
                // from clobbering an official stdlib library of the same
                // name (see libraries.rs's edit/delete guards), not to freeze
                // stdlib's own libraries against its own reinstalls. Allow
                // the update when either that protection doesn't apply, or
                // this exact module is the one that owns the row already.
                sqlx::query(
                    "UPDATE libraries SET description = ?, code = ?, enabled = 1, source_module = ? \
                     WHERE name = ? AND (is_stdlib = 0 OR source_module = ?)"
                )
                .bind(&desc).bind(&code).bind(module_id).bind(&lib.name).bind(module_id)
                .execute(&*pool).await
                .map_err(|e| anyhow::anyhow!("Failed to update bundled library '{}': {e}", lib.name))?;
            }

            // Also register in the Rhai import registry so scripts can `import "name" as x;`.
            // Must happen after DB insert to maintain manifest order (deps before dependents).
            Self::compile_library_to_registry(&lib.name, &code);
        }
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn is_enabled(&self, module_id: &str) -> bool {
        self.list_modules().await.iter()
            .find(|m| m.id == module_id)
            .map(|m| m.enabled)
            .unwrap_or(false)
    }

    /// Find the Rhai script source for a given builtin_key across all enabled modules.
    /// Returns (module_id, source, rel_path). Reads from disk — scripts are never stored in the DB.
    pub async fn get_command_script(&self, builtin_key: &str) -> Option<(String, String, String)> {
        for module in self.list_modules().await {
            if !module.enabled { continue; }
            let Some(rel_path) = module.scripts.get(builtin_key) else { continue };
            let script_path = self.module_dir(&module.id).await.join(rel_path);
            if let Ok(src) = std::fs::read_to_string(&script_path) {
                return Some((module.id.clone(), src, rel_path.clone()));
            }
        }
        None
    }

    /// Returns true if any installed enabled module declares this builtin_key in its scripts map,
    /// even if the script file is missing from disk. Used to distinguish "module script not found"
    /// from "genuinely not a module command" in the bot handler.
    pub async fn has_module_for_builtin(&self, builtin_key: &str) -> bool {
        self.list_modules().await
            .into_iter()
            .any(|m| m.enabled && m.scripts.contains_key(builtin_key))
    }

    /// Read a script source by module ID and script key. Used by execute_module_action.
    /// Returns (source, rel_path).
    pub async fn read_script(&self, module_id: &str, script_key: &str) -> Option<(String, String)> {
        let manifest = self.get_module(module_id).await?;
        let rel_path = manifest.scripts.get(script_key)?.clone();
        let path = self.module_dir(module_id).await.join(&rel_path);
        std::fs::read_to_string(&path).ok().map(|src| (src, rel_path))
    }

    /// All enabled modules that declare a `redemption_handler`, with their script
    /// source pre-read from disk. Returns (module_id, source, rel_path) tuples.
    pub async fn get_redemption_handlers(&self) -> Vec<(String, String, String)> {
        let mut out = Vec::new();
        for module in self.list_modules().await {
            if !module.enabled { continue; }
            let Some(script_key) = module.redemption_handler.as_ref() else { continue };
            let Some(rel_path) = module.scripts.get(script_key) else { continue };
            let script_path = self.module_dir(&module.id).await.join(rel_path);
            if let Ok(src) = std::fs::read_to_string(&script_path) {
                out.push((module.id.clone(), src, rel_path.clone()));
            }
        }
        out
    }

    /// The union of every enabled module's `twitch_events` — what `bot::eventsub`
    /// should actually be subscribed to right now. Two modules declaring the
    /// same type collapse to one entry here, which is the whole point: one
    /// Helix subscription serves every interested module, not one each.
    pub async fn desired_twitch_event_types(&self) -> std::collections::HashSet<String> {
        let mut set = std::collections::HashSet::new();
        for module in self.list_modules().await {
            if !module.enabled { continue; }
            for ev in &module.twitch_events {
                set.insert(ev.clone());
            }
        }
        set
    }

    /// Every enabled module that wants `event_type` delivered, with its
    /// `twitch_event_handler` script source pre-read from disk — the fan-out
    /// side of the same one-subscription-many-listeners design as
    /// `desired_twitch_event_types`. Returns (module_id, source, rel_path).
    pub async fn find_twitch_event_handlers(&self, event_type: &str) -> Vec<(String, String, String)> {
        let mut out = Vec::new();
        for module in self.list_modules().await {
            if !module.enabled { continue; }
            if !module.twitch_events.iter().any(|e| e == event_type) { continue; }
            let Some(script_key) = module.twitch_event_handler.as_ref() else { continue };
            let Some(rel_path) = module.scripts.get(script_key) else { continue };
            let script_path = self.module_dir(&module.id).await.join(rel_path);
            if let Ok(src) = std::fs::read_to_string(&script_path) {
                out.push((module.id.clone(), src, rel_path.clone()));
            }
        }
        out
    }

    /// All events declared by enabled modules, resolved to their namespaced
    /// dispatch-matchable form — data source for the "Internal event"
    /// listener picker. Returns (full_name, label, module_name).
    pub async fn list_declared_events(&self) -> Vec<(String, String, String)> {
        let mut out = Vec::new();
        for module in self.list_modules().await {
            if !module.enabled { continue; }
            let ns = format!("{}.{}", slugify(&module.author), module.id);
            for ev in &module.events {
                out.push((format!("{ns}.{}", ev.key), ev.label.clone(), module.name.clone()));
            }
        }
        out
    }

    #[allow(dead_code)]
    pub async fn get_module_preamble(&self, module_id: &str) -> String {
        let Some(manifest) = self.get_module(module_id).await else { return String::new() };
        if manifest.bundle.libraries.is_empty() { return String::new(); }
        let module_dir = self.module_dir(module_id).await;
        let mut preamble = String::new();
        for lib in &manifest.bundle.libraries {
            let src_path = module_dir.join(&lib.file);
            if let Ok(src) = std::fs::read_to_string(&src_path) {
                preamble.push_str(&src);
                preamble.push('\n');
            }
        }
        preamble
    }

    /// Run pre-flight validation for a module. Checks script files, UI pages, and libraries
    /// for existence and Rhai compile errors. Returns a list of issues (empty = all good).
    pub async fn preflight(&self, module_id: &str) -> Vec<PreflightIssue> {
        use crate::scripting::engine::get_engine;

        let Some(manifest) = self.get_module(module_id).await else {
            return vec![PreflightIssue {
                severity: "error".into(),
                kind: "module".into(),
                file: None,
                message: format!("Module '{}' not found", module_id),
            }];
        };

        let module_dir = self.module_dir(module_id).await;
        let engine = get_engine();
        let mut issues = Vec::new();

        // Check each script file
        for (key, rel_path) in &manifest.scripts {
            let path = module_dir.join(rel_path);
            match std::fs::read_to_string(&path) {
                Err(_) => issues.push(PreflightIssue {
                    severity: "error".into(),
                    kind: "script".into(),
                    file: Some(rel_path.clone()),
                    message: format!("Script '{}' not found on disk", key),
                }),
                Ok(src) => {
                    if let Err(e) = engine.compile(&src) {
                        issues.push(PreflightIssue {
                            severity: "error".into(),
                            kind: "script".into(),
                            file: Some(rel_path.clone()),
                            message: format!("Compile error: {e}"),
                        });
                    }
                }
            }
        }

        // Check each UI page file
        for page in &manifest.pages {
            let path = module_dir.join(&page.file);
            if !path.exists() {
                issues.push(PreflightIssue {
                    severity: "error".into(),
                    kind: "ui".into(),
                    file: Some(page.file.clone()),
                    message: format!("UI page '{}' not found on disk", page.id),
                });
            }
        }

        // Check settings page file if specified
        if let Some(ref settings_path) = manifest.settings_page {
            let path = module_dir.join(settings_path);
            if !path.exists() {
                issues.push(PreflightIssue {
                    severity: "error".into(),
                    kind: "ui".into(),
                    file: Some(settings_path.clone()),
                    message: "Settings page not found on disk".into(),
                });
            }
        }

        // Check bundled library files
        for lib in &manifest.bundle.libraries {
            let path = module_dir.join(&lib.file);
            match std::fs::read_to_string(&path) {
                Err(_) => issues.push(PreflightIssue {
                    severity: "error".into(),
                    kind: "library".into(),
                    file: Some(lib.file.clone()),
                    message: format!("Bundled library '{}' not found on disk", lib.name),
                }),
                Ok(src) => {
                    if let Err(e) = engine.compile(&src) {
                        issues.push(PreflightIssue {
                            severity: "error".into(),
                            kind: "library".into(),
                            file: Some(lib.file.clone()),
                            message: format!("Compile error: {e}"),
                        });
                    }
                }
            }

            // A library name already owned by a DIFFERENT module/package
            // would get silently reassigned to whichever one installs last —
            // see install_bundled_libraries's upsert-by-name behavior. Flag
            // it here rather than let two unrelated modules fight over the
            // same `import "name"` (or, if it's a global one, the same bare
            // global function names).
            let pool = self.db.read().await;
            let existing_owner: Option<Option<String>> = sqlx::query_scalar(
                "SELECT source_module FROM libraries WHERE name = ?"
            ).bind(&lib.name).fetch_optional(&*pool).await.unwrap_or(None);
            drop(pool);
            if let Some(owner) = existing_owner {
                let owned_by_someone_else = match &owner {
                    Some(other_id) => other_id != module_id,
                    None => true, // NULL = a global stdlib library; never safe to reassign
                };
                if owned_by_someone_else {
                    issues.push(PreflightIssue {
                        severity: "error".into(),
                        kind: "library".into(),
                        file: Some(lib.file.clone()),
                        message: format!(
                            "Library name '{}' is already used by {} — pick a different name to avoid silently overwriting it",
                            lib.name,
                            owner.as_deref().unwrap_or("a global stdlib library")
                        ),
                    });
                }
            }
        }

        // Check all commands have non-empty triggers
        for cmd in &manifest.commands {
            if cmd.trigger.trim().is_empty() {
                issues.push(PreflightIssue {
                    severity: "warn".into(),
                    kind: "command".into(),
                    file: None,
                    message: format!("Command with builtin_key '{}' has an empty trigger", cmd.builtin_key),
                });
            }
            // Check the script key referenced by each command exists in the scripts map
            if !manifest.scripts.contains_key(&cmd.builtin_key) {
                issues.push(PreflightIssue {
                    severity: "warn".into(),
                    kind: "command".into(),
                    file: None,
                    message: format!("Command '{}' references missing script key '{}'", cmd.trigger, cmd.builtin_key),
                });
            }
        }

        issues
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreflightIssue {
    pub severity: String,   // "error" | "warn"
    pub kind: String,       // "script" | "ui" | "library" | "command" | "module"
    pub file: Option<String>,
    pub message: String,
}
