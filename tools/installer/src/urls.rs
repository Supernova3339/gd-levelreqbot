//! Licensing/marketplace server base URLs for the developer-login flow (see
//! devauth.rs). Mirrors desktop/src-tauri/src/urls.rs and
//! desktop/src/lib/urls.ts — this installer is a separate binary so it can't
//! share that code directly, but the values must stay in sync. Flip
//! `USE_STAGING` in lockstep with those two if testing against the
//! `server-new` staging path; leave `false` for a real release build.

const USE_STAGING: bool = false;

const PROD_LICENSING_BASE: &str = "https://dl.supers0ft.us/gdlvlreqbot/licensing";
const PROD_MARKETPLACE_BASE: &str = "https://dl.supers0ft.us/gdlvlreqbot/marketplace";

const STAGING_LICENSING_BASE: &str = "https://dl.supers0ft.us/gdlvlreqbot/server-new/licensing";
const STAGING_MARKETPLACE_BASE: &str = "https://dl.supers0ft.us/gdlvlreqbot/server-new/marketplace";

pub const LICENSING_BASE: &str = if USE_STAGING { STAGING_LICENSING_BASE } else { PROD_LICENSING_BASE };
pub const MARKETPLACE_BASE: &str = if USE_STAGING { STAGING_MARKETPLACE_BASE } else { PROD_MARKETPLACE_BASE };
