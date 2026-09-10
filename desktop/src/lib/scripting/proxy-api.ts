// Single source of truth for every proxy object/context var available to Rhai
// scripts, mirrored exactly from desktop/src-tauri/src/scripting/{proxy/*.rs,execute.rs}.
//
// This drives BOTH the toolbar picker (VarChipDropdown) and the "." autocomplete
// (TextEditor + AutocompleteDropdown) — there is intentionally only one list, so
// they can't drift out of sync with each other or with what actually exists.
//
// Availability matters: several proxies only exist in certain script contexts
// (see execute.rs's Scope construction). Showing a proxy the current script
// can't actually use is worse than not showing it — the inserted snippet would
// fail at runtime with "variable not found". Always filter through
// `isAvailable()` / `availableProxyNames()` before displaying anything.

export interface CompletionItem {
    label: string;
    insert: string;
    docs: string;
    cursor?: number;  // offset into `insert` to place cursor; -1 = end
}

export type Availability =
    | "always"   // every script — module or custom
    | "module"   // module-owned command scripts only (builtin_key scripts)
    | "custom"   // plain custom commands only (no module_id)
    | "shell";   // only when Settings → Scripting → shell access is enabled

export interface ProxyMeta {
    color: string;
    availability: Availability;
    /** One-line description shown above the proxy's entries in the picker. */
    summary: string;
}

/** What the current script can actually see in scope — see execute.rs. */
export interface ScriptContext {
    isModule: boolean;
    shellEnabled: boolean;
}

export const PROXY_META: Record<string, ProxyMeta> = {
    chat: {color: "#c792ea", availability: "always", summary: "Send messages to chat"},
    command: {
        color: "#fbbf24",
        availability: "always",
        summary: "How this run was invoked — trigger, alias, usage count"
    },
    console: {color: "#a3a3a3", availability: "always", summary: "Log to the script debug console"},
    ms: {color: "#4ade80", availability: "module", summary: "Module-scoped key/value store + collections"},
    gd: {color: "#a78bfa", availability: "always", summary: "Geometry Dash level lookups"},
    twitch: {
        color: "#9146ff",
        availability: "always",
        summary: "Twitch Helix API (announcements, user lookup, channel-point rewards)"
    },
    youtube: {color: "#ff0000", availability: "always", summary: "YouTube Data API (own channel info)"},
    user: {color: "#c3e88d", availability: "always", summary: "The user who triggered this command"},
    rand: {color: "#f78c6c", availability: "always", summary: "Random numbers and array helpers"},
    time: {color: "#f59e0b", availability: "always", summary: "Timestamps and formatting"},
    event: {color: "#34d399", availability: "always", summary: "Emit events to the frontend / WebSocket"},
    web: {color: "#22d3ee", availability: "custom", summary: "HTTP requests (custom commands only)"},
    io: {color: "#eab308", availability: "always", summary: "JSON / CSV parsing utilities"},
    queue: {color: "#22c55e", availability: "custom", summary: "Legacy level-queue access (custom commands only)"},
    store: {color: "#6366f1", availability: "custom", summary: "Legacy global key/value store (custom commands only)"},
    data: {color: "#fb7185", availability: "custom", summary: "Legacy document collections (custom commands only)"},
    db: {color: "#f472b6", availability: "custom", summary: "Raw SQL exec (custom commands only)"},
    cache: {
        color: "#38bdf8",
        availability: "custom",
        summary: "TTL-cached HTTP fetches — replaces the old Integrations feature (custom commands only)"
    },
    shell: {color: "#f87171", availability: "shell", summary: "Run local shell commands — enabled in Settings"},
};

// Ordered display list — module-relevant proxies first, then always-available,
// then legacy custom-only ones, shell last (most dangerous / least common).
export const PROXY_ORDER = [
    "chat", "command", "ms", "user", "gd", "twitch", "youtube",
    "rand", "time", "event", "web", "io", "console",
    "queue", "store", "data", "cache", "db", "shell",
];

export const PROXY_NAMES = Object.keys(PROXY_META);

export function isAvailable(availability: Availability, ctx: ScriptContext): boolean {
    switch (availability) {
        case "always":
            return true;
        case "module":
            return ctx.isModule;
        case "custom":
            return !ctx.isModule;
        case "shell":
            return ctx.shellEnabled;
    }
}

/** Proxy names usable in the current script context, in display order. */
export function availableProxyNames(ctx: ScriptContext): string[] {
    return PROXY_ORDER.filter((name) => isAvailable(PROXY_META[name].availability, ctx));
}

