use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    #[serde(default)] pub bot_username:           String,
    #[serde(default)] pub bot_access_token:       String,
    #[serde(default)] pub bot_refresh_token:      String,
    #[serde(default)] pub channel:                String,
    #[serde(default)] pub web_api_token:          String,
    #[serde(default)] pub twitch_access_token:    String,
    #[serde(default)] pub twitch_refresh_token:   String,
    #[serde(default)] pub youtube_access_token:   String,
    #[serde(default)] pub youtube_refresh_token:  String,
    #[serde(default)] pub youtube_api_key:        String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModesConfig {
    #[serde(default = "default_true")] pub gd:      bool,
    #[serde(default)]                  pub sub:     bool,
    #[serde(default)]                  pub smart:   bool,
    #[serde(default)]                  pub youtube: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LimitsConfig {
    #[serde(default = "default_viewer_limit")]     pub viewer_request_limit:     u32,
    #[serde(default = "default_subscriber_limit")] pub subscriber_request_limit: u32,
    #[serde(default)]                              pub max_queue_size:           u32,
}

#[derive(FromRow)]
struct ConfigRow {
    bot_username: String, bot_access_token: String, bot_refresh_token: String,
    channel: String, web_api_token: String,
    twitch_access_token: String, twitch_refresh_token: String,
    youtube_access_token: String, youtube_refresh_token: String, youtube_api_key: String,
    mode_gd: i64, mode_sub: i64, mode_smart: i64, mode_youtube: i64,
    viewer_request_limit: i64, subscriber_request_limit: i64, queue_max_size: i64,
    setup_complete: i64, auto_copy_level_id: i64,
    level_thumbnails: i64, thumbnail_quality: String,
    ws_enabled: i64, ws_port: i64, ws_secret: String,
    gd_account_id: i64, gd_username: String, gd_gjp2_enc: String,
    gd_icon_url: String, gd_icon_b64: String,
    queue_open: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsConfig {
    #[serde(default)]                     pub enabled: bool,
    #[serde(default = "default_ws_port")] pub port:    u16,
    #[serde(default)]                     pub secret:  String,
}

impl Default for WsConfig {
    fn default() -> Self { Self { enabled: false, port: default_ws_port(), secret: String::new() } }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GDAccount {
    #[serde(default)] pub account_id: i64,
    #[serde(default)] pub username:   String,
    #[serde(default)] pub gjp2_enc:   String,
    #[serde(default)] pub icon_url:   String,
    #[serde(default)] pub icon_b64:   String,
}

impl Default for GDAccount {
    fn default() -> Self {
        Self { account_id: 0, username: String::new(), gjp2_enc: String::new(), icon_url: String::new(), icon_b64: String::new() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub auth:               AuthConfig,
    pub modes:              ModesConfig,
    pub limits:             LimitsConfig,
    #[serde(default)]
    pub ws:                 WsConfig,
    #[serde(default)]
    pub gd_account:         GDAccount,
    pub setup_complete:      bool,
    pub auto_copy_level_id:  bool,
    pub level_thumbnails:    bool,
    pub thumbnail_quality:   String,
    pub queue_open:          bool,
    #[serde(skip)]
    pool: Option<SqlitePool>,
}

impl AppConfig {
    pub async fn load(pool: &SqlitePool) -> Result<Self> {
        let row: ConfigRow = sqlx::query_as(
            "SELECT bot_username, bot_access_token, bot_refresh_token, channel, web_api_token,
                    twitch_access_token, twitch_refresh_token,
                    youtube_access_token, youtube_refresh_token, youtube_api_key,
                    mode_gd, mode_sub, mode_smart, mode_youtube,
                    viewer_request_limit, subscriber_request_limit, queue_max_size,
                    setup_complete, auto_copy_level_id,
                    level_thumbnails, thumbnail_quality,
                    ws_enabled, ws_port, ws_secret,
                    gd_account_id, gd_username, gd_gjp2_enc,
                    gd_icon_url, gd_icon_b64,
                    queue_open
             FROM config WHERE id = 1",
        )
        .fetch_one(pool).await.context("failed to load config")?;

        Ok(Self {
            auth: AuthConfig {
                bot_username:          row.bot_username,
                bot_access_token:      row.bot_access_token,
                bot_refresh_token:     row.bot_refresh_token,
                channel:               row.channel,
                web_api_token:         row.web_api_token,
                twitch_access_token:   row.twitch_access_token,
                twitch_refresh_token:  row.twitch_refresh_token,
                youtube_access_token:  row.youtube_access_token,
                youtube_refresh_token: row.youtube_refresh_token,
                youtube_api_key:       row.youtube_api_key,
            },
            modes: ModesConfig {
                gd:      row.mode_gd != 0, sub: row.mode_sub != 0,
                smart:   row.mode_smart != 0, youtube: row.mode_youtube != 0,
            },
            limits: LimitsConfig {
                viewer_request_limit:     row.viewer_request_limit as u32,
                subscriber_request_limit: row.subscriber_request_limit as u32,
                max_queue_size:           row.queue_max_size as u32,
            },
            ws: WsConfig {
                enabled: row.ws_enabled != 0,
                port:    row.ws_port as u16,
                secret:  row.ws_secret,
            },
            gd_account: GDAccount {
                account_id: row.gd_account_id,
                username:   row.gd_username,
                gjp2_enc:   row.gd_gjp2_enc,
                icon_url:   row.gd_icon_url,
                icon_b64:   row.gd_icon_b64,
            },
            setup_complete:     row.setup_complete != 0,
            auto_copy_level_id: row.auto_copy_level_id != 0,
            level_thumbnails:   row.level_thumbnails != 0,
            thumbnail_quality:  row.thumbnail_quality,
            queue_open:         row.queue_open != 0,
            pool: Some(pool.clone()),
        })
    }

    /// Save only the auth token fields — works even on older DB schemas
    /// that predate the refresh-token migrations (0012/0013).
    pub async fn save_tokens(&self) -> Result<()> {
        let pool = self.pool.as_ref().context("config has no database pool")?;
        // Try full token save (includes refresh tokens from migration 0012/0013)
        let full = sqlx::query(
            "UPDATE config SET
                twitch_access_token = ?, twitch_refresh_token = ?,
                bot_access_token    = ?, bot_refresh_token    = ?,
                youtube_access_token= ?, youtube_refresh_token= ?
             WHERE id = 1"
        )
        .bind(&self.auth.twitch_access_token) .bind(&self.auth.twitch_refresh_token)
        .bind(&self.auth.bot_access_token)    .bind(&self.auth.bot_refresh_token)
        .bind(&self.auth.youtube_access_token).bind(&self.auth.youtube_refresh_token)
        .execute(pool).await;

        if full.is_ok() { return Ok(()); }

        // Fallback: refresh token columns don't exist yet — save just the access tokens
        sqlx::query(
            "UPDATE config SET
                twitch_access_token  = ?,
                bot_access_token     = ?,
                youtube_access_token = ?
             WHERE id = 1"
        )
        .bind(&self.auth.twitch_access_token)
        .bind(&self.auth.bot_access_token)
        .bind(&self.auth.youtube_access_token)
        .execute(pool).await.context("failed to save auth tokens")?;
        Ok(())
    }

    pub async fn save(&self) -> Result<()> {
        let pool = self.pool.as_ref().context("config has no database pool")?;
        sqlx::query(
            "UPDATE config SET
                bot_username = ?, bot_access_token = ?, bot_refresh_token = ?,
                channel = ?, web_api_token = ?,
                twitch_access_token = ?, twitch_refresh_token = ?,
                youtube_access_token = ?, youtube_refresh_token = ?, youtube_api_key = ?,
                mode_gd = ?, mode_sub = ?, mode_smart = ?, mode_youtube = ?,
                viewer_request_limit = ?, subscriber_request_limit = ?, queue_max_size = ?,
                setup_complete = ?, auto_copy_level_id = ?,
                level_thumbnails = ?, thumbnail_quality = ?,
                ws_enabled = ?, ws_port = ?, ws_secret = ?,
                gd_account_id = ?, gd_username = ?, gd_gjp2_enc = ?,
                gd_icon_url = ?, gd_icon_b64 = ?,
                queue_open = ?
             WHERE id = 1",
        )
        .bind(&self.auth.bot_username)         .bind(&self.auth.bot_access_token)
        .bind(&self.auth.bot_refresh_token)    .bind(&self.auth.channel)
        .bind(&self.auth.web_api_token)        .bind(&self.auth.twitch_access_token)
        .bind(&self.auth.twitch_refresh_token) .bind(&self.auth.youtube_access_token)
        .bind(&self.auth.youtube_refresh_token).bind(&self.auth.youtube_api_key)
        .bind(self.modes.gd as i64).bind(self.modes.sub as i64)
        .bind(self.modes.smart as i64).bind(self.modes.youtube as i64)
        .bind(self.limits.viewer_request_limit as i64)
        .bind(self.limits.subscriber_request_limit as i64)
        .bind(self.limits.max_queue_size as i64)
        .bind(self.setup_complete as i64)
        .bind(self.auto_copy_level_id as i64)
        .bind(self.level_thumbnails as i64)
        .bind(&self.thumbnail_quality)
        .bind(self.ws.enabled as i64)
        .bind(self.ws.port as i64)
        .bind(&self.ws.secret)
        .bind(self.gd_account.account_id)
        .bind(&self.gd_account.username)
        .bind(&self.gd_account.gjp2_enc)
        .bind(&self.gd_account.icon_url)
        .bind(&self.gd_account.icon_b64)
        .bind(self.queue_open as i64)
        .execute(pool).await.context("failed to save config")?;
        Ok(())
    }
}

fn default_true() -> bool { true }
fn default_viewer_limit() -> u32 { 1 }
fn default_subscriber_limit() -> u32 { 5 }
fn default_ws_port() -> u16 { 24364 }
