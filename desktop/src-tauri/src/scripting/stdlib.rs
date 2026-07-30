// stdlib.rs — loads standard library Rhai files from the libraries DB table.
//
// Sources live in the marketplace (not embedded in the binary).
// During setup the stdlib package is installed from the marketplace, which
// writes each component (arr, fmt, str, io, math) into the `libraries` table.
//
// Scripts call load_stdlib() which compiles each enabled library's source once
// (per-source-hash, via compile_or_cached in execute.rs) and evaluates them
// into scope.  Load order is preserved by the DB ORDER BY clause:
//   is_stdlib DESC (stdlib first), then name ASC.

use rhai::Scope;
use sqlx::SqlitePool;
use tokio::runtime::Handle;
use tracing::warn;
use super::engine::get_engine;

/// Evaluate all enabled library sources from the DB into `scope`.
/// Must be called from within a `tokio::task::block_in_place` context.
pub fn load_stdlib_from_db(scope: &mut Scope<'_>, pool: &SqlitePool) {
    let sources: Vec<(String, String)> = Handle::current().block_on(async {
        // Module-bundled libraries (source_module IS NOT NULL) are available via
        // `import "name" as x;` through the engine's RegistryResolver — skip them here.
        sqlx::query_as::<_, (String, String)>(
            "SELECT name, code FROM libraries WHERE enabled = 1 AND source_module IS NULL ORDER BY is_stdlib DESC, name ASC"
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default()
    });

    let engine = get_engine();
    for (name, src) in &sources {
        match engine.compile(src) {
            Ok(ast) => {
                if let Err(e) = engine.run_ast_with_scope(scope, &ast) {
                    warn!("library/{name} eval error: {e}");
                }
            }
            Err(e) => warn!("library/{name} compile error: {e}"),
        }
    }
}
