// command proxy — friendly access to how the current run was invoked.
//
// Built for the "one command, different alias, different behavior" pattern
// (e.g. !bang vs !superbang running the same script but doing more on the
// bigger alias) — the underlying data already existed as the bare
// `command_trigger` scope variable, but it wasn't documented/discoverable
// and every branch needed a raw string comparison. `command_trigger` still
// works (kept for compatibility), this just gives it a friendlier surface:
//
// command.trigger()  — exact text used to invoke this run, e.g. "!superbang"
// command.name()     — the command's canonical/primary trigger, e.g. "!bang"
// command.is(text)   — true if trigger() == text
// command.is_alias() — true when invoked via an alias, not the primary trigger
// command.counter()  — total times this command has fired (i64)

use rhai::Engine;

#[derive(Clone)]
pub struct CommandProxy {
    pub name:    String,
    pub trigger: String,
    pub counter: i64,
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<CommandProxy>("Command");

    engine.register_fn("trigger", |c: &mut CommandProxy| -> String { c.trigger.clone() });
    engine.register_fn("name", |c: &mut CommandProxy| -> String { c.name.clone() });
    engine.register_fn("is", |c: &mut CommandProxy, text: &str| -> bool { c.trigger == text });
    engine.register_fn("is_alias", |c: &mut CommandProxy| -> bool { c.trigger != c.name });
    engine.register_fn("counter", |c: &mut CommandProxy| -> i64 { c.counter });
}
