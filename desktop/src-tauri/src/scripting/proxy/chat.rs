// chat proxy — exposes chat output as a Rhai object.
//
// chat.say(msg)             — send a message to chat
// chat.reply(msg)           — send a message prefixed with @username
// chat.announce(msg)        — highlighted chat announcement on Twitch (Helix);
// chat.announce(msg, color) — falls back to a plain say() on YouTube, or on
//                              Twitch when Helix isn't available (see twitch.announce())
// chat.say_each(items)      — call say() for each item in an array
// chat.poll(title, options) — options is an array of 2+ strings, or pass them
//   directly (chat.poll(title, "a", "b")) for 2-6 options. Tries a native
//   Twitch poll first (requires the connected account to BE the broadcaster
//   and hold `channel:manage:polls` — most bot setups won't qualify); if
//   that's not available, falls back to a chat-vote poll instead.
// chat.poll(title, options, settings) — same, with a settings map overriding
//   any of the defaults below. Nothing here is fixed: duration, the vote
//   command word, and every announced message are all script-controlled so
//   this works for non-English chats and non-default vote commands alike.
//     duration   — vote window in seconds (default 60)
//     trigger    — chat command viewers type to vote (default "!vote")
//     announce   — sent when the poll opens. Placeholders: {title} {trigger} {seconds} {options}
//     results    — sent when it closes with >=1 vote. Placeholders: {title} {winner} {votes} {breakdown}
//     no_votes   — sent when it closes with 0 votes. Placeholders: {title}
//     announce_results — bool, default true. When false, the poll still runs
//       (native or fallback) but nothing is said when it closes — for scripts
//       that want to read/report results themselves some other way.
//     results_key — an `ms` key (module scripts only) chat.poll() writes a
//       live tally to every few seconds while the poll runs, then a final
//       one when it closes, as JSON:
//       #{status: "running"|"closed", total: N, winner: "...", tally: [#{option, votes}, ...]}
//       (tally sorted by votes descending, so tally[0] is always the current
//       leader). The script itself should ms.set(results_key, io.encode_json(
//       #{status: "running"})) before starting the poll, so `ms.get(results_key)`
//       reads something sensible in the brief window before the first live
//       tick arrives — chat.poll() has no scope to write that placeholder
//       itself since it runs before the poll has even started.
//     results_event — an event name (module scripts only) chat.poll() fires
//       (same delivery as event.emit — Tauri window event + WS broadcast)
//       with the same JSON as results_key, on the same running/closed
//       cadence. Meant for a module's own browser-source overlay page to
//       listen for over the existing WS bus (see ws/mod.rs) — a stable,
//       script-chosen channel name (e.g. "current-poll"), distinct from
//       results_key, which is per-poll-instance for history lookups. The
//       script should event.emit(results_event, ...) itself when the poll
//       STARTS (chat.poll only ever fires running/closed ticks once it's
//       already underway, for the same scope reason as above).
//
// Native Twitch polls close themselves silently (Twitch has no "poll ended"
// push event) — chat.poll() compensates by waiting out the duration itself
// and polling Get Poll every few seconds for a live tally, then once more
// after a settle buffer for the final result, so results/no_votes get
// announced the same way regardless of which path was taken. The fallback
// (chat-vote) poll broadcasts its own in-memory tally on the same cadence.
// Either way, results_key/results_event receive a #{status: "running", ...}
// tally repeatedly while the poll is open, then a single #{status: "closed", ...}
// once it ends — an overlay only needs to render whatever it last received.

use super::queue::block_on;
use crate::bot::dev::DevLogger;
use crate::bot::platform::ChatPlatform;
use crate::bot::twitch::TwitchBot;
use crate::bot::youtube::YouTubeBot;
use crate::bot::ChatMessage;
use crate::queue::QueueState;
use crate::scripting::context::ScriptOutput;
use crate::ws::WsState;
use rhai::{Dynamic, Engine, Map};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::broadcast;

fn dev_log(app_handle: &AppHandle, msg: impl Into<String>) {
    if let Some(dev) = app_handle.try_state::<Arc<DevLogger>>() {
        dev.log(msg);
    }
}
use tracing::warn;

#[derive(Clone)]
pub struct ChatProxy {
    pub output:     ScriptOutput,
    pub username:   String,
    pub platform:   String,
    pub twitch:     Option<Arc<TwitchBot>>,
    pub youtube:    Option<Arc<YouTubeBot>>,
    /// Set only for module scripts — lets chat.poll() write its final tally
    /// back into the calling module's own `ms` store (see `results_key`) and
    /// broadcast it live (see `results_event`).
    pub module_id:  Option<String>,
    pub queue:      Arc<QueueState>,
    pub app_handle: AppHandle,
}

