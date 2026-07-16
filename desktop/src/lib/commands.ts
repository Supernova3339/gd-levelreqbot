import {invoke} from "@tauri-apps/api/core";
import type {AppConfig, BotStatusResponse, GDLevel, GDUser, HistoryPage, Keybind, MarketplaceEntry, ModuleManifest, NextLevel, QueuePage, VerifyResponse,} from "./types";

// ── Config ──────────────────────────────────────────────────────────────────

export async function getConfig(): Promise<AppConfig> {
    return invoke<AppConfig>("get_config");
}

export async function saveConfig(newConfig: AppConfig): Promise<void> {
    return invoke<void>("save_config", {newConfig});
}

export async function isSetupComplete(): Promise<boolean> {
    return invoke<boolean>("is_setup_complete");
}

export async function markSetupComplete(): Promise<void> {
    return invoke<void>("mark_setup_complete");
}

// ── Queue ───────────────────────────────────────────────────────────────────

export async function getQueue(
    queueType: "viewer" | "subscriber",
    page?: number,
    perPage?: number
): Promise<QueuePage> {
    return invoke<QueuePage>("get_queue", {queueType, page, perPage});
}

export async function addToQueue(
    levelId: number,
    username: string,
    isSubscriber: boolean
): Promise<string> {
    return invoke<string>("add_to_queue", {levelId, username, isSubscriber});
}

export async function removeFromQueue(levelId: number): Promise<string> {
    return invoke<string>("remove_from_queue", {levelId});
}

export async function clearQueue(): Promise<string> {
    return invoke<string>("clear_queue");
}

export async function nextLevel(): Promise<NextLevel | null> {
    return invoke<NextLevel | null>("next_level");
}

export async function getQueuePosition(
    levelId: number
): Promise<[number, string] | null> {
    return invoke<[number, string] | null>("get_queue_position", {levelId});
}

export async function promoteLevel(levelId: number): Promise<string> {
    return invoke<string>("promote_level", {levelId});
}

export async function shuffleQueue(): Promise<string> {
    return invoke<string>("shuffle_queue");
}

export async function openQueue(): Promise<void> {
    return invoke<void>("open_queue");
}

export async function closeQueue(): Promise<void> {
    return invoke<void>("close_queue");
}

export async function getQueueHistory(page?: number, perPage?: number): Promise<HistoryPage> {
    return invoke<HistoryPage>("get_queue_history", {page, perPage});
}

export async function clearQueueHistory(): Promise<void> {
    return invoke<void>("clear_queue_history");
}

// ── Bot ─────────────────────────────────────────────────────────────────────

export async function startBot(): Promise<void> {
    return invoke<void>("start_bot");
}

export async function stopBot(): Promise<void> {
    return invoke<void>("stop_bot");
}

export async function getBotStatus(): Promise<BotStatusResponse> {
    return invoke<BotStatusResponse>("get_bot_status");
}

// ── Auth ─────────────────────────────────────────────────────────────────────

/** Opens browser to gdlqbot.superdev.one/auth/twitch — no credentials needed */
export async function connectTwitch(): Promise<void> {
    return invoke<void>("connect_twitch");
}

export async function checkTwitchToken(): Promise<boolean> {
    return invoke<boolean>("check_twitch_token");
}

export async function refreshTwitchToken(): Promise<void> {
    return invoke<void>("refresh_twitch_token");
}

/** Opens browser to gdlqbot.superdev.one/auth/youtube */
export async function connectYouTube(): Promise<void> {
    return invoke<void>("connect_youtube");
}

export async function checkYouTubeToken(): Promise<boolean> {
    return invoke<boolean>("check_youtube_token");
}

export async function disconnectTwitch(): Promise<void> {
    return invoke<void>("disconnect_twitch");
}

export async function connectBotAccount(): Promise<void> {
    return invoke<void>("connect_bot_account");
}

export async function disconnectBotAccount(): Promise<void> {
    return invoke<void>("disconnect_bot_account");
}

export async function getBotAccountInfo(): Promise<TwitchUserInfo> {
    return invoke<TwitchUserInfo>("get_bot_account_info");
}

