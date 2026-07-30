use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, bail, Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::collections::HashMap;

const LOGIN_URL: &str       = "http://www.boomlings.com/database/accounts/loginGJAccount.php";
const USER_INFO_URL: &str   = "http://www.boomlings.com/database/getGJUserInfo20.php";
const LOGIN_SECRET: &str    = "Wmfv3899gc9";
const COMMON_SECRET: &str   = "Wmfd2893gb7";
const GJP2_SALT: &str       = "mI29fmAnxgTs";
const APP_KEY_SALT: &[u8]   = b"gdlqbot-gd-creds-v1";
const GDICON_BASE: &str     = "https://gdicon.oat.zone/icon.png";

// ─── GJP2 ────────────────────────────────────────────────────────────────────

/// GJP2 = lowercase hex(SHA1(password + GJP2_SALT))
pub fn compute_gjp2(password: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(password.as_bytes());
    hasher.update(GJP2_SALT.as_bytes());
    hex::encode(hasher.finalize())
}

// ─── Encryption ──────────────────────────────────────────────────────────────

fn derive_key() -> [u8; 32] {
    let guid = machine_guid();
    let mut hasher = Sha256::new();
    hasher.update(guid.as_bytes());
    hasher.update(APP_KEY_SALT);
    hasher.finalize().into()
}

/// On Windows: MachineGuid from HKLM\SOFTWARE\Microsoft\Cryptography.
/// Fallback: COMPUTERNAME env var.
pub fn machine_guid() -> String {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if let Ok(out) = std::process::Command::new("reg")
            .args(["query", r"HKLM\SOFTWARE\Microsoft\Cryptography", "/v", "MachineGuid"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                let line = line.trim();
                if line.contains("REG_SZ") {
                    if let Some(guid) = line.split_whitespace().last() {
                        if !guid.is_empty() { return guid.to_string(); }
                    }
                }
            }
        }
        std::env::var("COMPUTERNAME").unwrap_or_else(|_| "gdlqbot-fallback".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::fs::read_to_string("/etc/machine-id")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                std::env::var("HOSTNAME").unwrap_or_else(|_| "gdlqbot-fallback".to_string())
            })
    }
}

/// Returns base64(12-byte-nonce || AES-256-GCM ciphertext+tag).
pub fn encrypt_gjp2(gjp2: &str) -> Result<String> {
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key).context("failed to build cipher")?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, gjp2.as_bytes())
        .map_err(|e| anyhow!("encryption failed: {e}"))?;
    let mut blob = nonce.to_vec();
    blob.extend_from_slice(&ciphertext);
    Ok(STANDARD.encode(&blob))
}

pub fn decrypt_gjp2(encoded: &str) -> Result<String> {
    let blob = STANDARD.decode(encoded).context("base64 decode failed")?;
    if blob.len() < 12 { bail!("encrypted blob too short"); }
    let (nonce_bytes, ct) = blob.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key).context("failed to build cipher")?;
    let plaintext = cipher
        .decrypt(nonce, ct)
        .map_err(|e| anyhow!("decryption failed — wrong machine or corrupt data: {e}"))?;
    String::from_utf8(plaintext).context("decrypted bytes are not valid UTF-8")
}

// ─── GD response parser ───────────────────────────────────────────────────────

fn parse_kv(s: &str) -> HashMap<&str, &str> {
    let parts: Vec<&str> = s.split(':').collect();
    let mut map = HashMap::new();
    let mut i = 0;
    while i + 1 < parts.len() {
        map.insert(parts[i], parts[i + 1]);
        i += 2;
    }
    map
}

// ─── Icon ─────────────────────────────────────────────────────────────────────

