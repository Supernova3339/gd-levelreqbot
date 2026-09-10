use crate::modules::{ModuleManifest, ModuleState};
use crate::queue::QueueState;
use crate::urls::MARKETPLACE_BASE;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read as IoRead;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tracing::{info, warn};

// ── Size limits (zip-bomb / OOM guards) ──────────────────────────────────────
//
// A marketplace package's bytes are, once past initial staff approval,
// effectively author-controlled input handed to whoever installs it next —
// including a staff reviewer manually pulling down a pending submission to
// look at it, or any regular user installing an approved one. Two separate
// things need bounding:
//   1. The downloaded blob itself, before any zip parsing even starts — an
//      oversized (or infinite/slow) response would OOM the installer just
//      buffering it via reqwest's .bytes().
//   2. Per-entry *decompressed* size during extraction — capping only the
//      download size doesn't help here, since a classic zip bomb achieves a
//      huge compression ratio (a few KB compressing millions-to-one). The
//      only real defense is capping bytes actually read back out per entry,
//      via Read::take, regardless of what the zip's central directory claims
//      the size is.
const MAX_DOWNLOAD_BYTES: u64 = 150 * 1024 * 1024; // 150MB
const MAX_ZIP_ENTRY_BYTES: u64 = 50 * 1024 * 1024; // 50MB per file, post-decompression
const MAX_ZIP_ENTRIES: usize = 4000;

/// Reads an HTTP response body, aborting once it exceeds `MAX_DOWNLOAD_BYTES`
/// — checks the advertised Content-Length first (cheap, catches the common
/// case), then still caps the actual stream in case a server lies about it.
async fn download_capped(resp: reqwest::Response) -> Result<Vec<u8>, String> {
    if let Some(len) = resp.content_length() {
        if len > MAX_DOWNLOAD_BYTES {
            return Err(format!(
                "Download too large ({len} bytes, max {MAX_DOWNLOAD_BYTES})"
            ));
        }
    }
    use futures_util::StreamExt;
    let mut buf = Vec::new();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download failed: {e}"))?;
        buf.extend_from_slice(&chunk);
        if buf.len() as u64 > MAX_DOWNLOAD_BYTES {
            return Err(format!("Download exceeded max allowed size ({MAX_DOWNLOAD_BYTES} bytes)"));
        }
    }
    Ok(buf)
}

/// Reads one zip entry fully, capping decompressed output at
/// `MAX_ZIP_ENTRY_BYTES` regardless of the entry's declared size — see the
/// module-level doc comment for why the declared size can't be trusted.
fn read_zip_entry_capped(file: &mut dyn std::io::Read, label: &str) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    file.take(MAX_ZIP_ENTRY_BYTES + 1).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    if buf.len() as u64 > MAX_ZIP_ENTRY_BYTES {
        return Err(format!("'{label}' exceeds max allowed size ({MAX_ZIP_ENTRY_BYTES} bytes) after decompression"));
    }
    Ok(buf)
}

// ── Dev watch registry ────────────────────────────────────────────────────────

struct WatchEntry {
    source_dir: String,
    handle: tokio::task::JoinHandle<()>,
}

/// App-managed state tracking all active hot-reload directory watchers.
pub struct DevWatchRegistry {
    inner: tokio::sync::Mutex<HashMap<String, WatchEntry>>,
}

impl DevWatchRegistry {
    pub fn new() -> Self {
        Self { inner: tokio::sync::Mutex::new(HashMap::new()) }
    }
    pub async fn stop(&self, module_id: &str) {
        let mut inner = self.inner.lock().await;
        if let Some(entry) = inner.remove(module_id) {
            entry.handle.abort();
        }
    }
}

// â"€â"€ Marketplace types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

fn default_module_type() -> String { "module".into() }
fn default_source_type() -> String { "direct".into() }

