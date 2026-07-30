-- Generalizes 0034's single listener_type/listener_config pair into:
--   chat_enabled — lets a command exist purely as a listener, with chat
--                  matching turned off entirely (not just "no trigger set").
--   listeners    — JSON array of {"type": "...", "config": "..."}, so a
--                  command can bind to more than one listener at once
--                  (e.g. two different event names, or an event AND a
--                  redemption). Old columns are left in place unused —
--                  the actual data carryover happens in Rust at startup
--                  (see lib.rs) since it needs JSON construction that's
--                  simpler to get right there than in raw SQL.
ALTER TABLE bot_commands
    ADD COLUMN chat_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bot_commands
    ADD COLUMN listeners TEXT NOT NULL DEFAULT '[]';
