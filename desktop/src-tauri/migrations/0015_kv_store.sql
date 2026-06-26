CREATE TABLE IF NOT EXISTS kv_store
(
    key
    TEXT
    PRIMARY
    KEY,
    value
    TEXT
    NOT
    NULL,
    updated_at
    INTEGER
    NOT
    NULL
    DEFAULT (
    unixepoch
(
))
    );