/// Every piece of poll behavior a script can override via the `settings` map
/// — none of it is baked into the fallback runner itself, so a script can
/// run an entirely non-English poll, rename the vote command, or change the
/// vote window without touching Rust at all.
struct PollSettings {
    duration_secs:    u64,
    trigger:          String,
    announce_tpl:     String,
    results_tpl:      String,
    no_votes_tpl:     String,
    announce_results: bool,
    results_key:      Option<String>,
    results_event:    Option<String>,
}

impl Default for PollSettings {
    fn default() -> Self {
        Self {
            duration_secs:    60,
            trigger:          "!vote".to_string(),
            announce_tpl:     "📊 {title} — vote with {trigger} <number>: {options} ({seconds}s left)".to_string(),
            results_tpl:      "📊 Poll closed — \"{winner}\" wins with {votes} vote(s) ({breakdown})".to_string(),
            no_votes_tpl:     "📊 Poll closed — no votes cast for \"{title}\".".to_string(),
            announce_results: true,
            results_key:      None,
            results_event:    None,
        }
    }
}

impl PollSettings {
    fn from_map(map: Map) -> Self {
        let mut s = Self::default();
        if let Some(v) = map.get("duration") { if let Some(n) = v.as_int().ok() { s.duration_secs = n.max(1) as u64; } }
        if let Some(v) = map.get("trigger")  { s.trigger      = v.to_string(); }
        if let Some(v) = map.get("announce") { s.announce_tpl = v.to_string(); }
        if let Some(v) = map.get("results")  { s.results_tpl  = v.to_string(); }
        if let Some(v) = map.get("no_votes") { s.no_votes_tpl = v.to_string(); }
        if let Some(v) = map.get("announce_results") { if let Some(b) = v.as_bool().ok() { s.announce_results = b; } }
        if let Some(v) = map.get("results_key") { s.results_key = Some(v.to_string()); }
        if let Some(v) = map.get("results_event") { s.results_event = Some(v.to_string()); }
        s
    }
}

/// Builds the JSON shape `run_fallback_poll` and `watch_native_poll` write to
/// `ms.get(results_key)`/broadcast on `results_event` — tally sorted by votes
/// descending so index 0 is always the (current) leader. `status` is
/// `"running"` for the periodic live ticks and `"closed"` for the final one.
fn tally_json(status: &str, options_in_order: &[(&str, i64)]) -> String {
    let mut tally: Vec<(&str, i64)> = options_in_order.to_vec();
    tally.sort_by(|a, b| b.1.cmp(&a.1));
    let total: i64 = tally.iter().map(|(_, v)| v).sum();
    let winner = tally.first().map(|(o, _)| *o).unwrap_or("");
    serde_json::json!({
        "status": status,
        "total": total,
        "winner": winner,
        "tally": tally.iter().map(|(o, v)| serde_json::json!({"option": o, "votes": v})).collect::<Vec<_>>(),
    }).to_string()
}

/// How often the live tally is re-fetched/re-broadcast while a poll is open.
const LIVE_TICK: Duration = Duration::from_secs(4);

// `results_key`/`results_event` are used verbatim — the module script picks
// both (and writes/emits the initial "running" state under the same names
// itself, before the poll starts), so neither name is duplicated between
// Rust and any module. Broadcast mirrors EventProxy::emit's steps 1-2
// exactly (Tauri window event + WS broadcast) — not its listener-dispatch/
// cycle-detection logic, which only makes sense for a real chat-command
// dispatch chain, not a background task reporting a result.
async fn write_results(
    app_handle: &AppHandle,
    module_id: &Option<String>,
    queue: &Arc<QueueState>,
    results_key: &Option<String>,
    results_event: &Option<String>,
    json: &str,
) {
    if let (Some(mid), Some(key)) = (module_id, results_key) {
        super::module_store::set_module_kv(queue, mid, key, json).await;
        // This is a background Rust task, not a script — it bypasses
        // EventProxy::emit entirely, so it has to fire the same generic
        // "module-data-updated" companion signal itself (see EventProxy::emit's
        // comment) or a GDUI expression reading this key would never
        // re-evaluate on its own for a native/fallback poll's live ticks.
        // Scoped to this module's id so a poll ticking every few seconds
        // doesn't also debounce-refetch every other open module's page.
        let _ = app_handle.emit("module-data-updated", Some(mid.clone()));
    }
    if module_id.is_some() {
        if let Some(event) = results_event {
            let _ = app_handle.emit(event, json);
            if let Some(ws) = app_handle.try_state::<Arc<WsState>>() {
                if ws.client_count() > 0 {
                    let msg = serde_json::json!({"event": event, "data": json}).to_string();
                    let _ = ws.tx.send(msg);
                }
            }
        }
    }
}

