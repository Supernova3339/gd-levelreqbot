-- Platform filter: 'all', 'twitch', 'youtube'
ALTER TABLE bot_commands
    ADD COLUMN platform TEXT NOT NULL DEFAULT 'all';

-- Separate per-user cooldown from the global cooldown
ALTER TABLE bot_commands
    ADD COLUMN user_cooldown_seconds INTEGER NOT NULL DEFAULT 0;

-- Counter mode: when enabled, response can use {count} and the value persists across
-- bot restarts (stored here, incremented on each use)
ALTER TABLE bot_commands
    ADD COLUMN counter INTEGER NOT NULL DEFAULT 0;
