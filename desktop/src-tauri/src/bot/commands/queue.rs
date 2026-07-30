use super::{parse_level_id, Ctx};
use tauri::Emitter;
use tracing::error;

/// `!r <level_id>` — add a level to the queue
pub async fn request(ctx: &Ctx<'_>) -> Option<String> {
    let Some(level_id) = parse_level_id(ctx.args) else {
        return Some(format!(
            "@{} — usage: !r <level_id> (3–9 digit ID)",
            ctx.msg.username
        ));
    };

    if !ctx.queue_open {
        return Some(format!("@{} — the queue is currently closed.", ctx.msg.username));
    }

    match ctx.queue
        .add_level_from(
            level_id,
            &ctx.msg.username,
            ctx.msg.is_subscriber,
            ctx.sub_mode,
            ctx.viewer_limit,
            ctx.subscriber_limit,
            &ctx.msg.platform,
            ctx.max_queue_size,
        )
        .await
    {
        Ok(msg) => {
            ctx.app_handle.emit("queue-updated", ()).ok();
            Some(format!("@{} — {}", ctx.msg.username, msg))
        }
        Err(e) => {
            error!("!r add_level: {e}");
            Some(format!("@{} — something went wrong adding your level.", ctx.msg.username))
        }
    }
}

/// `!next` — pop the next level from the queue (mod/broadcaster)
pub async fn next(ctx: &Ctx<'_>) -> Option<String> {
    match ctx.queue.next_level(ctx.sub_mode).await {
        Ok(Some(next)) => {
            ctx.app_handle.emit("queue-updated", ()).ok();
            ctx.app_handle.emit("level-nexted", serde_json::json!({
                "level_id":   next.level_id,
                "username":   next.username,
                "queue_type": next.queue_type,
            })).ok();

            let name = if let Ok(Some(lvl)) = crate::gd::get_level_by_id(next.level_id, None).await {
                format!("{} ({})", lvl.level_name, next.level_id)
            } else {
                next.level_id.to_string()
            };

            Some(format!(
                "Next level: {} — requested by @{} [{} queue]",
                name, next.username, next.queue_type
            ))
        }
        Ok(None) => Some("The queue is empty!".into()),
        Err(e)   => { error!("!next: {e}"); None }
    }
}

/// `!list [page]` — show the current queue
pub async fn list(ctx: &Ctx<'_>) -> Option<String> {
    let page = ctx.args.parse::<u32>().unwrap_or(1);
    let mut parts: Vec<String> = Vec::new();

    if ctx.sub_mode {
        if let Ok(sq) = ctx.queue.get_page("subscriber", page, 5).await {
            if !sq.data.is_empty() {
                let items: Vec<String> = sq.data.iter()
                    .map(|e| format!("#{} {} (@{})", e.position, e.level_id, e.username))
                    .collect();
                parts.push(format!("[Sub] {}", items.join(" | ")));
            }
        }
    }

    if let Ok(vq) = ctx.queue.get_page("viewer", page, 5).await {
        if !vq.data.is_empty() {
            let items: Vec<String> = vq.data.iter()
                .map(|e| format!("#{} {} (@{})", e.position, e.level_id, e.username))
                .collect();
            parts.push(format!("[Viewer] {}", items.join(" | ")));
        }
    }

    if parts.is_empty() {
        Some("The queue is empty!".into())
    } else {
        Some(format!("Queue p.{page}: {}", parts.join(" | ")))
    }
}

/// `!pos <level_id>` — get a level's position in queue
pub async fn position(ctx: &Ctx<'_>) -> Option<String> {
    let Some(level_id) = parse_level_id(ctx.args) else {
        return Some(format!("@{} — usage: !pos <level_id>", ctx.msg.username));
    };

    match ctx.queue.get_position(level_id, ctx.sub_mode).await {
        Ok(Some((pos, qt))) => {
            let name = crate::gd::get_level_by_id(level_id, None).await
                .ok().flatten()
                .map(|l| l.level_name)
                .unwrap_or_else(|| level_id.to_string());
            Some(format!("{name} is #{pos} in the {qt} queue."))
        }
        Ok(None) => Some(format!("Level {level_id} is not in the queue.")),
        Err(e)   => { error!("!pos: {e}"); None }
    }
}

