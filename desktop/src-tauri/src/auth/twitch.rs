use anyhow::{bail, Context, Result};
use reqwest::Client;
use serde::Deserialize;
use tracing::{info, warn};

const AUTH_SERVICE_URL: &str = "http://gdlqbot.superdev.one/auth/twitch";
const REFRESH_URL:      &str = "http://gdlqbot.superdev.one/auth/twitch/refresh";

// Scopes required for the bot to work with Twitch IRC
const REQUIRED_SCOPES: &[&str] = &["chat:read", "chat:edit"];

/// Open the browser to the hosted auth service.
pub async fn start_auth_flow() -> Result<()> {
    opener::open(AUTH_SERVICE_URL)
        .context("Failed to open browser for Twitch authentication")?;
    info!("Twitch auth flow started — browser opened");
    Ok(())
}

#[derive(Deserialize)]
struct ValidateResponse {
    login:  String,
    scopes: Vec<String>,
}

/// Validate a stored access token.
/// Returns true only if the token is valid AND has the required IRC scopes.
pub async fn validate_token(token: &str) -> bool {
    if token.is_empty() { return false; }

    let resp = match Client::new()
        .get("https://id.twitch.tv/oauth2/validate")
        .header("Authorization", format!("OAuth {}", token))
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return false,
    };

    if !resp.status().is_success() { return false; }

    match resp.json::<ValidateResponse>().await {
        Ok(info) => {
            let missing: Vec<&str> = REQUIRED_SCOPES.iter()
                .filter(|&&s| !info.scopes.iter().any(|scope| scope == s))
                .copied()
                .collect();

            if !missing.is_empty() {
                warn!(
                    "Twitch token for {} is missing required scopes: {}. \
                     Reconnect in Settings → Twitch to get a token with the correct scopes. \
                     The auth service may need redeployment first.",
                    info.login,
                    missing.join(", ")
                );
                return false;
            }

            true
        }
        // Old token format — assume valid (let IRC connection tell us if it's wrong)
        Err(_) => true,
    }
}

#[derive(Deserialize)]
pub struct RefreshResult {
    pub access_token:  String,
    pub refresh_token: String,
}

/// Exchange a refresh token for a new access+refresh pair via the hosted auth service.
pub async fn refresh_access_token(refresh_token: &str) -> Result<RefreshResult> {
    if refresh_token.is_empty() {
        bail!("No refresh token stored — reconnect in Settings → Twitch.");
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
        .context("Failed to reach auth service for token refresh")?;

    let status = resp.status();
    let body: Resp = resp.json().await
        .context("Failed to parse refresh response from auth service")?;

    if let Some(err) = body.error {
        bail!("Token refresh failed: {err}");
    }

    if !status.is_success() {
        bail!("Token refresh failed (HTTP {status}) — reconnect in Settings → Twitch.");
    }

    Ok(RefreshResult {
        access_token:  body.access_token.unwrap_or_default(),
        refresh_token: body.refresh_token.unwrap_or_default(),
    })
}
