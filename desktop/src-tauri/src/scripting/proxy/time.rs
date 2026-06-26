use rhai::Engine;
use std::time::{SystemTime, UNIX_EPOCH};

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[derive(Clone)]
pub struct TimeProxy;

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<TimeProxy>("Time");

    // time.now() → Unix timestamp in seconds
    engine.register_fn("now", |_: &mut TimeProxy| -> i64 { now_secs() });

    // time.utc() → "HH:MM:SS UTC"
    engine.register_fn("utc", |_: &mut TimeProxy| -> String {
        let s = now_secs() as u64;
        format!("{:02}:{:02}:{:02} UTC", (s / 3600) % 24, (s / 60) % 60, s % 60)
    });

    // time.date() → "YYYY-MM-DD"
    engine.register_fn("date", |_: &mut TimeProxy| -> String {
        let s = now_secs();
        chrono::DateTime::from_timestamp_secs(s)
            .map(|d: chrono::DateTime<chrono::Utc>| d.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| s.to_string())
    });

    // time.elapsed(from_ts) → seconds since given timestamp
    engine.register_fn("elapsed", |_: &mut TimeProxy, from: i64| -> i64 {
        now_secs() - from
    });

    // time.format(ts, fmt) → formatted datetime string using strftime patterns
    // e.g. time.format(time.now(), "%Y-%m-%d %H:%M:%S")
    engine.register_fn("format", |_: &mut TimeProxy, ts: i64, fmt: &str| -> String {
        chrono::DateTime::from_timestamp_secs(ts)
            .map(|dt: chrono::DateTime<chrono::Utc>| dt.format(fmt).to_string())
            .unwrap_or_default()
    });

    // time.parse(str, fmt) → Unix timestamp or () on failure
    // e.g. time.parse("2024-01-01", "%Y-%m-%d")
    engine.register_fn("parse", |_: &mut TimeProxy, s: &str, fmt: &str| -> rhai::Dynamic {
        match chrono::NaiveDateTime::parse_from_str(s, fmt) {
            Ok(ndt) => rhai::Dynamic::from(ndt.and_utc().timestamp()),
            Err(_)  => rhai::Dynamic::UNIT,
        }
    });
}
