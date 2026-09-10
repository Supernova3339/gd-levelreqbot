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

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)] // full Helix response shape — id/title/status aren't needed by chat.poll() today
pub struct PollChoice {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub votes: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct TwitchPoll {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub choices: Vec<PollChoice>,
    /// "ACTIVE" | "COMPLETED" | "TERMINATED" | "ARCHIVED" | "MODERATED" | "INVALID"
    #[serde(default)]
    pub status: String,
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

    /// Send a chat message via Helix rather than IRC, optionally pinning it.
    /// Pinning requires `moderator:manage:chat_messages` (in addition to
    /// whatever scope sending itself needs) and that `sender_id` is the
    /// broadcaster or a moderator of `broadcaster_id`'s channel — a bot
    /// running as neither will get a scope/permission error back, which the
    /// caller should treat as "pin unavailable," not fatal. Twitch pins the
    /// message for a fixed 20 minutes and only ever lets one message be
    /// pinned at a time — pinning a second one while the first is still
    /// active silently replaces it, per Twitch's own behavior, but explicit
    /// unpinning (see `unpin_message`) is still worth doing for a "swap out"
    /// since it also lets a caller decide NOT to leave a stale pin up if the
    /// new one doesn't need pinning. If the pin itself fails, Twitch does not
    /// send the message at all (per Twitch's own docs). Returns the sent
    /// message's id, needed to unpin it later.
    pub async fn send_chat_message(
        &self,
        broadcaster_id: &str,
        sender_id:      &str,
        message:        &str,
        pin:            bool,
    ) -> Result<String> {
        let mut body = serde_json::json!({
            "broadcaster_id": broadcaster_id,
            "sender_id":      sender_id,
            "message":        message,
        });
        if pin {
            body["pin"] = serde_json::json!(true);
        }
        let resp = self.req(reqwest::Method::POST, "/chat/messages")
            .json(&body)
            .send().await.context("Helix chat/messages request failed")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch send chat message failed (HTTP {status}): {text}");
        }
        #[derive(Deserialize)] struct SentMsg { message_id: String }
        #[derive(Deserialize)] struct Resp { data: Vec<SentMsg> }
        resp.json::<Resp>().await.context("Helix chat/messages response parse failed")?
            .data.into_iter().next().map(|m| m.message_id).context("Helix returned no message_id after send")
    }

    /// Unpins a specific message by id (`DELETE /chat/pins`) — the caller
    /// needs the message_id `send_chat_message` returned when it pinned that
    /// message, since Twitch's endpoint targets a specific message rather
    /// than "whatever's currently pinned." Requires
    /// `moderator:manage:chat_messages`, same as pinning. Erroring here
    /// (e.g. that message already expired/was already unpinned) should be
    /// treated as non-fatal by the caller — the goal state (nothing stale
    /// pinned) is already true either way.
    pub async fn unpin_message(&self, broadcaster_id: &str, moderator_id: &str, message_id: &str) -> Result<()> {
        let resp = self.req(reqwest::Method::DELETE, "/chat/pins")
            .query(&[("broadcaster_id", broadcaster_id), ("moderator_id", moderator_id), ("message_id", message_id)])
            .send().await.context("Helix chat/pins (unpin) request failed")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch unpin message failed (HTTP {status}): {text}");
        }
        Ok(())
    }

    /// Create a native Twitch poll. Requires a user access token that includes
    /// `channel:manage:polls` AND belongs to the broadcaster themselves — Twitch
    /// rejects this call if the token owner isn't `broadcaster_id`, so a bot
    /// running under a separate account (the common setup here) will always
    /// fail this and should fall back to a chat-vote poll instead.
    /// `choices`: 2-5 options, each <=25 chars. `duration_secs`: 15-1800.
    /// Returns the new poll's id — the caller needs it to look up final
    /// results once the poll closes (see `get_poll`); Twitch itself never
    /// pushes a "poll ended" event, so that's the only way to find out.
    pub async fn create_poll(&self, broadcaster_id: &str, title: &str, choices: &[String], duration_secs: i32) -> Result<String> {
        let body = serde_json::json!({
            "broadcaster_id": broadcaster_id,
            "title": title,
            "choices": choices.iter().map(|c| serde_json::json!({"title": c})).collect::<Vec<_>>(),
            "duration": duration_secs,
        });
        let resp = self.req(reqwest::Method::POST, "/polls")
            .json(&body)
            .send().await.context("Helix polls (create) request failed")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch create poll failed (HTTP {status}): {text}");
        }
        #[derive(Deserialize)] struct Resp { data: Vec<TwitchPoll> }
        resp.json::<Resp>().await.context("Helix polls (create) response parse failed")?
            .data.into_iter().next().map(|p| p.id).context("Helix returned no poll after create")
    }

    /// Fetch a poll's current state, including per-choice vote counts. Used
    /// after `create_poll`'s duration has elapsed to read final results and
    /// announce them — Twitch doesn't push a completion event.
    pub async fn get_poll(&self, broadcaster_id: &str, poll_id: &str) -> Result<TwitchPoll> {
        #[derive(Deserialize)] struct Resp { data: Vec<TwitchPoll> }
        let resp = self.req(reqwest::Method::GET, "/polls")
            .query(&[("broadcaster_id", broadcaster_id), ("id", poll_id)])
            .send().await.context("Helix polls (get) request failed")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch get poll failed (HTTP {status}): {text}");
        }
        resp.json::<Resp>().await.context("Helix polls (get) response parse failed")?
            .data.into_iter().next().context("Helix returned no poll for that id")
    }

    /// End a native poll early (`status: "TERMINATED"`, discarding it rather
    /// than "ARCHIVED" which keeps it visible as ended-early) — same
    /// `channel:manage:polls` scope and broadcaster-token requirement as
    /// `create_poll`, so this only ever works when the connected account IS
    /// the broadcaster, same caveat as everywhere else native polls are used.
    pub async fn end_poll(&self, broadcaster_id: &str, poll_id: &str) -> Result<()> {
        let body = serde_json::json!({
            "broadcaster_id": broadcaster_id,
            "id": poll_id,
            "status": "TERMINATED",
        });
        let resp = self.req(reqwest::Method::PATCH, "/polls")
            .json(&body)
            .send().await.context("Helix end poll request failed")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch end poll failed (HTTP {status}): {text}");
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
    /// (e.g. `{"broadcaster_user_id": "..."}`). Returns the new subscription's id,
    /// needed to delete it later (see `delete_eventsub_subscription`) once no
    /// enabled module wants that type anymore.
    pub async fn create_eventsub_subscription(
        &self,
        event_type: &str,
        version: &str,
        condition: serde_json::Value,
        session_id: &str,
    ) -> Result<String> {
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
        #[derive(Deserialize)] struct SubData { id: String }
        #[derive(Deserialize)] struct Resp { data: Vec<SubData> }
        resp.json::<Resp>().await.context("Helix eventsub subscription response parse failed")?
            .data.into_iter().next().map(|s| s.id).context("Helix returned no subscription id after create")
    }

    /// Remove an EventSub subscription by id — called once no enabled module
    /// wants that event type anymore, so a disabled/uninstalled module's
    /// interest doesn't leave a subscription (and its Helix quota cost)
    /// running forever.
    pub async fn delete_eventsub_subscription(&self, id: &str) -> Result<()> {
        let resp = self.req(reqwest::Method::DELETE, "/eventsub/subscriptions")
            .query(&[("id", id)])
            .send().await.context("Helix eventsub unsubscribe request failed")?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Twitch EventSub unsubscribe failed (HTTP {status}): {text}");
        }
        Ok(())
    }
}