export async function disconnectYouTube(): Promise<void> {
    return invoke<void>("disconnect_youtube");
}

export interface TwitchUserInfo {
    login: string;
    display_name: string;
    profile_image_url: string;
}

export interface YouTubeUserInfo {
    name: string;
    picture: string;
    email: string;
}

export async function getTwitchUserInfo(): Promise<TwitchUserInfo> {
    return invoke<TwitchUserInfo>("get_twitch_user_info");
}

export async function getYouTubeUserInfo(): Promise<YouTubeUserInfo> {
    return invoke<YouTubeUserInfo>("get_youtube_user_info");
}

// ── Bot commands registry ─────────────────────────────────────────────────────

export interface BotCommand {
    id: number;
    trigger: string;
    aliases: string;              // JSON string
    enabled: boolean;
    description: string;
    builtin_key: string | null;
    response: string | null;
    required_badges: string;      // JSON string
    cooldown_seconds: number;
    user_cooldown_seconds: number;
    platform: string;             // 'all' | 'twitch' | 'youtube'
    counter: number;
    script: string | null;
    script_mode: string;          // "text" | "visual" — locked at creation
}

export async function saveScript(id: number, script: string | null): Promise<void> {
    return invoke<void>("save_script", {id, script});
}

export async function getCommands(): Promise<BotCommand[]> {
    return invoke<BotCommand[]>("get_commands");
}

export async function updateCommand(
    id: number,
    trigger: string,
    aliases: string,
    enabled: boolean,
    description: string,
    response: string | null,
    requiredBadges: string,
    cooldownSeconds: number,
    userCooldownSeconds: number,
    platform: string,
): Promise<void> {
    return invoke<void>("update_command", {
        id, trigger, aliases,
        enabled: enabled === true || (enabled as unknown as number) === 1,  // SQLite sends 0/1; force boolean
        description, response,
        requiredBadges, cooldownSeconds, userCooldownSeconds, platform,
    });
}

export async function resetCounter(id: number): Promise<void> {
    return invoke<void>("reset_counter", {id});
}

// ── GD API ────────────────────────────────────────────────────────────────────

export async function searchGdLevel(levelId: number): Promise<GDLevel | null> {
    return invoke<GDLevel | null>("search_gd_level", {levelId});
}

export async function searchGdLevels(query: string, searchType = 0): Promise<GDLevel[]> {
    return invoke<GDLevel[]>("search_gd_levels", {query, searchType});
}

export async function getGdUser(accountId: number): Promise<GDUser | null> {
    return invoke<GDUser | null>("get_gd_user", {accountId});
}

// ── GD account integration ───────────────────────────────────────────────────

export interface GDAccountInfo {
    account_id: number;
    username: string;
    connected: boolean;
    icon_url: string;
    icon_b64: string;
}

export async function gdLogin(username: string, password: string): Promise<GDAccountInfo> {
    return invoke<GDAccountInfo>("gd_login", {username, password});
}

export async function gdLogout(): Promise<void> {
    return invoke<void>("gd_logout");
}

export async function getGdAccount(): Promise<GDAccountInfo> {
    return invoke<GDAccountInfo>("get_gd_account");
}

// ── Keybinds ──────────────────────────────────────────────────────────────────

export async function getKeybinds(): Promise<Keybind[]> {
    return invoke<Keybind[]>("get_keybinds");
}

export async function setKeybind(action: string, shortcut: string): Promise<void> {
    return invoke<void>("set_keybind", {action, shortcut});
}

export async function createCommand(trigger: string, response: string, description: string, scriptMode?: string): Promise<BotCommand> {
    return invoke<BotCommand>("create_command", {trigger, response, description, scriptMode});
}

export async function deleteCommand(id: number): Promise<void> {
    return invoke<void>("delete_command", {id});
}

export async function toggleCommandEnabled(id: number, enabled: boolean): Promise<void> {
    return invoke<void>("toggle_command_enabled", {id, enabled});
}

export async function duplicateCommand(id: number): Promise<BotCommand> {
    return invoke<BotCommand>("duplicate_command", {id});
}

