-- The "Integrations" feature was never actually wired into command execution
-- (resolve_all() was dead code, no Rhai proxy called it — see cache proxy,
-- which replaces it for real). Nothing here was ever consumed at runtime.
DROP TABLE IF EXISTS integrations;
