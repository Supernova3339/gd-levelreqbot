-- Track which platform a level request came from
ALTER TABLE queue
    ADD COLUMN platform TEXT NOT NULL DEFAULT 'twitch';