// ── Modules ──────────────────────────────────────────────────────────────────

export async function listModules(): Promise<ModuleManifest[]> {
    return invoke<ModuleManifest[]>("list_modules");
}

export async function toggleModule(id: string, enabled: boolean): Promise<void> {
    return invoke<void>("toggle_module", {id, enabled});
}

export async function installModule(manifestJson: string): Promise<void> {
    return invoke<void>("install_module", {manifestJson});
}

export async function uninstallModule(id: string): Promise<void> {
    return invoke<void>("uninstall_module", {id});
}

/** Evaluate a Rhai snippet with `ms` injected; returns the JSON-encoded result.
 *  Pass extraVars to inject additional Rhai scope variables (e.g. selection state). */
export async function evalModulePanelData(
    moduleId: string,
    rhaiSnippet: string,
    extraVars?: Record<string, unknown>,
): Promise<unknown> {
    const extraVarsJson = extraVars && Object.keys(extraVars).length > 0
        ? JSON.stringify(extraVars) : undefined;
    const json = await invoke<string>("eval_module_panel_data", {moduleId, rhaiSnippet, extraVarsJson});
    try { return JSON.parse(json); } catch { return null; }
}

/** Execute a named action script from a module and return any chat output lines. */
export async function executeModuleAction(
    moduleId: string,
    actionKey: string,
    args?: string[],
): Promise<string[]> {
    return invoke<string[]>("execute_module_action", {moduleId, actionKey, args});
}

/** Open a native file picker for .json module manifests; returns file contents or null if cancelled. */
export async function loadModuleFile(): Promise<string | null> {
    return invoke<string | null>("load_module_file");
}

// ── Marketplace ───────────────────────────────────────────────────────────────

/** Returns the full marketplace catalog (bundled official + community modules). */
export async function fetchMarketplace(): Promise<MarketplaceEntry[]> {
    return invoke<MarketplaceEntry[]>("fetch_marketplace");
}

/** Install a module from the marketplace by its ID. Handles download + disk extraction. */
export async function installMarketplaceModule(id: string): Promise<void> {
    return invoke<void>("install_marketplace_module", {id});
}

/** Install a .gdmod package from raw bytes (for file-picker installs). */
export async function installGdmodBytes(bytes: number[]): Promise<void> {
    return invoke<void>("install_gdmod_bytes", {bytes});
}

/** Install any package type (.gdmod, .gdlib, .gdpck) from raw bytes — type is auto-detected from manifest. */
export async function installLocalPackage(bytes: number[]): Promise<void> {
    return invoke<void>("install_local_package", {bytes});
}

// ── Dev tools ────────────────────────────────────────────────────────────────

/** Save a PNG screenshot to {module_dir}/store/screenshots/. Returns the absolute path written. */
export async function saveModuleScreenshot(moduleId: string, filename: string, pngBytes: number[]): Promise<string> {
    return invoke<string>("save_module_screenshot", {moduleId, filename, pngBytes});
}

// ── Licensing ─────────────────────────────────────────────────────────────────

export async function getLicenseToken(): Promise<string | null> {
    return invoke<string | null>("get_license_token");
}

export async function setLicenseToken(token: string): Promise<void> {
    return invoke<void>("set_license_token", {token});
}

export async function clearLicenseToken(): Promise<void> {
    return invoke<void>("clear_license_token");
}

export async function verifyLicenseToken(token: string): Promise<VerifyResponse> {
    return invoke<VerifyResponse>("verify_license_token", {token});
}

export async function openGithubLogin(state: string): Promise<void> {
    return invoke<void>("open_github_login", {state});
}

// ── Libraries ─────────────────────────────────────────────────────────────────

export interface LibraryInfo {
    id: number;
    name: string;
    description: string;
    is_stdlib: boolean;
    enabled: boolean;
}

export async function getLibraries(): Promise<LibraryInfo[]> {
    return invoke<LibraryInfo[]>("get_libraries");
}

export async function uninstallLibrary(name: string): Promise<void> {
    return invoke<void>("uninstall_library", { name });
}
