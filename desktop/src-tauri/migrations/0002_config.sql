CREATE TABLE IF NOT EXISTS config
(
    id
    INTEGER
    PRIMARY
    KEY
    CHECK
(
    id =
    1
),
    -- Twitch IRC (chat connection)
    bot_username TEXT NOT NULL DEFAULT '',
    bot_token TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT '',
    -- Local API auth
    web_api_token TEXT NOT NULL DEFAULT '',
    -- Tokens returned by the hosted auth service (gdlqbot.superdev.one)
    twitch_access_token TEXT NOT NULL DEFAULT '',
    youtube_access_token TEXT NOT NULL DEFAULT '',
    youtube_api_key TEXT NOT NULL DEFAULT '',
    -- Modes
    mode_gd INTEGER NOT NULL DEFAULT 1,
    mode_sub INTEGER NOT NULL DEFAULT 0,
    mode_smart INTEGER NOT NULL DEFAULT 0,
    mode_youtube INTEGER NOT NULL DEFAULT 0,
    -- Request limits
    viewer_request_limit INTEGER NOT NULL DEFAULT 1,
    subscriber_request_limit INTEGER NOT NULL DEFAULT 5
    );

INSERT
OR IGNORE INTO config (id) VALUES (1);
