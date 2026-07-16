export interface AuthConfig {
    bot_username: string;
    /** OAuth token for the bot's account (when using a separate bot) */
    bot_access_token: string;
    channel: string;
    web_api_token: string;
    /** OAuth token for the channel/streamer account */
    twitch_access_token: string;
    youtube_access_token: string;
    youtube_api_key: string;
}

export interface ModesConfig {
    gd: boolean;
    sub: boolean;
    smart: boolean;
    youtube: boolean;
}

export interface LimitsConfig {
    viewer_request_limit: number;
    subscriber_request_limit: number;
    max_queue_size: number;
}

export interface WsConfig {
    enabled: boolean;
    port: number;
    secret: string;
}

export interface GDAccount {
    account_id: number;
    username: string;
    gjp2_enc: string;
}

export interface AppConfig {
    auth: AuthConfig;
    modes: ModesConfig;
    limits: LimitsConfig;
    ws?: WsConfig;
    gd_account?: GDAccount;
    setup_complete: boolean;
    auto_copy_level_id: boolean;
    level_thumbnails: boolean;
    thumbnail_quality: string;
    queue_open: boolean;
}

export interface HistoryEntry {
    id: number;
    level_id: number;
    username: string;
    queue_type: string;
    platform: string;
    nexted_at: string;
}

export interface HistoryPage {
    data: HistoryEntry[];
    page: number;
    total_pages: number;
    total_items: number;
}

export interface GDLevel {
    level_id: number;
    level_name: string;
    description: string;
    player_id: number;
    difficulty: string;
    downloads: number;
    likes: number;
    length: string;
    stars: number;
    demon: boolean;
    auto: boolean;
    coins: number;
    verified_coins: boolean;
    featured: boolean;
    epic: boolean;
    original_id: number;
    version: number;
}

export interface GDUser {
    user_name: string;
    user_id: number;
    account_id: number;
    stars: number;
    demons: number;
    creator_points: number;
    rank: number;
}

export interface Keybind {
    action: string;
    shortcut: string;
}

export interface QueueEntry {
    id: number;
    level_id: number;
    username: string;
    is_subscriber: boolean;
    position: number;
    queue_type: string;
    platform: string;
    added_at: string;
}

export interface QueuePage {
    data: QueueEntry[];
    page: number;
    total_pages: number;
    total_items: number;
    items_per_page: number;
}

export interface NextLevel {
    level_id: number;
    username: string;
    queue_type: string;
}

export interface BotStatusResponse {
    status: "stopped" | "connecting" | "connected" | { error: string };
    twitch_connected: boolean;
    youtube_connected: boolean;
}

// ── Modules ──────────────────────────────────────────────────────────────────

export interface CommandDef {
    trigger: string;
    aliases?: string[];
    description?: string;
    builtin_key: string;
    required_badges?: string[];
    enabled?: boolean;
    cooldown_seconds?: number;
    user_cooldown_seconds?: number;
}

export interface WidgetAction {
    label: string;
    action_key: string;
    /** Row field to pass as args[0] when triggered from a List row. Defaults to row_id. */
    arg_field?: string;
    args?: string[];
    style?: "default" | "danger" | "success";
}

// ── Page / Layout system ──────────────────────────────────────────────────────

export interface FieldDef {
    key: string;
    label: string;
    type?: "text" | "number" | "image" | "badge" | "stars";
}

export interface LayoutNode {
    type: "TwoColumn" | "Tabs" | "List" | "Toolbar" | "DetailCard" | "Stack" | "Empty";
    // TwoColumn
    left_width?: number;
    left?: LayoutNode;
    right?: LayoutNode;
    // Stack
    children?: LayoutNode[];
    // Tabs
    tabs?: Array<{ label: string; badge_expr?: string; content: LayoutNode }>;
    // List
    sections?: Array<{ label?: string; data_expr: string }>;
    row_id?: string;
    row_primary?: string;
    row_secondary?: string;
    row_platform?: string;
    selection_key?: string;
    row_actions?: WidgetAction[];
    empty_message?: string;
    // Toolbar
    status_expr?: string;
    status_on_label?: string;
    status_off_label?: string;
    status_action_on?: string;
    status_action_off?: string;
    count_expr?: string;
    max_expr?: string;
    actions?: WidgetAction[];
    // DetailCard
    data_expr?: string;
    fields?: FieldDef[];
    placeholder?: string;
    [key: string]: unknown;
}

export interface PageDef {
    id: string;
    label: string;
    icon?: string;
    category?: string;
    layout: LayoutNode;
}

export interface WidgetDef {
    widget_type: string;
    // Table
    columns?: { key: string; label: string }[];
    data_expr?: string;
    actions?: WidgetAction[];
    row_actions?: WidgetAction[];
    // StatCard
    label?: string;
    value_expr?: string;
    // StatusBadge
    // QueuePanel / HistoryPanel
    viewer_data_expr?: string;
    subscriber_data_expr?: string;
    open_expr?: string;
    max_size_expr?: string;
    [key: string]: unknown;
}

export interface PanelDef {
    id: string;
    label: string;
    widgets: WidgetDef[];
}

export interface ModuleManifest {
    id: string;
    name: string;
    version: string;
    min_app_version?: string;
    builtin: boolean;
    enabled: boolean;
    description: string;
    icon: string;
    panels: PanelDef[];
    pages?: PageDef[];
    commands: CommandDef[];
    /** Maps script key → relative path within the module directory. */
    scripts?: Record<string, string>;
}

// ── Licensing ────────────────────────────────────────────────────────────────

export interface VerifyResponse {
    valid: boolean;
    is_sponsor?: boolean;
    github_username?: string;
    expires_at?: string;
    error?: string;
}

// ── Marketplace ───────────────────────────────────────────────────────────────

export interface MarketplaceEntry {
    id: string;
    name: string;
    author: string;
    /** Whether this is a bot-command module or an installable Rhai function library, or a multi-library bundle. */
    package_type?: "module" | "library" | "package";
    /** Approval lifecycle state — only non-published entries carry this. */
    status?: "draft" | "pending" | "published" | "denied";
    deny_reason?: string;
    submitter_username?: string;
    /** Current version — pulled from the latest published release. */
    version: string;
    min_app_version: string;
    description: string;
    icon: string;
    verified: boolean;
    premium: boolean;
    downloads: number;
    tags: string[];
    /** Direct download URL from the latest published release. */
    download_url: string;
    checksum: string;
    /** Changelog from the latest published release. */
    changelog?: string;
    /** Release date of the latest published release. */
    pub_date?: string;
    /** Full manifest object — present only for bundled official modules. */
    manifest?: Record<string, unknown>;
    /** For library packages: component library names this package installs. */
    components?: string[];
    /** For .gdpck bundles: library IDs bundled inside this package. */
    libraries?: string[];
    /** For .gdpck bundles: module IDs bundled inside this package. */
    modules?: string[];
    /** Resource assets for this module (screenshots, banner, icon overrides). */
    resources?: Array<{
        id: number;
        resource_type: "icon" | "screenshot" | "banner" | "asset";
        url: string;
        filename: string;
        sort_order: number;
    }>;
}
