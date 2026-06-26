use crate::queue::QueueState;
use rhai::{Dynamic, Engine, Map};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tracing::error;

pub fn block_on<F, T>(f: F) -> T
where F: std::future::Future<Output = T> {
    tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(f))
}

#[derive(Clone)]
pub struct QueueProxy {
    pub queue:        Arc<QueueState>,
    pub username:     String,
    pub is_sub:       bool,
    pub sub_mode:     bool,
    pub viewer_limit: u32,
    pub sub_limit:    u32,
    pub app_handle:   AppHandle,
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<QueueProxy>("Queue");

    // queue.add(level_id_string) — returns a status string, emits queue-updated
    engine.register_fn("add", |q: &mut QueueProxy, level_id: &str| -> String {
        let id = match parse_level_id(level_id) {
            Some(n) => n,
            None    => return format!("\"{}\" is not a valid level ID (need 3-9 digits).", level_id),
        };
        let queue        = q.queue.clone();
        let username     = q.username.clone();
        let is_sub       = q.is_sub;
        let sub_mode     = q.sub_mode;
        let vl           = q.viewer_limit;
        let sl           = q.sub_limit;
        let app_handle   = q.app_handle.clone();
        block_on(async move {
            match queue.add_level(id, &username, is_sub, sub_mode, vl, sl).await {
                Ok(msg) => {
                    app_handle.emit("queue-updated", ()).ok();
                    msg
                }
                Err(e) => { error!("queue.add: {e}"); "Failed to add level.".into() }
            }
        })
    });

    // queue.next() — pops next level, emits queue-updated + level-nexted
    engine.register_fn("next", |q: &mut QueueProxy| -> String {
        let queue      = q.queue.clone();
        let sub_mode   = q.sub_mode;
        let app_handle = q.app_handle.clone();
        block_on(async move {
            match queue.next_level(sub_mode).await {
                Ok(Some(n)) => {
                    app_handle.emit("queue-updated", ()).ok();
                    app_handle.emit("level-nexted", serde_json::json!({
                        "level_id":   n.level_id,
                        "username":   n.username,
                        "queue_type": n.queue_type,
                    })).ok();
                    format!("Next level: {} (by @{})", n.level_id, n.username)
                }
                Ok(None) => "The queue is empty.".into(),
                Err(e)   => { error!("queue.next: {e}"); "Error.".into() }
            }
        })
    });

    // queue.remove(level_id) — emits queue-updated on success
    engine.register_fn("remove", |q: &mut QueueProxy, level_id: &str| -> String {
        let id = match parse_level_id(level_id) { Some(n) => n, None => return "Invalid level ID.".into() };
        let queue      = q.queue.clone();
        let app_handle = q.app_handle.clone();
        block_on(async move {
            match queue.remove_level(id).await {
                Ok(msg) => { app_handle.emit("queue-updated", ()).ok(); msg }
                Err(e)  => { error!("queue.remove: {e}"); "Failed to remove.".into() }
            }
        })
    });

    // queue.clear() — emits queue-updated
    engine.register_fn("clear", |q: &mut QueueProxy| -> String {
        let queue      = q.queue.clone();
        let app_handle = q.app_handle.clone();
        block_on(async move {
            match queue.clear().await {
                Ok(msg) => { app_handle.emit("queue-updated", ()).ok(); msg }
                Err(e)  => { error!("queue.clear: {e}"); "Failed to clear.".into() }
            }
        })
    });

    engine.register_fn("size", |q: &mut QueueProxy| -> i64 {
        block_on(async move {
            let pool = q.queue.db.read().await;
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM queue")
                .fetch_one(&*pool).await.unwrap_or(0)
        })
    });

    engine.register_fn("isEmpty", |q: &mut QueueProxy| -> bool {
        block_on(async move {
            let pool = q.queue.db.read().await;
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM queue")
                .fetch_one(&*pool).await.unwrap_or(0) == 0
        })
    });

    engine.register_fn("has", |q: &mut QueueProxy, level_id: &str| -> bool {
        let id = match parse_level_id(level_id) { Some(n) => n, None => return false };
        block_on(async move {
            let pool = q.queue.db.read().await;
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM queue WHERE level_id = ?")
                .bind(id).fetch_one(&*pool).await.unwrap_or(0) > 0
        })
    });

    engine.register_fn("list", |q: &mut QueueProxy, page: i64| -> Vec<Dynamic> {
        let per_page: i64 = 6;
        let offset  = (page.max(1) - 1) * per_page;
        block_on(async move {
            #[derive(sqlx::FromRow)]
            struct Row { level_id: i64, username: String, position: i64, queue_type: String }
            let pool = q.queue.db.read().await;
            let rows: Vec<Row> = sqlx::query_as(
                "SELECT level_id, username, position, queue_type \
                 FROM queue ORDER BY queue_type DESC, position ASC LIMIT ? OFFSET ?"
            ).bind(per_page).bind(offset).fetch_all(&*pool).await.unwrap_or_default();
            rows.into_iter().map(|r| {
                let mut m = Map::new();
                m.insert("level_id".into(),   Dynamic::from(r.level_id.to_string()));
                m.insert("username".into(),   Dynamic::from(r.username));
                m.insert("position".into(),   Dynamic::from(r.position));
                m.insert("queue_type".into(), Dynamic::from(r.queue_type));
                Dynamic::from_map(m)
            }).collect()
        })
    });

    engine.register_fn("position", |q: &mut QueueProxy, level_id: &str| -> i64 {
        let id = match parse_level_id(level_id) { Some(n) => n, None => return 0 };
        block_on(async move {
            let pool = q.queue.db.read().await;
            sqlx::query_scalar::<_, i64>("SELECT position FROM queue WHERE level_id = ? LIMIT 1")
                .bind(id).fetch_optional(&*pool).await.unwrap_or(None).unwrap_or(0)
        })
    });
}

pub fn parse_level_id(text: &str) -> Option<i64> {
    let digits: String = text.chars().filter(|c| c.is_ascii_digit()).take(9).collect();
    if digits.len() >= 3 { digits.parse().ok() } else { None }
}
