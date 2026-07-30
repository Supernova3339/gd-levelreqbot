-- Module registry: stores which modules are installed and enabled.
-- Built-in modules have NULL manifest (their definition lives in the binary).
-- Custom/user-installed modules store their full manifest JSON.
CREATE TABLE IF NOT EXISTS modules
(
    id
    TEXT
    PRIMARY
    KEY,
    enabled
    INTEGER
    NOT
    NULL
    DEFAULT
    1,
    installed_at
    TEXT
    NOT
    NULL
    DEFAULT (
    datetime
(
    'now'
)),
    manifest TEXT
    );

-- Seed built-in module enabled states
INSERT
OR IGNORE INTO modules (id, enabled) VALUES
    ('level-queue', 1),
    ('song-queue',  0),
    ('points',      0),
    ('polls',       0);

-- Bot commands for Song Queue module (disabled by default)
INSERT
OR IGNORE INTO bot_commands (trigger, description, builtin_key, required_badges, enabled) VALUES
    ('!sr',          'Request a song or video',                   'song_request',  '[]',                          0),
    ('!nowplaying',  'Show the currently playing song',           'now_playing',   '[]',                          0),
    ('!playlist',    'Show the song request queue',               'song_list',     '[]',                          0),
    ('!skipsong',    'Skip to the next song (mod only)',          'skip_song',     '["moderator","broadcaster"]', 0);

-- Bot commands for Points module (disabled by default)
INSERT
OR IGNORE INTO bot_commands (trigger, description, builtin_key, required_badges, enabled) VALUES
    ('!points',      'Check your points balance',                 'points_check',  '[]',                          0),
    ('!give',        'Give points to another viewer',             'points_give',   '[]',                          0),
    ('!top',         'Show the points leaderboard',               'points_top',    '[]',                          0),
    ('!addpoints',   'Add points to a user (mod only)',           'points_add',    '["moderator","broadcaster"]', 0);

-- Bot commands for Polls module (disabled by default)
INSERT
OR IGNORE INTO bot_commands (trigger, description, builtin_key, required_badges, enabled) VALUES
    ('!poll',        'Create a poll: !poll Question | A | B | C', 'poll_create',  '["moderator","broadcaster"]', 0),
    ('!vote',        'Vote in the active poll: !vote A',           'poll_vote',    '[]',                          0),
    ('!endpoll',     'End the active poll and show results',       'poll_end',     '["moderator","broadcaster"]', 0),
    ('!pollresults', 'Show current poll results',                  'poll_results', '[]',                          0);