fn default_status() -> String { "published".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceResource {
    pub id: i64,
    pub resource_type: String,
    pub url: String,
    #[serde(default)]
    pub filename: String,
    #[serde(default)]
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceEntry {
    pub id: String,
    pub name: String,
    #[serde(default = "default_module_type")]
    pub package_type: String,
    #[serde(default = "default_status")]
    pub status: String,
    pub author: String,
    pub version: String,
    pub min_app_version: String,
    pub description: String,
    pub icon: String,
    /// Manifest-defined accent color (e.g. "#7c3aed") — takes priority over
    /// the icon-name-derived color the UI falls back to when this is unset.
    #[serde(default)]
    pub color: Option<String>,
    pub verified: bool,
    pub premium: bool,
    pub downloads: u32,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub rating_avg: Option<f64>,
    #[serde(default)]
    pub rating_count: u32,
    pub tags: Vec<String>,
    /// "direct" = use download_url; "github" = resolve from repo at install time
    #[serde(default = "default_source_type")]
    pub source_type: String,
    /// Direct URL to the .gdmod package (empty for github source).
    #[serde(default)]
    pub download_url: String,
    #[serde(default)]
    pub checksum: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub changelog: String,
    #[serde(default)]
    pub pub_date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deny_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub submitter_username: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub resources: Vec<MarketplaceResource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub components: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub libraries: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modules: Vec<String>,
    // GitHub source fields
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub github_repo: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub github_dir: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub github_tag: String,
}

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");


// â"€â"€ Version compatibility â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/// Logs exactly what got downloaded before checksum verification runs, so a
/// mismatch is diagnosable from the log alone instead of just a hex string:
/// byte count, whether it actually looks like a zip (`PK\x03\x04` magic —
/// catches a CDN/edge serving an HTML error page or a truncated/redirected
/// response instead of the real package), and a text preview when it doesn't.
fn log_download(id: &str, url: &str, bytes: &[u8]) {
    let looks_like_zip = bytes.starts_with(b"PK\x03\x04");
    if looks_like_zip {
        info!("download '{id}' from {url}: {} bytes, valid zip signature", bytes.len());
    } else {
        let preview_len = bytes.len().min(200);
        let preview = String::from_utf8_lossy(&bytes[..preview_len]);
        warn!(
            "download '{id}' from {url}: {} bytes, NOT a zip (missing PK signature) — first {preview_len} bytes: {preview:?}",
            bytes.len()
        );
    }
}

/// Verify SHA-256 checksum of downloaded bytes against the release's `checksum`
/// field, when one was provided. A release without a checksum is not
/// rejected — direct-URL releases predate this field being mandatory.
fn verify_checksum(bytes: &[u8], expected: &str, id: &str) -> Result<(), String> {
    if expected.is_empty() {
        return Ok(());
    }
    use sha2::{Digest, Sha256};
    let actual = hex::encode(Sha256::digest(bytes));
    info!("checksum '{id}': expected {expected}, computed {actual}, {} bytes hashed", bytes.len());
    if actual != expected {
        return Err(format!(
            "Checksum mismatch for '{id}': expected {expected}, got {actual}"
        ));
    }
    Ok(())
}

/// Compares against `app_handle.package_info().version` — the version Tauri
/// actually resolved (tauri.conf.json's `version`, when set, wins over
/// Cargo.toml's) — not the `APP_VERSION`/`CARGO_PKG_VERSION` constant below,
/// which is baked in from Cargo.toml at compile time and silently goes stale
/// the moment the two files' version fields drift apart (as they had: this
/// reported "you have v0.1.0" on an app whose About page said v0.1.1).
fn check_version_compat(app_handle: &AppHandle, min_app_version: &str) -> Result<(), String> {
    let app_version = app_handle.package_info().version.clone();
    let required = semver::Version::parse(min_app_version)
        .map_err(|_| format!("Module has invalid min_app_version: '{min_app_version}'"))?;
    if app_version < required {
        return Err(format!(
            "This module requires GDLQBot v{min_app_version} or later (you have v{app_version}). \
             Please update the app first."
        ));
    }
    Ok(())
}



// ── Path safety for IDs used as filesystem path components ──────────────────
//
// Module/library/package IDs used below to build install directories
// (`modules_dir.join(author).join(pkg_type).join(id)` etc.) come straight out
// of a manifest.json — either the module's OWN manifest (attacker-controlled
// for a malicious marketplace submission) or a "modules"/"libraries" list
// inside a .gdpck bundle. extract_gdmod already sanitises the *internal* zip
// entry names against zip-slip, but that's a separate check from the id
// itself: a manifest declaring an id of "../../../../Desktop" would still
// pass that check and get joined straight into a real path. Every id used as
// a single path segment must go through this first.
fn safe_path_component(s: &str) -> Result<&str, String> {
    if s.is_empty() || s == "." || s == ".." || s.contains(['/', '\\']) {
        return Err(format!("Invalid id '{s}': must be a single path segment with no '/', '\\', or '..'"));
    }
    Ok(s)
}

// ── Hidden manifest ───────────────────────────────────────────────────────────
//
// A package's manifest.json can be carried two ways:
//   1. Legacy: a normal, visible zip entry named "manifest.json" — how every
//      package before this feature shipped. Only honored if that entry's
//      recorded zip modification date is on/before LEGACY_MANIFEST_CUTOFF, so
//      this is a closeable grandfather clause, not a permanent bypass: a
//      freshly-built plain zip dated after the cutoff is rejected outright,
//      forcing new packages through path 2.
//   2. Hidden: no visible manifest.json entry at all. Instead, a zero-byte
//      placeholder entry (HIDDEN_MANIFEST_ENTRY) carries the manifest JSON in
//      its zip "extra field" — a TLV area the zip spec reserves for
//      structural metadata (Zip64 sizes, Unix perms, NTFS timestamps…), never
//      the file's actual content. No mainstream archive tool (7-Zip, WinRAR,
//      Explorer) surfaces extra-field bytes anywhere in its UI, unlike the
//      well-known "archive comment" field — extracting the archive normally
//      just shows an empty file with an unremarkable name. This is
//      obfuscation, not encryption: anyone who knows to look at the raw extra
//      field with a hex editor can read it. It's meant to stop a casual
//      "unzip and see a real manifest.json" inspection, not resist a
//      determined one.
const HIDDEN_MANIFEST_ENTRY: &str = ".gdlrb";
const HIDDEN_MANIFEST_EXTRA_ID: u16 = 0x9401; // arbitrary, avoids PKWARE-registered IDs

fn legacy_manifest_cutoff() -> zip::DateTime {
    // Fixed on purpose — bump only if deliberately re-opening the legacy
    // (visible manifest.json) path going forward.
    zip::DateTime::from_date_and_time(2026, 7, 29, 23, 59, 58)
        .expect("legacy_manifest_cutoff: valid fixed date")
}

/// Extra-field bytes are a sequence of (header_id: u16 LE, size: u16 LE, payload) records.
fn find_extra_field(data: &[u8], target_id: u16) -> Option<Vec<u8>> {
    let mut i = 0;
    while i + 4 <= data.len() {
        let id = u16::from_le_bytes([data[i], data[i + 1]]);
        let size = u16::from_le_bytes([data[i + 2], data[i + 3]]) as usize;
        let start = i + 4;
        let end = start.checked_add(size)?;
        if end > data.len() { break; }
        if id == target_id {
            return Some(data[start..end].to_vec());
        }
        i = end;
    }
    None
}

fn read_hidden_manifest(archive: &mut zip::ZipArchive<std::io::Cursor<&[u8]>>) -> Option<String> {
    let file = archive.by_name(HIDDEN_MANIFEST_ENTRY).ok()?;
    let extra = file.extra_data()?;
    let bytes = find_extra_field(extra, HIDDEN_MANIFEST_EXTRA_ID)?;
    String::from_utf8(bytes).ok()
}

/// Reads the root manifest.json of a standalone package (.gdmod/.gdpck/.gdlib),
/// trying the hidden form first (see read_hidden_manifest) before falling back
/// to a legacy visible entry. Used for the initial "what kind of package is
/// this" peek — install_local_package/install_gdmod_bytes both need this
/// before they know which install path to take, same as extract_gdmod needs
/// it for a standalone module.
pub fn read_root_manifest_str(bytes: &[u8]) -> Result<String, String> {
    {
        let cursor = std::io::Cursor::new(bytes);
        if let Ok(mut archive) = zip::ZipArchive::new(cursor) {
            if let Some(s) = read_hidden_manifest(&mut archive) {
                return Ok(s);
            }
        }
    }
    let cursor = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("Not a valid package file: {e}"))?;
    let mut f = archive.by_name("manifest.json")
        .map_err(|_| "Package is missing manifest.json (or the hidden-manifest form)".to_string())?;
    let dated_ok = f.last_modified()
        .map(|d| d <= legacy_manifest_cutoff())
        .unwrap_or(false);
    if !dated_ok {
        return Err(
            "manifest.json is dated after the legacy cutoff — rebuild this package with the hidden-manifest form".to_string()
        );
    }
    let mut s = String::new();
    f.read_to_string(&mut s).map_err(|e| e.to_string())?;
    Ok(s)
}

/// Same idea as read_hidden_manifest, for a module nested inside a .gdpck
/// bundle at `modules/<mod_id>/` rather than at the archive root. Only the
/// module's own manifest gets the hidden treatment here — the bundle's own
/// root manifest.json (just a listing of library/module/package ids, not a
/// module's actual command/script logic) stays visible; there's nothing
/// sensitive in it worth hiding.
fn read_bundled_module_manifest(bytes: &[u8], mod_id: &str) -> Result<String, String> {
    let hidden_path = format!("modules/{mod_id}/{HIDDEN_MANIFEST_ENTRY}");
    {
        let cursor = std::io::Cursor::new(bytes);
        if let Ok(mut archive) = zip::ZipArchive::new(cursor) {
            if let Ok(file) = archive.by_name(&hidden_path) {
                if let Some(extra) = file.extra_data() {
                    if let Some(field) = find_extra_field(extra, HIDDEN_MANIFEST_EXTRA_ID) {
                        if let Ok(s) = String::from_utf8(field) {
                            return Ok(s);
                        }
                    }
                }
            }
        }
    }

    // Legacy fallback — same date-cutoff rule as extract_gdmod.
    let visible_path = format!("modules/{mod_id}/manifest.json");
    let cursor = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
    let mut f = archive.by_name(&visible_path)
        .map_err(|_| format!("Bundle missing {visible_path} (or the hidden-manifest form)"))?;
    let dated_ok = f.last_modified()
        .map(|d| d <= legacy_manifest_cutoff())
        .unwrap_or(false);
    if !dated_ok {
        return Err(format!(
            "Module '{mod_id}': manifest.json is dated after the legacy cutoff — \
             rebuild this bundle with the hidden-manifest form"
        ));
    }
    let mut s = String::new();
    f.read_to_string(&mut s).map_err(|e| e.to_string())?;
    Ok(s)
}

// ── .gdmod extraction (for downloaded packages) ──────────────────────────────

/// Extract a .gdmod (zip) package into `dest_dir`.
/// Returns the parsed manifest.
pub fn extract_gdmod(
    data: &[u8],
    dest_dir: &Path,
) -> Result<ModuleManifest, String> {
    let cursor = std::io::Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("Invalid .gdmod package: {e}"))?;

    if archive.len() > MAX_ZIP_ENTRIES {
        return Err(format!("Package has too many entries ({}, max {MAX_ZIP_ENTRIES})", archive.len()));
    }

    let module_dir = dest_dir;
    std::fs::create_dir_all(&module_dir)
        .map_err(|e| format!("Could not create module directory: {e}"))?;

    let mut legacy_manifest_json: Option<String> = None;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();

        // Sanitise path â€" prevent zip-slip attacks
        if name.contains("..") || name.starts_with('/') {
            continue;
        }
        // Plumbing, not a real module file — never written to disk.
        if name == HIDDEN_MANIFEST_ENTRY {
            continue;
        }

        let dest = module_dir.join(&name);

        if name.ends_with('/') {
            std::fs::create_dir_all(&dest).ok();
        } else {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            // Capped regardless of the entry's declared size — see
            // read_zip_entry_capped's doc comment (zip-bomb defense).
            let buf = read_zip_entry_capped(&mut file, &name)?;

            if name == "manifest.json" {
                // Legacy visible-manifest path — only honored pre-cutoff (see
                // the module-level doc comment above). Written to disk below
                // like any other entry regardless, but only captured as the
                // resolved manifest if the date check passes; a rejected one
                // just becomes an inert file on disk, not the authoritative
                // manifest.
                let dated_ok = file.last_modified()
                    .map(|d| d <= legacy_manifest_cutoff())
                    .unwrap_or(false);
                if dated_ok {
                    legacy_manifest_json = Some(String::from_utf8_lossy(&buf).into_owned());
                }
            }

            std::fs::write(&dest, &buf).map_err(|e| format!("Failed to write {name}: {e}"))?;
        }
    }

    let json = match legacy_manifest_json {
        Some(j) => j,
        None => read_hidden_manifest(&mut archive)
            .ok_or_else(|| "Package is missing manifest.json".to_string())?,
    };

    // Always (re)write the resolved manifest to disk under its normal name —
    // everything downstream (module_dir/manifest.json reads elsewhere in the
    // codebase) expects a real file there regardless of which of the two
    // paths above it came from.
    std::fs::write(module_dir.join("manifest.json"), &json)
        .map_err(|e| format!("Failed to write manifest.json: {e}"))?;

    serde_json::from_str::<ModuleManifest>(&json)
        .map_err(|e| format!("Invalid manifest.json: {e}"))
}

// â"€â"€ Tauri commands â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const LICENSE_KV_KEY: &str = "sys:license_token";

fn mp_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MarketplaceMeResponse {
    pub github_id:  i64,
    pub username:   String,
    pub is_sponsor: bool,
    pub is_owner:   bool,
    #[serde(default = "default_role")]
    pub role:       String,
}

fn default_role() -> String { "user".into() }

/// GET /me — returns account info including is_owner. Routed through Rust to avoid CORS issues.
#[tauri::command]
pub async fn fetch_marketplace_me(token: String) -> Result<MarketplaceMeResponse, String> {
    let res = mp_client()?
        .get(format!("{MARKETPLACE_BASE}/me"))
        .header("Authorization", format!("Bearer {token}"))
        .send().await
        .map_err(|e| format!("Marketplace /me failed: {e}"))?;
    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Marketplace /me error: {body}"));
    }
    res.json::<MarketplaceMeResponse>().await
        .map_err(|e| format!("Marketplace /me parse error: {e}"))
}

/// GET /admin/modules — returns all packages visible to this owner. Routed through Rust to avoid CORS.
#[tauri::command]
pub async fn fetch_marketplace_admin_list(token: String) -> Result<Vec<MarketplaceEntry>, String> {
    let res = mp_client()?
        .get(format!("{MARKETPLACE_BASE}/admin/modules"))
        .header("Authorization", format!("Bearer {token}"))
        .send().await
        .map_err(|e| format!("Admin list request failed: {e}"))?;
    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Admin list error: {body}"));
    }
    res.json::<Vec<MarketplaceEntry>>().await
        .map_err(|e| format!("Admin list parse error: {e}"))
}

