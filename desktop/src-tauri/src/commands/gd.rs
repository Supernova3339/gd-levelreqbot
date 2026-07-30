use crate::auth::gd as gd_auth;
use crate::config::AppConfig;
use crate::gd::{GDCreds, GDLevel, GDUser};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use tracing::info;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Resolve live GD credentials from config (decrypt GJP2 on demand).
/// Returns None if the user has not logged in to a GD account.
async fn live_creds(config: &Arc<RwLock<AppConfig>>) -> Option<GDCreds> {
    let cfg = config.read().await;
    let acct = &cfg.gd_account;
    if acct.account_id <= 0 || acct.gjp2_enc.is_empty() {
        return None;
    }
    match gd_auth::decrypt_gjp2(&acct.gjp2_enc) {
        Ok(gjp2) => Some(GDCreds { account_id: acct.account_id, gjp2 }),
        Err(e) => {
            tracing::warn!("Failed to decrypt GD GJP2 (will search without auth): {e}");
            None
        }
    }
}

// ─── Level / user search ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn search_gd_level(
    level_id: i64,
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<Option<GDLevel>, String> {
    let creds = live_creds(&config).await;
    crate::gd::get_level_by_id(level_id, creds.as_ref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_gd_levels(
    query: String,
    search_type: i32,
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<Vec<GDLevel>, String> {
    let creds = live_creds(&config).await;
    crate::gd::get_levels(&query, 0, search_type, creds.as_ref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_gd_user(account_id: i64) -> Result<Option<GDUser>, String> {
    crate::gd::get_user(account_id)
        .await
        .map_err(|e| e.to_string())
}

// ─── GD account integration ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct GDAccountInfo {
    pub account_id: i64,
    pub username:   String,
    pub connected:  bool,
    pub icon_url:   String,
    pub icon_b64:   String,
}

/// Log in to a GD account. Computes GJP2, encrypts it, and persists to config.
#[tauri::command]
pub async fn gd_login(
    username: String,
    password: String,
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<GDAccountInfo, String> {
    let result = gd_auth::login(&username, &password)
        .await
        .map_err(|e| e.to_string())?;

    let mut cfg = config.write().await;
    cfg.gd_account.account_id = result.account_id;
    cfg.gd_account.username   = result.username.clone();
    cfg.gd_account.gjp2_enc   = result.gjp2_enc;
    cfg.gd_account.icon_url   = result.icon_url.clone();
    cfg.gd_account.icon_b64   = result.icon_b64.clone();
    cfg.save().await.map_err(|e| e.to_string())?;

    info!("GD account logged in: {} ({})", result.username, result.account_id);

    Ok(GDAccountInfo {
        account_id: result.account_id,
        username:   result.username,
        connected:  true,
        icon_url:   result.icon_url,
        icon_b64:   result.icon_b64,
    })
}

/// Log out of the GD account and clear stored credentials.
#[tauri::command]
pub async fn gd_logout(
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<(), String> {
    let mut cfg = config.write().await;
    cfg.gd_account.account_id = 0;
    cfg.gd_account.username   = String::new();
    cfg.gd_account.gjp2_enc   = String::new();
    cfg.gd_account.icon_url   = String::new();
    cfg.gd_account.icon_b64   = String::new();
    cfg.save().await.map_err(|e| e.to_string())?;
    info!("GD account disconnected");
    Ok(())
}

/// Return the currently connected GD account info (without any secret material).
#[tauri::command]
pub async fn get_gd_account(
    config: State<'_, Arc<RwLock<AppConfig>>>,
) -> Result<GDAccountInfo, String> {
    let cfg = config.read().await;
    let acct = &cfg.gd_account;
    Ok(GDAccountInfo {
        account_id: acct.account_id,
        username:   acct.username.clone(),
        connected:  acct.account_id > 0 && !acct.gjp2_enc.is_empty(),
        icon_url:   acct.icon_url.clone(),
        icon_b64:   acct.icon_b64.clone(),
    })
}
