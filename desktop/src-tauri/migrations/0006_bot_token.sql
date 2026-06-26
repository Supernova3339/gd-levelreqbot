-- Separate OAuth token for the bot account (when using a different account than the channel).
-- When empty, the channel's twitch_access_token is used for IRC instead.
ALTER TABLE config
    ADD COLUMN bot_access_token TEXT NOT NULL DEFAULT '';
