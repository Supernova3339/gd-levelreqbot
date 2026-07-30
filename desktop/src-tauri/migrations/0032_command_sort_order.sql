ALTER TABLE bot_commands
    ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE bot_commands
SET sort_order = rowid * 10;
