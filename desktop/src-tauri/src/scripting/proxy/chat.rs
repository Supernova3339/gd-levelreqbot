// chat proxy — exposes chat output as a Rhai object.
//
// chat.say(msg)             — send a message to chat
// chat.reply(msg)           — send a message prefixed with @username
// chat.announce(msg)        — highlighted chat announcement on Twitch (Helix);
// chat.announce(msg, color) — falls back to a plain say() on YouTube, or on
//                              Twitch when Helix isn't available (see twitch.announce())
// chat.say_each(items)      — call say() for each item in an array

use super::queue::block_on;
use crate::bot::twitch::TwitchBot;
use crate::scripting::context::ScriptOutput;
use rhai::{Dynamic, Engine};
use std::sync::Arc;
use tracing::warn;

#[derive(Clone)]
pub struct ChatProxy {
    pub output:   ScriptOutput,
    pub username: String,
    pub platform: String,
    pub twitch:   Option<Arc<TwitchBot>>,
}

fn announce(c: &mut ChatProxy, msg: &str, color: Option<&str>) {
    if c.platform == "twitch" {
        if let Some(bot) = c.twitch.clone() {
            let msg_owned = msg.to_string();
            let color_owned = color.map(str::to_string);
            let result = block_on(async move {
                bot.send_announcement(&msg_owned, color_owned.as_deref()).await
            });
            match result {
                Ok(()) => return,
                Err(e) => warn!("chat.announce: Helix call failed, falling back to say(): {e}"),
            }
        }
    }
    c.output.lock().unwrap().push(msg.to_string());
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
        announce(c, msg, None);
    });
    engine.register_fn("announce", |c: &mut ChatProxy, msg: &str, color: &str| {
        announce(c, msg, Some(color));
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