/// Returns the full marketplace catalog from the live API.
/// Returns an error if the marketplace is unreachable.
#[tauri::command]
pub async fn fetch_marketplace(
    modules: State<'_, Arc<ModuleState>>,
    sort: Option<String>,
    category: Option<String>,
    q: Option<String>,
) -> Result<Vec<MarketplaceEntry>, String> {
    let installed_ids: std::collections::HashSet<String> = modules
        .list_modules().await
        .into_iter()
        .map(|m| m.id)
        .collect();

    let token: Option<String> = {
        let pool = modules.db.read().await;
        sqlx::query_scalar("SELECT value FROM kv_store WHERE key = ?")
            .bind(LICENSE_KV_KEY)
            .fetch_optional(&*pool)
            .await
            .ok()
            .flatten()
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(format!("{MARKETPLACE_BASE}/catalog"));
    if let Some(tok) = &token {
        req = req
            .header("Authorization", format!("Bearer {tok}"))
            .query(&[("_token", tok.as_str())]);
    }
    let mut query: Vec<(&str, String)> = Vec::new();
    if let Some(s) = sort.filter(|s| !s.is_empty()) { query.push(("sort", s)); }
    if let Some(c) = category.filter(|c| !c.is_empty()) { query.push(("category", c)); }
    if let Some(term) = q.filter(|q| !q.is_empty()) { query.push(("q", term)); }
    if !query.is_empty() {
        req = req.query(&query);
    }
    let resp = req.send().await
        .map_err(|e| format!("Marketplace unavailable: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Marketplace returned status {}", resp.status()));
    }
    let mut catalog: Vec<MarketplaceEntry> = resp.json().await
        .map_err(|e| format!("Marketplace response invalid: {e}"))?;

    for entry in &mut catalog {
        if installed_ids.contains(&entry.id) {
            entry.tags.push("installed".into());
        }
    }
    Ok(catalog)
}

/// Emit a structured install-progress event to the frontend.
fn emit_progress(app: &AppHandle, id: &str, state: &str, message: Option<&str>) {
    let mut v = serde_json::json!({ "id": id, "state": state });
    if let Some(msg) = message {
        v["message"] = serde_json::Value::String(msg.to_string());
    }
    app.emit("marketplace-install-progress", v).ok();
}

