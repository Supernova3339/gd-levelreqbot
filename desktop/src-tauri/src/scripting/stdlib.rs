// stdlib.rs — embeds and pre-compiles standard library Rhai files.
//
// All stdlib ASTs are compiled ONCE at first use via OnceLock.
// Every subsequent script execution re-uses the cached ASTs — zero re-parse overhead.
//
// Load order matters: later modules can call functions defined by earlier ones.
//   arr → fmt → queue → counter → str → io

use rhai::{Engine, AST};
use std::sync::OnceLock;
use tracing::warn;

const ARR:     &str = include_str!("../../stdlib/arr.rhai");
const FMT:     &str = include_str!("../../stdlib/fmt.rhai");
const QUEUE:   &str = include_str!("../../stdlib/queue.rhai");
const COUNTER: &str = include_str!("../../stdlib/counter.rhai");
const STR:     &str = include_str!("../../stdlib/str.rhai");
const IO:      &str = include_str!("../../stdlib/io.rhai");

static STDLIB_ASTS: OnceLock<Vec<(&'static str, AST)>> = OnceLock::new();

fn compiled_stdlib(engine: &Engine) -> &'static Vec<(&'static str, AST)> {
    STDLIB_ASTS.get_or_init(|| {
        [
            ("arr",     ARR),
            ("fmt",     FMT),
            ("queue",   QUEUE),
            ("counter", COUNTER),
            ("str",     STR),
            ("io",      IO),
        ]
        .into_iter()
        .filter_map(|(name, src)| {
            engine.compile(src)
                .map(|ast| (name, ast))
                .map_err(|e| warn!("stdlib/{name}.rhai compile error: {e}"))
                .ok()
        })
        .collect()
    })
}

/// Evaluate all stdlib ASTs into `scope` so their functions are available.
/// ASTs are compiled once and reused — safe because Engine is NOT shared.
pub fn load_stdlib(engine: &Engine, scope: &mut rhai::Scope<'_>) {
    for (name, ast) in compiled_stdlib(engine) {
        if let Err(e) = engine.run_ast_with_scope(scope, ast) {
            warn!("stdlib/{name}.rhai eval error: {e}");
        }
    }
}

/// Returns raw source strings for seeding the `libraries` DB table.
pub fn stdlib_sources() -> Vec<(&'static str, &'static str)> {
    vec![
        ("arr",     ARR),
        ("fmt",     FMT),
        ("queue",   QUEUE),
        ("counter", COUNTER),
        ("str",     STR),
        ("io",      IO),
    ]
}
