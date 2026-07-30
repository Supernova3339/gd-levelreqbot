-- Generalizes 0033's Twitch-only redemption listener into a listener_type +
-- listener_config pair, so a command can also be bound to an internal
-- event name (event.emit), not just a Twitch reward title. The old columns
-- are left in place (unused going forward) rather than dropped — cheap to
-- keep, and avoids relying on SQLite's DROP COLUMN support across versions.
ALTER TABLE bot_commands
    ADD COLUMN listener_type TEXT NOT NULL DEFAULT '';
ALTER TABLE bot_commands
    ADD COLUMN listener_config TEXT NOT NULL DEFAULT '';

UPDATE bot_commands
SET listener_type   = 'twitch_redemption',
    listener_config = redemption_reward_title
WHERE redemption_enabled != 0;
