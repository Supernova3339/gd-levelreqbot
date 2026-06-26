use rhai::{Dynamic, Engine, Map};
use tracing::error;
use super::queue::block_on;

#[derive(Clone)]
pub struct GdProxy;

fn level_to_map(lvl: crate::gd::GDLevel) -> Dynamic {
    let mut m = Map::new();
    m.insert("id".into(), Dynamic::from(lvl.level_id));
    m.insert("name".into(), Dynamic::from(lvl.level_name));
    m.insert("difficulty".into(), Dynamic::from(lvl.difficulty));
    m.insert("stars".into(), Dynamic::from(lvl.stars));
    m.insert("downloads".into(), Dynamic::from(lvl.downloads));
    m.insert("likes".into(), Dynamic::from(lvl.likes));
    m.insert("length".into(), Dynamic::from(lvl.length));
    m.insert("is_demon".into(), Dynamic::from(lvl.demon));
    m.insert("is_featured".into(), Dynamic::from(lvl.featured));
    m.insert("is_epic".into(), Dynamic::from(lvl.epic));
    Dynamic::from_map(m)
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<GdProxy>("Gd");

    engine.register_fn("fetch", |_: &mut GdProxy, id: &str| -> Dynamic {
        let n: i64 = match id.trim().parse() { Ok(n) => n, Err(_) => return Dynamic::UNIT };
        match block_on(crate::gd::get_level_by_id(n)) {
            Ok(Some(lvl)) => level_to_map(lvl),
            Ok(None) => Dynamic::UNIT,
            Err(e) => { error!("gd.fetch: {e}"); Dynamic::UNIT }
        }
    });

    engine.register_fn("search", |_: &mut GdProxy, query: &str| -> Vec<Dynamic> {
        match block_on(crate::gd::get_levels(query, 0, 0)) {
            Ok(levels) => levels.into_iter().map(level_to_map).collect(),
            Err(e) => { error!("gd.search: {e}"); vec![] }
        }
    });

    engine.register_fn("isValidId", |_: &mut GdProxy, s: &str| -> bool {
        let digits: String = s.chars().filter(|c| c.is_ascii_digit()).take(9).collect();
        digits.len() >= 3 && digits.parse::<i64>().is_ok()
    });
}
