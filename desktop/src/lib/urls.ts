/**
 * Single source of truth for the marketplace server base URL used by direct
 * fetch() calls (see marketplace-api.ts). The licensing/marketplace URLs
 * used by Tauri commands live in the Rust-side equivalent,
 * desktop/src-tauri/src/urls.rs — keep both in sync.
 *
 * While following DEPLOY.md Phase A (testing against the `server-new`
 * staging path), flip USE_STAGING to true. Flip back to false before a real
 * release build; it's false by default so this can't accidentally ship
 * pointed at staging.
 */

const USE_STAGING = true; // currently mid-rollout against server-new — flip to false before shipping

const PROD_MARKETPLACE_BASE = "https://dl.supers0ft.us/gdlvlreqbot/marketplace";
const STAGING_MARKETPLACE_BASE = "https://dl.supers0ft.us/gdlvlreqbot/server-new/marketplace";

export const MARKETPLACE_BASE = USE_STAGING ? STAGING_MARKETPLACE_BASE : PROD_MARKETPLACE_BASE;
