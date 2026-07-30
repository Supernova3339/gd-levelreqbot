ALTER TABLE modules
    ADD COLUMN author TEXT NOT NULL DEFAULT '';
ALTER TABLE modules
    ADD COLUMN package_type TEXT NOT NULL DEFAULT 'module';
