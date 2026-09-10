// Creates the Rhai engine with all proxy types registered.
// The engine contains NO per-call state — all dynamic data goes into the Scope
// (see execute.rs).  This makes the engine safe to share across calls.
//
// perf: the Engine is built ONCE and cached in a OnceLock.  Type registration
// is the expensive part (allocates internal method tables); reusing the same
// Engine instance eliminates that cost on every script execution.
//
// ShellProxy and IoProxy are always TYPE-REGISTERED here so the parser accepts
// them.  ShellProxy is only injected into the *Scope* (execute.rs) when
// shell_enabled is true — without the scope variable a script that references
// `shell` gets a runtime "variable not found" error, which is intentional.

use rhai::{Engine, EvalAltResult, Module, ModuleResolver, Position};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock, RwLock};
use super::proxy;

// ── Library registry — populated as module libraries are installed ────────────
// Scripts resolve `import "queue-core" as q;` through RegistryResolver which
// looks up the compiled Module from this map. Libraries must be registered
// (via register_library) before any script that imports them is evaluated.

static LIB_REGISTRY: OnceLock<Arc<RwLock<HashMap<String, Arc<Module>>>>> = OnceLock::new();

pub fn lib_registry() -> &'static Arc<RwLock<HashMap<String, Arc<Module>>>> {
    LIB_REGISTRY.get_or_init(|| Arc::new(RwLock::new(HashMap::new())))
}

pub fn register_library(name: &str, module: Module) {
    lib_registry().write().unwrap().insert(name.to_string(), Arc::new(module));
}

struct RegistryResolver;

impl ModuleResolver for RegistryResolver {
    fn resolve(
        &self,
        _engine: &Engine,
        _source_path: Option<&str>,
        path: &str,
        pos: Position,
    ) -> Result<Arc<Module>, Box<EvalAltResult>> {
        lib_registry()
            .read()
            .unwrap()
            .get(path)
            .cloned()
            .ok_or_else(|| {
                Box::new(EvalAltResult::ErrorModuleNotFound(path.to_string(), pos))
            })
    }
}

// ── Engine singleton ──────────────────────────────────────────────────────────

static ENGINE: OnceLock<Engine> = OnceLock::new();

pub fn get_engine() -> &'static Engine {
    ENGINE.get_or_init(build_engine)
}

fn build_engine() -> Engine {
    let mut engine = Engine::new();

    // Safety limits — prevent runaway scripts from consuming resources
    engine.set_max_operations(100_000);
    engine.set_max_string_size(32_000);
    engine.set_max_array_size(10_000);
    engine.set_max_map_size(10_000);
    // Rhai's own default expression-depth limit is 32/16 (expr/function-expr)
    // in debug builds vs 64/32 in release — profile-dependent by default,
    // meaning a script with moderately nested control flow could compile in
    // one build and fail with "Expression exceeds maximum complexity" in the
    // other. Pinning this explicitly, like the limits above, makes script
    // acceptance consistent regardless of how the app itself was built.
    engine.set_max_expr_depths(128, 64);

    // Module resolver — allows `import "queue-core" as q;` in scripts.
    // The registry is populated lazily as modules install their bundled libraries.
    engine.set_module_resolver(RegistryResolver);

    // Array helpers not in Rhai's default packages
    engine.register_fn("join", |arr: rhai::Array, sep: &str| -> String {
        arr.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(sep)
    });
    // `replace` isn't natively registered — it comes from stdlib's str.rhai
    // (installed with source_module = NULL, so it's globally available and
    // method-call-resolvable — see modules/mod.rs's install_bundled_libraries
    // and stdlib.rs's load_stdlib_from_db) rather than being hardcoded here.

    // Register all proxy types (no captured state — pure type registration)
    proxy::chat::register(&mut engine);
    proxy::command::register(&mut engine);
    proxy::console::register(&mut engine);
    proxy::queue::register(&mut engine);
    proxy::user::register(&mut engine);
    proxy::store::register(&mut engine);
    proxy::db::register(&mut engine);
    proxy::gd::register(&mut engine);
    proxy::rand::register(&mut engine);
    proxy::time::register(&mut engine);
    proxy::event::register(&mut engine);
    proxy::data::register(&mut engine);
    proxy::web::register(&mut engine);
    proxy::cache::register(&mut engine);
    proxy::io::register(&mut engine);
    proxy::shell::register(&mut engine);
    proxy::module_store::register(&mut engine);
    proxy::twitch::register(&mut engine);
    proxy::youtube::register(&mut engine);

    engine
}

// Keep the old name as an alias so callers that still use create_engine() compile.
#[allow(dead_code)]
pub fn create_engine() -> &'static Engine {
    get_engine()
}
