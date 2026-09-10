// web proxy — HTTP requests from Rhai scripts.
//
// web.get(url)                           → String   — GET, returns body text
// web.post(url, body)                    → String   — POST plain-text body
// web.get_json(url)                      → Dynamic  — GET + parse JSON response
// web.post_json(url, body)               → Dynamic  — POST JSON + parse JSON response
// web.get_with_headers(url, headers)      → String   — GET with a Rhai map of headers
// web.post_with_headers(url, b, headers)  → String   — POST with headers
// web.get_json_with_headers(url, headers) → Dynamic  — GET + headers + parse JSON response
// web.post_json_with_headers(url, b, h)   → Dynamic  — POST JSON body + headers + parse JSON response
//   (for APIs that need both an Authorization/API-key header and a JSON body —
//   e.g. web.post_json_with_headers(url, io.encode_json(#{...}), #{"X-API-Key": key}))
// web.get_status(url)                    → i64      — HTTP status code (0 on failure)
// web.delete_with_headers(url, headers)  → bool     — DELETE with headers, true on 2xx
// web.put_json_with_headers(url, b, h)   → Dynamic  — PUT JSON body + headers + parse JSON response
//
// All requests time out after 10 seconds.
// Network errors return () (Rhai unit) or 0 rather than crashing the script.

use rhai::{Dynamic, Engine, Map};
use reqwest::{Client, RequestBuilder};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::OnceLock;
use std::time::Duration;
use tracing::warn;

use super::io::json_to_dynamic;
use super::queue::block_on;

const TIMEOUT: Duration = Duration::from_secs(10);

// ── SSRF guard ──────────────────────────────────────────────────────────────
//
// `web.*` is only reachable from the streamer's own trusted command/library
// scripts (module scripts never get it — see execute.rs), but those scripts
// often build URLs out of chat-supplied arguments (e.g. `web.get(args[0])`).
// Without this, any viewer could point the bot's HTTP client at the
// streamer's own router, NAS, or other LAN devices, or at a cloud metadata
// endpoint (169.254.169.254) if the app is ever run in a cloud VM. Blocks
// loopback/private/link-local/CGNAT ranges and non-http(s) schemes, and
// resolves hostnames before checking so a plain IP-literal check can't be
// sidestepped by DNS. Fails closed: unparseable URLs and unresolvable hosts
// are treated as blocked rather than silently allowed through.

fn is_blocked_ipv4(ip: &Ipv4Addr) -> bool {
    ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_unspecified()
        || ip.is_broadcast() || ip.is_multicast()
        || (ip.octets()[0] == 100 && (ip.octets()[1] & 0xC0) == 64) // 100.64.0.0/10 CGNAT
}

fn is_blocked_ipv6(ip: &Ipv6Addr) -> bool {
    if ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() { return true; }
    if let Some(v4) = ip.to_ipv4_mapped() { return is_blocked_ipv4(&v4); }
    let seg0 = ip.segments()[0];
    (seg0 & 0xfe00) == 0xfc00 // fc00::/7 unique local
        || (seg0 & 0xffc0) == 0xfe80 // fe80::/10 link-local
}

fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_blocked_ipv4(&v4),
        IpAddr::V6(v6) => is_blocked_ipv6(&v6),
    }
}

async fn is_blocked_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else { return true };
    if parsed.scheme() != "http" && parsed.scheme() != "https" { return true; }
    let Some(host) = parsed.host_str().map(str::to_string) else { return true };
    let port = parsed.port_or_known_default().unwrap_or(80);
    drop(parsed);

    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_blocked_ip(ip);
    }
    let host_port = format!("{host}:{port}");
    match tokio::net::lookup_host(host_port).await {
        Ok(addrs) => addrs.map(|a| a.ip()).any(is_blocked_ip),
        Err(_) => true,
    }
}

// perf: reuse a single reqwest::Client — it manages a connection pool internally.
// Creating a Client per request re-does TLS handshake + DNS on every call.
static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

fn client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(TIMEOUT)
            .build()
            .expect("failed to build HTTP client")
    })
}

#[derive(Clone)]
pub struct WebProxy;

// ── Async helpers ─────────────────────────────────────────────────────────────

