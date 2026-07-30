// queue.rs — Backward-compatibility facade for the `queue` Rhai proxy.
//
// The actual storage is now in user_data/kv_store via the module store
// (module:level-queue:*).  This proxy preserves the old queue.add(),
// queue.next(), queue.list() etc. API so existing custom user scripts
// keep working without modification.

use crate::config::AppConfig;
use crate::queue::QueueState;
use rhai::{Dynamic, Engine, Map};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

const VIEWER_COL:  &str = "module:level-queue:viewer";
const SUB_COL:     &str = "module:level-queue:subscriber";
const HISTORY_COL: &str = "module:level-queue:history";
const OPEN_KEY:    &str = "module:level-queue:kv:open";
const MAX_KEY:     &str = "module:level-queue:kv:max_size";

pub fn block_on<F, T>(f: F) -> T
where F: std::future::Future<Output = T> {
    tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(f))
}

#[derive(Clone)]
pub struct QueueProxy {
    pub queue:        Arc<QueueState>,
    #[allow(dead_code)]
    pub config:       Option<Arc<RwLock<AppConfig>>>,
    pub username:     String,
    pub is_sub:       bool,
    pub sub_mode:     bool,
    pub viewer_limit: u32,
    pub sub_limit:    u32,
    pub app_handle:   AppHandle,
    pub platform:     String,
}

// ── SQL helpers ───────────────────────────────────────────────────────────────

async fn kv_get_opt(queue: &Arc<QueueState>, key: &str) -> Option<String> {
    let pool = queue.db.read().await;
    sqlx::query_scalar::<_, String>("SELECT value FROM kv_store WHERE key = ?")
        .bind(key).fetch_optional(&*pool).await.unwrap_or(None)
}

async fn kv_set(queue: &Arc<QueueState>, key: &str, value: &str) {
    let pool = queue.db.read().await;
    let _ = sqlx::query(
        "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()"
    ).bind(key).bind(value).execute(&*pool).await;
}

async fn col_count(queue: &Arc<QueueState>, col: &str) -> i64 {
    let pool = queue.db.read().await;
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM user_data WHERE collection = ?")
        .bind(col).fetch_one(&*pool).await.unwrap_or(0)
}

async fn total_size(queue: &Arc<QueueState>) -> i64 {
    let pool = queue.db.read().await;
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM user_data WHERE collection = ? OR collection = ?"
    )
    .bind(VIEWER_COL).bind(SUB_COL)
    .fetch_one(&*pool).await.unwrap_or(0)
}

async fn level_exists(queue: &Arc<QueueState>, level_id: i64) -> bool {
    let pool = queue.db.read().await;
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM user_data \
         WHERE (collection = ? OR collection = ?) \
         AND CAST(json_extract(data, '$.level_id') AS INTEGER) = ?"
    )
    .bind(VIEWER_COL).bind(SUB_COL).bind(level_id)
    .fetch_one(&*pool).await.unwrap_or(0) > 0
}

async fn user_count_in(queue: &Arc<QueueState>, col: &str, username: &str) -> i64 {
    let pool = queue.db.read().await;
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM user_data WHERE collection = ? AND json_extract(data, '$.username') = ?"
    )
    .bind(col).bind(username)
    .fetch_one(&*pool).await.unwrap_or(0)
}

async fn max_position(queue: &Arc<QueueState>, col: &str) -> i64 {
    let pool = queue.db.read().await;
    sqlx::query_scalar::<_, Option<i64>>(
        "SELECT MAX(CAST(json_extract(data,'$.position') AS INTEGER)) FROM user_data WHERE collection = ?"
    )
    .bind(col).fetch_one(&*pool).await.unwrap_or(None).unwrap_or(0)
}

async fn push_entry(queue: &Arc<QueueState>, col: &str, doc: &str) {
    let doc_id = format!("{}", uuid::Uuid::new_v4());
    let pool = queue.db.read().await;
    let _ = sqlx::query("INSERT INTO user_data (collection, doc_id, data) VALUES (?, ?, ?)")
        .bind(col).bind(doc_id).bind(doc).execute(&*pool).await;
}

