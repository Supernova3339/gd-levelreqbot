-- Queue open/close and max size settings
ALTER TABLE config
    ADD COLUMN queue_open INTEGER NOT NULL DEFAULT 1;
ALTER TABLE config
    ADD COLUMN queue_max_size INTEGER NOT NULL DEFAULT 0;

-- History of nexted levels (append-only, never cleared by queue operations)
CREATE TABLE IF NOT EXISTS queue_history
(
    id
    INTEGER
    PRIMARY
    KEY
    AUTOINCREMENT,
    level_id
    INTEGER
    NOT
    NULL,
    username
    TEXT
    NOT
    NULL,
    queue_type
    TEXT
    NOT
    NULL,
    platform
    TEXT
    NOT
    NULL
    DEFAULT
    'twitch',
    nexted_at
    TEXT
    NOT
    NULL
    DEFAULT (
    datetime
(
    'now'
))
    );

CREATE INDEX IF NOT EXISTS idx_history_nexted_at ON queue_history(nexted_at DESC);

-- New built-in commands (seeded once; OR IGNORE skips if already present)
INSERT
OR IGNORE INTO bot_commands (trigger, description, builtin_key, required_badges) VALUES
    ('!open',      'Open the queue for new requests',           'open_queue',  '["moderator","broadcaster"]'),
    ('!close',     'Close the queue to new requests',           'close_queue', '["moderator","broadcaster"]'),
    ('!mylevels',  'Show your levels currently in the queue',   'my_levels',   '[]'),
    ('!promote',   'Move a level to the front of the queue',    'promote',     '["moderator","broadcaster"]'),
    ('!shuffle',   'Randomize the order of the viewer queue',   'shuffle',     '["moderator","broadcaster"]');