// Context variables available at top level (not behind a proxy dot).
export const CONTEXT_VARS_ALWAYS: CompletionItem[] = [
    {label: "command_trigger", insert: "command_trigger", docs: 'e.g. "!request" — prefer the command proxy below'},
    {label: "args", insert: "args", docs: "Array of whitespace-split arguments"},
    {label: "args[0]", insert: "args[0]", docs: "First argument"},
    {label: "args.len()", insert: "args.len()", docs: "Number of arguments"},
];

// Only present for custom (non-module) command scripts — see execute.rs.
export const CONTEXT_VARS_CUSTOM: CompletionItem[] = [
    {label: "username", insert: "username", docs: "The sender's login name (string)"},
    {label: "platform", insert: "platform", docs: '"twitch" | "youtube"'},
    {label: "sub_mode", insert: "sub_mode", docs: "True when sub-only queue mode is active"},
    {label: "queue_size", insert: "queue_size", docs: "Current queue entry count (i64)"},
];

export function contextVars(ctx: ScriptContext): CompletionItem[] {
    return ctx.isModule ? CONTEXT_VARS_ALWAYS : [...CONTEXT_VARS_ALWAYS, ...CONTEXT_VARS_CUSTOM];
}

export const PROXY_API: Record<string, CompletionItem[]> = {
    chat: [
        {label: 'say(msg)', insert: 'say("")', docs: "Send a message to chat", cursor: 5},
        {label: 'reply(msg)', insert: 'reply("")', docs: "Reply mentioning the user", cursor: 7},
        {
            label: 'announce(msg)',
            insert: 'announce("")',
            docs: "Twitch: highlighted announcement; elsewhere: same as say()",
            cursor: 10
        },
        {
            label: 'announce(msg, color)',
            insert: 'announce("", "")',
            docs: 'Twitch only — color: primary|blue|green|orange|purple',
            cursor: 10
        },
        {label: 'say_each(items)', insert: 'say_each([])', docs: "say() each element of an array", cursor: 9},
        {label: 'count()', insert: 'count()', docs: "Messages queued so far this run (i64)", cursor: -1},
        {
            label: 'poll(title, options)',
            insert: 'poll("", [])',
            docs: "2+ options. Native Twitch poll if eligible, else a chat-vote fallback (!vote <n>)",
            cursor: 6
        },
        {
            label: 'poll(title, options, settings)',
            insert: 'poll("", [], #{})',
            docs: "settings: duration, trigger, announce, results, no_votes",
            cursor: 6
        },
    ],
    command: [
        {
            label: 'trigger()',
            insert: 'trigger()',
            docs: 'Exact text used to invoke this run, e.g. "!superbang"',
            cursor: -1
        },
        {label: 'name()', insert: 'name()', docs: 'Command\'s canonical/primary trigger, e.g. "!bang"', cursor: -1},
        {
            label: 'is(text)',
            insert: 'is("")',
            docs: 'True if trigger() == text — e.g. if command.is("!superbang") { ... }',
            cursor: 4
        },
        {
            label: 'is_alias()',
            insert: 'is_alias()',
            docs: "True when invoked via an alias, not the primary trigger",
            cursor: -1
        },
        {label: 'counter()', insert: 'counter()', docs: "Total times this command has fired (i64)", cursor: -1},
    ],
    console: [
        {label: 'log(value)', insert: 'log("")', docs: "Log a value to the script console", cursor: 5},
        {label: 'log(a, b)', insert: 'log("", "")', docs: "Log two values", cursor: 5},
        {label: 'warn(value)', insert: 'warn("")', docs: "Log a warning", cursor: 6},
        {label: 'error(value)', insert: 'error("")', docs: "Log an error", cursor: 7},
    ],
    ms: [
        {label: 'get(key)', insert: 'get("")', docs: "Retrieve stored value, () if unset", cursor: 5},
        {label: 'get_or(key, default)', insert: 'get_or("", "")', docs: "Retrieve with fallback default", cursor: 8},
        {label: 'set(key, value)', insert: 'set("", "")', docs: "Store a string, number, or bool", cursor: 5},
        {label: 'has(key)', insert: 'has("")', docs: "True if key exists", cursor: 5},
        {label: 'delete(key)', insert: 'delete("")', docs: "Remove a key", cursor: 8},
        {label: 'incr(key)', insert: 'incr("")', docs: "Increment by 1, return new value", cursor: 6},
        {label: 'incr_by(key, n)', insert: 'incr_by("", 1)', docs: "Increment by n, return new value", cursor: 9},
        {label: 'decr(key)', insert: 'decr("")', docs: "Decrement by 1, return new value", cursor: 6},
        {label: 'decr_by(key, n)', insert: 'decr_by("", 1)', docs: "Decrement by n, return new value", cursor: 9},
        {label: 'list_keys(prefix)', insert: 'list_keys("")', docs: "Array of matching key names", cursor: 11},
        {
            label: 'collection(name)', insert: 'collection("")', docs:
                "Returns a Collection: .push(#{}) .all() .find(n) .first() .last() .at(i) .remove(id) .clear() .count()",
            cursor: 12,
        },
    ],
    gd: [
        {label: 'fetch(id)', insert: 'fetch("")', docs: "Fetch GD level, returns map or ()", cursor: 7},
        {label: 'search(query)', insert: 'search("")', docs: "Search GD levels, array of maps", cursor: 8},
        {label: 'isValidId(s)', insert: 'isValidId("")', docs: "True if 3-9 digit valid level ID", cursor: 10},
    ],
    twitch: [
        {
            label: 'is_connected()',
            insert: 'is_connected()',
            docs: "True once IRC + Helix API are both ready",
            cursor: -1
        },
        {label: 'get_user(login)', insert: 'get_user("")', docs: "#{id, login, display_name} or ()", cursor: 10},
        {label: 'announce(msg)', insert: 'announce("")', docs: "Highlighted Helix chat announcement", cursor: 10},
        {
            label: 'announce(msg, color)',
            insert: 'announce("", "")',
            docs: "color: primary|blue|green|orange|purple",
            cursor: 10
        },
        {
            label: 'list_rewards()',
            insert: 'list_rewards()',
            docs: "Array of #{id, title, cost, prompt, is_enabled, icon_url} — this app's manageable rewards",
            cursor: -1
        },
        {
            label: 'create_reward(title, cost)',
            insert: 'create_reward("", 100)',
            docs: "Creates a channel-point reward, returns the reward map or ()",
            cursor: 15
        },
        {
            label: 'complete_redemption(id, rewardId)',
            insert: 'complete_redemption("", "")',
            docs: "Marks a redemption fulfilled — args match the redemption_handler script's args[3]/args[4]",
            cursor: 21
        },
        {
            label: 'cancel_redemption(id, rewardId)',
            insert: 'cancel_redemption("", "")',
            docs: "Marks a redemption canceled (refunds the viewer's points)",
            cursor: 19
        },
        {
            label: 'is_subscriber(login)',
            insert: 'is_subscriber("")',
            docs: "Live Helix check — for scripts with no real chat message behind them (user.isSub() is already fresh for real chat)",
            cursor: 14
        },
    ],
    youtube: [
        {
            label: 'is_connected()',
            insert: 'is_connected()',
            docs: "True if the YouTube live chat poller is running",
            cursor: -1
        },
        {
            label: 'get_channel()',
            insert: 'get_channel()',
            docs: "#{id, title} for the connected account, or ()",
            cursor: -1
        },
    ],
    user: [
        {label: 'name', insert: 'name', docs: "Login name (string)"},
        {label: 'platform', insert: 'platform', docs: '"twitch" | "youtube"'},
        {label: 'isMod()', insert: 'isMod()', docs: "True if user is a moderator"},
        {label: 'isSub()', insert: 'isSub()', docs: "True if user is a subscriber"},
        {label: 'isBroadcaster()', insert: 'isBroadcaster()', docs: "True if user is broadcaster"},
        {label: 'isStaff()', insert: 'isStaff()', docs: "True if mod OR broadcaster"},
    ],
    rand: [
        {label: 'int(lo, hi)', insert: 'int(1, 100)', docs: "Random integer in [lo, hi)", cursor: -1},
        {label: 'float()', insert: 'float()', docs: "Random float 0.0-1.0", cursor: -1},
        {label: 'bool()', insert: 'bool()', docs: "Random boolean", cursor: -1},
        {label: 'pick(array)', insert: 'pick([])', docs: "Random element from array", cursor: 6},
        {label: 'shuffle(array)', insert: 'shuffle([])', docs: "Shuffled copy of array", cursor: 9},
        {label: 'sample(array, n)', insert: 'sample([], 1)', docs: "n random elements, no repeats", cursor: 8},
        {
            label: 'weighted_pick(items, weights)',
            insert: 'weighted_pick([], [])',
            docs: "Weighted random pick",
            cursor: 15
        },
        {label: 'seed(val)', insert: 'seed(42)', docs: "Set the random seed", cursor: -1},
    ],
    time: [
        {label: 'now()', insert: 'now()', docs: "Unix timestamp in seconds (i64)", cursor: -1},
        {label: 'utc()', insert: 'utc()', docs: '"HH:MM UTC"', cursor: -1},
        {label: 'date()', insert: 'date()', docs: '"YYYY-MM-DD"', cursor: -1},
        {label: 'elapsed(from)', insert: 'elapsed(0)', docs: "Seconds since unix timestamp", cursor: -1},
        {label: 'format(ts, fmt)', insert: 'format(0, "")', docs: "Format a timestamp (strftime-style)", cursor: 12},
        {label: 'parse(s, fmt)', insert: 'parse("", "")', docs: "Parse a timestamp string, () on failure", cursor: 7},
    ],
    event: [
        {
            label: 'emit(name, payload)',
            insert: 'emit("", "")',
            docs: "Emit to frontend + WebSocket, and fire any command listening for it",
            cursor: 6
        },
        {label: 'emit(name)', insert: 'emit("")', docs: "Emit with no payload", cursor: 6},
        {
            label: 'emitted(name)',
            insert: 'emitted("")',
            docs: "True if this event fired in the last 5s — coordinate two ways of triggering the same effect",
            cursor: 9
        },
        {label: 'emitted(name, seconds)', insert: 'emitted("", 5)', docs: "Same, with a custom time window", cursor: 9},
    ],
    web: [
        {label: 'get(url)', insert: 'get("")', docs: "HTTP GET, returns body or ()", cursor: 5},
        {label: 'post(url, body)', insert: 'post("", "")', docs: "POST plain text", cursor: 6},
        {label: 'get_json(url)', insert: 'get_json("")', docs: "GET + parse JSON", cursor: 9},
        {label: 'post_json(url, body)', insert: 'post_json("", "")', docs: "POST JSON", cursor: 10},
        {label: 'get_status(url)', insert: 'get_status("")', docs: "HTTP status code only (i64)", cursor: 12},
        {
            label: 'get_with_headers(url, h)',
            insert: 'get_with_headers("", #{})',
            docs: "GET with custom headers map",
            cursor: 18
        },
        {
            label: 'post_with_headers(url, body, h)',
            insert: 'post_with_headers("", "", #{})',
            docs: "POST with custom headers map",
            cursor: 19
        },
    ],
    io: [
        {label: 'parse_json(s)', insert: 'parse_json("")', docs: "JSON string → value, () on failure", cursor: 11},
        {label: 'encode_json(val)', insert: 'encode_json()', docs: "Value → JSON string", cursor: 12},
        {
            label: 'encode_json_pretty(val)',
            insert: 'encode_json_pretty()',
            docs: "Value → pretty-printed JSON string",
            cursor: 19
        },
        {label: 'parse_int(s)', insert: 'parse_int("")', docs: "→ i64 or ()", cursor: 10},
        {label: 'parse_float(s)', insert: 'parse_float("")', docs: "→ f64 or ()", cursor: 12},
        {label: 'csv_split(line)', insert: 'csv_split("")', docs: "Split a CSV line respecting quotes", cursor: 10},
        {label: 'split(s, sep)', insert: 'split("", "")', docs: "Split a string by separator", cursor: 6},
    ],
    queue: [
        {label: 'add(id)', insert: 'add("")', docs: "Add level to queue, returns status", cursor: 5},
        {label: 'remove(id)', insert: 'remove("")', docs: "Remove level from queue", cursor: 8},
        {label: 'next()', insert: 'next()', docs: "Pop next level from queue", cursor: -1},
        {label: 'clear()', insert: 'clear()', docs: "Clear the entire queue", cursor: -1},
        {label: 'size()', insert: 'size()', docs: "Number of entries (i64)", cursor: -1},
        {label: 'isEmpty()', insert: 'isEmpty()', docs: "True if queue is empty", cursor: -1},
        {label: 'has(id)', insert: 'has("")', docs: "True if level ID is in queue", cursor: 5},
        {label: 'list(page)', insert: 'list(1)', docs: "Paginated list, array of maps", cursor: -1},
        {label: 'position(id)', insert: 'position("")', docs: "Position of level, 0 if not found", cursor: 10},
        {
            label: 'promote(id)',
            insert: 'promote("")',
            docs: "Move level to front of its queue, returns status",
            cursor: 9
        },
        {label: 'shuffle()', insert: 'shuffle()', docs: "Randomize viewer queue positions, returns status", cursor: -1},
        {
            label: 'myLevels()',
            insert: 'myLevels()',
            docs: "Caller's queue entries — array of {level_id, queue_type, platform}",
            cursor: -1
        },
        {label: 'isOpen()', insert: 'isOpen()', docs: "True if the queue is open for requests", cursor: -1},
        {label: 'open()', insert: 'open()', docs: "Open the queue, returns status string", cursor: -1},
        {label: 'close()', insert: 'close()', docs: "Close the queue, returns status string", cursor: -1},
    ],
    store: [
        {label: 'get(key)', insert: 'get("")', docs: "Retrieve stored value", cursor: 5},
        {label: 'get_or(key, def)', insert: 'get_or("", "")', docs: "Retrieve with fallback default", cursor: 8},
        {label: 'set(key, value)', insert: 'set("", "")', docs: "Store a string, number, or bool", cursor: 5},
        {label: 'has(key)', insert: 'has("")', docs: "True if key exists", cursor: 5},
        {label: 'delete(key)', insert: 'delete("")', docs: "Remove a key from the store", cursor: 8},
        {label: 'incr(key)', insert: 'incr("")', docs: "Increment by 1, return new value", cursor: 6},
        {label: 'incr_by(key, n)', insert: 'incr_by("", 1)', docs: "Increment by n, return new value", cursor: 9},
        {label: 'decr(key)', insert: 'decr("")', docs: "Decrement by 1, return new value", cursor: 6},
        {label: 'decr_by(key, n)', insert: 'decr_by("", 1)', docs: "Decrement by n, return new value", cursor: 9},
        {label: 'list_keys(prefix)', insert: 'list_keys("")', docs: "Array of matching key names", cursor: 11},
    ],
    data: [
        {label: 'insert(col, map)', insert: 'insert("", #{})', docs: "Insert document, returns UUID", cursor: 8},
        {label: 'find(col, limit)', insert: 'find("", 10)', docs: "Find documents (array)", cursor: 6},
        {label: 'find_one(id)', insert: 'find_one("")', docs: "Find single document by UUID", cursor: 10},
        {label: 'find_all(col)', insert: 'find_all("")', docs: "All documents in collection", cursor: 10},
        {label: 'count(col)', insert: 'count("")', docs: "Count documents in collection", cursor: 7},
        {label: 'delete(id)', insert: 'delete("")', docs: "Delete document by UUID", cursor: 8},
        {label: 'clear(col)', insert: 'clear("")', docs: "Delete all docs in collection", cursor: 7},
    ],
    cache: [
        {label: 'get(key)', insert: 'get("")', docs: "Last stored/fetched value, () if none", cursor: 5},
        {label: 'set(key, value)', insert: 'set("", "")', docs: "Manually store a value", cursor: 5},
        {
            label: 'fetch(key, url, ttlSeconds)',
            insert: 'fetch("", "", 300)',
            docs: "Cached HTTP GET — re-fetches only once ttlSeconds has passed",
            cursor: 7
        },
        {
            label: 'fetch_json(key, url, ttlSeconds)',
            insert: 'fetch_json("", "", 300)',
            docs: "Same, but JSON-parsed",
            cursor: 12
        },
    ],
    db: [
        {label: 'exec(sql)', insert: 'exec("")', docs: "Run non-parameterised SQL, returns rows affected", cursor: 6},
        {label: 'last_id()', insert: 'last_id()', docs: "SQLite last_insert_rowid()", cursor: -1},
        {
            label: 'query(sql)',
            insert: 'query("")',
            docs: "Disabled — always returns []; use store.* or data.*",
            cursor: 7
        },
    ],
    shell: [
        {label: 'run(cmd)', insert: 'run("")', docs: "Run a shell command, returns trimmed stdout", cursor: 5},
        {
            label: 'run_timeout(cmd, secs)',
            insert: 'run_timeout("", 10)',
            docs: "Same, with an explicit timeout",
            cursor: 13
        },
        {label: 'env(name)', insert: 'env("")', docs: "Environment variable value, \"\" if unset", cursor: 5},
    ],
};