/// Renumber positions 1..n in `col` by insertion order.
async fn renumber(queue: &Arc<QueueState>, col: &str) {
    let pool = queue.db.read().await;
    let doc_ids: Vec<String> = sqlx::query_scalar(
        "SELECT doc_id FROM user_data WHERE collection = ? ORDER BY id ASC"
    )
    .bind(col).fetch_all(&*pool).await.unwrap_or_default();

    for (i, doc_id) in doc_ids.iter().enumerate() {
        let _ = sqlx::query(
            "UPDATE user_data SET data = json_set(data, '$.position', ?) WHERE doc_id = ?"
        )
        .bind(i as i64 + 1).bind(doc_id).execute(&*pool).await;
    }
}

/// Find a doc by level_id in both queue collections. Returns (doc_id, collection).
async fn find_by_level_id(queue: &Arc<QueueState>, level_id: i64) -> Option<(String, String)> {
    let pool = queue.db.read().await;
    sqlx::query_as::<_, (String, String)>(
        "SELECT doc_id, collection FROM user_data \
         WHERE (collection = ? OR collection = ?) \
         AND CAST(json_extract(data, '$.level_id') AS INTEGER) = ? LIMIT 1"
    )
    .bind(VIEWER_COL).bind(SUB_COL).bind(level_id)
    .fetch_optional(&*pool).await.unwrap_or(None)
}

/// Pop the first entry (lowest id) from `col`. Returns (doc_id, data_json).
async fn pop_first(queue: &Arc<QueueState>, col: &str) -> Option<(String, String)> {
    let pool = queue.db.read().await;
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT doc_id, data FROM user_data WHERE collection = ? ORDER BY id ASC LIMIT 1"
    )
    .bind(col).fetch_optional(&*pool).await.unwrap_or(None);
    if let Some((doc_id, data)) = row {
        let _ = sqlx::query("DELETE FROM user_data WHERE doc_id = ?")
            .bind(&doc_id).execute(&*pool).await;
        Some((doc_id, data))
    } else {
        None
    }
}

async fn delete_by_level_id(queue: &Arc<QueueState>, level_id: i64) -> Option<String> {
    if let Some((doc_id, col)) = find_by_level_id(queue, level_id).await {
        let pool = queue.db.read().await;
        let _ = sqlx::query("DELETE FROM user_data WHERE doc_id = ?")
            .bind(&doc_id).execute(&*pool).await;
        drop(pool);
        renumber(queue, &col).await;
        Some(col)
    } else {
        None
    }
}

