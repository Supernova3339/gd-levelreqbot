use anyhow::{bail, Context, Result};
use reqwest::Client;
use serde::Deserialize;
use tracing::info;

const AUTH_SERVICE_URL: &str = "http://gdlqbot.superdev.one/auth/youtube";
const REFRESH_URL: &str = "http://gdlqbot.superdev.one/auth/youtube/refresh";

/// Open the browser to the hosted auth service for YouTube.
/// The service redirects back to localhost:24363/youtube/auth/token.
pub async fn start_auth_flow() -> Result<()> {
    opener::open(AUTH_SERVICE_URL)
        .context("Failed to open browser for YouTube authentication")?;
    info!("YouTube auth flow started — browser opened");
    Ok(())
}

/// Validate a stored YouTube access token.
pub async fn validate_token(token: &str) -> bool {
    if token.is_empty() {
        return false;
    }
    Client::new()
        .get("https://www.googleapis.com/oauth2/v1/tokeninfo")
        .query(&[("access_token", token)])
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

pub struct RefreshResult {
    pub access_token:  String,
    pub refresh_token: String,
}

/// Exchange a refresh token for a new access token via the hosted auth service.
/// Google may or may not return a new refresh token — if it doesn't, the existing
/// one stays valid, so we preserve it.
pub async fn refresh_access_token(refresh_token: &str) -> Result<RefreshResult> {
    if refresh_token.is_empty() {
        bail!("No refresh token stored — reconnect in Settings → YouTube.");
    }

    #[derive(serde::Serialize)]
    struct Req<'a> { refresh_token: &'a str }

    #[derive(Deserialize)]
    struct Resp {
        access_token:  Option<String>,
        refresh_token: Option<String>,
        error:         Option<String>,
    }

    let resp = Client::new()
        .post(REFRESH_URL)
        .json(&Req { refresh_token })
        .send()
        .await
        .context("Failed to reach auth service for YouTube token refresh")?;

    let status = resp.status();
    let body: Resp = resp.json().await
        .context("Failed to parse refresh response from auth service")?;

    if let Some(err) = body.error {
        bail!("YouTube token refresh failed: {err}");
    }

    if !status.is_success() {
        bail!("YouTube token refresh failed (HTTP {status}) — reconnect in Settings → YouTube.");
    }

    Ok(RefreshResult {
        access_token: body.access_token.unwrap_or_default(),
        // Google only returns a new refresh token on the first grant; keep the old one if absent
        refresh_token: body.refresh_token.unwrap_or_else(|| refresh_token.to_string()),
    })
}
