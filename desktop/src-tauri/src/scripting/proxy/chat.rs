// chat proxy — exposes chat output as a Rhai object.
//
// chat.say(msg)        — send a message to chat
// chat.reply(msg)      — send a message prefixed with @username
// chat.announce(msg)   — same as say (platform.twitch.announce() is future work)
// chat.say_each(items) — call say() for each item in an array

use crate::scripting::context::ScriptOutput;
use rhai::{Dynamic, Engine};

#[derive(Clone)]
pub struct ChatProxy {
    pub output:   ScriptOutput,
    pub username: String,
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<ChatProxy>("Chat");

    engine.register_fn("say", |c: &mut ChatProxy, msg: &str| {
        c.output.lock().unwrap().push(msg.to_string());
    });

    engine.register_fn("reply", |c: &mut ChatProxy, msg: &str| {
        c.output.lock().unwrap().push(format!("@{} {}", c.username, msg));
    });

    engine.register_fn("announce", |c: &mut ChatProxy, msg: &str| {
        c.output.lock().unwrap().push(msg.to_string());
    });

    // say_each — iterate an array and push each element as a separate chat message
    engine.register_fn("say_each", |c: &mut ChatProxy, items: Vec<Dynamic>| {
        let mut buf = c.output.lock().unwrap();
        for item in items {
            let s = item.to_string();
            if !s.is_empty() { buf.push(s); }
        }
    });

    // count — number of messages queued so far this invocation
    engine.register_fn("count", |c: &mut ChatProxy| -> i64 {
        c.output.lock().unwrap().len() as i64
    });
}
