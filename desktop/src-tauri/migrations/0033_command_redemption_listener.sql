-- Lets a command optionally fire on a Twitch channel-point redemption, in
-- addition to (not instead of) its chat trigger — the chat trigger keeps
-- working unchanged either way.
ALTER TABLE bot_commands
    ADD COLUMN redemption_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_commands
    ADD COLUMN redemption_reward_title TEXT NOT NULL DEFAULT '';
