use crate::bot::twitch::TwitchBot;
use crate::bot::youtube::YouTubeBot;
use crate::bot::ChatMessage;
use crate::config::AppConfig;
use crate::queue::QueueState;
use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;

/// Shared output buffer: each chat_say / chat_reply call appends here.
pub type ScriptOutput = Arc<Mutex<Vec<String>>>;

/// Everything a script execution needs to know about its invocation context.
#[allow(dead_code)]
pub struct ScriptCtx<'a> {
    pub msg:              &'a ChatMessage,
    pub args:             Vec<String>,
    pub queue:            Arc<QueueState>,
    /// App config — Some when running from a real chat command, None in test runner.
    pub config:           Option<Arc<RwLock<AppConfig>>>,
    pub command_name:     String,
    pub command_trigger:  String,
    pub command_counter:  i64,
    pub sub_mode:         bool,
    pub viewer_limit:     u32,
    pub sub_limit:        u32,
    pub queue_size:       i64,
    pub platform:         String,
    /// Whether the shell proxy is injected into scope for this execution.
    /// Controlled by the "Script settings → Enable shell access" toggle.
    pub shell_enabled:    bool,
    /// When set, a ModuleStoreProxy for this module is injected as `ms`.
    pub module_id:        Option<String>,
    /// Relative path of the script file within the module directory (for error reporting).
    pub script_file:      Option<String>,
    /// Live Twitch bot handle, when connected — backs the `twitch` proxy and
    /// chat.announce() on Twitch. None in test/dev-tooling contexts.
    pub twitch:            Option<Arc<TwitchBot>>,
    /// Live YouTube bot handle, when connected — backs the `youtube` proxy.
    pub youtube:           Option<Arc<YouTubeBot>>,
    /// Event names already seen earlier in this dispatch chain (this script
    /// was invoked because one of these fired via `event.emit`). Empty for
    /// chat/redemption-triggered and test/dev-tooling runs — only non-empty
    /// when `handler::execute_command` is called from an event-listener
    /// dispatch. Lets `EventProxy::emit` refuse to re-dispatch a name that's
    /// already in the chain, catching A→B→A cycles precisely instead of a
    /// blunt global in-flight cap.
    pub event_chain:       Vec<String>,
    /// Set when this run was triggered by a Twitch channel-point redemption
    /// (either a command's own listener, or a module's redemption_handler) —
    /// lets the script call `twitch.cancel_redemption(redemption_id, reward_id)`
    /// to auto-refund the viewer's points when its own logic decides the
    /// redemption should fail (e.g. "not enough levels to shuffle"). Both are
    /// `None` for ordinary chat-triggered or test-runner executions.
    pub redemption_id:    Option<String>,
    pub reward_id:        Option<String>,
}

/// Read shell_enabled from kv_store.  Used when building ScriptCtx.
pub async fn read_shell_enabled(pool: &sqlx::SqlitePool) -> bool {
    sqlx::query_scalar::<_, String>(
        "SELECT value FROM kv_store WHERE key = 'sys:shell_enabled'"
    )
    .fetch_optional(pool)
    .await
    .unwrap_or(None)
    .map(|v| v == "true")
    .unwrap_or(false)
}
