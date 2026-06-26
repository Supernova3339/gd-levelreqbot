// web proxy — HTTP requests from Rhai scripts.
//
// web.get(url)                           → String   — GET, returns body text
// web.post(url, body)                    → String   — POST plain-text body
// web.get_json(url)                      → Dynamic  — GET + parse JSON response
// web.post_json(url, body)               → Dynamic  — POST JSON + parse JSON response
// web.get_with_headers(url, headers)     → String   — GET with a Rhai map of headers
// web.post_with_headers(url, b, headers) → String   — POST with headers
// web.get_status(url)                    → i64      — HTTP status code (0 on failure)
//
// All requests time out after 10 seconds.
// Network errors return () (Rhai unit) or 0 rather than crashing the script.

use rhai::{Dynamic, Engine, Map};
use reqwest::{Client, RequestBuilder};
use std::time::Duration;
use tracing::warn;

use super::io::json_to_dynamic;
use super::queue::block_on;

const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct WebProxy;

// ── Async helpers ─────────────────────────────────────────────────────────────

fn apply_headers(req: RequestBuilder, headers: &Map) -> RequestBuilder {
    headers.iter().fold(req, |r, (k, v)| {
        r.header(k.as_str(), v.to_string())
    })
}

async fn do_get(url: &str, headers: Option<&Map>) -> Option<String> {
    let req = Client::new().get(url).timeout(TIMEOUT);
    let req = if let Some(h) = headers { apply_headers(req, h) } else { req };
    req.send().await.ok()?.text().await.ok()
}

async fn do_post(url: &str, body: String, content_type: &'static str, headers: Option<&Map>) -> Option<String> {
    let req = Client::new().post(url).header("Content-Type", content_type).body(body).timeout(TIMEOUT);
    let req = if let Some(h) = headers { apply_headers(req, h) } else { req };
    req.send().await.ok()?.text().await.ok()
}

async fn do_status(url: &str) -> u16 {
    match Client::new().get(url).timeout(TIMEOUT).send().await {
        Ok(r)  => r.status().as_u16(),
        Err(_) => 0,
    }
}

// ── Registration ──────────────────────────────────────────────────────────────

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<WebProxy>("Web");

    // ── Basic GET / POST ──────────────────────────────────────────────────────

    engine.register_fn("get", |_: &mut WebProxy, url: &str| -> Dynamic {
        match block_on(do_get(url, None)) {
            Some(s) => Dynamic::from(s),
            None    => { warn!("web.get({url}) failed"); Dynamic::UNIT }
        }
    });

    engine.register_fn("post", |_: &mut WebProxy, url: &str, body: &str| -> Dynamic {
        match block_on(do_post(url, body.to_string(), "text/plain", None)) {
            Some(s) => Dynamic::from(s),
            None    => { warn!("web.post({url}) failed"); Dynamic::UNIT }
        }
    });

    // ── JSON helpers ──────────────────────────────────────────────────────────

    engine.register_fn("get_json", |_: &mut WebProxy, url: &str| -> Dynamic {
        let text = block_on(do_get(url, None));
        match text.and_then(|t| serde_json::from_str(&t).ok()) {
            Some(v) => json_to_dynamic(v),
            None    => { warn!("web.get_json({url}) failed"); Dynamic::UNIT }
        }
    });

    engine.register_fn("post_json", |_: &mut WebProxy, url: &str, body: &str| -> Dynamic {
        let text = block_on(do_post(url, body.to_string(), "application/json", None));
        match text.and_then(|t| serde_json::from_str(&t).ok()) {
            Some(v) => json_to_dynamic(v),
            None    => { warn!("web.post_json({url}) failed"); Dynamic::UNIT }
        }
    });

    // ── With custom headers ───────────────────────────────────────────────────

    engine.register_fn("get_with_headers", |_: &mut WebProxy, url: &str, headers: Map| -> Dynamic {
        match block_on(do_get(url, Some(&headers))) {
            Some(s) => Dynamic::from(s),
            None    => { warn!("web.get_with_headers({url}) failed"); Dynamic::UNIT }
        }
    });

    engine.register_fn("post_with_headers", |_: &mut WebProxy, url: &str, body: &str, headers: Map| -> Dynamic {
        match block_on(do_post(url, body.to_string(), "text/plain", Some(&headers))) {
            Some(s) => Dynamic::from(s),
            None    => { warn!("web.post_with_headers({url}) failed"); Dynamic::UNIT }
        }
    });

    // ── Status code ───────────────────────────────────────────────────────────

    engine.register_fn("get_status", |_: &mut WebProxy, url: &str| -> i64 {
        block_on(do_status(url)) as i64
    });
}
