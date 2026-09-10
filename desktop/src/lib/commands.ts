import {invoke} from "@tauri-apps/api/core";
import type {
    AppConfig,
    BotStatusResponse,
    GDLevel,
    GDUser,
    HistoryPage,
    Keybind,
    MarketplaceEntry,
    ModuleManifest,
    NextLevel,
    QueuePage,
    VerifyResponse,
} from "./types";

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

export interface TwitchRewardImage {
    url_1x: string; // 28x28
    url_2x: string; // 56x56
    url_4x: string; // 112x112
}

export interface TwitchReward {
    id: string;
    title: string;
    cost: number;
    prompt: string;
    is_enabled: boolean;
    /** Only set if the broadcaster picked a custom icon on the Twitch dashboard. */
    image: TwitchRewardImage | null;
    /** Twitch's fallback icon set — always present. */
    default_image: TwitchRewardImage | null;
}

/** This app's manageable channel-point rewards. Throws if the bot isn't connected. */
export async function listTwitchRewards(): Promise<TwitchReward[]> {
    return invoke<TwitchReward[]>("list_twitch_rewards");
}

/** Create a new channel-point reward. Throws if the bot isn't connected or the call fails. */
export async function createTwitchReward(title: string, cost: number, prompt?: string): Promise<TwitchReward> {
    return invoke<TwitchReward>("create_twitch_reward", {title, cost, prompt: prompt ?? null});
}

/** Update a reward's title/cost/prompt/enabled state. Pass undefined to leave a field
 *  unchanged. Note: Twitch's API has no way to set a reward's icon — dashboard only. */
export async function updateTwitchReward(
    rewardId: string,
    fields: { title?: string; cost?: number; prompt?: string; isEnabled?: boolean },
): Promise<TwitchReward> {
    return invoke<TwitchReward>("update_twitch_reward", {
        rewardId,
        title: fields.title ?? null,
        cost: fields.cost ?? null,
        prompt: fields.prompt ?? null,
        isEnabled: fields.isEnabled ?? null,
    });
}

/** Delete a channel-point reward (must have been created by this app). */
export async function deleteTwitchReward(rewardId: string): Promise<void> {
    return invoke<void>("delete_twitch_reward", {rewardId});
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
    sort_order: number;
    /** Off lets a command exist purely as a listener, invisible to chat. */
    chat_enabled: boolean;
    /** JSON string: ListenerDef[]. Zero or more additional ways this command
     *  can fire, independent of (and in addition to) the chat trigger. */
    listeners: string;
}

export interface ListenerDef {
    type: "twitch_redemption" | "event";
    /** Reward title (twitch_redemption) or event name (event). */
    config: string;
}

export interface ModuleEventOption {
    full_name: string;
    label: string;
    module_name: string;
}

/** Every event declared by an enabled module's manifest, in the namespaced
 *  form dispatch actually matches against — data source for the event picker. */
