CREATE TABLE IF NOT EXISTS queue
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
    is_subscriber
    INTEGER
    NOT
    NULL
    DEFAULT
    0,
    position
    INTEGER
    NOT
    NULL,
    queue_type
    TEXT
    NOT
    NULL
    CHECK (
    queue_type
    IN
(
    'viewer',
    'subscriber'
)),
    added_at TEXT NOT NULL DEFAULT
(
    datetime
(
    'now'
))
    );

CREATE INDEX IF NOT EXISTS idx_queue_level_id ON queue(level_id);
CREATE INDEX IF NOT EXISTS idx_queue_username ON queue(username);
CREATE INDEX IF NOT EXISTS idx_queue_type ON queue(queue_type);