fn apply_headers(req: RequestBuilder, headers: &Map) -> RequestBuilder {
    headers.iter().fold(req, |r, (k, v)| {
        r.header(k.as_str(), v.to_string())
    })
}

/// SSRF-guarded GET, shared with `cache.rs` — the only other proxy that
/// needs raw outbound HTTP, so it reuses this instead of duplicating the
/// blocked-URL check and connection-pooled client.
pub(super) async fn fetch_text(url: &str) -> Option<String> {
    do_get(url, None).await
}

async fn do_get(url: &str, headers: Option<&Map>) -> Option<String> {
    if is_blocked_url(url).await {
        warn!("web request to {url} blocked (private/reserved address or non-http(s) scheme)");
        return None;
    }
    let req = client().get(url);
    let req = if let Some(h) = headers { apply_headers(req, h) } else { req };
    req.send().await.ok()?.text().await.ok()
}

async fn do_post(url: &str, body: String, content_type: &'static str, headers: Option<&Map>) -> Option<String> {
    if is_blocked_url(url).await {
        warn!("web request to {url} blocked (private/reserved address or non-http(s) scheme)");
        return None;
    }
    let req = client().post(url).header("Content-Type", content_type).body(body);
    let req = if let Some(h) = headers { apply_headers(req, h) } else { req };
    req.send().await.ok()?.text().await.ok()
}

async fn do_put(url: &str, body: String, content_type: &'static str, headers: Option<&Map>) -> Option<String> {
    if is_blocked_url(url).await {
        warn!("web request to {url} blocked (private/reserved address or non-http(s) scheme)");
        return None;
    }
    let req = client().put(url).header("Content-Type", content_type).body(body);
    let req = if let Some(h) = headers { apply_headers(req, h) } else { req };
    req.send().await.ok()?.text().await.ok()
}

async fn do_delete(url: &str, headers: Option<&Map>) -> bool {
    if is_blocked_url(url).await {
        warn!("web request to {url} blocked (private/reserved address or non-http(s) scheme)");
        return false;
    }
    let req = client().delete(url);
    let req = if let Some(h) = headers { apply_headers(req, h) } else { req };
    matches!(req.send().await, Ok(r) if r.status().is_success())
}

async fn do_status(url: &str) -> u16 {
    if is_blocked_url(url).await {
        warn!("web request to {url} blocked (private/reserved address or non-http(s) scheme)");
        return 0;
    }
    match client().get(url).send().await {
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

    engine.register_fn("get_json_with_headers", |_: &mut WebProxy, url: &str, headers: Map| -> Dynamic {
        let text = block_on(do_get(url, Some(&headers)));
        match text.and_then(|t| serde_json::from_str(&t).ok()) {
            Some(v) => json_to_dynamic(v),
            None    => { warn!("web.get_json_with_headers({url}) failed"); Dynamic::UNIT }
        }
    });

    engine.register_fn("post_json_with_headers", |_: &mut WebProxy, url: &str, body: &str, headers: Map| -> Dynamic {
        let text = block_on(do_post(url, body.to_string(), "application/json", Some(&headers)));
        match text.and_then(|t| serde_json::from_str(&t).ok()) {
            Some(v) => json_to_dynamic(v),
            None    => { warn!("web.post_json_with_headers({url}) failed"); Dynamic::UNIT }
        }
    });

    // ── Status code ───────────────────────────────────────────────────────────

    engine.register_fn("get_status", |_: &mut WebProxy, url: &str| -> i64 {
        block_on(do_status(url)) as i64
    });

    engine.register_fn("delete_with_headers", |_: &mut WebProxy, url: &str, headers: Map| -> bool {
        block_on(do_delete(url, Some(&headers)))
    });

    engine.register_fn("put_json_with_headers", |_: &mut WebProxy, url: &str, body: &str, headers: Map| -> Dynamic {
        let text = block_on(do_put(url, body.to_string(), "application/json", Some(&headers)));
        match text.and_then(|t| serde_json::from_str(&t).ok()) {
            Some(v) => json_to_dynamic(v),
            None    => { warn!("web.put_json_with_headers({url}) failed"); Dynamic::UNIT }
        }
    });
}
