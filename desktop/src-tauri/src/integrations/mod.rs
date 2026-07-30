use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::process::Command as ShellCommand;
use std::time::Duration;
use tracing::error;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Integration {
    pub id:           i64,
    pub name:         String,
    pub kind:         String,
    pub config:       String,   // JSON
    pub description:  String,
    pub enabled:      i64,
    pub cached_value: Option<String>,
    pub last_fetched: Option<String>,
}

const HTTP_TIMEOUT: Duration = Duration::from_secs(10);

/// Fetch or compute the current value of an integration.
pub async fn resolve(integration: &Integration) -> Result<String> {
    match integration.kind.as_str() {
        "static" => {
            let cfg: serde_json::Value = serde_json::from_str(&integration.config)?;
            Ok(cfg["value"].as_str().unwrap_or("").to_string())
        }

        "http" => {
            let cfg: serde_json::Value = serde_json::from_str(&integration.config)?;
            let url    = cfg["url"].as_str().unwrap_or("").to_string();
            let method = cfg["method"].as_str().unwrap_or("GET").to_uppercase();
            let path   = cfg["path"].as_str().unwrap_or("").to_string();
            let body   = cfg["body"].as_str().unwrap_or("").to_string();

            if url.is_empty() { return Ok(String::new()); }

            // Parse custom headers: [{key, value}]
            let headers: Vec<(String, String)> = cfg["headers"]
                .as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|h| {
                    let k = h["key"].as_str()?.trim().to_string();
                    let v = h["value"].as_str()?.to_string();
                    if k.is_empty() { None } else { Some((k, v)) }
                })
                .collect();

            let client = Client::new();
            let req = match method.as_str() {
                "POST" => client.post(&url).body(body),
                _      => client.get(&url),
            };
            let req = headers.iter().fold(req, |r, (k, v)| r.header(k.as_str(), v.as_str()));
            let text = req.timeout(HTTP_TIMEOUT).send().await?.text().await?;

            if path.is_empty() {
                return Ok(text.trim().to_string());
            }

            // Dot-notation JSON field extraction
            let json: serde_json::Value = serde_json::from_str(&text)?;
            let mut cur = &json;
            for key in path.split('.') {
                cur = cur.get(key).unwrap_or(&serde_json::Value::Null);
            }
            Ok(match cur {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Null      => String::new(),
                other                        => other.to_string(),
            })
        }

        "shell" => {
            let cfg: serde_json::Value = serde_json::from_str(&integration.config)?;
            let cmd = cfg["command"].as_str().unwrap_or("").to_string();
            if cmd.is_empty() { return Ok(String::new()); }

            #[cfg(target_os = "windows")]
            let output = {
                use std::os::windows::process::CommandExt;
                ShellCommand::new("cmd").args(["/C", &cmd]).creation_flags(0x08000000).output()
            };
            #[cfg(not(target_os = "windows"))]
            let output = ShellCommand::new("sh").args(["-c", &cmd]).output();

            match output {
                Ok(o)  => Ok(String::from_utf8_lossy(&o.stdout).trim().to_string()),
                Err(e) => Err(anyhow::anyhow!("Shell command failed: {e}")),
            }
        }

        other => Err(anyhow::anyhow!("Unknown integration kind: {other}")),
    }
}

/// Resolve all enabled integrations and return a map of name → value.
#[allow(dead_code)]
pub async fn resolve_all(pool: &SqlitePool) -> std::collections::HashMap<String, String> {
    let integrations: Vec<Integration> = sqlx::query_as(
        "SELECT id, name, kind, config, description, enabled, cached_value, last_fetched
         FROM integrations WHERE enabled != 0"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut map = std::collections::HashMap::new();
    for integ in &integrations {
        match resolve(integ).await {
            Ok(val) => { map.insert(integ.name.clone(), val); }
            Err(e)  => error!("Integration '{}' failed: {e}", integ.name),
        }
    }
    map
}
