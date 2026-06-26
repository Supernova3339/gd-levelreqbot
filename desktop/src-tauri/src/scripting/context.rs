use crate::bot::ChatMessage;
use crate::queue::QueueState;
use std::sync::{Arc, Mutex};

/// Shared output buffer: each chat_say / chat_reply call appends here.
pub type ScriptOutput = Arc<Mutex<Vec<String>>>;

/// Everything a script execution needs to know about its invocation context.
pub struct ScriptCtx<'a> {
    pub msg:              &'a ChatMessage,
    pub args:             Vec<String>,
    pub queue:            Arc<QueueState>,
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
