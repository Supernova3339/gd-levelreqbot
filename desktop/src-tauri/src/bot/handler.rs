/// Chat message dispatcher.
///
/// Receives messages from the Twitch/YouTube broadcast channel, looks up the
/// matching command in the in-memory cache, performs permission + cooldown
/// checks, then delegates to the appropriate command module:
///
///   bot/commands/queue.rs   — !r, !next, !list, !pos, !remove, !clear
///   bot/commands/info.rs    — !info
///   bot/commands/general.rs — custom response / block-script commands

use crate::bot::cmd_cache::CommandCache;
use crate::bot::commands::{self, Ctx};
use crate::bot::platform::ChatPlatform;
use crate::bot::ChatMessage;
use crate::bot::twitch::TwitchBot;
use crate::bot::youtube::YouTubeBot;
use crate::config::AppConfig;
use crate::queue::QueueState;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::{broadcast, RwLock};
use tracing::{error, info};

pub async fn process_messages(
    mut rx:         broadcast::Receiver<ChatMessage>,
    queue:          Arc<QueueState>,
    config:         Arc<RwLock<AppConfig>>,
    client:         Arc<TwitchBot>,
    youtube_client: Option<Arc<YouTubeBot>>,
    app_handle:     AppHandle,
    cache:          Arc<CommandCache>,
) {
    loop {
        let msg = match rx.recv().await {
            Ok(m) => m,
            Err(broadcast::error::RecvError::Closed)     => {
                info!("Broadcast channel closed — handler stopping");
                break;
            }
            Err(broadcast::error::RecvError::Lagged(n))  => {
                error!("Handler lagged, dropped {n} messages");
                continue;
            }
        };

        // Find a matching command (checks trigger + aliases)
        let command = match cache.find(msg.text.trim()).await {
            Some(c) => c,
            None    => continue,
        };

        // Platform filter
        if !passes_platform(&command.platform, &msg) { continue; }

        // Badge / permission check
        if !passes_badges(&command.required_badges, &msg) { continue; }

        // Cooldown check
        if !cache.check_and_update_cooldown(&command, &msg.username).await { continue; }

        // Extract args (text after the trigger).
        // Use the first word of the message as the matched trigger — this correctly
        // handles aliases: if the user typed "!r 12345" but command.trigger is "!request",
        // strip "!r" not "!request" (which wouldn't match and would leave "!r" in args).
        let matched_trigger = msg.text.trim().split_whitespace().next().unwrap_or("");
        let args = msg.text.trim()
            .trim_start_matches(matched_trigger)
            .trim();

        // Read shared config values
        let (sub_mode, viewer_limit, subscriber_limit) = {
            let cfg = config.read().await;
            (cfg.modes.sub, cfg.limits.viewer_request_limit, cfg.limits.subscriber_request_limit)
        };

        let queue_size: i64 = {
            let pool = queue.db.read().await;
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM queue")
                .fetch_one(&*pool).await.unwrap_or(0)
        };

        let ctx = Ctx {
            msg: &msg, args, queue: &queue, config: &config,
            client: &client, app_handle: &app_handle,
            sub_mode, viewer_limit, subscriber_limit, queue_size,
        };

        // If the command has a custom script, always run it through the script engine
        // regardless of builtin_key — this allows built-ins to be overridden via script.
        let replies: Vec<String> = if command.script.is_some() {
            commands::general::custom(&ctx, &command).await
        } else {
            match command.builtin_key.as_deref() {
                Some("request")  => commands::queue::request(&ctx).await.into_iter().collect(),
                Some("next")     => commands::queue::next(&ctx).await.into_iter().collect(),
                Some("list")     => commands::queue::list(&ctx).await.into_iter().collect(),
                Some("position") => commands::queue::position(&ctx).await.into_iter().collect(),
                Some("remove")   => commands::queue::remove(&ctx).await.into_iter().collect(),
                Some("clear")    => commands::queue::clear(&ctx).await.into_iter().collect(),
                Some("info")     => commands::info::info(&ctx).await.into_iter().collect(),
                Some(unknown)    => { error!("Unknown builtin_key: {unknown}"); vec![] }
                None             => commands::general::custom(&ctx, &command).await,
            }
        };

        for reply in replies {
            let result = if msg.platform == "youtube" {
                if let Some(ref yc) = youtube_client {
                    yc.send_message(&reply).await
                } else {
                    client.send_message(&reply).await
                }
            } else {
                client.send_message(&reply).await
            };
            if let Err(e) = result {
                error!("Failed to send reply on {}: {e}", msg.platform);
            }
        }
    }
}

// ─── Guards ───────────────────────────────────────────────────────────────────

fn passes_platform(platform: &str, msg: &ChatMessage) -> bool {
    match platform {
        "twitch"  => msg.platform == "twitch",
        "youtube" => msg.platform == "youtube",
        _         => true,
    }
}

fn passes_badges(required_json: &str, msg: &ChatMessage) -> bool {
    let required: Vec<String> = serde_json::from_str(required_json).unwrap_or_default();
    if required.is_empty() { return true; }
    required.iter().any(|r| match r.as_str() {
        "moderator"   => msg.is_mod,
        "broadcaster" => msg.is_broadcaster,
        "subscriber"  => msg.is_subscriber,
        _             => false,
    })
}