export async function listModuleEvents(): Promise<ModuleEventOption[]> {
    return invoke<ModuleEventOption[]>("list_module_events");
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
    chatEnabled?: boolean,
    listeners?: ListenerDef[],
): Promise<void> {
    return invoke<void>("update_command", {
        id, trigger, aliases,
        enabled: enabled === true || (enabled as unknown as number) === 1,  // SQLite sends 0/1; force boolean
        description, response,
        requiredBadges, cooldownSeconds, userCooldownSeconds, platform,
        chatEnabled: chatEnabled ?? true,
        listeners: JSON.stringify(listeners ?? []),
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

export async function reorderCommands(ids: number[]): Promise<void> {
    return invoke<void>("reorder_commands", {ids});
}

export async function sortSectionCommands(
    ids: number[],
    strategy: "alpha" | "register",
    registerOrder?: number[],
): Promise<void> {
    return invoke<void>("sort_section_commands", {ids, strategy, registerOrder: registerOrder ?? null});
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

/** Same as evalModulePanelData, but rejects with the real Rhai error instead of
 *  silently returning null on failure — see eval_module_panel_data_strict's doc comment. */
export async function evalModulePanelDataStrict(
    moduleId: string,
    rhaiSnippet: string,
    extraVars?: Record<string, unknown>,
): Promise<unknown> {
    const extraVarsJson = extraVars && Object.keys(extraVars).length > 0
        ? JSON.stringify(extraVars) : undefined;
    const json = await invoke<string>("eval_module_panel_data_strict", {moduleId, rhaiSnippet, extraVarsJson});
    try {
        return JSON.parse(json);
    } catch {
        return null;
    }
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

/** Read a module UI page file (e.g. "ui/queue.gdui") from disk as raw XML string. */
export async function readModulePage(moduleId: string, path: string): Promise<string> {
    return invoke<string>("read_module_page", {moduleId, path});
}

/** Read a module's raster resource (e.g. "resources/logo.png") as a data: URI. */
export async function readModuleResourceDataUrl(moduleId: string, path: string): Promise<string> {
    return invoke<string>("read_module_resource_data_url", {moduleId, path});
}

/** Return the Rhai source of whichever module owns the given builtin_key, or null if none. */
export async function readModuleScriptForBuiltin(builtinKey: string): Promise<string | null> {
    return invoke<string | null>("read_module_script_for_builtin", {builtinKey});
}

/** Open a native directory picker. Returns the selected path, or null if cancelled. */
export async function pickDirectory(): Promise<string | null> {
    return invoke<string | null>("pick_directory");
}

// ── Marketplace ───────────────────────────────────────────────────────────────

/** Returns the full marketplace catalog (bundled official + community modules). */
export async function fetchMarketplace(filters?: {
    sort?: "popular" | "top_rated" | "newest" | "updated";
    category?: string;
    q?: string;
}): Promise<MarketplaceEntry[]> {
    return invoke<MarketplaceEntry[]>("fetch_marketplace", {
        sort: filters?.sort ?? null,
        category: filters?.category ?? null,
        q: filters?.q ?? null,
    });
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

/** Install a module from a local source directory (reads manifest.json from that dir). Returns the module ID. */
export async function installModuleFromDir(sourceDir: string): Promise<string> {
    return invoke<string>("install_module_from_dir", {sourceDir});
}

/** Fully wipe the installed copy of a local/dev module and reinstall fresh from
 *  sourceDir — unlike the normal watch sync, also removes files that no longer
 *  exist in source. Command/listener customizations on the module's commands
 *  are preserved (only the on-disk module files + manifest are replaced). */
export async function hardRefreshModule(sourceDir: string): Promise<string> {
    return invoke<string>("hard_refresh_module", {sourceDir});
}

export interface DevWatch {
    module_id: string;
    source_dir: string;
}

/** Start watching a source directory and hot-reloading the module on file changes. */
export async function startModuleDevWatch(moduleId: string, sourceDir: string): Promise<void> {
    return invoke<void>("start_module_dev_watch", {moduleId, sourceDir});
}

/** Stop watching a module source directory. */
export async function stopModuleDevWatch(moduleId: string): Promise<void> {
    return invoke<void>("stop_module_dev_watch", {moduleId});
}

/** List all currently active dev watches. */
export async function listDevWatches(): Promise<DevWatch[]> {
    return invoke<DevWatch[]>("list_dev_watches");
}

/** Restore persisted dev watches from DB (call once on app startup). */
export async function restoreDevWatches(): Promise<void> {
    return invoke<void>("restore_dev_watches");
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

/** GDPR Art. 15 export — full response shape is server-defined; the caller
 *  only needs to pretty-print it, so this stays untyped. */
export async function gdprExport(token: string): Promise<unknown> {
    return invoke<unknown>("gdpr_export", {token});
}

export interface GdprEraseResponse {
    success: boolean;
    message: string;
}

export async function gdprErase(token: string): Promise<GdprEraseResponse> {
    return invoke<GdprEraseResponse>("gdpr_erase", {token});
}

// ── Libraries ─────────────────────────────────────────────────────────────────

export interface LibraryInfo {
    id: number;
    name: string;
    description: string;
    is_stdlib: boolean;
    enabled: boolean;
    source_module: string | null;
}

export async function getLibraries(): Promise<LibraryInfo[]> {
    return invoke<LibraryInfo[]>("get_libraries");
}

export async function uninstallLibrary(name: string): Promise<void> {
    return invoke<void>("uninstall_library", { name });
}

export interface InstalledPackage {
    id: string;
    version: string;
    libs: string[];
}

export async function getInstalledPackages(): Promise<InstalledPackage[]> {
    return invoke<InstalledPackage[]>("get_installed_packages");
}

export async function uninstallPackage(id: string): Promise<void> {
    return invoke<void>("uninstall_package", {id});
}

export type MarketplaceRole = "user" | "author" | "staff" | "admin";

export interface MarketplaceMeResponse {
    github_id: number;
    username: string;
    is_sponsor: boolean;
    is_owner: boolean;
    role: MarketplaceRole;
}

export async function fetchMarketplaceMe(token: string): Promise<MarketplaceMeResponse> {
    return invoke<MarketplaceMeResponse>("fetch_marketplace_me", {token});
}

export async function fetchMarketplaceAdminList(token: string): Promise<MarketplaceEntry[]> {
    return invoke<MarketplaceEntry[]>("fetch_marketplace_admin_list", {token});
}

export async function openDebugConsole(): Promise<void> {
    return invoke<void>("open_debug_console");
}

export interface PreflightIssue {
    severity: "error" | "warn";
    kind: "script" | "ui" | "library" | "command" | "module";
    file: string | null;
    message: string;
}

export async function preflightModule(id: string): Promise<PreflightIssue[]> {
    return invoke<PreflightIssue[]>("preflight_module", {id});
}

// ── CLI PATH setup ────────────────────────────────────────────────────────────

export interface CliInstallResult {
    installed: boolean;
    dir: string | null;
    already_in_path: boolean;
    binary_found: boolean;
}

export async function cliInstallStatus(): Promise<CliInstallResult> {
    return invoke<CliInstallResult>("cli_install_status");
}

export async function installCliToPath(): Promise<CliInstallResult> {
    return invoke<CliInstallResult>("install_cli_to_path");
}

export async function uninstallCliFromPath(): Promise<void> {
    return invoke<void>("uninstall_cli_from_path");
}

