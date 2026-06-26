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
}

export interface WsConfig {
    enabled: boolean;
    port: number;
    secret: string;
}

export interface AppConfig {
    auth: AuthConfig;
    modes: ModesConfig;
    limits: LimitsConfig;
    ws?: WsConfig;
    setup_complete: boolean;
    auto_copy_level_id: boolean;
    level_thumbnails: boolean;
    thumbnail_quality: string;
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