/// Install a module from the marketplace by catalog ID.
/// Fetches entry metadata from /catalog/{id} (fresh, single-entry), downloads
/// the release file, installs it, then records the install event on the server.
#[tauri::command]
pub async fn install_marketplace_module(
    id: String,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let token: Option<String> = {
        let pool = modules.db.read().await;
        sqlx::query_scalar("SELECT value FROM kv_store WHERE key = ?")
            .bind(LICENSE_KV_KEY)
            .fetch_optional(&*pool)
            .await
            .ok()
            .flatten()
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent(format!("GDLQBot/{APP_VERSION}"))
        .build()
        .map_err(|e| e.to_string())?;

    // Fetch just this entry from /catalog/{id} — fresh download URL, no full-catalog round-trip
    emit_progress(&app_handle, &id, "resolving", None);
    let detail_url = format!("{MARKETPLACE_BASE}/catalog/{id}");
    let mut req = client.get(&detail_url);
    if let Some(tok) = &token {
        req = req.header("Authorization", format!("Bearer {tok}"));
    }
    let resp = req.send().await
        .map_err(|e| format!("Marketplace unavailable: {e}"))?;
    if !resp.status().is_success() {
        emit_progress(&app_handle, &id, "error", Some("Package not found in marketplace"));
        return Err(format!("Package '{id}' not found in marketplace ({})", resp.status()));
    }
    let entry: MarketplaceEntry = resp.json().await
        .map_err(|e| format!("Marketplace response invalid: {e}"))?;

    // Version compatibility check
    check_version_compat(&app_handle, &entry.min_app_version)?;

    // â"€â"€ Library install path â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    // ── GitHub source: resolve and install from raw repo files ────────────────
    if entry.source_type == "github" {
        return install_from_github(&entry, &id, &modules, &app_handle, &client, token.as_deref()).await;
    }

    // Guard: direct source must have a URL
    if entry.download_url.is_empty() {
        let msg = "No download URL configured for this release";
        emit_progress(&app_handle, &id, "error", Some(msg));
        return Err(format!("Package '{id}' has no download URL — contact the package author."));
    }

    // -- Library install path
    if entry.package_type == "library" {
        let components: HashMap<String, String> = {
            emit_progress(&app_handle, &id, "downloading", Some(&format!("Downloading {}…", entry.name)));
            let resp = client.get(&entry.download_url)
                .send()
                .await
                .map_err(|e| format!("Download failed: {e}"))?;
            if !resp.status().is_success() {
                let status = resp.status();
                emit_progress(&app_handle, &id, "error", Some("Download failed"));
                return Err(format!("Download failed for '{id}': HTTP {status} from {}", entry.download_url));
            }
            let bytes = download_capped(resp).await?;
            log_download(&id, &entry.download_url, &bytes);
            verify_checksum(&bytes, &entry.checksum, &id)?;

            let manifest_val: serde_json::Value = {
                let cursor = std::io::Cursor::new(&bytes);
                let mut archive = zip::ZipArchive::new(cursor)
                    .map_err(|e| format!("Invalid .gdlib package: {e}"))?;
                let mut f = archive.by_name("manifest.json")
                    .map_err(|_| "Library package missing manifest.json".to_string())?;
                let mut s = String::new();
                f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                serde_json::from_str(&s).map_err(|e| format!("Invalid manifest.json: {e}"))?
            };

            // Supports both single 'entry' and 'components: {name: file}' formats
            let mut name_file_pairs: Vec<(String, String)> = Vec::new();
            if let Some(comps) = manifest_val.get("components").and_then(|v| v.as_object()) {
                for (name, file) in comps {
                    if let Some(f) = file.as_str() {
                        name_file_pairs.push((name.clone(), f.to_string()));
                    }
                }
            } else if let Some(entry_file) = manifest_val.get("entry").and_then(|v| v.as_str()) {
                let lib_name = manifest_val.get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&entry.id)
                    .to_string();
                name_file_pairs.push((lib_name, entry_file.to_string()));
            }

            if name_file_pairs.is_empty() {
                return Err("Library manifest has no 'entry' or 'components' field".to_string());
            }

            let mut result = HashMap::new();
            for (name, filename) in name_file_pairs {
                let cursor = std::io::Cursor::new(&bytes);
                let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
                let mut file = archive.by_name(&filename)
                    .map_err(|_| format!("Library package missing '{filename}'"))?;
                let mut src = String::new();
                file.read_to_string(&mut src).map_err(|e| e.to_string())?;
                result.insert(name, src);
            }
            result
        };

        let pool = modules.db.read().await;
        for (lib_name, source) in &components {
            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM libraries WHERE name = ?")
                .bind(lib_name)
                .fetch_one(&*pool)
                .await
                .unwrap_or(0);

            if exists == 0 {
                sqlx::query(
                    "INSERT INTO libraries (name, description, code, enabled) VALUES (?, ?, ?, 1)"
                )
                .bind(lib_name)
                .bind(format!("Part of {} package", &entry.name))
                .bind(source)
                .execute(&*pool)
                .await
                .map_err(|e| format!("Failed to install library component '{lib_name}': {e}"))?;
            }
        }

        app_handle.emit("library-updated", &id).ok();
        emit_progress(&app_handle, &id, "done", None);
        record_install(&client, &id, token.as_deref()).await;
        return Ok(());
    }

    // -- Package (.gdpck) install path: multi-library bundle
    if entry.package_type == "package" {
        emit_progress(&app_handle, &id, "downloading", Some(&format!("Downloading {}…", entry.name)));
        let resp = client.get(&entry.download_url)
            .send()
            .await
            .map_err(|e| format!("Download failed: {e}"))?;
        if !resp.status().is_success() {
            let status = resp.status();
            emit_progress(&app_handle, &id, "error", Some("Download failed"));
            return Err(format!("Download failed for '{id}': HTTP {status} from {}", entry.download_url));
        }
        let bytes = download_capped(resp).await?;
        log_download(&id, &entry.download_url, &bytes);
        verify_checksum(&bytes, &entry.checksum, &id)?;

        // Read bundle manifest to get library list
        let lib_ids: Vec<String> = {
            let cursor = std::io::Cursor::new(&bytes);
            let mut archive = zip::ZipArchive::new(cursor)
                .map_err(|e| format!("Invalid .gdpck package: {e}"))?;
            let mut f = archive.by_name("manifest.json")
                .map_err(|_| "Bundle missing manifest.json".to_string())?;
            let mut s = String::new();
            f.read_to_string(&mut s).map_err(|e| e.to_string())?;
            let v: serde_json::Value = serde_json::from_str(&s)
                .map_err(|e| format!("Invalid bundle manifest: {e}"))?;
            v.get("libraries")
                .and_then(|a| a.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default()
        };

        let installed_libs = install_gdpck_bytes_inner(&bytes, &modules, &app_handle).await?;
        let lib_ids = if installed_libs.is_empty() { lib_ids } else { installed_libs };
        {
            let pool = modules.db.read().await;
            record_installed_package(&pool, &id, &entry.version, &lib_ids).await;
        }
        emit_progress(&app_handle, &id, "done", None);
        record_install(&client, &id, token.as_deref()).await;
        return Ok(());
    }

    // â"€â"€ Module install path â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    let modules_dir = modules.modules_dir.clone();

    emit_progress(&app_handle, &id, "downloading", Some(&format!("Downloading {}…", entry.name)));
    let resp = client.get(&entry.download_url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        emit_progress(&app_handle, &id, "error", Some("Download failed"));
        return Err(format!("Download failed for '{id}': HTTP {status} from {}", entry.download_url));
    }
    let bytes = download_capped(resp).await?;
    log_download(&id, &entry.download_url, &bytes);
    verify_checksum(&bytes, &entry.checksum, &id)?;

    emit_progress(&app_handle, &id, "installing", None);
    let dest_dir = modules_dir
        .join(safe_path_component(&entry.author)?)
        .join(safe_path_component(&entry.package_type)?)
        .join(safe_path_component(&entry.id)?);
    let manifest = extract_gdmod(&bytes, &dest_dir)?;
    let manifest_json = serde_json::to_string(&manifest)
        .map_err(|e| format!("Failed to serialise manifest: {e}"))?;

    modules.install_module(&manifest_json, &entry.author, &entry.package_type).await.map_err(|e| e.to_string())?;

    // Install libraries bundled inside the module package
    if !manifest.bundle.libraries.is_empty() {
        emit_progress(&app_handle, &id, "installing", Some("Installing bundled libraries…"));
        if let Err(e) = modules.install_bundled_libraries(&manifest.id).await {
            tracing::warn!("Bundled library install warning: {e}");
        }
        app_handle.emit("library-updated", &id).ok();
    }

    app_handle.emit("module-updated", &id).ok();
    emit_progress(&app_handle, &id, "done", None);
    record_install(&client, &id, token.as_deref()).await;
    Ok(())
}

/// Install a package whose release is served via the GitHub dist tree.
///
/// Expected layout in the repo:
///   `{github_dir}/{version}/manifest.json`   ← dist manifest (written by build.py)
///   `{github_dir}/{version}/{file}`           ← built artifact (.gdmod / .gdpck)
///
/// `github_tag` may be a git tag to pin to a specific commit; when empty the
/// repo's default branch is used.
async fn install_from_github(
    entry: &MarketplaceEntry,
    id: &str,
    modules: &Arc<ModuleState>,
    app_handle: &AppHandle,
    client: &reqwest::Client,
    token: Option<&str>,
) -> Result<(), String> {
    use sha2::{Sha256, Digest};

    let repo = entry.github_repo.trim();
    let dir  = entry.github_dir.trim();
    let tag  = entry.github_tag.trim();

    if repo.is_empty() {
        emit_progress(app_handle, id, "error", Some("No GitHub repo configured"));
        return Err(format!("Package '{id}' has no GitHub repository configured"));
    }

    emit_progress(app_handle, id, "resolving", Some("Resolving from GitHub…"));

    // Resolve git ref: explicit tag → refs/tags/{tag}; else use HEAD (repo default branch).
    // Avoids an extra GitHub API round-trip and sidesteps unauthenticated rate limits.
    let gh_ref: String = if !tag.is_empty() {
        format!("refs/tags/{tag}")
    } else {
        "HEAD".to_string()
    };

    // Base URL for this version's dist directory.
    // `github_dir` is the full path to the versioned dist folder
    // (e.g. "dist/level-queue/2.0.0") — no need to append the version again.
    let dir_clean = dir.trim_matches('/');
    let version_base = if dir_clean.is_empty() {
        format!("https://raw.githubusercontent.com/{repo}/{gh_ref}/")
    } else {
        format!("https://raw.githubusercontent.com/{repo}/{gh_ref}/{dir_clean}/")
    };

    // Fetch the dist manifest — tells us the artifact filename and checksum.
    let manifest_resp = client
        .get(format!("{version_base}manifest.json"))
        .header("User-Agent", format!("GDLQBot/{APP_VERSION}"))
        .send().await
        .map_err(|e| format!("Failed to fetch dist manifest from GitHub: {e}"))?;
    if !manifest_resp.status().is_success() {
        let status = manifest_resp.status();
        emit_progress(app_handle, id, "error", Some("Dist manifest not found on GitHub"));
        return Err(format!(
            "Dist manifest not found for '{id}' ({status}). \
             Expected: {version_base}manifest.json"
        ));
    }
    let manifest_text = manifest_resp.text().await
        .map_err(|e| format!("Failed to read dist manifest body: {e}"))?;
    info!("dist manifest for '{id}' from {version_base}manifest.json: {manifest_text}");
    let dist_manifest: serde_json::Value = serde_json::from_str(&manifest_text)
        .map_err(|e| format!("Dist manifest is not valid JSON: {e}"))?;

    let file = dist_manifest["file"].as_str()
        .ok_or_else(|| format!("Dist manifest for '{id}' is missing 'file' field"))?
        .to_string();
    let pkg_type          = dist_manifest["package_type"].as_str()
        .unwrap_or(&entry.package_type)
        .to_string();
    let expected_checksum = dist_manifest["checksum"].as_str().unwrap_or("").to_string();

    // Prevent path traversal in the filename returned by the manifest.
    if file.contains('/') || file.contains("..") {
        return Err(format!("Dist manifest for '{id}' has invalid 'file' value: '{file}'"));
    }

    // Download the built artifact.
    emit_progress(app_handle, id, "downloading", Some(&format!("Downloading {}…", entry.name)));
    let artifact_resp = client
        .get(format!("{version_base}{file}"))
        .header("User-Agent", format!("GDLQBot/{APP_VERSION}"))
        .send().await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !artifact_resp.status().is_success() {
        let status = artifact_resp.status();
        emit_progress(app_handle, id, "error", Some("Artifact not found on GitHub"));
        return Err(format!(
            "Artifact '{file}' not found for '{id}' ({status}). \
             Expected: {version_base}{file}"
        ));
    }
    let bytes = download_capped(artifact_resp).await?;
    log_download(id, &format!("{version_base}{file}"), &bytes);

    // Verify SHA-256 checksum when the manifest provides one.
    if !expected_checksum.is_empty() {
        let actual = hex::encode(Sha256::digest(&bytes));
        info!("checksum '{id}': expected {expected_checksum}, computed {actual}, {} bytes hashed", bytes.len());
        if actual != expected_checksum {
            let msg = format!("Checksum mismatch for '{id}': expected {expected_checksum}, got {actual}");
            emit_progress(app_handle, id, "error", Some("Checksum mismatch"));
            return Err(msg);
        }
    }

    // Install — same paths as a direct download.
    emit_progress(app_handle, id, "installing", None);
    match pkg_type.as_str() {
        "package" => {
            let lib_ids = install_gdpck_bytes_inner(&bytes, modules, app_handle).await?;
            let pool = modules.db.read().await;
            record_installed_package(&pool, id, &entry.version, &lib_ids).await;
        }
        _ => {
            // module (libraries embedded in .gdmod are handled by extract_gdmod)
            let dest_dir = modules.modules_dir.join("marketplace").join("module").join(safe_path_component(id)?);
            let manifest = extract_gdmod(&bytes, &dest_dir)?;
            let manifest_json = serde_json::to_string(&manifest).map_err(|e| e.to_string())?;
            modules.install_module(&manifest_json, "marketplace", "module").await
                .map_err(|e| e.to_string())?;
            app_handle.emit("module-updated", id).ok();
        }
    }

    emit_progress(app_handle, id, "done", None);
    record_install(client, id, token).await;
    Ok(())
}

/// Non-fatal: record an install event on the marketplace server (for download counts).
async fn record_install(client: &reqwest::Client, id: &str, token: Option<&str>) {
    let url = format!("{MARKETPLACE_BASE}/install/{id}");
    let mut req = client.post(&url);
    if let Some(tok) = token {
        req = req.header("Authorization", format!("Bearer {tok}"));
    }
    req.send().await.ok();
}

// ── Installed-package tracking (kv_store) ────────────────────────────────────

const PKG_KV_PREFIX: &str = "pkg:installed:";

/// Write (or overwrite) the installed-package record so the frontend knows
/// which library names belong to a given package ID.
async fn record_installed_package(
    pool: &sqlx::SqlitePool,
    pkg_id: &str,
    version: &str,
    lib_ids: &[String],
) {
    let key   = format!("{PKG_KV_PREFIX}{pkg_id}");
    let value = serde_json::json!({ "version": version, "libs": lib_ids }).to_string();
    sqlx::query(
        "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(&key)
    .bind(&value)
    .execute(pool)
    .await
    .ok();
}

/// Return all package records written by `record_installed_package`.
#[tauri::command]
pub async fn get_installed_packages(
    modules: State<'_, Arc<ModuleState>>,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = modules.db.read().await;
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT key, value FROM kv_store WHERE key LIKE ?"
    )
    .bind(format!("{PKG_KV_PREFIX}%"))
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().filter_map(|(key, value)| {
        let id = key.strip_prefix(PKG_KV_PREFIX)?.to_string();
        let mut v: serde_json::Value = serde_json::from_str(&value).ok()?;
        v["id"] = serde_json::Value::String(id);
        Some(v)
    }).collect())
}

