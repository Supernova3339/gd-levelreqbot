// youtube proxy — general-purpose YouTube Data API access for scripts.
//
// Available in every script (module or custom), same as `gd`/`twitch`. The
// Data API's chat surface is much thinner than Twitch's Helix API — there is
// no broadcaster-triggered "announcement" or channel-points equivalent, so
// this stays intentionally small rather than faking parity.

use super::queue::block_on;
use crate::bot::platform::ChatPlatform;
use crate::bot::youtube::YouTubeBot;
use rhai::{Dynamic, Engine, Map};
use std::sync::Arc;
use tracing::warn;

#[derive(Clone)]
pub struct YouTubeProxy {
    pub bot: Option<Arc<YouTubeBot>>,
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<YouTubeProxy>("YouTube");

    engine.register_fn("is_connected", |p: &mut YouTubeProxy| -> bool {
        let Some(bot) = p.bot.clone() else { return false; };
        block_on(async move { bot.is_connected().await })
    });

    // get_channel() — the connected account's own channel (id, title).
    engine.register_fn("get_channel", |p: &mut YouTubeProxy| -> Dynamic {
        let Some(bot) = p.bot.clone() else { return Dynamic::UNIT; };
        match block_on(async move { bot.get_channel().await }) {
            Ok(ch) => {
                let mut m = Map::new();
                m.insert("id".into(), Dynamic::from(ch.id));
                m.insert("title".into(), Dynamic::from(ch.title));
                Dynamic::from_map(m)
            }
            Err(e) => { warn!("youtube.get_channel: {e}"); Dynamic::UNIT }
        }
    });
}
