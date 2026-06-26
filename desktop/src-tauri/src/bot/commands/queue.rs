use super::{parse_level_id, Ctx};
use crate::bot::platform::ChatPlatform;
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

    match ctx.queue
        .add_level_from(
            level_id,
            &ctx.msg.username,
            ctx.msg.is_subscriber,
            ctx.sub_mode,
            ctx.viewer_limit,
            ctx.subscriber_limit,
            &ctx.msg.platform,
        )
        .await
    {
        Ok(msg) => {
            ctx.app_handle.emit("queue-updated", ()).ok();
            Some(msg)
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

            // Try to fetch GD level name if available
            let name = if let Ok(Some(lvl)) = crate::gd::get_level_by_id(next.level_id).await {
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

    // Subscriber queue (if enabled)
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

    // Viewer queue
    if let Ok(vq) = ctx.queue.get_page("viewer", page, 5).await {
        if vq.data.is_empty() && parts.is_empty() {
            return Some("The queue is empty!".into());
        }
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
            // Try to get GD name
            let name = crate::gd::get_level_by_id(level_id).await
                .ok().flatten()
                .map(|l| l.level_name)
                .unwrap_or_else(|| level_id.to_string());

            Some(format!("{name} is #{pos} in the {qt} queue."))
        }
        Ok(None) => Some(format!("Level {level_id} is not in the queue.")),
        Err(e)   => { error!("!pos: {e}"); None }
    }
}

/// `!remove <level_id>` — remove a level (mod removes any; user removes their own)
pub async fn remove(ctx: &Ctx<'_>) -> Option<String> {
    let Some(level_id) = parse_level_id(ctx.args) else {
        return Some(format!("@{} — usage: !remove <level_id>", ctx.msg.username));
    };

    let is_staff = ctx.msg.is_mod || ctx.msg.is_broadcaster;

    if !is_staff {
        // Check ownership
        match ctx.queue.get_position(level_id, ctx.sub_mode).await {
            Ok(None) => return Some(format!("Level {level_id} is not in the queue.")),
            Err(e)   => { error!("!remove get_position: {e}"); return None; }
            Ok(Some(_)) => {
                // Verify ownership via searchQueue equivalent
                // We'll allow removal if they own it — check via queue pages
                let owns = check_ownership(ctx, level_id).await;
                if !owns {
                    return Some(format!(
                        "@{} — you can only remove your own levels.",
                        ctx.msg.username
                    ));
                }
            }
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

async fn check_ownership(ctx: &Ctx<'_>, level_id: i64) -> bool {
    let pool = ctx.queue.db.read().await;
    let owner: Option<String> = sqlx::query_scalar(
        "SELECT username FROM queue WHERE level_id = ? LIMIT 1"
    )
    .bind(level_id)
    .fetch_optional(&*pool)
    .await
    .unwrap_or(None);
    owner.as_deref() == Some(&ctx.msg.username)
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
