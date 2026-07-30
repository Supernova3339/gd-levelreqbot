/// Chat message dispatcher.
///
/// Receives messages from the Twitch/YouTube broadcast channel, looks up the
/// matching command in the in-memory cache, performs permission + cooldown
/// checks, then delegates to the appropriate handler:
///
///   Module-owned commands → run Rhai script with `ms` injected
///   bot/commands/info.rs  → !info
///   bot/commands/general.rs → custom response / script commands

use crate::bot::cmd_cache::CommandCache;
use crate::bot::commands::{self, Ctx};
use crate::bot::platform::ChatPlatform;
use crate::bot::ChatMessage;
use crate::bot::twitch::TwitchBot;
use crate::bot::youtube::YouTubeBot;
use crate::commands::cmd_registry::BotCommand;
use crate::config::AppConfig;
use crate::modules::ModuleState;
use crate::queue::QueueState;
use crate::scripting::context::{read_shell_enabled, ScriptCtx};
use crate::scripting::execute::run_script;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
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
    modules:        Arc<ModuleState>,
) {
    loop {
        let msg = match rx.recv().await {
            Ok(m) => m,
            Err(broadcast::error::RecvError::Closed)    => {
                info!("Broadcast channel closed — handler stopping");
                break;
            }
            Err(broadcast::error::RecvError::Lagged(n)) => {
                error!("Handler lagged, dropped {n} messages");
                continue;
            }
        };

        let command = match cache.find(msg.text.trim()).await {
            Some(c) => c,
            None    => continue,
        };

        if !passes_platform(&command.platform, &msg) { continue; }
        if !passes_badges(&command.required_badges, &msg) { continue; }
        if !cache.check_and_update_cooldown(&command, &msg.username).await { continue; }

        let matched_trigger = msg.text.trim().split_whitespace().next().unwrap_or("");
        let args_str = msg.text.trim().trim_start_matches(matched_trigger).trim();

        let replies = execute_command(
            &command, &msg, args_str, matched_trigger,
            &queue, &config, &client, &youtube_client, &app_handle, &modules, &[],
            None, None,
        ).await;

        send_replies(&msg.platform, replies, &client, &youtube_client).await;
    }
}

/// Runs a resolved command (builtin/module/custom) and returns its chat replies.
/// Shared by the chat dispatcher above and the Twitch redemption dispatcher —
/// a command doesn't care whether it was invoked by a typed trigger or a
/// channel-point redemption, it just needs a `msg` (real or synthetic) and args.
///
/// `redemption_id`/`reward_id` are `Some` only when this run was triggered by
/// a channel-point redemption (see `redemption_handler::process_redemptions`);
/// they're forwarded into the script's `redemption_id`/`reward_id` globals so
/// it can call `twitch.cancel_redemption(...)` to auto-refund on failure.
#[allow(clippy::too_many_arguments)]
pub async fn execute_command(
    command:        &BotCommand,
    msg:            &ChatMessage,
    args_str:       &str,
    matched_trigger: &str,
    queue:          &Arc<QueueState>,
    config:         &Arc<RwLock<AppConfig>>,
    client:         &Arc<TwitchBot>,
    youtube_client: &Option<Arc<YouTubeBot>>,
    app_handle:     &AppHandle,
    modules:        &Arc<ModuleState>,
    event_chain:    &[String],
    redemption_id:  Option<&str>,
    reward_id:      Option<&str>,
) -> Vec<String> {
    let args: Vec<String> = args_str.split_whitespace().map(String::from).collect();

    let (sub_mode, viewer_limit, subscriber_limit, queue_size) = {
        let cfg = config.read().await;
        let pool = queue.db.read().await;
        let total: i64 = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM user_data WHERE collection LIKE 'module:level-queue:%' AND collection != 'module:level-queue:history'"
        ).fetch_one(&*pool).await.unwrap_or(0);
        (cfg.modes.sub, cfg.limits.viewer_request_limit, cfg.limits.subscriber_request_limit, total)
    };

    let ctx = Ctx {
        msg, args: args_str, queue, config,
        client, youtube: youtube_client, app_handle,
        sub_mode, viewer_limit, subscriber_limit, queue_size,
        queue_open: true, // managed by module store
        max_queue_size: 0,
        redemption_id, reward_id,
    };

    // Module-owned commands always run through the module script path (so `ms` and
    // module-bundled libraries are available), even when the user has saved a local
    // override script for them — the override just replaces the source, not the context.
    if let Some(ref builtin_key) = command.builtin_key {
        // Check if a module owns this builtin_key
        if let Some((module_id, module_script_src, script_rel)) = modules.get_command_script(builtin_key).await {
            let script_src = command.script.clone().unwrap_or(module_script_src);
            let shell_enabled = {
                let pool = queue.db.read().await;
                read_shell_enabled(&*pool).await
            };
            let script_ctx = ScriptCtx {
                msg,
                args,
                queue: queue.clone(),
                config: Some(config.clone()),
                command_name: command.trigger.clone(),
                command_trigger: matched_trigger.to_string(),
                command_counter: command.counter,
                sub_mode,
                viewer_limit,
                sub_limit: subscriber_limit,
                queue_size,
                platform: msg.platform.clone(),
                shell_enabled,
                module_id: Some(module_id),
                script_file: Some(script_rel),
                twitch: Some(client.clone()),
                youtube: youtube_client.clone(),
                event_chain: event_chain.to_vec(),
                redemption_id: redemption_id.map(str::to_string),
                reward_id: reward_id.map(str::to_string),
            };
            run_script(&script_src, &script_ctx, app_handle.clone()).await
        } else {
            // Check if this is a module builtin that exists in the DB but has no script on disk
            let is_module_cmd = modules.has_module_for_builtin(builtin_key).await;
            if is_module_cmd {
                let err = format!("Script '{}' not found — reinstall the module.", builtin_key);
                error!("{err}");
                app_handle.emit("bot-script-error", &err).ok();
                vec![]
            } else {
                match builtin_key.as_str() {
                    "info" => commands::info::info(&ctx).await.into_iter().collect(),
                    unknown => { error!("Unknown builtin_key: {unknown}"); vec![] }
                }
            }
        }
    } else {
        commands::general::custom(&ctx, command, event_chain).await
    }
}

pub async fn send_replies(
    platform:       &str,
    replies:        Vec<String>,
    client:         &Arc<TwitchBot>,
    youtube_client: &Option<Arc<YouTubeBot>>,
) {
    for reply in replies {
        let result = if platform == "youtube" {
            if let Some(ref yc) = youtube_client {
                yc.send_message(&reply).await
            } else {
                client.send_message(&reply).await
            }
        } else {
            client.send_message(&reply).await
        };
        if let Err(e) = result {
            error!("Failed to send reply on {platform}: {e}");
        }
    }
}

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