/// Preflight for an installed library-bundle package (e.g. "stdlib") — the
/// counterpart to `ModuleState::preflight` for modules. A package has no
/// commands/scripts/pages of its own to check, just a set of bundled
/// libraries (tracked via `record_installed_package` above, actual source in
/// the `libraries` table — see `install_gdpck_bytes_inner`), so this just
/// compile-checks each one instead of reusing the module-shaped checks.
pub async fn preflight_package(pool: &sqlx::SqlitePool, pkg_id: &str) -> Vec<crate::modules::PreflightIssue> {
    use crate::modules::PreflightIssue;
    use crate::scripting::engine::get_engine;

    let key = format!("{PKG_KV_PREFIX}{pkg_id}");
    let Some(value): Option<String> = sqlx::query_scalar("SELECT value FROM kv_store WHERE key = ?")
        .bind(&key).fetch_optional(pool).await.ok().flatten()
    else {
        return vec![PreflightIssue {
            severity: "error".into(), kind: "module".into(), file: None,
            message: format!("Package '{pkg_id}' not found"),
        }];
    };
    let Ok(record) = serde_json::from_str::<serde_json::Value>(&value) else {
        return vec![PreflightIssue {
            severity: "error".into(), kind: "module".into(), file: None,
            message: format!("Package '{pkg_id}' install record is corrupt"),
        }];
    };
    let lib_ids: Vec<String> = record.get("libs").and_then(|a| a.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    if lib_ids.is_empty() {
        return vec![PreflightIssue {
            severity: "warn".into(), kind: "library".into(), file: None,
            message: "Package has no bundled libraries recorded".into(),
        }];
    }

    let engine = get_engine();
    let mut issues = Vec::new();
    for lib_id in &lib_ids {
        let code: Option<String> = sqlx::query_scalar("SELECT code FROM libraries WHERE name = ?")
            .bind(lib_id).fetch_optional(pool).await.ok().flatten();
        match code {
            None => issues.push(PreflightIssue {
                severity: "error".into(), kind: "library".into(), file: Some(lib_id.clone()),
                message: format!("Library '{lib_id}' is part of this package but missing from the libraries table"),
            }),
            Some(src) => {
                if let Err(e) = engine.compile(&src) {
                    issues.push(PreflightIssue {
                        severity: "error".into(), kind: "library".into(), file: Some(lib_id.clone()),
                        message: format!("Compile error: {e}"),
                    });
                }
            }
        }
    }
    issues
}

/// Remove a previously installed package: deletes its constituent libraries
/// (those not marked is_stdlib) and removes the kv tracking record.
#[tauri::command]
pub async fn uninstall_package(
    id: String,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let pool = modules.db.read().await;
    let key  = format!("{PKG_KV_PREFIX}{id}");

    let record: Option<String> = sqlx::query_scalar(
        "SELECT value FROM kv_store WHERE key = ?"
    )
    .bind(&key)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(json) = record {
        let v: serde_json::Value = serde_json::from_str(&json)
            .map_err(|e| format!("Corrupt package record: {e}"))?;
        let lib_ids: Vec<String> = v.get("libs")
            .and_then(|a| a.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.as_str().map(String::from)).collect())
            .unwrap_or_default();

        for lib in &lib_ids {
            sqlx::query("DELETE FROM libraries WHERE name = ? AND is_stdlib = 0")
                .bind(lib)
                .execute(&*pool)
                .await
                .map_err(|e| format!("Failed to remove library '{lib}': {e}"))?;
        }
    }

    sqlx::query("DELETE FROM kv_store WHERE key = ?")
        .bind(&key)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    drop(pool);
    app_handle.emit("library-updated", &id).ok();
    Ok(())
}

// ── .gdpck installation ───────────────────────────────────────────────────────

/// Shared: install a .gdpck bundle from raw bytes.
/// Handles libraries/<id>/, modules/<id>/, and packages/<id>/ subfolders recursively.
/// Returns the list of library IDs that were installed so callers can record them.
async fn install_gdpck_bytes_inner(
    bytes: &[u8],
    modules: &Arc<ModuleState>,
    app_handle: &AppHandle,
) -> Result<Vec<String>, String> {
    // Read root manifest
    let root_manifest: serde_json::Value = {
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| format!("Invalid .gdpck package: {e}"))?;
        let mut f = archive.by_name("manifest.json")
            .map_err(|_| "Bundle missing manifest.json".to_string())?;
        let mut s = String::new();
        f.read_to_string(&mut s).map_err(|e| e.to_string())?;
        serde_json::from_str(&s).map_err(|e| format!("Invalid bundle manifest: {e}"))?
    };

    fn str_list(v: &serde_json::Value, key: &str) -> Vec<String> {
        v.get(key).and_then(|a| a.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.as_str().map(String::from)).collect())
            .unwrap_or_default()
    }

    let mut all_lib_ids: Vec<String> = Vec::new();

    // Install libraries from libraries/<lib_id>/
    let lib_ids = str_list(&root_manifest, "libraries");
    if !lib_ids.is_empty() {
        let pool = modules.db.read().await;
        for lib_id in &lib_ids {
            let lib_manifest: serde_json::Value = {
                let cursor = std::io::Cursor::new(bytes);
                let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
                let path = format!("libraries/{lib_id}/manifest.json");
                let mut f = archive.by_name(&path).map_err(|_| format!("Bundle missing {path}"))?;
                let mut s = String::new();
                f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                serde_json::from_str(&s).map_err(|e| format!("Invalid manifest for '{lib_id}': {e}"))?
            };
            let entry_file = lib_manifest.get("entry").and_then(|v| v.as_str())
                .ok_or_else(|| format!("Library '{lib_id}' missing 'entry' field"))?.to_string();
            let description = lib_manifest.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();

            let source = {
                let cursor = std::io::Cursor::new(bytes);
                let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
                let path = format!("libraries/{lib_id}/{entry_file}");
                let mut f = archive.by_name(&path).map_err(|_| format!("Bundle missing {path}"))?;
                let mut s = String::new();
                f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                s
            };

            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM libraries WHERE name = ?")
                .bind(lib_id).fetch_one(&*pool).await.unwrap_or(0);
            if exists == 0 {
                sqlx::query("INSERT INTO libraries (name, description, code, enabled) VALUES (?, ?, ?, 1)")
                    .bind(lib_id).bind(&description).bind(&source)
                    .execute(&*pool).await
                    .map_err(|e| format!("Failed to install library '{lib_id}': {e}"))?;
            } else {
                sqlx::query("UPDATE libraries SET code = ?, description = ? WHERE name = ?")
                    .bind(&source).bind(&description).bind(lib_id)
                    .execute(&*pool).await
                    .map_err(|e| format!("Failed to update library '{lib_id}': {e}"))?;
            }
        }
        all_lib_ids.extend(lib_ids.iter().cloned());
        app_handle.emit("library-updated", ()).ok();
    }

    // Install modules from modules/<mod_id>/
    let mod_ids = str_list(&root_manifest, "modules");
    for mod_id in &mod_ids {
        let mod_manifest_str = read_bundled_module_manifest(bytes, mod_id)?;
        let mod_manifest: ModuleManifest = serde_json::from_str(&mod_manifest_str)
            .map_err(|e| format!("Invalid module manifest for '{mod_id}': {e}"))?;

        // Extract module files to disk
        let dest_dir = modules.modules_dir.join("marketplace").join("module").join(safe_path_component(mod_id)?);
        std::fs::create_dir_all(&dest_dir).map_err(|e| format!("Could not create dir: {e}"))?;
        std::fs::write(dest_dir.join("manifest.json"), &mod_manifest_str)
            .map_err(|e| format!("Failed to write manifest: {e}"))?;

        // Extract scripts/, ui/, and resources/ sub-folders
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
        let mod_prefix = format!("modules/{mod_id}/");
        let allowed_prefixes = ["scripts/", "ui/", "resources/"];
        let names: Vec<String> = (0..archive.len())
            .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
            .filter(|n| {
                if !n.starts_with(&mod_prefix) || n.ends_with('/') { return false; }
                let rel = &n[mod_prefix.len()..];
                allowed_prefixes.iter().any(|p| rel.starts_with(p))
            })
            .collect();
        if names.len() > MAX_ZIP_ENTRIES {
            return Err(format!("Module '{mod_id}' has too many files ({}, max {MAX_ZIP_ENTRIES})", names.len()));
        }
        for name in names {
            let mut archive2 = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
            let mut f = archive2.by_name(&name).map_err(|e| e.to_string())?;
            let rel = name.trim_start_matches(&mod_prefix);
            let dest = dest_dir.join(rel);
            if let Some(p) = dest.parent() { std::fs::create_dir_all(p).ok(); }
            let buf = read_zip_entry_capped(&mut f, &name)?;
            std::fs::write(&dest, &buf).map_err(|e| format!("Failed to write {rel}: {e}"))?;
        }

        let final_json = serde_json::to_string(&mod_manifest).map_err(|e| e.to_string())?;
        modules.install_module(&final_json, "marketplace", "module").await.map_err(|e| e.to_string())?;
        app_handle.emit("module-updated", mod_id).ok();
    }

    // Nested packages — recurse by building sub-bytes from the zip entries
    // (simple: re-open parent archive and extract nested .gdpck on-the-fly isn't possible,
    //  so for now nested packages are flattened: their libraries/modules are installed directly)
    let pkg_ids = str_list(&root_manifest, "packages");
    for pkg_id in &pkg_ids {
        // Extract nested manifest
        let nested_manifest: serde_json::Value = {
            let cursor = std::io::Cursor::new(bytes);
            let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
            let path = format!("packages/{pkg_id}/manifest.json");
            let mut f = archive.by_name(&path).map_err(|_| format!("Bundle missing {path}"))?;
            let mut s = String::new();
            f.read_to_string(&mut s).map_err(|e| e.to_string())?;
            serde_json::from_str(&s).map_err(|e| format!("Invalid nested manifest '{pkg_id}': {e}"))?
        };
        // Install nested libraries (at packages/<pkg_id>/libraries/<lib_id>/)
        let nested_libs = str_list(&nested_manifest, "libraries");
        if !nested_libs.is_empty() {
            let pool = modules.db.read().await;
            for lib_id in &nested_libs {
                let lib_m: serde_json::Value = {
                    let cursor = std::io::Cursor::new(bytes);
                    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
                    let path = format!("packages/{pkg_id}/libraries/{lib_id}/manifest.json");
                    let mut f = archive.by_name(&path).map_err(|_| format!("Bundle missing {path}"))?;
                    let mut s = String::new();
                    f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                    serde_json::from_str(&s).map_err(|e| e.to_string())?
                };
                let entry_file = lib_m.get("entry").and_then(|v| v.as_str())
                    .ok_or_else(|| format!("Nested library '{lib_id}' missing 'entry'"))?.to_string();
                let description = lib_m.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let source = {
                    let cursor = std::io::Cursor::new(bytes);
                    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
                    let path = format!("packages/{pkg_id}/libraries/{lib_id}/{entry_file}");
                    let mut f = archive.by_name(&path).map_err(|_| format!("Bundle missing {path}"))?;
                    let mut s = String::new();
                    f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                    s
                };
                let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM libraries WHERE name = ?")
                    .bind(lib_id).fetch_one(&*pool).await.unwrap_or(0);
                if exists == 0 {
                    sqlx::query("INSERT INTO libraries (name, description, code, enabled) VALUES (?, ?, ?, 1)")
                        .bind(lib_id).bind(&description).bind(&source)
                        .execute(&*pool).await
                        .map_err(|e| format!("Failed to install nested library '{lib_id}': {e}"))?;
                } else {
                    sqlx::query("UPDATE libraries SET code = ?, description = ? WHERE name = ?")
                        .bind(&source).bind(&description).bind(lib_id)
                        .execute(&*pool).await
                        .map_err(|e| format!("Failed to update nested library '{lib_id}': {e}"))?;
                }
            }
            all_lib_ids.extend(nested_libs.iter().cloned());
            app_handle.emit("library-updated", ()).ok();
        }
    }

    Ok(all_lib_ids)
}

