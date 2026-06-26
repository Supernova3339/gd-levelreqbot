// All available proxy objects and their methods, used for autocomplete.

export interface CompletionItem {
    label: string;
    insert: string;
    docs: string;
    cursor?: number;  // offset into `insert` to place cursor; -1 = end
}

// Context variables available at top level in every script
export const CONTEXT_VARS: CompletionItem[] = [
    {label: "username", insert: "username", docs: "The sender's login name (string)"},
    {label: "platform", insert: "platform", docs: '"twitch" | "youtube"'},
    {label: "sub_mode", insert: "sub_mode", docs: "True when sub-only queue mode is active"},
    {label: "queue_size", insert: "queue_size", docs: "Current queue entry count (i64)"},
    {label: "command_trigger", insert: "command_trigger", docs: 'e.g. "!request"'},
    {label: "args", insert: "args", docs: "Array of whitespace-split arguments"},
    {label: "args[0]", insert: "args[0]", docs: "First argument"},
    {label: "args.len()", insert: "args.len()", docs: "Number of arguments"},
];

// All proxy object names
export const PROXY_NAMES = ["chat", "console", "queue", "user", "store", "data", "gd", "rand", "time", "event", "web"];

export const PROXY_API: Record<string, CompletionItem[]> = {
    chat: [
        {label: 'say(msg)', insert: 'say("")', docs: "Send a message to chat", cursor: 5},
        {label: 'reply(msg)', insert: 'reply("")', docs: "Reply mentioning the user", cursor: 7},
        {label: 'announce(msg)', insert: 'announce("")', docs: "Send an announcement", cursor: 10},
    ],
    console: [
        {label: 'log(value)', insert: 'log("")', docs: "Log a value to the script console", cursor: 5},
        {label: 'log(a, b)', insert: 'log("", "")', docs: "Log two values", cursor: 5},
        {label: 'warn(value)', insert: 'warn("")', docs: "Log a warning", cursor: 6},
        {label: 'error(value)', insert: 'error("")', docs: "Log an error", cursor: 7},
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
    ],
    user: [
        {label: 'name', insert: 'name', docs: "Login name (string)"},
        {label: 'platform', insert: 'platform', docs: '"twitch" | "youtube"'},
        {label: 'isMod()', insert: 'isMod()', docs: "True if user is a moderator"},
        {label: 'isSub()', insert: 'isSub()', docs: "True if user is a subscriber"},
        {label: 'isBroadcaster()', insert: 'isBroadcaster()', docs: "True if user is broadcaster"},
        {label: 'isStaff()', insert: 'isStaff()', docs: "True if mod OR broadcaster"},
    ],
    store: [
        {label: 'get(key)', insert: 'get("")', docs: "Retrieve stored value", cursor: 5},
        {label: 'get_or(key, def)', insert: 'get_or("", "")', docs: "Retrieve with fallback default", cursor: 8},
        {label: 'set(key, value)', insert: 'set("", "")', docs: "Store a string or number value", cursor: 5},
        {label: 'delete(key)', insert: 'delete("")', docs: "Remove a key from the store", cursor: 8},
        {label: 'incr(key)', insert: 'incr("")', docs: "Increment by 1, return new value", cursor: 6},
        {label: 'incr_by(key, n)', insert: 'incr_by("", 1)', docs: "Increment by n, return new value", cursor: 9},
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
    gd: [
        {label: 'fetch(id)', insert: 'fetch("")', docs: "Fetch GD level, returns map or ()", cursor: 7},
        {label: 'search(query)', insert: 'search("")', docs: "Search GD levels, array of maps", cursor: 8},
        {label: 'isValidId(s)', insert: 'isValidId("")', docs: "True if 3-9 digit valid level ID", cursor: 10},
    ],
    rand: [
        {label: 'int(lo, hi)', insert: 'int(1, 100)', docs: "Random integer in [lo, hi)", cursor: -1},
        {label: 'float()', insert: 'float()', docs: "Random float 0.0-1.0", cursor: -1},
        {label: 'bool()', insert: 'bool()', docs: "Random boolean", cursor: -1},
        {label: 'pick(array)', insert: 'pick([])', docs: "Random element from array", cursor: 6},
        {label: 'shuffle(array)', insert: 'shuffle([])', docs: "Shuffled copy of array", cursor: 9},
        {label: 'seed(val)', insert: 'seed(42)', docs: "Set the random seed", cursor: -1},
    ],
    time: [
        {label: 'now()', insert: 'now()', docs: "Unix timestamp in seconds (i64)", cursor: -1},
        {label: 'utc()', insert: 'utc()', docs: '"HH:MM UTC"', cursor: -1},
        {label: 'date()', insert: 'date()', docs: '"YYYY-MM-DD"', cursor: -1},
        {label: 'elapsed(from)', insert: 'elapsed(0)', docs: "Seconds since unix timestamp", cursor: -1},
    ],
    event: [
        {label: 'emit(name, payload)', insert: 'emit("", "")', docs: "Emit to frontend + WebSocket", cursor: 6},
        {label: 'emit(name)', insert: 'emit("")', docs: "Emit with no payload", cursor: 6},
    ],
    web: [
        {label: 'get(url)', insert: 'get("")', docs: "HTTP GET, returns body or ()", cursor: 5},
        {label: 'post(url, body)', insert: 'post("", "")', docs: "HTTP POST plain text", cursor: 6},
        {label: 'get_json(url)', insert: 'get_json("")', docs: "HTTP GET + parse JSON", cursor: 9},
        {label: 'post_json(url, b)', insert: 'post_json("", "")', docs: "HTTP POST JSON", cursor: 10},
    ],
};
