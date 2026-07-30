use crate::bot::ChatMessage;
use crate::queue::QueueState;
use crate::scripting::context::{read_shell_enabled, ScriptCtx};
use crate::scripting::execute::run_script_full;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, State};

// ─── Changelog API proxy ──────────────────────────────────────────────────────
// Called from the frontend instead of a direct fetch() to avoid CORS restrictions.

const CHANGELOG_API: &str =
    "https://chr-dev.superdev.one/api/projects/cmqtz339d00sgnobsal9rt8l2/changelog";
const CHANGELOG_KEY: &str = "chr_yXQr3KayowCSWTZAt-gV_sOXdGfmDb9B";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangelogTag {
    pub id:    String,
    pub name:  String,
    pub color: String,
}

// Returned by the list endpoint — no content, has excerpt instead
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangelogListEntry {
    pub id:           String,
    #[serde(default)]
    pub version:      Option<String>,
    pub title:        String,
    #[serde(default)]
    pub excerpt:      Option<String>,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub tags:         Vec<ChangelogTag>,
}

// Returned by the single-entry endpoint — includes full content
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangelogFullEntry {
    pub id:           String,
    #[serde(default)]
    pub version:      Option<String>,
    pub title:        String,
    pub content:      String,
    #[serde(default)]
    pub excerpt:      Option<String>,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub tags:         Vec<ChangelogTag>,
}

fn changelog_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_changelog() -> Result<Vec<ChangelogListEntry>, String> {
    let client = changelog_client()?;

    let res = client
        .get(CHANGELOG_API)
        .header("Authorization", format!("Bearer {}", CHANGELOG_KEY))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Changelog request failed: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Changelog API returned {}", res.status()));
    }

    let text = res.text().await
        .map_err(|e| format!("Failed to read changelog response: {e}"))?;

    let val: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Changelog JSON parse error: {e}"))?;

    let arr = val.get("entries")
        .or_else(|| val.get("data"))
        .or_else(|| val.get("items"))
        .and_then(|v| v.as_array())
        .or_else(|| val.as_array())
        .ok_or_else(|| format!(
            "Unexpected changelog shape. Keys: {:?}",
            val.as_object().map(|o| o.keys().collect::<Vec<_>>())
        ))?;

    Ok(arr.iter()
        .filter_map(|item| serde_json::from_value(item.clone()).ok())
        .collect())
}

#[tauri::command]
pub async fn fetch_changelog_entry(id: String) -> Result<ChangelogFullEntry, String> {
    let client = changelog_client()?;
    let url = format!("{}/{}", CHANGELOG_API, id);

    let res = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", CHANGELOG_KEY))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Changelog entry request failed: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Changelog entry API returned {}", res.status()));
    }

    let text = res.text().await
        .map_err(|e| format!("Failed to read entry response: {e}"))?;

    serde_json::from_str::<ChangelogFullEntry>(&text)
        .map_err(|e| format!("Entry parse error: {e}"))
}

#[derive(Serialize)]
pub struct TestScriptResult {
    pub output:     Vec<String>,  // chat messages
    pub console:    Vec<String>,  // console.log/warn/error lines
    pub errors:     Vec<String>,  // compile / runtime errors
    pub elapsed_ms: u64,
}

#[tauri::command]
pub async fn test_script(
    script:         String,
    username:       String,
    args:           Vec<String>,
    platform:       String,
    is_mod:         bool,
    is_sub:         bool,
    is_broadcaster: bool,
    queue:          State<'_, Arc<QueueState>>,
    app_handle:     AppHandle,
) -> Result<TestScriptResult, String> {
    let mock_msg = ChatMessage {
        platform:       platform.clone(),
        username:       username.clone(),
        text:           args.join(" "),
        is_subscriber:  is_sub,
        is_mod,
        is_broadcaster,
    };

    let queue_arc = Arc::clone(&queue);

    let (queue_size, shell_enabled) = {
        let pool = queue_arc.db.read().await;
        let size: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM user_data WHERE collection = 'module:level-queue:viewer' OR collection = 'module:level-queue:subscriber'"
        ).fetch_one(&*pool).await.unwrap_or(0);
        let shell = read_shell_enabled(&pool).await;
        (size, shell)
    };

    let ctx = ScriptCtx {
        msg:             &mock_msg,
        args,
        queue:           queue_arc,
        config:          None,
        command_name:    "test".to_string(),
        command_trigger: "!test".to_string(),
        command_counter: 0,
        sub_mode:        false,
        viewer_limit:    100,
        sub_limit:       100,
        queue_size,
        platform,
        shell_enabled,
        module_id: None,
        script_file: None,
        twitch: None,
        youtube: None,
        event_chain: vec![],
        redemption_id: None,
        reward_id: None,
    };

    let result = run_script_full(&script, &ctx, app_handle).await;

    Ok(TestScriptResult {
        output:     result.output,
        console:    result.console,
        errors:     result.errors,
        elapsed_ms: result.elapsed_ms,
    })
}

// ─── Script settings (stored in kv_store) ─────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ScriptSettings {
    pub shell_enabled: bool,
}

#[tauri::command]
pub async fn get_script_settings(
    queue: State<'_, Arc<QueueState>>,
) -> Result<ScriptSettings, String> {
    let pool = queue.db.read().await;
    let shell_enabled = read_shell_enabled(&pool).await;
    Ok(ScriptSettings { shell_enabled })
}

#[tauri::command]
pub async fn save_script_settings(
    settings: ScriptSettings,
    queue:    State<'_, Arc<QueueState>>,
) -> Result<(), String> {
    let pool = queue.db.read().await;
    sqlx::query(
        "INSERT INTO kv_store (key, value, updated_at) VALUES ('sys:shell_enabled', ?, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()"
    )
    .bind(settings.shell_enabled.to_string())
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Startup message suppression (stored in kv_store) ────────────────────────

#[tauri::command]
pub async fn get_suppress_startup_msg(
    queue: State<'_, Arc<QueueState>>,
) -> Result<bool, String> {
    let pool = queue.db.read().await;
    let val: Option<String> = sqlx::query_scalar(
        "SELECT value FROM kv_store WHERE key = 'sys:suppress_startup_msg'"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(val.as_deref() == Some("1"))
}

#[tauri::command]
pub async fn set_suppress_startup_msg(
    suppress: bool,
    queue:    State<'_, Arc<QueueState>>,
) -> Result<(), String> {
    let pool = queue.db.read().await;
    sqlx::query(
        "INSERT INTO kv_store (key, value, updated_at) VALUES ('sys:suppress_startup_msg', ?, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()"
    )
    .bind(if suppress { "1" } else { "0" })
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Version / changelog tracking (stored in kv_store) ───────────────────────

#[tauri::command]
pub async fn get_last_seen_version(
    queue: State<'_, Arc<QueueState>>,
) -> Result<String, String> {
    let pool = queue.db.read().await;
    let val: Option<String> = sqlx::query_scalar(
        "SELECT value FROM kv_store WHERE key = 'sys:last_seen_version'"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(val.unwrap_or_default())
}

#[tauri::command]
pub async fn set_last_seen_version(
    version: String,
    queue:   State<'_, Arc<QueueState>>,
) -> Result<(), String> {
    let pool = queue.db.read().await;
    sqlx::query(
        "INSERT INTO kv_store (key, value, updated_at) VALUES ('sys:last_seen_version', ?, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()"
    )
    .bind(&version)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}
