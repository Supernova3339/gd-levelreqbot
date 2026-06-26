-- Auto-copy the level ID to clipboard when Next Level is triggered
ALTER TABLE config
    ADD COLUMN auto_copy_level_id INTEGER NOT NULL DEFAULT 0;

-- Global keybinds — action -> shortcut (empty string means unbound)
CREATE TABLE IF NOT EXISTS keybinds
(
    action
    TEXT
    PRIMARY
    KEY,
    shortcut
    TEXT
    NOT
    NULL
    DEFAULT
    ''
);

INSERT
OR IGNORE INTO keybinds (action, shortcut) VALUES
    ('next_level',   ''),
    ('open_settings', '');
