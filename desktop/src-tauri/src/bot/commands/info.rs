use super::{parse_level_id, Ctx};
use tracing::error;

/// `!info <level_id>` — show Geometry Dash level details
pub async fn info(ctx: &Ctx<'_>) -> Option<String> {
    let Some(level_id) = parse_level_id(ctx.args) else {
        return Some(format!("@{} — usage: !info <level_id>", ctx.msg.username));
    };

    match crate::gd::get_level_by_id(level_id).await {
        Ok(Some(lvl)) => {
            let mut parts = vec![
                format!("{} ({})", lvl.level_name, lvl.level_id),
                format!("{} ★{}", lvl.difficulty, lvl.stars),
                format!("{}", lvl.length),
            ];

            if lvl.demon   { parts.push("Demon".into()); }
            if lvl.epic    { parts.push("Epic".into()); }
            if lvl.featured { parts.push("Featured".into()); }

            parts.push(format!("↓{}", format_num(lvl.downloads)));
            parts.push(format!("♥{}", format_num(lvl.likes)));

            Some(parts.join(" | "))
        }
        Ok(None) => Some(format!("Level {level_id} not found on the GD servers.")),
        Err(e)   => { error!("!info gd fetch: {e}"); Some("Could not fetch level info right now.".into()) }
    }
}

fn format_num(n: i64) -> String {
    if n >= 1_000_000 { format!("{:.1}M", n as f64 / 1_000_000.0) }
    else if n >= 1_000 { format!("{:.1}K", n as f64 / 1_000.0) }
    else { n.to_string() }
}
