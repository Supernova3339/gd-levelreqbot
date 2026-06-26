-- Which editor produced this command's script. Locked at creation time.
ALTER TABLE bot_commands
    ADD COLUMN script_mode TEXT NOT NULL DEFAULT 'text';
