-- Block-based script for custom commands (JSON array of blocks).
-- When set, takes precedence over the legacy `response` text field.
ALTER TABLE bot_commands
    ADD COLUMN script TEXT;
