// General-purpose Twitch Helix API client.
//
// This is deliberately separate from `bot/twitch.rs` (the IRC chat connection) —
// IRC handles chat send/receive, Helix handles everything else (announcements,
// user lookup, and future work like channel-points redemptions). Both use the
// same OAuth token; the auth service (gdlevelreqbot-auth-service) already
// requests the full scope set this client needs, so no reconnect is required
// for users who authed after that scope list was deployed.
//
// CLIENT_ID is the Twitch application's public client identifier — it is not
// secret (unlike the client secret, which stays server-side in the auth
// service) and is required alongside the bearer token on every Helix call.

use anyhow::{Context, Result};
use reqwest::Client;
use serde::Deserialize;

const CLIENT_ID: &str = "xa7q77aepewgt88z6d566olye10kc8";
const HELIX_BASE: &str = "https://api.twitch.tv/helix";

#[derive(Debug, Clone, Deserialize)]
pub struct TwitchUser {
    pub id: String,
    pub login: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct RewardImage {
    pub url_1x: String, // 28x28
    pub url_2x: String, // 56x56
    pub url_4x: String, // 112x112
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct CustomReward {
    pub id: String,
    pub title: String,
    pub cost: i64,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub is_enabled: bool,
    /// Only present if the broadcaster set a custom icon from the Twitch
    /// dashboard — there's no API field to set this, read-only here.
    #[serde(default)]
    pub image: Option<RewardImage>,
    /// Twitch's fallback icon set, always present.
    #[serde(default)]
    pub default_image: Option<RewardImage>,
}

#[derive(Clone)]
pub struct TwitchApiClient {
    http:  Client,
    token: String, // raw access token, no "oauth:" prefix
}

impl TwitchApiClient {
    pub fn new(token: String) -> Self {
        Self { http: Client::new(), token }
    }

    fn req(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.http
            .request(method, format!("{HELIX_BASE}{path}"))
            .header("Client-Id", CLIENT_ID)
            .bearer_auth(&self.token)
    }

    /// The authenticated user (the token owner).
    pub async fn get_self(&self) -> Result<TwitchUser> {
        #[derive(Deserialize)] struct Resp { data: Vec<TwitchUser> }
        let resp: Resp = self.req(reqwest::Method::GET, "/users")
            .send().await.context("Helix /users (self) request failed")?
            .error_for_status().context("Helix /users (self) returned an error status")?
            .json().await.context("Helix /users (self) response parse failed")?;
        resp.data.into_iter().next().context("Helix returned no user for this token")
    }

    /// Look up a user by login name. `None` if the login doesn't exist.
    pub async fn get_user_by_login(&self, login: &str) -> Result<Option<TwitchUser>> {
        #[derive(Deserialize)] struct Resp { data: Vec<TwitchUser> }
        let resp: Resp = self.req(reqwest::Method::GET, "/users")
            .query(&[("login", login)])
            .send().await.context("Helix /users (login) request failed")?
            .error_for_status().context("Helix /users (login) returned an error status")?
            .json().await.context("Helix /users (login) response parse failed")?;
        Ok(resp.data.into_iter().next())
    }

    /// Post a chat announcement — a highlighted, colored message. Requires the
    /// `moderator:manage:announcements` scope and that `moderator_id` is a mod
    /// (or the broadcaster) of `broadcaster_id`'s channel.
    /// `color`: one of "primary" | "blue" | "green" | "orange" | "purple" (defaults to "primary").
    pub async fn send_announcement(
        &self,
        broadcaster_id: &str,
        moderator_id:   &str,
        message:        &str,
        color:          Option<&str>,
    ) -> Result<()> {
        let body = serde_json::json!({
            "message": message,
            "color":   color.unwrap_or("primary"),
        });

        let resp = self.req(reqwest::Method::POST, "/chat/announcements")
            .query(&[("broadcaster_id", broadcaster_id), ("moderator_id", moderator_id)])
            .json(&body)
            .send().await.context("Helix chat/announcements request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch announcement failed (HTTP {status}): {text}");
        }
        Ok(())
    }

    /// List custom channel-point rewards created by this app (`only_manageable_rewards=true` —
    /// rewards created via the Twitch dashboard directly aren't returned, only ones this
    /// client_id created, which is a Twitch API restriction, not a choice made here).
    pub async fn list_custom_rewards(&self, broadcaster_id: &str) -> Result<Vec<CustomReward>> {
        #[derive(Deserialize)] struct Resp { data: Vec<CustomReward> }
        let resp = self.req(reqwest::Method::GET, "/channel_points/custom_rewards")
            .query(&[("broadcaster_id", broadcaster_id), ("only_manageable_rewards", "true")])
            .send().await.context("Helix custom_rewards (list) request failed")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch list rewards failed (HTTP {status}): {text}");
        }
        Ok(resp.json::<Resp>().await.context("Helix custom_rewards (list) response parse failed")?.data)
    }