/// Fetch the user's cube icon info, download the rendered PNG, and return
/// (icon_url, "data:image/png;base64,…"). Non-fatal — returns empty strings on error.
async fn fetch_icon(account_id: i64, gjp2: &str, udid: &str) -> (String, String) {
    let acid_str = account_id.to_string();
    let params = [
        ("targetAccountID", acid_str.as_str()),
        ("accountID",       acid_str.as_str()),
        ("gjp2",            gjp2),
        ("secret",          COMMON_SECRET),
        ("gameVersion",     "22"),
        ("binaryVersion",   "47"),
        ("udid",            udid),
    ];

    let send = Client::new()
        .post(USER_INFO_URL)
        .header("User-Agent", "")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&params)
        .send().await;

    let info = match send {
        Err(e) => { tracing::warn!("getGJUserInfo20 failed: {e}"); return (String::new(), String::new()); }
        Ok(r) => match r.text().await {
            Err(e) => { tracing::warn!("getGJUserInfo20 read failed: {e}"); return (String::new(), String::new()); }
            Ok(t) => t,
        }
    };

    let info = info.trim();
    if info.starts_with('-') {
        tracing::warn!("getGJUserInfo20 returned error: {info}");
        return (String::new(), String::new());
    }

    let kv = parse_kv(info);
    let icon_id = kv.get("21").copied().unwrap_or("1");
    let color1  = kv.get("10").copied().unwrap_or("0");
    let color2  = kv.get("11").copied().unwrap_or("0");

    let icon_url = format!(
        "{GDICON_BASE}?type=cube&value={icon_id}&color1={color1}&color2={color2}"
    );

    let bytes = match Client::new().get(&icon_url).send().await {
        Err(e) => { tracing::warn!("icon request failed: {e}"); return (icon_url, String::new()); }
        Ok(r) => match r.bytes().await {
            Err(e) => { tracing::warn!("icon download failed: {e}"); return (icon_url, String::new()); }
            Ok(b) => b,
        }
    };

    let icon_b64 = format!("data:image/png;base64,{}", STANDARD.encode(&bytes));
    (icon_url, icon_b64)
}

// ─── Login ───────────────────────────────────────────────────────────────────

pub struct GDLoginResult {
    pub account_id: i64,
    pub username:   String,
    pub gjp2_enc:   String,
    pub icon_url:   String,
    pub icon_b64:   String,
}

pub async fn login(username: &str, password: &str) -> Result<GDLoginResult> {
    let gjp2 = compute_gjp2(password);
    let udid = machine_guid();

    let params = [
        ("userName",      username),
        ("gjp2",          gjp2.as_str()),
        ("secret",        LOGIN_SECRET),
        ("gameVersion",   "22"),
        ("binaryVersion", "47"),
        ("udid",          udid.as_str()),
    ];

    let resp = Client::new()
        .post(LOGIN_URL)
        .header("User-Agent", "")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&params)
        .send()
        .await
        .context("network error reaching GD login endpoint")?
        .text()
        .await
        .context("failed to read GD login response")?;

    let resp = resp.trim();
    if resp.starts_with('-') {
        let code = resp.parse::<i64>().unwrap_or(i64::MIN);
        let msg = match code {
            -1  => "Server error. Please try again.".to_string(),
            -8  => "Password is too short (minimum 6 characters).".to_string(),
            -9  => "Username is too short (minimum 3 characters).".to_string(),
            -10 => "This account is already linked to a different account.".to_string(),
            -11 => "Incorrect username or password.".to_string(),
            -12 => "This account has been disabled.".to_string(),
            -13 => "This account is already linked to a different Steam account.".to_string(),
            n   => format!("GD server returned error code {n}."),
        };
        bail!("{msg}");
    }

    if !resp.contains(',') && resp.parse::<i64>().is_err() {
        bail!("Unexpected response from GD server: {resp}");
    }

    let account_id: i64 = resp
        .splitn(2, ',')
        .next()
        .and_then(|s| s.trim().parse().ok())
        .ok_or_else(|| anyhow!("unexpected GD login response: {resp}"))?;

    if account_id <= 0 {
        bail!("GD login returned invalid accountID: {account_id}");
    }

    let gjp2_enc = encrypt_gjp2(&gjp2)?;
    let (icon_url, icon_b64) = fetch_icon(account_id, &gjp2, &udid).await;

    Ok(GDLoginResult { account_id, username: username.to_string(), gjp2_enc, icon_url, icon_b64 })
}
