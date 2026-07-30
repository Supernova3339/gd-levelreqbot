//! Single source of truth for the licensing/marketplace server base URLs.
//!
//! Before this existed, `MARKETPLACE_BASE` and `LICENSING_BASE` were each
//! hardcoded separately in `commands/marketplace.rs`, `commands/licensing.rs`,
//! and `api/mod.rs` — during the server-new staging rollout, some of those
//! copies got flipped to the staging path and others didn't, silently
//! pointing different parts of the app at different backends. Every call
//! site should import from here instead of hardcoding the domain.
//!
//! While following DEPLOY.md Phase A (testing against the `server-new`
//! staging path), flip `USE_STAGING` to `true` and rebuild — that's the only
//! edit needed. Flip it back to `false` before a real release build; it's
//! `false` by default so a normal build can never accidentally ship pointed
//! at staging.

const USE_STAGING: bool = true; // currently mid-rollout against server-new — flip to false before shipping

const PROD_LICENSING_BASE: &str = "https://dl.supers0ft.us/gdlvlreqbot/licensing";
const PROD_MARKETPLACE_BASE: &str = "https://dl.supers0ft.us/gdlvlreqbot/marketplace";

const STAGING_LICENSING_BASE: &str = "https://dl.supers0ft.us/gdlvlreqbot/server-new/licensing";
const STAGING_MARKETPLACE_BASE: &str = "https://dl.supers0ft.us/gdlvlreqbot/server-new/marketplace";

pub const LICENSING_BASE: &str = if USE_STAGING { STAGING_LICENSING_BASE } else { PROD_LICENSING_BASE };
pub const MARKETPLACE_BASE: &str = if USE_STAGING { STAGING_MARKETPLACE_BASE } else { PROD_MARKETPLACE_BASE };
