// Creates the Rhai engine with all proxy types registered.
// The engine contains NO per-call state — all dynamic data goes into the Scope
// (see execute.rs).  This makes the engine fast to create per call since type
// registrations are the only allocation.
//
// ShellProxy and IoProxy are always TYPE-REGISTERED here so the parser accepts
// them.  ShellProxy is only injected into the *Scope* (execute.rs) when
// shell_enabled is true — without the scope variable a script that references
// `shell` gets a runtime "variable not found" error, which is intentional.

use rhai::Engine;
use super::proxy;

pub fn create_engine() -> Engine {
    let mut engine = Engine::new();

    // Safety limits — prevent runaway scripts from consuming resources
    engine.set_max_operations(100_000);
    engine.set_max_string_size(32_000);
    engine.set_max_array_size(10_000);
    engine.set_max_map_size(10_000);

    // Register all proxy types (no captured state — pure type registration)
    proxy::chat::register(&mut engine);
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
    proxy::io::register(&mut engine);
    proxy::shell::register(&mut engine);

    engine
}
