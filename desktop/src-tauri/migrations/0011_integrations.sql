CREATE TABLE IF NOT EXISTS integrations
(
    id
    INTEGER
    PRIMARY
    KEY
    AUTOINCREMENT,
    name
    TEXT
    NOT
    NULL
    UNIQUE, -- variable name, used as {name} in responses
    kind
    TEXT
    NOT
    NULL,   -- 'static' | 'http' | 'shell' | 'websocket'
    config
    TEXT
    NOT
    NULL
    DEFAULT
    '{}',   -- JSON config per kind
    description
    TEXT
    NOT
    NULL
    DEFAULT
    '',
    enabled
    INTEGER
    NOT
    NULL
    DEFAULT
    1,
    cached_value
    TEXT,   -- last fetched value
    last_fetched
    TEXT    -- ISO timestamp
);