// ── File-association open flow (in-app confirmation) ─────────────────────────
//
// A .gdmod/.gdpck/.gdlib file opened via the OS file association is queued in
// PendingOpenedFile (lib.rs) rather than acted on immediately — see that
// type's doc comment for why. The frontend calls peek_pending_opened_file on
// mount and on the "opened-file-pending" event; if it returns Ready, the
// frontend shows an in-app confirmation modal with this info before calling
// install_pending_opened_file.

#[derive(Serialize)]
#[serde(tag = "status")]
pub enum PendingFileInfo {
    NotSupported,
    Ready {
        path: String,
        name: String,
        id: String,
        version: String,
        author: String,
        package_type: String,
        description: String,
    },
}

/// Takes the queued opened-file path (if any) and, when developer options are
/// enabled, peeks its manifest for a confirmation summary. Returns `None`
/// when nothing is queued — callers should treat that as "do nothing", not
/// an error. Errors here mean a file *was* queued but wasn't readable/valid;
/// the frontend surfaces those distinctly from `NotSupported`.
#[tauri::command]
pub async fn peek_pending_opened_file(
    app_handle: AppHandle,
    pending: State<'_, Arc<crate::PendingOpenedFile>>,
) -> Result<Option<PendingFileInfo>, String> {
    let path = pending.0.lock().await.take();
    let Some(path) = path else { return Ok(None) };

    if !crate::commands::install_info::is_dev_install(app_handle) {
        return Ok(Some(PendingFileInfo::NotSupported));
    }

    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read file: {e}"))?;
    let manifest_str = read_root_manifest_str(&bytes)?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_str)
        .map_err(|e| format!("Invalid manifest.json: {e}"))?;

    let get = |k: &str, default: &str| manifest.get(k).and_then(|v| v.as_str()).unwrap_or(default).to_string();
    Ok(Some(PendingFileInfo::Ready {
        path: path.to_string_lossy().into_owned(),
        name: get("name", "(unnamed)"),
        id: get("id", "?"),
        version: get("version", "?"),
        author: get("author", ""),
        package_type: get("package_type", "module"),
        description: get("description", ""),
    }))
}

/// Installs a package the user confirmed via the modal above.
#[tauri::command]
pub async fn install_pending_opened_file(
    path: String,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read file: {e}"))?;
    install_local_package_inner(bytes, modules.inner(), &app_handle).await
}

/// Install a local package file (.gdmod, .gdlib, or .gdpck) from bytes read by the frontend.
/// Auto-detects the package type from manifest.json inside the archive.
#[tauri::command]
pub async fn install_local_package(
    bytes: Vec<u8>,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    install_local_package_inner(bytes, modules.inner(), &app_handle).await
}

/// Shared implementation used by both the Tauri command above and the
/// file-association open handler in lib.rs.
pub async fn install_local_package_inner(
    bytes: Vec<u8>,
    modules: &Arc<ModuleState>,
    app_handle: &AppHandle,
) -> Result<(), String> {
    let root_manifest: serde_json::Value = {
        let manifest_str = read_root_manifest_str(&bytes)?;
        serde_json::from_str(&manifest_str).map_err(|e| format!("Invalid manifest.json: {e}"))?
    };

    let pkg_type = root_manifest.get("package_type").and_then(|v| v.as_str()).unwrap_or("module");
    let min_ver = root_manifest.get("min_app_version").and_then(|v| v.as_str()).unwrap_or("0.0.1");
    check_version_compat(app_handle, min_ver)?;

    match pkg_type {
        "library" => {
            // Reuse library install logic from install_marketplace_module
            let manifest_str = serde_json::to_string(&root_manifest).unwrap();
            let manifest_val = &root_manifest;
            let lib_id = manifest_val.get("id").and_then(|v| v.as_str())
                .ok_or("Library manifest missing 'id'")?;
            let entry_file = manifest_val.get("entry").and_then(|v| v.as_str())
                .ok_or("Library manifest missing 'entry'")?;
            let description = manifest_val.get("description").and_then(|v| v.as_str()).unwrap_or("");

            let source = {
                let cursor = std::io::Cursor::new(&bytes);
                let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
                let mut f = archive.by_name(entry_file)
                    .map_err(|_| format!("Library missing entry file '{entry_file}'"))?;
                let mut s = String::new();
                f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                s
            };
            let _ = manifest_str;

            let pool = modules.db.read().await;
            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM libraries WHERE name = ?")
                .bind(lib_id).fetch_one(&*pool).await.unwrap_or(0);
            if exists == 0 {
                sqlx::query("INSERT INTO libraries (name, description, code, enabled) VALUES (?, ?, ?, 1)")
                    .bind(lib_id).bind(description).bind(&source)
                    .execute(&*pool).await
                    .map_err(|e| format!("Failed to install library: {e}"))?;
            } else {
                sqlx::query("UPDATE libraries SET code = ?, description = ? WHERE name = ?")
                    .bind(&source).bind(description).bind(lib_id)
                    .execute(&*pool).await
                    .map_err(|e| format!("Failed to update library: {e}"))?;
            }
            app_handle.emit("library-updated", lib_id).ok();
        }
        "package" => {
            install_gdpck_bytes_inner(&bytes, modules, app_handle).await?;
            // Local packages aren't tracked in installed_packages (no catalog ID available).
        }
        _ => {
            // module
            let id = root_manifest.get("id").and_then(|v| v.as_str())
                .ok_or("Module manifest missing 'id'")?.to_string();
            let typed: ModuleManifest = serde_json::from_value(root_manifest)
                .map_err(|e| format!("Invalid module manifest: {e}"))?;
            let dest_dir = modules.modules_dir.join("local").join("module").join(safe_path_component(&id)?);
            extract_gdmod(&bytes, &dest_dir)?;
            let final_json = serde_json::to_string(&typed).map_err(|e| e.to_string())?;
            modules.install_module(&final_json, "local", "module").await.map_err(|e| e.to_string())?;
            app_handle.emit("module-updated", &id).ok();
        }
    }
    Ok(())
}

/// Install a module from a local .gdmod file (already read as bytes by the frontend).
#[tauri::command]
pub async fn install_gdmod_bytes(
    bytes: Vec<u8>,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    // Peek at manifest to get the id first
    let manifest_json = read_root_manifest_str(&bytes)?;

    let manifest: serde_json::Value = serde_json::from_str(&manifest_json)
        .map_err(|e| format!("Invalid manifest.json: {e}"))?;

    let id = manifest.get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "manifest.json missing 'id' field".to_string())?
        .to_string();

    let min_ver = manifest.get("min_app_version")
        .and_then(|v| v.as_str())
        .unwrap_or("0.0.1");
    check_version_compat(&app_handle, min_ver)?;

    let typed: ModuleManifest = serde_json::from_str(&manifest_json)
        .map_err(|e| format!("Invalid manifest.json: {e}"))?;

    let dest_dir = modules.modules_dir.join("local").join("module").join(safe_path_component(&id)?);
    extract_gdmod(&bytes, &dest_dir)?;

    let final_json = serde_json::to_string(&typed)
        .map_err(|e| format!("Failed to serialise manifest: {e}"))?;

    modules.install_module(&final_json, "local", "module").await.map_err(|e| e.to_string())?;
    if let Err(e) = modules.install_bundled_libraries(&id).await {
        tracing::warn!("Bundled library install warning: {e}");
    }
    app_handle.emit("module-updated", &id).ok();
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn copy_dir_recursive(src: &std::path::Path, dest: &std::path::Path) -> std::io::Result<()> {
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if src_path.is_dir() {
            std::fs::create_dir_all(&dest_path)?;
            copy_dir_recursive(&src_path, &dest_path)?;
        } else {
            std::fs::copy(&src_path, &dest_path)?;
        }
    }
    Ok(())
}

