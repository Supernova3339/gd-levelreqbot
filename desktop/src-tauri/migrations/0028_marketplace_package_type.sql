ALTER TABLE marketplace_cache
    ADD COLUMN package_type TEXT NOT NULL DEFAULT 'module';
