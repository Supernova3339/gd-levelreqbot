use anyhow::Result;
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const SECRET: &str = "Wmfd2893gb7";
const LEVELS_URL: &str = "http://www.boomlings.com/database/getGJLevels21.php";
const USERS_URL:  &str = "http://www.boomlings.com/database/getGJUsers20.php";

/// GD account credentials used to make authenticated requests.
#[derive(Debug, Clone)]
pub struct GDCreds {
    pub account_id: i64,
    pub gjp2:       String,
}

// ─── Public types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GDLevel {
    pub level_id:      i64,
    pub level_name:    String,
    pub description:   String,
    pub player_id:     i64,
    /// Creator's username. Parsed from the response's creators section
    /// (`getGJLevels21` includes it; empty if the API omitted it).
    pub author:        String,
    pub difficulty:    String,
    pub downloads:     i64,
    pub likes:         i64,
    pub length:        String,
    pub stars:         i64,
    pub demon:         bool,
    pub auto:          bool,
    pub coins:         i64,
    pub verified_coins: bool,
    pub featured:      bool,
    pub epic:          bool,
    pub original_id:   i64,
    pub version:       i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GDUser {
    pub user_name:      String,
    pub user_id:        i64,
    pub account_id:     i64,
    pub stars:          i64,
    pub demons:         i64,
    pub creator_points: i64,
    pub rank:           i64,
}

// ─── Search levels ────────────────────────────────────────────────────────────

pub async fn get_levels(search: &str, star: i32, search_type: i32, creds: Option<&GDCreds>) -> Result<Vec<GDLevel>> {
    let client = Client::new();

    let star_s  = star.to_string();
    let type_s  = search_type.to_string();
    let mut params: Vec<(&str, &str)> = vec![
        ("str",    search),
        ("star",   &star_s),
        ("type",   &type_s),
        ("secret", SECRET),
    ];

    // Include account credentials when available — enables rated/friends filters
    let account_id_s;
    if let Some(c) = creds {
        account_id_s = c.account_id.to_string();
        params.push(("accountID", &account_id_s));
        params.push(("gjp2",      &c.gjp2));
    }

    let resp = client
        .post(LEVELS_URL)
        .header("User-Agent", "")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&params)
        .send()
        .await?
        .text()
        .await?;

    if resp == "-1" || resp.is_empty() {
        return Ok(vec![]);
    }

    Ok(decode_levels_response(&resp))
}

/// Look up a single level by ID.
pub async fn get_level_by_id(level_id: i64, creds: Option<&GDCreds>) -> Result<Option<GDLevel>> {
    let levels = get_levels(&level_id.to_string(), 0, 0, creds).await?;
    Ok(levels.into_iter().find(|l| l.level_id == level_id))
}

// ─── Search users ─────────────────────────────────────────────────────────────

pub async fn get_user(account_id: i64) -> Result<Option<GDUser>> {
    let client = Client::new();
    let id_str = account_id.to_string();
    let params = [("str", id_str.as_str()), ("secret", SECRET)];
    let resp = client
        .post(USERS_URL)
        .header("User-Agent", "")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&params)
        .send()
        .await?
        .text()
        .await?;

    if resp == "-1" || resp.is_empty() {
        return Ok(None);
    }

    let users = decode_users_response(&resp);
    Ok(users.into_iter().next())
}

// ─── Decoders ────────────────────────────────────────────────────────────────

fn kv_pairs(raw: &str) -> HashMap<&str, &str> {
    let parts: Vec<&str> = raw.split(':').collect();
    let mut map = HashMap::new();
    let mut i = 0;
    while i + 1 < parts.len() {
        map.insert(parts[i], parts[i + 1]);
        i += 2;
    }
    map
}

fn difficulty_from_keys(diff: i64, demon_diff: i64, demon: bool, auto: bool) -> &'static str {
    if auto   { return "Auto"; }
    if demon  {
        return match demon_diff {
            3 => "Easy Demon",
            4 => "Medium Demon",
            5 => "Insane Demon",
            6 => "Extreme Demon",
            _ => "Hard Demon",
        };
    }
    match diff {
        10 => "Easy",
        20 => "Normal",
        30 => "Hard",
        40 => "Harder",
        50 => "Insane",
        _ => "NA",
    }
}

fn level_length(code: i64) -> &'static str {
    match code {
        0 => "Tiny",
        1 => "Short",
        2 => "Medium",
        3 => "Long",
        4 => "XL",
        5 => "Platformer",
        _ => "Unknown",
    }
}

/// The response's second `#`-delimited section lists creators as
/// `playerID:playerName:accountID`, pipe-separated. Build a lookup so each
/// level chunk (which only carries the numeric player_id) can resolve a name.
fn parse_creator_names(raw: &str) -> HashMap<i64, String> {
    let mut map = HashMap::new();
    let Some(section) = raw.split('#').nth(1) else { return map; };
    for chunk in section.split('|').filter(|s| !s.is_empty()) {
        let parts: Vec<&str> = chunk.split(':').collect();
        if let (Some(id), Some(name)) = (parts.first(), parts.get(1)) {
            if let Ok(id) = id.parse::<i64>() {
                map.insert(id, name.to_string());
            }
        }
    }
    map
}

fn decode_levels_response(raw: &str) -> Vec<GDLevel> {
    let creators = parse_creator_names(raw);
    let section = raw.split('#').next().unwrap_or(raw);
    section.split('|').filter(|s| !s.is_empty()).map(|chunk| {
        let m = kv_pairs(chunk);
        let get = |k: &str| -> &str { m.get(k).copied().unwrap_or("") };
        let geti = |k: &str| -> i64 { get(k).parse().unwrap_or(0) };
        let getb = |k: &str| -> bool { geti(k) != 0 };

        let demon      = getb("17");
        let auto       = getb("25");
        let diff       = geti("9");
        let demon_diff = geti("43");
        let player_id  = geti("6");

        let description = STANDARD.decode(get("3").replace('-', "+").replace('_', "/")).ok()
            .and_then(|b| String::from_utf8(b).ok())
            .unwrap_or_default();

        GDLevel {
            level_id:       geti("1"),
            level_name:     get("2").to_string(),
            description,
            player_id,
            author:         creators.get(&player_id).cloned().unwrap_or_default(),
            difficulty:     difficulty_from_keys(diff, demon_diff, demon, auto).to_string(),
            downloads:      geti("10"),
            likes:          geti("14"),
            length:         level_length(geti("15")).to_string(),
            stars:          geti("18"),
            demon,
            auto,
            coins:          geti("37"),
            verified_coins: getb("38"),
            featured:       getb("19"),
            epic:           getb("42"),
            original_id:    geti("30"),
            version:        geti("5"),
        }
    }).collect()
}

fn decode_users_response(raw: &str) -> Vec<GDUser> {
    let section = raw.split('#').next().unwrap_or(raw);
    section.split('|').filter(|s| !s.is_empty()).map(|chunk| {
        let m = kv_pairs(chunk);
        let get  = |k: &str| -> &str { m.get(k).copied().unwrap_or("") };
        let geti = |k: &str| -> i64  { get(k).parse().unwrap_or(0) };
        GDUser {
            user_name:      get("1").to_string(),
            user_id:        geti("2"),
            account_id:     geti("16"),
            stars:          geti("3"),
            demons:         geti("4"),
            creator_points: geti("8"),
            rank:           geti("6"),
        }
    }).collect()
}