// â"€â"€ Developer tools â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/// Install (or refresh) a library-bundle package from a local source
/// directory — the directory-based equivalent of `install_gdpck_bytes_inner`
/// for the "package" manifest shape (`libraries: [...]`, no scripts/pages of
/// its own). A package has no files copied anywhere on disk; each declared
/// library's source is upserted straight into the `libraries` DB table —
/// see that function's doc comment for why that alone is sufficient
/// (`load_stdlib_from_db` re-reads it fresh on every script execution, no
/// separate "recompile"/"register" step needed). Nested `packages: [...]`
/// bundles aren't supported here (only top-level `libraries`) — dev-watching
/// a nested bundle is a rare enough case not worth the extra complexity this
/// pass; `install_gdpck_bytes_inner` still handles it for real installs.
pub async fn install_package_from_dir_inner(
    source_dir: &str,
    manifest: &serde_json::Value,
    modules: &Arc<ModuleState>,
    app_handle: &AppHandle,
) -> Result<String, String> {
    let src = PathBuf::from(source_dir);
    let pkg_id = manifest.get("id").and_then(|v| v.as_str())
        .ok_or_else(|| "manifest.json missing 'id' field".to_string())?.to_string();
    let version = manifest.get("version").and_then(|v| v.as_str()).unwrap_or("0.0.0").to_string();
    let lib_ids: Vec<String> = manifest.get("libraries").and_then(|a| a.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    {
        let pool = modules.db.read().await;
        for lib_id in &lib_ids {
            let lib_dir = src.join("libraries").join(lib_id);
            let lib_manifest_json = std::fs::read_to_string(lib_dir.join("manifest.json"))
                .map_err(|e| format!("Library '{lib_id}': failed to read manifest.json: {e}"))?;
            let lib_manifest: serde_json::Value = serde_json::from_str(&lib_manifest_json)
                .map_err(|e| format!("Library '{lib_id}': invalid manifest.json: {e}"))?;
            let entry_file = lib_manifest.get("entry").and_then(|v| v.as_str())
                .ok_or_else(|| format!("Library '{lib_id}' missing 'entry' field"))?.to_string();
            let description = lib_manifest.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let source = std::fs::read_to_string(lib_dir.join(&entry_file))
                .map_err(|e| format!("Library '{lib_id}': failed to read {entry_file}: {e}"))?;

            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM libraries WHERE name = ?")
                .bind(lib_id).fetch_one(&*pool).await.unwrap_or(0);
            if exists == 0 {
                sqlx::query("INSERT INTO libraries (name, description, code, enabled) VALUES (?, ?, ?, 1)")
                    .bind(lib_id).bind(&description).bind(&source)
                    .execute(&*pool).await
                    .map_err(|e| format!("Failed to install library '{lib_id}': {e}"))?;
            } else {
                sqlx::query("UPDATE libraries SET code = ?, description = ? WHERE name = ?")
                    .bind(&source).bind(&description).bind(lib_id)
                    .execute(&*pool).await
                    .map_err(|e| format!("Failed to update library '{lib_id}': {e}"))?;
            }
        }
        record_installed_package(&pool, &pkg_id, &version, &lib_ids).await;
    }

    app_handle.emit("library-updated", &pkg_id).ok();
    Ok(pkg_id)
}

/// Install a module (or library-bundle package) from a local source
/// directory (no zip required). Reads manifest.json and dispatches on its
/// `package_type` — modules get their scripts/ui/resources copied into the
/// app's modules directory; packages just get their libraries upserted into
/// the DB (see `install_package_from_dir_inner`). Intended for development
/// workflows where you edit files in your source tree. Returns the
/// installed module/package ID.
#[tauri::command]
pub async fn install_module_from_dir(
    source_dir: String,
    modules: State<'_, Arc<ModuleState>>,
    queue: State<'_, Arc<QueueState>>,
    app_handle: AppHandle,
) -> Result<String, String> {
    install_module_from_dir_inner(&source_dir, modules.inner(), queue.inner(), &app_handle).await
}

/// Shared implementation used by both the Tauri command and the dev HTTP API.
pub async fn install_module_from_dir_inner(
    source_dir: &str,
    modules: &Arc<ModuleState>,
    queue: &Arc<QueueState>,
    app_handle: &AppHandle,
) -> Result<String, String> {
    let src = PathBuf::from(source_dir);
    let manifest_path = src.join("manifest.json");
    if !manifest_path.exists() {
        return Err(format!("No manifest.json found in {source_dir}"));
    }

    let manifest_json = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest.json: {e}"))?;

    // Packages (library bundles) are a completely different shape from
    // modules — no commands/scripts/pages, just a `libraries` list — and
    // install into a different place entirely (the `libraries` DB table via
    // kv_store tracking, not the modules table). Peek at package_type before
    // committing to the ModuleManifest shape below.
    let raw: serde_json::Value = serde_json::from_str(&manifest_json)
        .map_err(|e| format!("Invalid manifest.json: {e}"))?;
    if raw.get("package_type").and_then(|v| v.as_str()) == Some("package") {
        return install_package_from_dir_inner(source_dir, &raw, modules, app_handle).await;
    }

    let manifest: ModuleManifest = serde_json::from_str(&manifest_json)
        .map_err(|e| format!("Invalid manifest.json: {e}"))?;

    check_version_compat(app_handle, &manifest.min_app_version)?;

    sync_module_dir_to_dest(&src, &modules.modules_dir.join("local").join("module").join(safe_path_component(&manifest.id)?))
        .map_err(|e| format!("Failed to sync module files: {e}"))?;

    modules.install_module(&manifest_json, "local", "module").await.map_err(|e| e.to_string())?;
    if let Err(e) = modules.install_bundled_libraries(&manifest.id).await {
        tracing::warn!("Bundled library install warning: {e}");
    }
    app_handle.emit("library-updated", &manifest.id).ok();
    app_handle.emit("module-updated", &manifest.id).ok();
    let mid = manifest.id.clone();
    let mods = Arc::clone(modules);
    let q    = Arc::clone(queue);
    let ah   = app_handle.clone();
    tokio::spawn(async move {
        super::modules::run_scripts_preflight(&mid, &mods, &q, ah).await;
    });
    Ok(manifest.id)
}

/// Fully wipe the installed copy of a local/dev module and reinstall it fresh
/// from `source_dir` — unlike the normal sync (used by `install_module_from_dir`
/// and the dev-watch loop), which only ever adds/overwrites files, this also
/// removes anything in the installed copy that no longer exists in source
/// (a renamed/deleted script, say) instead of leaving it to linger forever.
///
/// Doesn't touch `bot_commands` — `install_module` upserts the manifest but
/// never deletes command rows, so trigger/alias/listener customizations a
/// user made on this module's commands survive a refresh.
#[tauri::command]
pub async fn hard_refresh_module(
    source_dir: String,
    modules:    State<'_, Arc<ModuleState>>,
    queue:      State<'_, Arc<QueueState>>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let src = PathBuf::from(&source_dir);
    let manifest_path = src.join("manifest.json");
    if !manifest_path.exists() {
        return Err(format!("No manifest.json found in {source_dir}"));
    }
    let manifest_json = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest.json: {e}"))?;

    // Packages have no on-disk install directory to wipe — their content is
    // just DB rows in `libraries`, which install_package_from_dir_inner's
    // UPDATE already fully overwrites. "Hard refresh" and "normal reinstall"
    // are the same operation for a package.
    let raw: serde_json::Value = serde_json::from_str(&manifest_json)
        .map_err(|e| format!("Invalid manifest.json: {e}"))?;
    if raw.get("package_type").and_then(|v| v.as_str()) == Some("package") {
        return install_package_from_dir_inner(&source_dir, &raw, modules.inner(), &app_handle).await;
    }

    let manifest: ModuleManifest = serde_json::from_str(&manifest_json)
        .map_err(|e| format!("Invalid manifest.json: {e}"))?;

    // Wherever this module is ACTUALLY installed right now — not a hardcoded
    // "local/module" guess. If it was ever installed some other way (seeded
    // as a bundled/official module, installed from the marketplace, etc.),
    // that guess would silently wipe+rebuild a phantom directory the running
    // bot never reads from, while the real stale copy sat untouched. This is
    // almost certainly why "hard refresh" didn't fix the stale-script reports.
    let dest = modules.module_dir(&manifest.id).await;
    if dest.exists() {
        std::fs::remove_dir_all(&dest).map_err(|e| format!("Failed to remove old install: {e}"))?;
    }

    // install_module_from_dir_inner writes the fresh copy to "local/module/<id>"
    // and repoints the DB row's author/package_type to match in the same call,
    // so this is self-consistent afterward even if the old install lived
    // somewhere else — module_dir() will resolve there from now on.
    install_module_from_dir_inner(&source_dir, modules.inner(), queue.inner(), &app_handle).await
}

/// Copy all known module sub-directories from `src` into `dest`, creating dirs as needed.
fn sync_module_dir_to_dest(src: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;
    // Always copy manifest
    let mp = src.join("manifest.json");
    if mp.exists() { std::fs::copy(&mp, dest.join("manifest.json"))?; }
    // Sub-directories to mirror
    for sub in &["scripts", "ui", "resources", "libraries"] {
        let sub_src = src.join(sub);
        if !sub_src.is_dir() { continue; }
        let sub_dest = dest.join(sub);
        std::fs::create_dir_all(&sub_dest)?;
        copy_dir_recursive(&sub_src, &sub_dest)?;
    }
    Ok(())
}

/// Start watching a local module source directory for file changes and
/// hot-reload the installed module whenever a file is saved.
///
/// - `.rhai` / `manifest.json` changes → re-registers scripts + emits `module-updated`
/// - `libraries/` changes → re-installs bundled libraries + emits `library-updated`
/// - Any change → emits `module-dev-reloaded` so the UI can show a refresh indicator
///
/// Only one watcher per module_id can be active at a time; starting a new one
/// automatically stops any existing watcher for the same module.
#[tauri::command]
pub async fn start_module_dev_watch(
    module_id: String,
    source_dir: String,
    modules: State<'_, Arc<ModuleState>>,
    registry: State<'_, Arc<DevWatchRegistry>>,
    queue: State<'_, Arc<QueueState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let src = PathBuf::from(&source_dir);
    if !src.is_dir() {
        return Err(format!("Source directory not found: {source_dir}"));
    }

    // Packages (library bundles, e.g. "stdlib") have no on-disk install
    // directory at all — their content lives purely as DB rows — so the
    // watch loop needs an entirely different reload strategy than modules.
    // Peeked once at watch-start; package_type doesn't change on a live watch.
    let is_package = std::fs::read_to_string(src.join("manifest.json")).ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("package_type").and_then(|t| t.as_str()).map(String::from))
        .as_deref() == Some("package");
    let dest_dir = if is_package { PathBuf::new() } else { modules.module_dir(&module_id).await };
    let modules_arc = Arc::clone(modules.inner());
    let queue_arc   = Arc::clone(queue.inner());
    let handle = app_handle.clone();
    let id = module_id.clone();
    let src_clone = src.clone();

    // Abort any existing watcher for this module
    {
        let mut inner = registry.inner.lock().await;
        if let Some(old) = inner.remove(&module_id) {
            old.handle.abort();
        }
    }

    let task_handle = tokio::spawn(async move {
        if is_package {
            package_dev_watch_loop(id, src_clone, modules_arc, handle).await;
        } else {
            dev_watch_loop(id, src_clone, dest_dir, modules_arc, queue_arc, handle).await;
        }
    });

    {
        let mut inner = registry.inner.lock().await;
        inner.insert(module_id.clone(), WatchEntry { source_dir: source_dir.clone(), handle: task_handle });
    }

    // Persist the watch so it survives app restarts
    let pool = queue.db.read().await.clone();
    sqlx::query("INSERT OR REPLACE INTO dev_watches (module_id, source_dir) VALUES (?, ?)")
        .bind(&module_id)
        .bind(&source_dir)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to persist dev watch: {e}"))?;

    Ok(())
}

