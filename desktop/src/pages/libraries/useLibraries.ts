import {useCallback, useEffect, useState} from "react";

export interface Library {
    id: number | string;  // number from Rust DB, string for proxy stubs
    name: string;
    description: string;
    code: string;
    isStandard: boolean;
}

// What Rust actually sends (snake_case, numeric id)
interface RawLibrary {
    id: number;
    name: string;
    description: string;
    code: string;
    is_stdlib: boolean;
    enabled: boolean;
}

function normalize(raw: RawLibrary): Library {
    return {
        id: raw.id,
        name: raw.name,
        description: raw.description,
        code: raw.code,
        isStandard: raw.is_stdlib,
    };
}

// ── Proxy-module reference stubs ───────────────────────────────────────────────
// These modules are implemented in Rust — not .rhai files.
// Shown as read-only reference so users can understand what's available.

const PROXY_STUBS: Library[] = [
    {
        id: "ref:chat", name: "chat", isStandard: true,
        description: "Send messages to chat — Rust built-in",
        code: `// chat — Rust built-in proxy
// These functions are always available in every script.

// chat.say("Hello!")
//   Send a plain message in chat.
//   Use backtick strings for interpolation:
//   chat.say(\`Hello \${username}!\`);

// chat.reply("Good choice!")
//   Send a message prefixed with @username.

// chat.announce("Level accepted!")
//   Send a highlighted announcement.

// Example — combining them:
// if queue.isEmpty() {
//     chat.reply("The queue is empty!");
// } else {
//     let pos = queue.position(args[0].to_string());
//     chat.reply(\`You're at position \${pos}.\`);
// }`,
    },
    {
        id: "ref:store", name: "store", isStandard: true,
        description: "Persistent key-value storage — Rust built-in",
        code: `// store — Rust built-in proxy
// Persistent string key-value storage that survives restarts.
// Keys are strings. Values are strings (serialize manually if needed).

// store.get("my_key")           → String or ()
// store.set("my_key", "value")  → ()
// store.delete("my_key")        → ()
// store.incr("my_key")          → Int   (creates at 0 if missing, increments by 1)
// store.get_or("my_key", "def") → String (returns "def" if key not set)

// Example — count uses per user:
// let key = \`uses:\${username}\`;
// let count = store.incr(key);
// chat.say(\`You've used this command \${count} times.\`);

// Example — toggle a setting:
// let current = store.get_or("queue.open", "yes");
// if current == "yes" {
//     store.set("queue.open", "no");
//     chat.say("Queue is now closed.");
// } else {
//     store.set("queue.open", "yes");
//     chat.say("Queue is now open.");
// }`,
    },
    {
        id: "ref:data", name: "data", isStandard: true,
        description: "Structured user-data collections — Rust built-in",
        code: `// data — Rust built-in proxy
// Store and query structured records in named collections.

// data.insert("requests", #{ user: "alice", level: "12345678", ts: time.now() })
//   Insert a row. Auto-assigns an id.

// data.find("requests", 10)
//   Return the 10 most recent rows (newest first).
//   Each row is a map with your fields + an auto "id" field.

// data.find_one("requests", id)
//   Find one row by its id.

// data.count("requests")
//   Number of rows in a collection.

// data.clear("requests")
//   Delete all rows in a collection.

// Example — log every level request:
// data.insert("requests", #{
//     user:     username,
//     level:    args[0].to_string(),
//     platform: platform,
//     ts:       time.now(),
// });
// let total = data.count("requests");
// chat.say(\`Request logged! Total: \${total}\`);`,
    },
    {
        id: "ref:gd", name: "gd", isStandard: true,
        description: "Geometry Dash API — Rust built-in",
        code: `// gd — Rust built-in proxy
// Fetch level data from the Geometry Dash servers.

// gd.fetch("12345678")
//   Fetch a level by ID. Returns a map or () if not found.
//   Map keys: id, name, author, difficulty, stars, length,
//              downloads, likes, is_demon, is_featured, is_epic

// gd.search("bloodbath")
//   Search levels by name. Returns an array of maps.

// gd.isValidId("12345678")
//   Returns true if the string looks like a valid level ID (digits only).

// Example — show level info in chat:
// if !gd.isValidId(args[0]) {
//     chat.reply("That doesn't look like a level ID.");
//     return;
// }
// let lvl = gd.fetch(args[0].to_string());
// if lvl == () { chat.reply("Level not found."); return; }
// chat.say(\`\${lvl.name} by \${lvl.author} — \${lvl.stars}★ (\${lvl.difficulty})\`);`,
    },
    {
        id: "ref:rand", name: "rand", isStandard: true,
        description: "Randomisation — Rust built-in",
        code: `// rand — Rust built-in proxy

// rand.int(1, 100)       → random integer between 1 and 100 inclusive
// rand.float()           → random float in [0.0, 1.0)
// rand.pick(array)       → pick a random element from an array
// rand.shuffle(array)    → return a shuffled copy of an array
// rand.seed(42)          → set RNG seed (reproducible results)

// Example — random response:
// let replies = [
//     "Nice pick!",
//     "That's a hard one!",
//     "Good luck with that!",
// ];
// chat.say(rand.pick(replies));

// Example — random level from queue:
// let entries = queue.entries(100);
// if entries.len() == 0 { chat.say("Queue is empty!"); return; }
// let picked = rand.pick(entries);
// chat.say(\`Random pick: \${picked.level_id} by @\${picked.username}\`);`,
    },
    {
        id: "ref:time", name: "time", isStandard: true,
        description: "Date and time utilities — Rust built-in",
        code: `// time — Rust built-in proxy

// time.now()         → Unix timestamp in seconds (integer)
// time.utc()         → UTC datetime string, e.g. "2024-01-15T12:34:56Z"
// time.date()        → Current date string, e.g. "2024-01-15"
// time.elapsed(ts)   → Seconds since timestamp ts

// Example — per-user cooldown (30 seconds):
// let key = \`cooldown:\${username}\`;
// let last = store.get(key);
// if last != () && time.elapsed(parse_int(last)) < 30 {
//     let wait = 30 - time.elapsed(parse_int(last));
//     chat.reply(\`Cooldown! Wait \${wait}s.\`);
//     return;
// }
// store.set(key, \`\${time.now()}\`);

// Example — show how long queue has been open:
// let opened = store.get_or("queue.opened_at", \`\${time.now()}\`);
// let elapsed = time.elapsed(parse_int(opened));
// chat.say(\`Queue has been open for \${fmt.duration(elapsed)}\`);`,
    },
    {
        id: "ref:web", name: "web", isStandard: true,
        description: "HTTP requests — GET, POST, JSON — Rust built-in",
        code: `// web — Rust built-in proxy
// Make HTTP requests from scripts. All calls time out after 8 seconds.
// Errors return () rather than crashing the script — always check the result.

// web.get(url)             → String  — fetch a URL, return body as text
// web.post(url, body)      → String  — POST plain text, return response body
// web.get_json(url)        → Dynamic — fetch URL, parse response as JSON
// web.post_json(url, body) → Dynamic — POST a JSON string, parse response

// Example — fetch a JSON API and read a field:
// let resp = web.get_json("https://api.example.com/data");
// if resp == () { chat.say("Request failed"); return; }
// chat.say(\`Result: \${resp.value}\`);

// Example — send a webhook notification:
// web.post_json(
//     "https://hooks.example.com/notify",
//     \`{"text": "Level \${args[0]} was added by \${username}"}\`
// );

// Example — simple GET:
// let html = web.get("https://example.com/page");
// chat.say(\`Got \${html.len()} characters\`);`,
    },
    {
        id: "ref:event", name: "event", isStandard: true,
        description: "Emit custom events to the overlay — Rust built-in",
        code: `// event — Rust built-in proxy

// event.emit("event_name", payload_map)
//   Broadcast a named event with a payload to:
//   - The overlay window (if open)
//   - Any connected WebSocket clients

// Example — notify overlay when a level is added:
// queue.add(args[0].to_string());
// event.emit("level_added", #{
//     id:       args[0].to_string(),
//     user:     username,
//     platform: platform,
//     ts:       time.now(),
// });

// Example — level popped:
// let next = queue.next();
// event.emit("level_nexted", #{ id: next.level_id, user: next.username });`,
    },
];