fn render(tpl: &str, vars: &[(&str, &str)]) -> String {
    let mut out = tpl.to_string();
    for (key, val) in vars {
        out = out.replace(&format!("{{{key}}}"), val);
    }
    out
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

fn poll(c: &mut ChatProxy, title: &str, options: Vec<String>, settings: PollSettings) {
    if options.len() < 2 {
        c.output.lock().unwrap().push("chat.poll needs at least 2 options.".to_string());
        return;
    }

    // Native Twitch poll — only ever attempted on Twitch, and only succeeds
    // when the connected account IS the broadcaster with channel:manage:polls.
    // Most setups (a separate bot account) will fail this, which is expected
    // and not logged as an error — see create_poll's docs on TwitchBot.
    if c.platform == "twitch" {
        if let Some(bot) = c.twitch.clone() {
            let title_owned = title.to_string();
            let opts_owned = options.clone();
            let duration = settings.duration_secs as i32;
            let bot_for_create = bot.clone();
            let result = block_on(async move {
                bot_for_create.create_poll(&title_owned, &opts_owned, duration).await
            });
            match result {
                Ok(poll_id) => {
                    c.output.lock().unwrap().push(format!("📊 Poll started: {title}"));
                    let youtube = c.youtube.clone();
                    let title_owned = title.to_string();
                    let module_id = c.module_id.clone();
                    let queue = c.queue.clone();
                    let app_handle = c.app_handle.clone();
                    dev_log(&app_handle, format!("chat.poll: native Twitch poll created (id={poll_id}, duration={}s)", settings.duration_secs));
                    tokio::spawn(watch_native_poll(poll_id, title_owned, settings, bot, youtube, module_id, queue, app_handle));
                    return;
                }
                Err(e) => {
                    dev_log(&c.app_handle, format!("chat.poll: native Twitch poll unavailable, falling back to chat vote: {e}"));
                    warn!("chat.poll: native Twitch poll unavailable, falling back to chat vote: {e}");
                }
            }
        }
    }

    // Fallback: a chat-vote poll, works regardless of platform/eligibility.
    // Needs at least one live bot connection to announce/listen/report on —
    // if there's none (e.g. a test-runner context), just say so and bail.
    let Some(twitch) = c.twitch.clone() else {
        c.output.lock().unwrap().push("chat.poll: no active chat connection to run a poll on.".to_string());
        return;
    };
    let youtube = c.youtube.clone();
    let title_owned = title.to_string();
    let module_id = c.module_id.clone();
    let queue = c.queue.clone();
    let app_handle = c.app_handle.clone();
    tokio::spawn(run_fallback_poll(title_owned, options, settings, twitch, youtube, module_id, queue, app_handle));
}

/// Polls Get Poll every `LIVE_TICK` for the duration of a native Twitch poll
/// (broadcasting a live tally each time), then once more after a settle
/// buffer for the final result, which it announces the same way the
/// fallback path does — Twitch runs the poll and shows its own overlay, but
/// never tells the bot when it's done, so this is the only way to say
/// anything in chat once it closes.
async fn watch_native_poll(
    poll_id: String,
    title: String,
    settings: PollSettings,
    twitch: Arc<TwitchBot>,
    youtube: Option<Arc<YouTubeBot>>,
    module_id: Option<String>,
    queue: Arc<QueueState>,
    app_handle: AppHandle,
) {
    // Twitch's own poll UI updates live off repeated Get Poll calls, not a
    // push event — mirror that here so the overlay isn't stuck showing a
    // bare option list for the whole vote window.
    let mut elapsed = Duration::ZERO;
    let total_duration = Duration::from_secs(settings.duration_secs);
    while elapsed < total_duration {
        let step = LIVE_TICK.min(total_duration - elapsed);
        tokio::time::sleep(step).await;
        elapsed += step;
        match twitch.get_poll(&poll_id).await {
            Ok(poll) => {
                let pairs: Vec<(&str, i64)> = poll.choices.iter().map(|c| (c.title.as_str(), c.votes)).collect();
                let total: i64 = pairs.iter().map(|(_, v)| v).sum();
                dev_log(&app_handle, format!("chat.poll: live tick for '{poll_id}' — {total} vote(s) so far"));
                write_results(&app_handle, &module_id, &queue, &settings.results_key, &settings.results_event, &tally_json("running", &pairs)).await;
            }
            Err(e) => dev_log(&app_handle, format!("chat.poll: live tick for '{poll_id}' failed: {e}")),
        }
    }

    // +3s settle buffer so the final Get Poll isn't asked for results before
    // Twitch has actually finalized them right at the duration boundary.
    tokio::time::sleep(Duration::from_secs(3)).await;

    let poll = match twitch.get_poll(&poll_id).await {
        Ok(p) => p,
        Err(e) => {
            dev_log(&app_handle, format!("chat.poll: final fetch for '{poll_id}' failed: {e}"));
            warn!("chat.poll: couldn't fetch native poll results for '{title}': {e}");
            return;
        }
    };
    dev_log(&app_handle, format!("chat.poll: final fetch for '{poll_id}' succeeded"));

    let pairs: Vec<(&str, i64)> = poll.choices.iter().map(|c| (c.title.as_str(), c.votes)).collect();
    write_results(&app_handle, &module_id, &queue, &settings.results_key, &settings.results_event, &tally_json("closed", &pairs)).await;

    if !settings.announce_results {
        return;
    }

    let total: i64 = poll.choices.iter().map(|c| c.votes).sum();
    let result_msg = if total == 0 || poll.choices.is_empty() {
        render(&settings.no_votes_tpl, &[("title", &title)])
    } else {
        let winner = poll.choices.iter().max_by_key(|c| c.votes).unwrap();
        let breakdown = poll.choices.iter()
            .map(|c| format!("{}: {}", c.title, c.votes))
            .collect::<Vec<_>>().join(", ");
        let votes_str = winner.votes.to_string();
        render(&settings.results_tpl, &[
            ("title", &title),
            ("winner", &winner.title),
            ("votes", &votes_str),
            ("breakdown", &breakdown),
        ])
    };
    let _ = twitch.send_message(&result_msg).await;
    if let Some(yt) = &youtube {
        let _ = yt.send_message(&result_msg).await;
    }
}

/// Announces a poll, tallies `<trigger> <n>` / `<trigger> <option text>` from
/// live chat for `settings.duration_secs`, then reports the results — all
/// independent of the normal command dispatcher (it reads straight off the
/// shared chat broadcast channel), so no command needs to be registered for
/// the vote trigger to work.
async fn run_fallback_poll(
    title: String,
    options: Vec<String>,
    settings: PollSettings,
    twitch: Arc<TwitchBot>,
    youtube: Option<Arc<YouTubeBot>>,
    module_id: Option<String>,
    queue: Arc<QueueState>,
    app_handle: AppHandle,
) {
    let opts_line = options.iter().enumerate()
        .map(|(i, o)| format!("{}) {o}", i + 1))
        .collect::<Vec<_>>().join("  ");
    let seconds = settings.duration_secs.to_string();
    let announce_msg = render(&settings.announce_tpl, &[
        ("title", &title),
        ("trigger", &settings.trigger),
        ("seconds", &seconds),
        ("options", &opts_line),
    ]);
    let _ = twitch.send_message(&announce_msg).await;
    if let Some(yt) = &youtube {
        let _ = yt.send_message(&announce_msg).await;
    }

    let mut rx = twitch.subscribe_chat();
    let mut votes: HashMap<String, usize> = HashMap::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(settings.duration_secs);
    let mut ticker = tokio::time::interval(LIVE_TICK);
    ticker.tick().await; // first tick fires immediately — skip it, nothing's happened yet

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }
        tokio::select! {
            _ = tokio::time::sleep(remaining) => break,
            _ = ticker.tick() => {
                let mut tally = vec![0usize; options.len()];
                for &idx in votes.values() { tally[idx] += 1; }
                let pairs: Vec<(&str, i64)> = options.iter().zip(tally.iter())
                    .map(|(o, v)| (o.as_str(), *v as i64))
                    .collect();
                write_results(&app_handle, &module_id, &queue, &settings.results_key, &settings.results_event, &tally_json("running", &pairs)).await;
            }
            msg = rx.recv() => {
                match msg {
                    Ok(m) => record_vote(&mut votes, &options, &settings.trigger, &m),
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    let mut tally = vec![0usize; options.len()];
    for &idx in votes.values() {
        tally[idx] += 1;
    }
    let total: usize = tally.iter().sum();

    let pairs: Vec<(&str, i64)> = options.iter().zip(tally.iter())
        .map(|(o, v)| (o.as_str(), *v as i64))
        .collect();
    write_results(&app_handle, &module_id, &queue, &settings.results_key, &settings.results_event, &tally_json("closed", &pairs)).await;

    if !settings.announce_results {
        return;
    }

    let result_msg = if total == 0 {
        render(&settings.no_votes_tpl, &[("title", &title)])
    } else {
        let (winner_idx, winner_votes) = tally.iter().enumerate()
            .max_by_key(|&(_, v)| *v)
            .map(|(i, v)| (i, *v))
            .unwrap_or((0, 0));
        let breakdown = options.iter().zip(tally.iter())
            .map(|(o, v)| format!("{o}: {v}"))
            .collect::<Vec<_>>().join(", ");
        let votes_str = winner_votes.to_string();
        render(&settings.results_tpl, &[
            ("title", &title),
            ("winner", &options[winner_idx]),
            ("votes", &votes_str),
            ("breakdown", &breakdown),
        ])
    };
    let _ = twitch.send_message(&result_msg).await;
    if let Some(yt) = &youtube {
        let _ = yt.send_message(&result_msg).await;
    }
}

fn record_vote(votes: &mut HashMap<String, usize>, options: &[String], trigger: &str, m: &ChatMessage) {
    let text = m.text.trim();
    let mut parts = text.splitn(2, char::is_whitespace);
    let Some(first) = parts.next() else { return };
    if first != trigger {
        return;
    }
    let choice = parts.next().unwrap_or("").trim();
    if choice.is_empty() {
        return;
    }
    if let Ok(n) = choice.parse::<usize>() {
        if n >= 1 && n <= options.len() {
            votes.insert(m.username.clone(), n - 1);
        }
        return;
    }
    if let Some(idx) = options.iter().position(|o| o.eq_ignore_ascii_case(choice)) {
        votes.insert(m.username.clone(), idx);
    }
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

    // poll — accepts an explicit options array, or 2-6 options as direct
    // string args (chat.poll("title", "a", "b", "c")), matching how it reads
    // in a script rather than forcing an array literal for the common case.
    // An optional trailing settings map (see file header) overrides duration,
    // the vote trigger word, and every announced message template — the
    // array form is the one to reach for whenever any of that needs changing,
    // since stacking a settings map onto every fixed-arity overload below
    // would just multiply them out for no benefit.
    engine.register_fn("poll", |c: &mut ChatProxy, title: &str, options: rhai::Array| {
        poll(c, title, options.into_iter().map(|d| d.to_string()).collect(), PollSettings::default());
    });
    engine.register_fn("poll", |c: &mut ChatProxy, title: &str, options: rhai::Array, settings: Map| {
        poll(c, title, options.into_iter().map(|d| d.to_string()).collect(), PollSettings::from_map(settings));
    });
    engine.register_fn("poll", |c: &mut ChatProxy, title: &str, a: &str, b: &str| {
        poll(c, title, vec![a.to_string(), b.to_string()], PollSettings::default());
    });
    engine.register_fn("poll", |c: &mut ChatProxy, title: &str, a: &str, b: &str, d: &str| {
        poll(c, title, vec![a.to_string(), b.to_string(), d.to_string()], PollSettings::default());
    });
    engine.register_fn("poll", |c: &mut ChatProxy, title: &str, a: &str, b: &str, d: &str, e: &str| {
        poll(c, title, vec![a.to_string(), b.to_string(), d.to_string(), e.to_string()], PollSettings::default());
    });
    engine.register_fn("poll", |c: &mut ChatProxy, title: &str, a: &str, b: &str, d: &str, e: &str, f: &str| {
        poll(c, title, vec![a.to_string(), b.to_string(), d.to_string(), e.to_string(), f.to_string()], PollSettings::default());
    });
    engine.register_fn("poll", |c: &mut ChatProxy, title: &str, a: &str, b: &str, d: &str, e: &str, f: &str, g: &str| {
        poll(c, title, vec![a.to_string(), b.to_string(), d.to_string(), e.to_string(), f.to_string(), g.to_string()], PollSettings::default());
    });
}
