CREATE TABLE IF NOT EXISTS user_data
(
    id
    INTEGER
    PRIMARY
    KEY
    AUTOINCREMENT,
    collection
    TEXT
    NOT
    NULL,
    doc_id
    TEXT
    NOT
    NULL
    UNIQUE,
    data
    TEXT
    NOT
    NULL,
    created_at
    INTEGER
    NOT
    NULL
    DEFAULT (
    unixepoch
(
)),
    updated_at INTEGER NOT NULL DEFAULT
(
    unixepoch
(
))
    );
CREATE INDEX IF NOT EXISTS idx_user_data_col ON user_data(collection);
