use crate::bot::ChatMessage;
use rhai::Engine;

#[derive(Clone)]
pub struct UserProxy {
    pub name:           String,
    pub platform:       String,
    pub is_mod:         bool,
    pub is_sub:         bool,
    pub is_broadcaster: bool,
}

impl UserProxy {
    pub fn from_msg(msg: &ChatMessage) -> Self {
        Self {
            name:           msg.username.clone(),
            platform:       msg.platform.clone(),
            is_mod:         msg.is_mod,
            is_sub:         msg.is_subscriber,
            is_broadcaster: msg.is_broadcaster,
        }
    }
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<UserProxy>("User");
    engine.register_get("name",     |u: &mut UserProxy| u.name.clone());
    engine.register_get("platform", |u: &mut UserProxy| u.platform.clone());
    engine.register_fn("isMod",         |u: &mut UserProxy| u.is_mod);
    engine.register_fn("isSub",         |u: &mut UserProxy| u.is_sub);
    engine.register_fn("isBroadcaster", |u: &mut UserProxy| u.is_broadcaster);
    engine.register_fn("isStaff",       |u: &mut UserProxy| u.is_mod || u.is_broadcaster);
}
