CREATE TABLE IF NOT EXISTS bot_commands
(
    id
    INTEGER
    PRIMARY
    KEY
    AUTOINCREMENT,
    trigger
    TEXT
    NOT
    NULL
    UNIQUE,
    aliases
    TEXT
    NOT
    NULL
    DEFAULT
    '[]', -- JSON array of strings
    enabled
    INTEGER
    NOT
    NULL
    DEFAULT
    1,
    description
    TEXT
    NOT
    NULL
    DEFAULT
    '',
    builtin_key
    TEXT, -- maps to a built-in handler; NULL for response-only
    response
    TEXT, -- reply text for response-only commands
    required_badges
    TEXT
    NOT
    NULL
    DEFAULT
    '[]', -- JSON: ["moderator","broadcaster"]
    cooldown_seconds
    INTEGER
    NOT
    NULL
    DEFAULT
    0
);

-- Seed built-in commands (skip if already present)
INSERT
OR IGNORE INTO bot_commands (trigger, description, builtin_key, required_badges) VALUES
    ('!r',       'Add a level to the queue',           'request',  '[]'),
    ('!next',    'Pop the next level from queue',       'next',     '["moderator","broadcaster"]'),
    ('!list',    'Show the current queue',              'list',     '[]'),
    ('!pos',     'Get a level''s position in queue',   'position', '[]'),
    ('!remove',  'Remove a level from queue',           'remove',   '[]'),
    ('!clear',   'Clear the entire queue',              'clear',    '["moderator","broadcaster"]'),
    ('!info',    'Get info about a queued level',       'info',     '[]');
