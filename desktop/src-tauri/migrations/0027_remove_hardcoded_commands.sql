-- Remove all hardcoded builtin commands seeded by migrations 0003, 0022, and 0023.
-- In the new architecture, modules are installed from the marketplace and register
-- their own commands at install time. Nothing is hardcoded in migrations.
DELETE
FROM bot_commands
WHERE builtin_key IS NOT NULL;

-- Remove placeholder module rows that were seeded before the marketplace system.
-- Properly installed modules have a full JSON manifest; the old stubs have NULL or
-- an empty/trivial manifest and should be cleared so users install cleanly.
DELETE
FROM modules
WHERE manifest IS NULL
   OR manifest = ''
   OR manifest = '{}';