async function fetchLibraries(): Promise<Library[]> {
    let fromRust: Library[] = [];
    try {
        const {invoke} = await import("@tauri-apps/api/core");
        const raw = await invoke<RawLibrary[]>("get_libraries");
        fromRust = raw.map(normalize);
    } catch {
        fromRust = [];
    }

    // Merge in proxy-module stubs for modules not covered by .rhai files.
    const rustNames = new Set(fromRust.map((l) => l.name));
    const proxyStubs = PROXY_STUBS.filter((s) => !rustNames.has(s.name));

    return [...fromRust, ...proxyStubs];
}

export function useLibraries() {
    const [libraries, setLibraries] = useState<Library[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            setLibraries(await fetchLibraries());
        } catch { /* backend not ready yet */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    // Save a library and reload from DB so we always hold the real numeric id.
    // Returns the saved library with its DB id (use this as the new `selected`).
    const save = useCallback(async (lib: Library): Promise<Library> => {
        try {
            const {invoke} = await import("@tauri-apps/api/core");
            await invoke("save_library", {
                id: typeof lib.id === "number" ? lib.id : null,
                name: lib.name,
                description: lib.description,
                code: lib.code,
                enabled: true,
            });
        } catch { /* non-fatal in dev */
        }

        // Reload to pick up the real auto-assigned id from DB.
        const fresh = await fetchLibraries();
        setLibraries(fresh);

        // Find by name among user libs (name is unique per user lib).
        return fresh.find((l) => l.name === lib.name && !l.isStandard) ?? lib;
    }, []);

    const del = useCallback(async (id: number | string) => {
        // Proxy reference stubs only exist in the frontend — nothing to delete.
        if (typeof id === "string" && id.startsWith("ref:")) return;

        try {
            const {invoke} = await import("@tauri-apps/api/core");
            await invoke("delete_library", {id});
        } catch { /* stub */
        }
        setLibraries((prev) => prev.filter((l) => l.id !== id));
    }, []);

    return {libraries, loading, save, delete: del, reload};
}