// ── Registration ───────────────────────────────────────────────────────────────

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<QueueProxy>("Queue");

    // queue.add(level_id_string)
    engine.register_fn("add", |q: &mut QueueProxy, level_id: &str| -> String {
        let Some(id) = parse_level_id(level_id) else {
            return format!("\"{}\" is not a valid level ID (need 3-9 digits).", level_id);
        };
        let queue      = q.queue.clone();
        let username   = q.username.clone();
        let is_sub     = q.is_sub && q.sub_mode;
        let col        = if is_sub { SUB_COL } else { VIEWER_COL };
        let limit      = if is_sub { q.sub_limit as i64 } else { q.viewer_limit as i64 };
        let app_handle = q.app_handle.clone();
        let platform   = q.platform.clone();
        block_on(async move {
            if level_exists(&queue, id).await {
                return format!("Level {} is already in the queue.", id);
            }
            let max_size = kv_get_opt(&queue, MAX_KEY).await
                .and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
            if max_size > 0 && total_size(&queue).await >= max_size {
                return format!("Sorry, the queue is full ({} levels).", max_size);
            }
            let user_c = user_count_in(&queue, col, &username).await;
            if user_c >= limit {
                return format!("Sorry, you have reached your request limit of {} level(s).", limit);
            }
            let pos = max_position(&queue, col).await + 1;
            let doc = serde_json::json!({
                "level_id": id, "username": username,
                "platform": platform, "position": pos,
                "added_at": chrono::Utc::now().to_rfc3339(),
            }).to_string();
            push_entry(&queue, col, &doc).await;
            app_handle.emit("queue-updated", ()).ok();
            format!("Level {} added to the queue at position {}.", id, pos)
        })
    });

    // queue.next() — weighted pop (60% sub bias when sub_mode)
    engine.register_fn("next", |q: &mut QueueProxy| -> String {
        let queue      = q.queue.clone();
        let sub_mode   = q.sub_mode;
        let app_handle = q.app_handle.clone();
        block_on(async move {
            let (first, second) = if sub_mode {
                let sub_c = col_count(&queue, SUB_COL).await;
                let use_sub = sub_c > 0 && rand_bool(0.6);
                if use_sub { (SUB_COL, VIEWER_COL) } else { (VIEWER_COL, SUB_COL) }
            } else {
                (VIEWER_COL, SUB_COL)
            };

            let entry = pop_first(&queue, first).await
                .or(pop_first(&queue, second).await);

            if let Some((_, data)) = entry {
                // Renumber whichever col we popped from (pop_first deletes before returning)
                renumber(&queue, first).await;

                let v: serde_json::Value = serde_json::from_str(&data).unwrap_or_default();
                let level_id = v["level_id"].as_i64().unwrap_or(0);
                let username = v["username"].as_str().unwrap_or("").to_string();
                let qt       = if first == SUB_COL { "subscriber" } else { "viewer" };
                let platform = v["platform"].as_str().unwrap_or("twitch").to_string();

                // Push to history
                let hist = serde_json::json!({
                    "level_id": level_id, "username": username,
                    "queue_type": qt, "platform": platform,
                    "nexted_at": chrono::Utc::now().to_rfc3339(),
                }).to_string();
                push_entry(&queue, HISTORY_COL, &hist).await;

                app_handle.emit("queue-updated", ()).ok();
                app_handle.emit("level-nexted", serde_json::json!({
                    "level_id": level_id, "username": username, "queue_type": qt,
                })).ok();
                format!("Next level: {} (by @{})", level_id, username)
            } else {
                "The queue is empty.".into()
            }
        })
    });

    // queue.remove(level_id)
    engine.register_fn("remove", |q: &mut QueueProxy, level_id: &str| -> String {
        let Some(id) = parse_level_id(level_id) else { return "Invalid level ID.".into(); };
        let queue      = q.queue.clone();
        let app_handle = q.app_handle.clone();
        block_on(async move {
            match delete_by_level_id(&queue, id).await {
                Some(_) => {
                    app_handle.emit("queue-updated", ()).ok();
                    format!("Level {} removed from the queue.", id)
                }
                None => format!("Level {} was not found in the queue.", id),
            }
        })
    });

    // queue.clear()
    engine.register_fn("clear", |q: &mut QueueProxy| -> String {
        let queue      = q.queue.clone();
        let app_handle = q.app_handle.clone();
        block_on(async move {
            let pool = queue.db.read().await;
            let _ = sqlx::query("DELETE FROM user_data WHERE collection = ? OR collection = ?")
                .bind(VIEWER_COL).bind(SUB_COL).execute(&*pool).await;
            drop(pool);
            app_handle.emit("queue-updated", ()).ok();
            "The level queue has been cleared.".into()
        })
    });

    engine.register_fn("size", |q: &mut QueueProxy| -> i64 {
        let queue = q.queue.clone();
        block_on(total_size(&queue))
    });

    engine.register_fn("isEmpty", |q: &mut QueueProxy| -> bool {
        let queue = q.queue.clone();
        block_on(total_size(&queue)) == 0
    });

    engine.register_fn("has", |q: &mut QueueProxy, level_id: &str| -> bool {
        let Some(id) = parse_level_id(level_id) else { return false; };
        let queue = q.queue.clone();
        block_on(level_exists(&queue, id))
    });

    engine.register_fn("list", |q: &mut QueueProxy, page: i64| -> Vec<Dynamic> {
        let per_page: i64 = 6;
        let offset        = (page.max(1) - 1) * per_page;
        let queue         = q.queue.clone();
        block_on(async move {
            let pool = queue.db.read().await;
            let rows: Vec<(String, String)> = sqlx::query_as(
                "SELECT doc_id, data FROM user_data \
                 WHERE collection = ? OR collection = ? \
                 ORDER BY collection DESC, CAST(json_extract(data,'$.position') AS INTEGER) ASC \
                 LIMIT ? OFFSET ?"
            )
            .bind(VIEWER_COL).bind(SUB_COL)
            .bind(per_page).bind(offset)
            .fetch_all(&*pool).await.unwrap_or_default();

            rows.into_iter().map(|(_, data)| {
                let v: serde_json::Value = serde_json::from_str(&data).unwrap_or_default();
                let mut m = Map::new();
                m.insert("level_id".into(),   Dynamic::from(v["level_id"].as_i64().unwrap_or(0).to_string()));
                m.insert("username".into(),   Dynamic::from(v["username"].as_str().unwrap_or("").to_string()));
                m.insert("position".into(),   Dynamic::from(v["position"].as_i64().unwrap_or(0)));
                m.insert("queue_type".into(), Dynamic::from(v.get("queue_type")
                    .and_then(|s| s.as_str()).unwrap_or("viewer").to_string()));
                Dynamic::from_map(m)
            }).collect()
        })
    });

    engine.register_fn("position", |q: &mut QueueProxy, level_id: &str| -> i64 {
        let Some(id) = parse_level_id(level_id) else { return 0; };
        let queue = q.queue.clone();
        block_on(async move {
            let pool = queue.db.read().await;
            sqlx::query_scalar::<_, Option<i64>>(
                "SELECT CAST(json_extract(data,'$.position') AS INTEGER) FROM user_data \
                 WHERE (collection = ? OR collection = ?) \
                 AND CAST(json_extract(data,'$.level_id') AS INTEGER) = ? LIMIT 1"
            )
            .bind(VIEWER_COL).bind(SUB_COL).bind(id)
            .fetch_optional(&*pool).await.unwrap_or(None)
            .flatten().unwrap_or(0)
        })
    });

    // queue.promote(level_id) — move a level to position 1 in its queue
    engine.register_fn("promote", |q: &mut QueueProxy, level_id: &str| -> String {
        let Some(id) = parse_level_id(level_id) else { return "Invalid level ID.".into(); };
        let queue      = q.queue.clone();
        let app_handle = q.app_handle.clone();
        block_on(async move {
            let Some((doc_id, col)) = find_by_level_id(&queue, id).await else {
                return format!("Level {} is not in the queue.", id);
            };
            // Collect all docs in insertion order; put target first
            let pool = queue.db.read().await;
            let all_ids: Vec<String> = sqlx::query_scalar(
                "SELECT doc_id FROM user_data WHERE collection = ? ORDER BY id ASC"
            )
            .bind(&col).fetch_all(&*pool).await.unwrap_or_default();

            let mut ordered = vec![doc_id.clone()];
            ordered.extend(all_ids.iter().filter(|d| *d != &doc_id).cloned());

            for (i, did) in ordered.iter().enumerate() {
                let _ = sqlx::query(
                    "UPDATE user_data SET data = json_set(data, '$.position', ?) WHERE doc_id = ?"
                )
                .bind(i as i64 + 1).bind(did).execute(&*pool).await;
            }
            drop(pool);

            app_handle.emit("queue-updated", ()).ok();
            format!("Level {} has been promoted to the front of the queue.", id)
        })
    });

    // queue.shuffle() — randomize viewer queue positions
    engine.register_fn("shuffle", |q: &mut QueueProxy| -> String {
        let queue      = q.queue.clone();
        let app_handle = q.app_handle.clone();
        block_on(async move {
            let pool = queue.db.read().await;
            let ids: Vec<String> = sqlx::query_scalar(
                "SELECT doc_id FROM user_data WHERE collection = ? ORDER BY RANDOM()"
            )
            .bind(VIEWER_COL).fetch_all(&*pool).await.unwrap_or_default();

            if ids.len() < 2 {
                return "Not enough viewers in queue to shuffle.".into();
            }

            for (i, doc_id) in ids.iter().enumerate() {
                let _ = sqlx::query(
                    "UPDATE user_data SET data = json_set(data,'$.position',?) WHERE doc_id=?"
                )
                .bind(i as i64 + 1).bind(doc_id).execute(&*pool).await;
            }
            drop(pool);
            app_handle.emit("queue-updated", ()).ok();
            "The viewer queue has been shuffled!".into()
        })
    });

    // queue.myLevels() — get the calling user's own queue entries
    engine.register_fn("myLevels", |q: &mut QueueProxy| -> Vec<Dynamic> {
        let queue    = q.queue.clone();
        let username = q.username.clone();
        block_on(async move {
            let pool = queue.db.read().await;
            let rows: Vec<(String, String)> = sqlx::query_as(
                "SELECT doc_id, data FROM user_data \
                 WHERE (collection = ? OR collection = ?) \
                 AND json_extract(data,'$.username') = ? \
                 ORDER BY collection DESC, CAST(json_extract(data,'$.position') AS INTEGER) ASC"
            )
            .bind(VIEWER_COL).bind(SUB_COL).bind(&username)
            .fetch_all(&*pool).await.unwrap_or_default();

            rows.into_iter().map(|(_, data)| {
                let v: serde_json::Value = serde_json::from_str(&data).unwrap_or_default();
                let is_sub = if v["is_subscriber"].as_bool().unwrap_or(false) { "subscriber" } else { "viewer" };
                let mut m = Map::new();
                m.insert("level_id".into(),   Dynamic::from(v["level_id"].as_i64().unwrap_or(0).to_string()));
                m.insert("queue_type".into(), Dynamic::from(is_sub.to_string()));
                m.insert("platform".into(),   Dynamic::from(v["platform"].as_str().unwrap_or("").to_string()));
                Dynamic::from_map(m)
            }).collect()
        })
    });

    // queue.isOpen()
    engine.register_fn("isOpen", |q: &mut QueueProxy| -> bool {
        let queue = q.queue.clone();
        block_on(async move {
            kv_get_opt(&queue, OPEN_KEY).await
                .map(|v| v != "false")
                .unwrap_or(true) // default: open
        })
    });

    // queue.open()
    engine.register_fn("open", |q: &mut QueueProxy| -> String {
        let queue      = q.queue.clone();
        let app_handle = q.app_handle.clone();
        block_on(async move {
            kv_set(&queue, OPEN_KEY, "true").await;
            app_handle.emit("queue-status-changed", true).ok();
            "The queue is now open! Use !r <level_id> to request a level.".into()
        })
    });

    // queue.close()
    engine.register_fn("close", |q: &mut QueueProxy| -> String {
        let queue      = q.queue.clone();
        let app_handle = q.app_handle.clone();
        block_on(async move {
            kv_set(&queue, OPEN_KEY, "false").await;
            app_handle.emit("queue-status-changed", false).ok();
            "The queue is now closed. No new requests will be accepted.".into()
        })
    });
}

pub fn parse_level_id(text: &str) -> Option<i64> {
    let digits: String = text.chars().filter(|c| c.is_ascii_digit()).take(9).collect();
    if digits.len() >= 3 { digits.parse().ok() } else { None }
}

fn rand_bool(probability: f64) -> bool {
    let byte = uuid::Uuid::new_v4().as_bytes()[0];
    (byte as f64 / 255.0) < probability
}