/// `!remove <level_id>` — remove a level (mod removes any; viewer removes their own)
pub async fn remove(ctx: &Ctx<'_>) -> Option<String> {
    let Some(level_id) = parse_level_id(ctx.args) else {
        return Some(format!("@{} — usage: !remove <level_id>", ctx.msg.username));
    };

    let is_staff = ctx.msg.is_mod || ctx.msg.is_broadcaster;

    if !is_staff {
        match get_owner(ctx.queue.as_ref(), level_id).await {
            None => return Some(format!("Level {level_id} is not in the queue.")),
            Some(owner) if owner != ctx.msg.username => return Some(format!(
                "@{} — you can only remove your own levels.",
                ctx.msg.username
            )),
            Some(_) => {}
        }
    }

    match ctx.queue.remove_level(level_id).await {
        Ok(msg) => {
            ctx.app_handle.emit("queue-updated", ()).ok();
            Some(msg)
        }
        Err(e) => { error!("!remove: {e}"); None }
    }
}

async fn get_owner(queue: &crate::queue::QueueState, level_id: i64) -> Option<String> {
    let pool = queue.db.read().await;
    sqlx::query_scalar("SELECT username FROM queue WHERE level_id = ? LIMIT 1")
        .bind(level_id)
        .fetch_optional(&*pool)
        .await
        .unwrap_or(None)
}

/// `!clear` — clear the entire queue (mod/broadcaster only)
pub async fn clear(ctx: &Ctx<'_>) -> Option<String> {
    match ctx.queue.clear().await {
        Ok(msg) => {
            ctx.app_handle.emit("queue-updated", ()).ok();
            Some(msg)
        }
        Err(e) => { error!("!clear: {e}"); None }
    }
}

/// `!open` — open the queue for new requests (mod/broadcaster only)
pub async fn open_queue(ctx: &Ctx<'_>) -> Option<String> {
    let mut cfg = ctx.config.write().await;
    if cfg.queue_open {
        return Some("The queue is already open.".into());
    }
    cfg.queue_open = true;
    if let Err(e) = cfg.save().await {
        error!("!open save: {e}");
        return Some("Failed to open the queue.".into());
    }
    ctx.app_handle.emit("queue-status-changed", true).ok();
    Some("The queue is now open! Use !r <level_id> to request a level.".into())
}

/// `!close` — close the queue to new requests (mod/broadcaster only)
pub async fn close_queue(ctx: &Ctx<'_>) -> Option<String> {
    let mut cfg = ctx.config.write().await;
    if !cfg.queue_open {
        return Some("The queue is already closed.".into());
    }
    cfg.queue_open = false;
    if let Err(e) = cfg.save().await {
        error!("!close save: {e}");
        return Some("Failed to close the queue.".into());
    }
    ctx.app_handle.emit("queue-status-changed", false).ok();
    Some("The queue is now closed. No new requests will be accepted.".into())
}

/// `!mylevels` — show the user's own levels in the queue
pub async fn my_levels(ctx: &Ctx<'_>) -> Option<String> {
    match ctx.queue.get_user_levels(&ctx.msg.username).await {
        Ok(entries) if entries.is_empty() => {
            Some(format!("@{} — you have no levels in the queue.", ctx.msg.username))
        }
        Ok(entries) => {
            let parts: Vec<String> = entries.iter().map(|e| {
                format!("{} [{}]", e.level_id, e.queue_type)
            }).collect();
            Some(format!("@{} — your levels: {}", ctx.msg.username, parts.join(", ")))
        }
        Err(e) => { error!("!mylevels: {e}"); None }
    }
}

/// `!promote <level_id>` — move a level to the front (mod/broadcaster only)
pub async fn promote(ctx: &Ctx<'_>) -> Option<String> {
    let Some(level_id) = parse_level_id(ctx.args) else {
        return Some(format!("@{} — usage: !promote <level_id>", ctx.msg.username));
    };

    match ctx.queue.promote_level(level_id).await {
        Ok(msg) => {
            ctx.app_handle.emit("queue-updated", ()).ok();
            Some(msg)
        }
        Err(e) => { error!("!promote: {e}"); None }
    }
}

/// `!shuffle` — randomize the viewer queue (mod/broadcaster only)
pub async fn shuffle(ctx: &Ctx<'_>) -> Option<String> {
    match ctx.queue.shuffle_viewer_queue().await {
        Ok(msg) => {
            ctx.app_handle.emit("queue-updated", ()).ok();
            Some(msg)
        }
        Err(e) => { error!("!shuffle: {e}"); None }
    }
}