    /// Create a custom channel-point reward. Requires `channel:manage:redemptions`.
    pub async fn create_custom_reward(&self, broadcaster_id: &str, title: &str, cost: i64, prompt: &str) -> Result<CustomReward> {
        #[derive(Deserialize)] struct Resp { data: Vec<CustomReward> }
        let body = serde_json::json!({ "title": title, "cost": cost, "prompt": prompt, "is_user_input_required": !prompt.is_empty() });
        let resp = self.req(reqwest::Method::POST, "/channel_points/custom_rewards")
            .query(&[("broadcaster_id", broadcaster_id)])
            .json(&body)
            .send().await.context("Helix custom_rewards (create) request failed")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch create reward failed (HTTP {status}): {text}");
        }
        resp.json::<Resp>().await.context("Helix custom_rewards (create) response parse failed")?
            .data.into_iter().next().context("Helix returned no reward after create")
    }

    /// Mark a redemption FULFILLED or CANCELED. Requires `channel:manage:redemptions` and that
    /// the reward was created by this client_id (Twitch restriction on third-party apps).
    pub async fn update_redemption_status(&self, broadcaster_id: &str, reward_id: &str, redemption_id: &str, fulfilled: bool) -> Result<()> {
        let body = serde_json::json!({ "status": if fulfilled { "FULFILLED" } else { "CANCELED" } });
        let resp = self.req(reqwest::Method::PATCH, "/channel_points/custom_rewards/redemptions")
            .query(&[
                ("broadcaster_id", broadcaster_id),
                ("reward_id", reward_id),
                ("id", redemption_id),
            ])
            .json(&body)
            .send().await.context("Helix redemption status update request failed")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch redemption status update failed (HTTP {status}): {text}");
        }
        Ok(())
    }

    /// Update an existing custom reward. Only `Some` fields are changed — Twitch's
    /// Update Custom Reward endpoint doesn't accept (or return a way to set) a
    /// custom icon; icons can only be set from the Twitch dashboard, not this API.
    pub async fn update_custom_reward(
        &self,
        broadcaster_id: &str,
        reward_id:      &str,
        title:          Option<&str>,
        cost:           Option<i64>,
        prompt:         Option<&str>,
        is_enabled:     Option<bool>,
    ) -> Result<CustomReward> {
        #[derive(Deserialize)] struct Resp { data: Vec<CustomReward> }
        let mut body = serde_json::Map::new();
        if let Some(t) = title { body.insert("title".into(), serde_json::json!(t)); }
        if let Some(c) = cost { body.insert("cost".into(), serde_json::json!(c)); }
        if let Some(p) = prompt { body.insert("prompt".into(), serde_json::json!(p)); }
        if let Some(e) = is_enabled { body.insert("is_enabled".into(), serde_json::json!(e)); }

        let resp = self.req(reqwest::Method::PATCH, "/channel_points/custom_rewards")
            .query(&[("broadcaster_id", broadcaster_id), ("id", reward_id)])
            .json(&serde_json::Value::Object(body))
            .send().await.context("Helix custom_rewards (update) request failed")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch update reward failed (HTTP {status}): {text}");
        }
        resp.json::<Resp>().await.context("Helix custom_rewards (update) response parse failed")?
            .data.into_iter().next().context("Helix returned no reward after update")
    }

    /// Delete a custom reward. Only rewards created by this app (client_id) can be deleted.
    pub async fn delete_custom_reward(&self, broadcaster_id: &str, reward_id: &str) -> Result<()> {
        let resp = self.req(reqwest::Method::DELETE, "/channel_points/custom_rewards")
            .query(&[("broadcaster_id", broadcaster_id), ("id", reward_id)])
            .send().await.context("Helix custom_rewards (delete) request failed")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch delete reward failed (HTTP {status}): {text}");
        }
        Ok(())
    }

    /// True if `user_id` currently has an active subscription to `broadcaster_id`.
    /// Requires `channel:read:subscriptions` (already in the auth service's scope
    /// list). Twitch returns 200 with an empty `data` array for a non-subscriber,
    /// not a 404, so this only needs to check whether `data` is non-empty.
    pub async fn check_subscription(&self, broadcaster_id: &str, user_id: &str) -> Result<bool> {
        #[derive(Deserialize)] struct Resp { data: Vec<serde_json::Value> }
        let resp = self.req(reqwest::Method::GET, "/subscriptions")
            .query(&[("broadcaster_id", broadcaster_id), ("user_id", user_id)])
            .send().await.context("Helix subscriptions request failed")?;
        if !resp.status().is_success() {
            // A 404-shaped error here just means "not subscribed" on some Helix
            // versions — treat any non-success as "not subscribed" rather than
            // failing the caller outright.
            return Ok(false);
        }
        Ok(!resp.json::<Resp>().await.context("Helix subscriptions response parse failed")?.data.is_empty())
    }

    /// Create an EventSub WebSocket subscription for the given event type against an
    /// already-established EventSub session. `condition` is the type-specific JSON body
    /// (e.g. `{"broadcaster_user_id": "..."}`).
    pub async fn create_eventsub_subscription(
        &self,
        event_type: &str,
        version: &str,
        condition: serde_json::Value,
        session_id: &str,
    ) -> Result<()> {
        let body = serde_json::json!({
            "type": event_type,
            "version": version,
            "condition": condition,
            "transport": { "method": "websocket", "session_id": session_id },
        });
        let resp = self.req(reqwest::Method::POST, "/eventsub/subscriptions")
            .json(&body)
            .send().await.context("Helix eventsub subscription request failed")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch EventSub subscription failed (HTTP {status}): {text}");
        }
        Ok(())
    }
}
