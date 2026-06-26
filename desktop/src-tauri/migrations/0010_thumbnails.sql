ALTER TABLE config
    ADD COLUMN level_thumbnails INTEGER NOT NULL DEFAULT 1;
ALTER TABLE config
    ADD COLUMN thumbnail_quality TEXT NOT NULL DEFAULT '';
