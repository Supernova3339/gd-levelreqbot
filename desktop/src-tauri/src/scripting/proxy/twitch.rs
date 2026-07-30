// twitch proxy — general-purpose Twitch Helix API access for scripts.
//
// Available in every script (module or custom), same as `gd` — not gated
// behind module_id. Falls back to inert results (unit / false) when the bot
// isn't connected to Twitch or the token predates the Helix scope set;
// scripts should not assume these calls always succeed.

use super::queue::block_on;
use crate::bot::twitch::TwitchBot;
use crate::bot::twitch_api::{CustomReward, TwitchUser};
use rhai::{Array, Dynamic, Engine, Map};
use std::sync::Arc;
use tracing::warn;

#[derive(Clone)]
pub struct TwitchProxy {
    pub bot: Option<Arc<TwitchBot>>,
}

fn user_to_dynamic(u: TwitchUser) -> Dynamic {
    let mut m = Map::new();
    m.insert("id".into(), Dynamic::from(u.id));
    m.insert("login".into(), Dynamic::from(u.login));
    m.insert("display_name".into(), Dynamic::from(u.display_name));
    Dynamic::from_map(m)
}

fn reward_to_dynamic(r: CustomReward) -> Dynamic {
    let mut m = Map::new();
    m.insert("id".into(), Dynamic::from(r.id));
    m.insert("title".into(), Dynamic::from(r.title));
    m.insert("cost".into(), Dynamic::from(r.cost));
    m.insert("prompt".into(), Dynamic::from(r.prompt));
    m.insert("is_enabled".into(), Dynamic::from(r.is_enabled));
    let icon_url = r.image.or(r.default_image).map(|i| i.url_2x).unwrap_or_default();
    m.insert("icon_url".into(), Dynamic::from(icon_url));
    Dynamic::from_map(m)
}

fn announce_impl(p: &mut TwitchProxy, msg: &str, color: Option<&str>) -> bool {
    let Some(bot) = p.bot.clone() else { return false; };
    let msg = msg.to_string();
    let color = color.map(str::to_string);
    match block_on(async move { bot.send_announcement(&msg, color.as_deref()).await }) {
        Ok(()) => true,
        Err(e) => { warn!("twitch.announce: {e}"); false }
    }
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<TwitchProxy>("Twitch");

    // is_connected — true once IRC + Helix are both up (see is_irc_connected for IRC-only)
    engine.register_fn("is_connected", |p: &mut TwitchProxy| -> bool {
        let Some(bot) = p.bot.clone() else { return false; };
        block_on(async move { bot.helix_ready().await })
    });

    engine.register_fn("get_user", |p: &mut TwitchProxy, login: &str| -> Dynamic {
        let Some(bot) = p.bot.clone() else { return Dynamic::UNIT; };
        let login = login.to_string();
        match block_on(async move { bot.get_user(&login).await }) {
            Ok(Some(u)) => user_to_dynamic(u),
            Ok(None) => Dynamic::UNIT,
            Err(e) => { warn!("twitch.get_user: {e}"); Dynamic::UNIT }
        }
    });

    // announce(msg) / announce(msg, color) — color: primary|blue|green|orange|purple.
    // Posts a highlighted Helix chat announcement; returns false (never errors the
    // script) if Helix isn't available, so callers can fall back to chat.say().
    engine.register_fn("announce", |p: &mut TwitchProxy, msg: &str| -> bool {
        announce_impl(p, msg, None)
    });
    engine.register_fn("announce", |p: &mut TwitchProxy, msg: &str, color: &str| -> bool {
        announce_impl(p, msg, Some(color))
    });

    // list_rewards() — this app's manageable channel-point rewards (title, cost, id, ...).
    // Empty array (never errors the script) if Helix isn't available.
    engine.register_fn("list_rewards", |p: &mut TwitchProxy| -> Array {
        let Some(bot) = p.bot.clone() else { return Array::new(); };
        match block_on(async move { bot.list_rewards().await }) {
            Ok(rewards) => rewards.into_iter().map(reward_to_dynamic).collect(),
            Err(e) => { warn!("twitch.list_rewards: {e}"); Array::new() }
        }
    });

    // create_reward(title, cost) / create_reward(title, cost, prompt) — makes a new
    // channel-point reward. Requires channel:manage:redemptions. Returns the created
    // reward map, or () on failure.
    engine.register_fn("create_reward", |p: &mut TwitchProxy, title: &str, cost: i64| -> Dynamic {
        create_reward_impl(p, title, cost, "")
    });
    engine.register_fn("create_reward", |p: &mut TwitchProxy, title: &str, cost: i64, prompt: &str| -> Dynamic {
        create_reward_impl(p, title, cost, prompt)
    });

    // complete_redemption(redemption_id, reward_id) / cancel_redemption(redemption_id, reward_id)
    // — mark a redemption fulfilled or canceled (canceling refunds the viewer's points).
    // A module's redemption_handler script gets these as its 4th/5th positional
    // args; a command bound to a redemption listener (or any custom/module
    // script run through it) can instead read the `redemption_id`/`reward_id`
    // globals — empty strings when the run wasn't redemption-triggered. Typical
    // use: `if <failure condition> { twitch.cancel_redemption(redemption_id, reward_id); }`
    // to auto-refund the viewer when the command's own logic rejects the request.
    engine.register_fn("complete_redemption", |p: &mut TwitchProxy, redemption_id: &str, reward_id: &str| -> bool {
        set_redemption_status_impl(p, redemption_id, reward_id, true)
    });
    engine.register_fn("cancel_redemption", |p: &mut TwitchProxy, redemption_id: &str, reward_id: &str| -> bool {
        set_redemption_status_impl(p, redemption_id, reward_id, false)
    });

    // is_subscriber(login) — a live Helix check (channel:read:subscriptions),
    // not the chat-message-time badge `user.isSub()` uses. `user.isSub()` is
    // already fresh and correct for real chat messages (Twitch sends badge
    // tags on every PRIVMSG) — this exists for scripts invoked *without* a
    // real chat message behind them (a UI action, an event listener), where
    // `user.isSub()` has nothing to read and always reports false. Returns
    // false (never errors the script) if Helix isn't available or the login
    // doesn't resolve to a user.
    engine.register_fn("is_subscriber", |p: &mut TwitchProxy, login: &str| -> bool {
        let Some(bot) = p.bot.clone() else { return false; };
        let login = login.to_string();
        block_on(async move {
            let Ok(Some(user)) = bot.get_user(&login).await else { return false; };
            bot.is_subscriber(&user.id).await.unwrap_or(false)
        })
    });
}

fn create_reward_impl(p: &mut TwitchProxy, title: &str, cost: i64, prompt: &str) -> Dynamic {
    let Some(bot) = p.bot.clone() else { return Dynamic::UNIT; };
    let title = title.to_string();
    let prompt = prompt.to_string();
    match block_on(async move { bot.create_reward(&title, cost, &prompt).await }) {
        Ok(r) => reward_to_dynamic(r),
        Err(e) => { warn!("twitch.create_reward: {e}"); Dynamic::UNIT }
    }
}

fn set_redemption_status_impl(p: &mut TwitchProxy, redemption_id: &str, reward_id: &str, fulfilled: bool) -> bool {
    let Some(bot) = p.bot.clone() else { return false; };
    let redemption_id = redemption_id.to_string();
    let reward_id = reward_id.to_string();
    match block_on(async move { bot.set_redemption_status(&reward_id, &redemption_id, fulfilled).await }) {
        Ok(()) => true,
        Err(e) => { warn!("twitch.set_redemption_status: {e}"); false }
    }
}
