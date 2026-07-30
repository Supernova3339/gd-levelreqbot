/// Channel-point redemption dispatcher — the EventSub-driven counterpart to
/// `handler::process_messages`. Two independent ways a redemption can result
/// in something happening:
///
///   1. Command-level listener — a command in Settings → Commands with its
///      redemption listener enabled and a matching reward title. Runs
///      through the same `execute_command` path a chat trigger would.
///   2. Module-level listener — any enabled module that declares a
///      `redemption_handler` script gets a shot at every redemption; the
///      script itself decides (via `ms`-stored settings) whether it's the
///      one it's waiting for, and is responsible for fulfilling/canceling it
///      through the `twitch` proxy — this dispatcher doesn't auto-resolve
///      redemptions, since only the module knows whether it actually handled
///      one.
///
/// Both can fire for the same redemption — they're independent, not
/// mutually exclusive.

use crate::bot::cmd_cache::CommandCache;
use crate::bot::dev::DevLogger;
use crate::bot::eventsub::RedemptionEvent;
use crate::bot::handler::{execute_command, send_replies};
use crate::bot::platform::ChatPlatform;
use crate::bot::twitch::TwitchBot;
use crate::bot::youtube::YouTubeBot;
use crate::bot::ChatMessage;
use crate::config::AppConfig;
use crate::modules::ModuleState;
use crate::queue::QueueState;
use crate::scripting::context::{read_shell_enabled, ScriptCtx};
use crate::scripting::execute::run_script;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::{broadcast, RwLock};
use tracing::error;

fn dev_log(app_handle: &AppHandle, msg: impl Into<String>) {
    if let Some(dev) = app_handle.try_state::<Arc<DevLogger>>() {
        dev.log(msg);
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn process_redemptions(
    mut rx:         broadcast::Receiver<RedemptionEvent>,
    queue:          Arc<QueueState>,
    config:         Arc<RwLock<AppConfig>>,
    client:         Arc<TwitchBot>,
    youtube_client: Option<Arc<YouTubeBot>>,
    app_handle:     AppHandle,
    modules:        Arc<ModuleState>,
    cache:          Arc<CommandCache>,
) {
    loop {
        let event = match rx.recv().await {
            Ok(e) => e,
            Err(broadcast::error::RecvError::Closed) => break,
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
        };

        // EventSub redemption payloads only carry the redeemer's user_id/login —
        // no badges — so subscriber/broadcaster status has to be resolved
        // separately, or every sub-only-gated command/script would silently see
        // a false negative for genuine subscribers. `is_mod` stays false: there's
        // no moderator-list scope in the current grant, and moderators redeeming
        // their own points is a rare enough case to not justify one yet.
        let is_broadcaster = client.broadcaster_id().await.as_deref() == Some(event.user_id.as_str());
        let is_subscriber = if is_broadcaster {
            true
        } else {
            client.is_subscriber(&event.user_id).await.unwrap_or(false)
        };

        let synthetic_msg = ChatMessage {
            platform:       "twitch".to_string(),
            username:       event.user_login.clone(),
            text:           String::new(),
            is_subscriber,
            is_mod:         false,
            is_broadcaster,
        };

        let args = vec![
            event.reward_title.clone(),
            event.user_login.clone(),
            event.user_input.clone(),
            event.redemption_id.clone(),
            event.reward_id.clone(),
            event.reward_cost.to_string(),
        ];

        // Command-level listener: a command in Settings → Commands with
        // "Also trigger on channel-point redemption" enabled and a matching
        // reward title. Runs through the exact same path a chat trigger would.
        if let Some(command) = cache.find_by_listener("twitch_redemption", &event.reward_title).await {
            dev_log(&app_handle, format!(
                "redemption '{}' → intercepted by command '{}' (#{})", event.reward_title, command.trigger, command.id
            ));
            let args_str = event.user_input.clone();
            let replies = execute_command(
                &command, &synthetic_msg, &args_str, "",
                &queue, &config, &client, &youtube_client, &app_handle, &modules, &[],
                Some(event.redemption_id.as_str()), Some(event.reward_id.as_str()),
            ).await;
            send_replies("twitch", replies, &client, &youtube_client).await;
        } else {
            dev_log(&app_handle, format!("redemption '{}' — no command listening", event.reward_title));
        }

        // Module-level listener: any enabled module that declares a
        // `redemption_handler` script gets a shot at every redemption; the
        // script itself decides whether it's the one it's waiting for.
        let handlers = modules.get_redemption_handlers().await;
        if handlers.is_empty() { continue; }

        let shell_enabled = {
            let pool = queue.db.read().await;
            read_shell_enabled(&*pool).await
        };

        for (module_id, script_src, script_rel) in handlers {
            let ctx = ScriptCtx {
                msg: &synthetic_msg,
                args: args.clone(),
                queue: queue.clone(),
                config: None,
                command_name: "twitch_redemption".to_string(),
                command_trigger: String::new(),
                command_counter: 0,
                sub_mode: false,
                viewer_limit: 0,
                sub_limit: 0,
                queue_size: 0,
                platform: "twitch".to_string(),
                shell_enabled,
                module_id: Some(module_id.clone()),
                script_file: Some(script_rel),
                twitch: Some(client.clone()),
                youtube: youtube_client.clone(),
                event_chain: vec![],
                redemption_id: Some(event.redemption_id.clone()),
                reward_id: Some(event.reward_id.clone()),
            };

            let replies = run_script(&script_src, &ctx, app_handle.clone()).await;
            for reply in replies {
                if let Err(e) = client.send_message(&reply).await {
                    error!("Failed to send redemption-handler reply for module {module_id}: {e}");
                }
            }
        }
    }
}