/// Stop watching the given module and remove it from the registry and DB.
#[tauri::command]
pub async fn stop_module_dev_watch(
    module_id: String,
    registry: State<'_, Arc<DevWatchRegistry>>,
    queue: State<'_, Arc<QueueState>>,
) -> Result<(), String> {
    {
        let mut inner = registry.inner.lock().await;
        if let Some(entry) = inner.remove(&module_id) {
            entry.handle.abort();
        }
    }
    let pool = queue.db.read().await.clone();
    sqlx::query("DELETE FROM dev_watches WHERE module_id = ?")
        .bind(&module_id)
        .execute(&pool)
        .await
        .ok();
    Ok(())
}

/// Restore all persisted dev watches from DB on startup. Call this once from the frontend.
#[tauri::command]
pub async fn restore_dev_watches(
    modules: State<'_, Arc<ModuleState>>,
    registry: State<'_, Arc<DevWatchRegistry>>,
    queue: State<'_, Arc<QueueState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let pool = queue.db.read().await.clone();
    let rows: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
        "SELECT module_id, source_dir FROM dev_watches"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    for (module_id, source_dir) in rows {
        let src = PathBuf::from(&source_dir);
        if !src.is_dir() {
            // Source dir gone — clean up the DB entry
            sqlx::query("DELETE FROM dev_watches WHERE module_id = ?")
                .bind(&module_id)
                .execute(&pool)
                .await
                .ok();
            continue;
        }

        let dest_dir = modules.module_dir(&module_id).await;
        let modules_arc = Arc::clone(modules.inner());
        let queue_arc   = Arc::clone(queue.inner());
        let handle = app_handle.clone();
        let id = module_id.clone();
        let src_clone = src.clone();

        let task_handle = tokio::spawn(async move {
            dev_watch_loop(id, src_clone, dest_dir, modules_arc, queue_arc, handle).await;
        });

        let mut inner = registry.inner.lock().await;
        inner.insert(module_id, WatchEntry { source_dir, handle: task_handle });
    }
    Ok(())
}

/// List all currently active (not yet stopped or aborted) dev watches.
#[tauri::command]
pub async fn list_dev_watches(
    registry: State<'_, Arc<DevWatchRegistry>>,
) -> Result<Vec<serde_json::Value>, String> {
    let mut inner = registry.inner.lock().await;
    // Clean up any tasks that finished on their own
    inner.retain(|_, e| !e.handle.is_finished());
    Ok(inner.iter().map(|(id, e)| serde_json::json!({
        "module_id":  id,
        "source_dir": e.source_dir,
    })).collect())
}

// ── Dev watcher internals ─────────────────────────────────────────────────────

/// Background task: polls `src` every 600 ms and syncs changed files to `dest`.
async fn dev_watch_loop(
    module_id: String,
    src: PathBuf,
    dest: PathBuf,
    modules: Arc<ModuleState>,
    queue: Arc<QueueState>,
    handle: AppHandle,
) {
    let mut mtimes: HashMap<PathBuf, std::time::SystemTime> = HashMap::new();

    // Initial: full sync + reinstall so the installed copy is always up to date on watch start
    collect_mtimes(&src, &mut mtimes);
    let _ = sync_module_dir_to_dest(&src, &dest);
    {
        let manifest_path = dest.join("manifest.json");
        if let Ok(json) = std::fs::read_to_string(&manifest_path) {
            if let Ok(manifest) = serde_json::from_str::<ModuleManifest>(&json) {
                let _ = modules.install_module(&json, "local", "module").await;
                let _ = modules.install_bundled_libraries(&manifest.id).await;
                handle.emit("library-updated", &manifest.id).ok();
            }
        }
        handle.emit("module-updated", &module_id).ok();
        // Run scripts as preflight on initial watch start — errors go to debug console
        super::modules::run_scripts_preflight(&module_id, &modules, &queue, handle.clone()).await;
    }

    loop {
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;

        let changed = detect_changes(&src, &mut mtimes);
        if changed.is_empty() {
            continue;
        }

        // Copy only the changed files to dest
        for path in &changed {
            if let Ok(rel) = path.strip_prefix(&src) {
                let dest_path = dest.join(rel);
                if let Some(p) = dest_path.parent() { std::fs::create_dir_all(p).ok(); }
                std::fs::copy(path, &dest_path).ok();
            }
        }

        let needs_reinstall = changed.iter().any(|p| {
            p.file_name().map(|n| n == "manifest.json").unwrap_or(false)
                || p.extension().map(|e| e == "rhai").unwrap_or(false)
        });
        let libs_changed = changed.iter().any(|p| {
            p.components().any(|c| c.as_os_str() == "libraries")
        });

        if needs_reinstall {
            let manifest_path = dest.join("manifest.json");
            if let Ok(json) = std::fs::read_to_string(&manifest_path) {
                if let Ok(manifest) = serde_json::from_str::<ModuleManifest>(&json) {
                    let _ = modules.install_module(&json, "local", "module").await;
                    if libs_changed {
                        let _ = modules.install_bundled_libraries(&manifest.id).await;
                        handle.emit("library-updated", &module_id).ok();
                    }
                }
            }
            handle.emit("module-updated", &module_id).ok();
        } else if libs_changed {
            let manifest_path = dest.join("manifest.json");
            if let Ok(json) = std::fs::read_to_string(&manifest_path) {
                if let Ok(manifest) = serde_json::from_str::<ModuleManifest>(&json) {
                    let _ = modules.install_bundled_libraries(&manifest.id).await;
                }
            }
            handle.emit("library-updated", &module_id).ok();
        }

        handle.emit("module-dev-reloaded", serde_json::json!({
            "module_id": &module_id,
            "files": changed.iter().filter_map(|p| p.file_name()?.to_str()).collect::<Vec<_>>(),
        })).ok();

        // Re-run preflight after every hot-reload — only emits if there are errors
        super::modules::run_scripts_preflight(&module_id, &modules, &queue, handle.clone()).await;
    }
}

/// Package equivalent of `dev_watch_loop` — packages have no on-disk install
/// directory or scripts/pages to run preflight against, just a `libraries`
/// list that gets upserted into the DB. Any change anywhere under `src`
/// (manifest.json or a library's .rhai) just re-runs the full package
/// install, which is cheap (a handful of DB upserts, no file I/O beyond
/// reading the source itself).
async fn package_dev_watch_loop(
    pkg_id: String,
    src: PathBuf,
    modules: Arc<ModuleState>,
    handle: AppHandle,
) {
    let mut mtimes: HashMap<PathBuf, std::time::SystemTime> = HashMap::new();
    collect_mtimes(&src, &mut mtimes);

    let reinstall = |handle: AppHandle, modules: Arc<ModuleState>, src: PathBuf, pkg_id: String| async move {
        let Ok(json) = std::fs::read_to_string(src.join("manifest.json")) else { return };
        let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&json) else { return };
        match install_package_from_dir_inner(&src.to_string_lossy(), &manifest, &modules, &handle).await {
            Ok(_) => {
                handle.emit("module-dev-reloaded", serde_json::json!({
                    "module_id": &pkg_id,
                    "files": Vec::<String>::new(),
                })).ok();
            }
            Err(e) => tracing::warn!("Package dev-watch reinstall failed for '{pkg_id}': {e}"),
        }
    };

    // Initial: reinstall so the DB copy is up to date the moment the watch starts.
    reinstall(handle.clone(), Arc::clone(&modules), src.clone(), pkg_id.clone()).await;

    loop {
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;
        let changed = detect_changes(&src, &mut mtimes);
        if changed.is_empty() {
            continue;
        }
        reinstall(handle.clone(), Arc::clone(&modules), src.clone(), pkg_id.clone()).await;
    }
}

/// Walk `src` recursively and snapshot all file mtimes into `map`.
fn collect_mtimes(src: &Path, map: &mut HashMap<PathBuf, std::time::SystemTime>) {
    if let Ok(entries) = std::fs::read_dir(src) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_mtimes(&path, map);
            } else if let Ok(mtime) = path.metadata().and_then(|m| m.modified()) {
                map.insert(path, mtime);
            }
        }
    }
}

/// Compare current mtimes against `map`, update the map for changed files, return changed paths.
fn detect_changes(
    src: &Path,
    map: &mut HashMap<PathBuf, std::time::SystemTime>,
) -> Vec<PathBuf> {
    let mut changed = Vec::new();
    let mut current: HashMap<PathBuf, std::time::SystemTime> = HashMap::new();
    collect_mtimes(src, &mut current);

    for (path, mtime) in &current {
        if map.get(path) != Some(mtime) {
            changed.push(path.clone());
            map.insert(path.clone(), *mtime);
        }
    }
    changed
}
