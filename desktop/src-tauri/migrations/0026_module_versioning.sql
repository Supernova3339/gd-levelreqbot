-- Add version compatibility and download URL tracking for the marketplace-based module system.
-- Modules are now distributed as .gdmod packages hosted externally; scripts live on disk.
ALTER TABLE modules
    ADD COLUMN min_app_version TEXT NOT NULL DEFAULT '0.0.1';
ALTER TABLE modules
    ADD COLUMN download_url TEXT NOT NULL DEFAULT '';

ALTER TABLE marketplace_cache
    ADD COLUMN min_app_version TEXT NOT NULL DEFAULT '0.0.1';
ALTER TABLE marketplace_cache
    ADD COLUMN download_url TEXT NOT NULL DEFAULT '';
ALTER TABLE marketplace_cache
    ADD COLUMN checksum TEXT NOT NULL DEFAULT '';
