/// Generic Twitch EventSub dispatcher — the fan-out side of the
/// one-subscription-per-type design in `bot::eventsub`. Any enabled module
/// that declared interest in an event type (manifest `twitch_events`) gets
/// its `twitch_event_handler` script run with `[event_type, payload_json]`
/// args for every notification of that type, regardless of how many other
/// modules also asked for it or whether the built-in redemption handler
/// (`redemption_handler.rs`) already reacted to the same notification.
///
/// No command-level listener here (unlike redemptions) — that concept was
/// specific to the channel-point-redemption command binding in Settings →
/// Commands; a generic Twitch event has no equivalent UI surface (yet).

use crate::bot::eventsub::TwitchEventSubEvent;
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
use tauri::AppHandle;
use tokio::sync::{broadcast, RwLock};
use tracing::error;

pub async fn process_twitch_events(
    mut rx:         broadcast::Receiver<TwitchEventSubEvent>,
    queue:          Arc<QueueState>,
    _config:        Arc<RwLock<AppConfig>>,
    client:         Arc<TwitchBot>,
    youtube_client: Option<Arc<YouTubeBot>>,
    app_handle:     AppHandle,
    modules:        Arc<ModuleState>,
) {
    loop {
        let event = match rx.recv().await {
            Ok(e) => e,
            Err(broadcast::error::RecvError::Closed) => break,
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
        };

        let handlers = modules.find_twitch_event_handlers(&event.event_type).await;
        if handlers.is_empty() { continue; }

        let payload_json = event.payload.to_string();
        let args = vec![event.event_type.clone(), payload_json];

        // No real chat message behind a Twitch event — a neutral, trusted
        // synthetic sender, same shape used for panel-data evals and other
        // non-chat-triggered script runs elsewhere in this app.
        let synthetic_msg = ChatMessage {
            platform:       "twitch".to_string(),
            username:       "system".to_string(),
            text:           String::new(),
            is_subscriber:  false,
            is_mod:         true,
            is_broadcaster: true,
        };

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
                command_name: "twitch_event".to_string(),
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
                redemption_id: None,
                reward_id: None,
            };

            let replies = run_script(&script_src, &ctx, app_handle.clone()).await;
            for reply in replies {
                if let Err(e) = client.send_message(&reply).await {
                    error!("Failed to send twitch-event-handler reply for module {module_id}: {e}");
                }
            }
        }
    }
}
