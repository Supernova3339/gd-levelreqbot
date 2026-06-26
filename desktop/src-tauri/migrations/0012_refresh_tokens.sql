ALTER TABLE config
    ADD COLUMN twitch_refresh_token TEXT NOT NULL DEFAULT '';
ALTER TABLE config
    ADD COLUMN bot_refresh_token TEXT NOT NULL DEFAULT '';
