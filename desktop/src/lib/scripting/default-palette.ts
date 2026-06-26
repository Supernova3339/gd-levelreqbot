// Default palette — organized by common use case, not by which module owns the call.
// Libraries can call registerPaletteCategory() to add their own top-level entries.

import type {Block, Condition} from "../../components/scripting/visual/block-types";
import {clearPaletteRegistry, registerPaletteCategory} from "./palette-registry";

// Clear on every module evaluation so HMR doesn't accumulate stale entries.
clearPaletteRegistry();

function uid(): string {
    return Math.random().toString(36).slice(2);
}

function call(m: string): Condition {
    return {kind: "call", method: m};
}

function ifCond(m: string): Block {
    return {id: uid(), type: "if", condition: call(m), then: [], else: []};
}

function req(m: string): Block {
    return {id: uid(), type: "require", condition: call(m)};
}

function act(n: string): Block {
    return {id: uid(), type: "action", name: n};
}

function say(msg = ""): Block {
    return {id: uid(), type: "say", message: msg};
}

function reply(msg = ""): Block {
    return {id: uid(), type: "reply", message: msg};
}

// ── 1. Chat ───────────────────────────────────────────────────────────────────
// Everything that sends output to the viewer.

registerPaletteCategory({
    kind: "category", label: "Chat", color: "#3b82f6",
    children: [
        {kind: "leaf", label: "chat.say(msg)", color: "#3b82f6", desc: "Send a message in chat", block: say()},
        {kind: "leaf", label: "chat.reply(msg)", color: "#6366f1", desc: "Reply with @username prefix", block: reply()},
        {
            kind: "leaf",
            label: "chat.announce(msg)",
            color: "#818cf8",
            desc: "Send a highlighted announcement",
            block: act("chat.announce")
        },
        {
            kind: "leaf",
            label: "say random",
            color: "#8b5cf6",
            desc: "Pick and send one message at random",
            block: {id: uid(), type: "random", messages: ["", ""]}
        },
    ],
});

// ── 2. Queue ──────────────────────────────────────────────────────────────────
// Level queue operations and queue-state conditions.

registerPaletteCategory({
    kind: "category", label: "Queue", color: "#22c55e",
    children: [
        {
            kind: "category", label: "Actions", color: "#22c55e",
            children: [
                {
                    kind: "leaf",
                    label: "queue.add()",
                    color: "#22c55e",
                    desc: "Add {args} to the queue",
                    block: act("queue.add")
                },
                {
                    kind: "leaf",
                    label: "queue.next()",
                    color: "#22c55e",
                    desc: "Pop the next level from queue",
                    block: act("queue.next")
                },
                {
                    kind: "leaf",
                    label: "queue.remove()",
                    color: "#ef4444",
                    desc: "Remove {args} from the queue",
                    block: act("queue.remove")
                },
                {
                    kind: "leaf",
                    label: "queue.clear()",
                    color: "#ef4444",
                    desc: "Clear the entire queue",
                    block: act("queue.clear")
                },
            ],
        },
        {
            kind: "category", label: "Conditions", color: "#f59e0b",
            children: [
                {
                    kind: "leaf",
                    label: "if queue.isEmpty()",
                    color: "#f59e0b",
                    desc: "Branch if the queue is empty",
                    block: ifCond("queue.isEmpty")
                },
                {
                    kind: "leaf",
                    label: "if queue.has(args[0])",
                    color: "#f59e0b",
                    desc: "Branch if {args} is already queued",
                    block: ifCond("queue.has(args[0])")
                },
                {
                    kind: "leaf",
                    label: "require queue.isEmpty()",
                    color: "#f59e0b",
                    desc: "Stop if the queue is not empty",
                    block: req("queue.isEmpty")
                },
                {
                    kind: "leaf",
                    label: "require queue.has(args[0])",
                    color: "#f59e0b",
                    desc: "Stop if {args} is not in the queue",
                    block: req("queue.has(args[0])")
                },
            ],
        },
    ],
});

// ── 3. Control ────────────────────────────────────────────────────────────────
// Flow control: permissions, argument checks, branching, halting.

registerPaletteCategory({
    kind: "category", label: "Control", color: "#ec4899",
    children: [
        {
            kind: "category", label: "Permissions", color: "#c3e88d",
            children: [
                {
                    kind: "leaf",
                    label: "require mod+",
                    color: "#c3e88d",
                    desc: "Stop if user is not a mod or owner",
                    block: req("user.isStaff")
                },
                {
                    kind: "leaf",
                    label: "require moderator",
                    color: "#c3e88d",
                    desc: "Stop if user is not a moderator",
                    block: req("user.isMod")
                },
                {
                    kind: "leaf",
                    label: "require subscriber",
                    color: "#c3e88d",
                    desc: "Stop if user is not subscribed",
                    block: req("user.isSub")
                },
                {
                    kind: "leaf",
                    label: "require owner",
                    color: "#c3e88d",
                    desc: "Stop if user is not the broadcaster",
                    block: req("user.isBroadcaster")
                },
                {
                    kind: "leaf",
                    label: "if user.isMod()",
                    color: "#c3e88d",
                    desc: "Branch if user is a moderator",
                    block: ifCond("user.isMod")
                },
                {
                    kind: "leaf",
                    label: "if user.isSub()",
                    color: "#c3e88d",
                    desc: "Branch if user is subscribed",
                    block: ifCond("user.isSub")
                },
            ],
        },
        {
            kind: "category", label: "Arguments", color: "#c3e88d",
            children: [
                {
                    kind: "leaf",
                    label: "require args provided",
                    color: "#c3e88d",
                    desc: "Stop if no arguments were given",
                    block: req("args.len() > 0")
                },
                {
                    kind: "leaf",
                    label: "if args provided",
                    color: "#c3e88d",
                    desc: "Branch if arguments were given",
                    block: ifCond("args.len() > 0")
                },
                {
                    kind: "leaf",
                    label: "require valid level ID",
                    color: "#f59e0b",
                    desc: "Stop if args[0] is not a valid level ID",
                    block: req("gd.isValidId(args[0])")
                },
            ],
        },
        {
            kind: "category", label: "Statements", color: "#c792ea",
            children: [
                {
                    kind: "leaf",
                    label: "if … { }",
                    color: "#ec4899",
                    desc: "Branch on any condition",
                    block: ifCond("user.isMod")
                },
                {
                    kind: "leaf",
                    label: "require …",
                    color: "#f59e0b",
                    desc: "Stop if condition is false",
                    block: req("user.isStaff")
                },
                {
                    kind: "leaf",
                    label: "let variable",
                    color: "#c792ea",
                    desc: "Declare a variable for use downstream",
                    block: {id: uid(), type: "variable", name: "", value: ""} as any
                },
                {
                    kind: "leaf",
                    label: "stop",
                    color: "#555",
                    desc: "Halt script execution here",
                    block: {id: uid(), type: "stop"}
                },
            ],
        },
    ],
});

// ── 4. GD ─────────────────────────────────────────────────────────────────────
// Geometry Dash API — fetch level data, search, validate IDs.

registerPaletteCategory({
    kind: "category", label: "GD", color: "#f59e0b",
    children: [
        {
            kind: "leaf",
            label: "gd.fetch(id)",
            color: "#f59e0b",
            desc: "Fetch level data by ID — results in gd.name, gd.stars, etc.",
            block: act("gd.fetch")
        },
        {
            kind: "leaf",
            label: "gd.search(query)",
            color: "#f59e0b",
            desc: "Search GD levels by name or ID",
            block: act("gd.search")
        },
        {
            kind: "leaf",
            label: "gd.isValidId(args[0])",
            color: "#f59e0b",
            desc: "True if args[0] looks like a valid level ID",
            block: req("gd.isValidId(args[0])")
        },
    ],
});

// ── 5. Storage ────────────────────────────────────────────────────────────────
// Persistent data: key-value store, structured collections, counters.

registerPaletteCategory({
    kind: "category", label: "Storage", color: "#a78bfa",
    children: [
        {
            kind: "category", label: "Store  (key-value)", color: "#a78bfa",
            children: [
                {
                    kind: "leaf",
                    label: "store.get(key)",
                    color: "#a78bfa",
                    desc: "Read a value (returns () if not set)",
                    block: act("store.get")
                },
                {
                    kind: "leaf",
                    label: "store.set(key, val)",
                    color: "#a78bfa",
                    desc: "Write a value",
                    block: act("store.set")
                },
                {
                    kind: "leaf",
                    label: "store.incr(key)",
                    color: "#a78bfa",
                    desc: "Increment a numeric value (creates if missing)",
                    block: act("store.incr")
                },
                {
                    kind: "leaf",
                    label: "store.get_or(key, def)",
                    color: "#a78bfa",
                    desc: "Read value, or return default if missing",
                    block: act("store.get_or")
                },
                {
                    kind: "leaf",
                    label: "store.delete(key)",
                    color: "#a78bfa",
                    desc: "Delete a key",
                    block: act("store.delete")
                },
            ],
        },
        {
            kind: "category", label: "Data  (collections)", color: "#f97316",
            children: [
                {
                    kind: "leaf",
                    label: "data.insert(col, map)",
                    color: "#f97316",
                    desc: "Insert a row (map) into a named collection",
                    block: act("data.insert")
                },
                {
                    kind: "leaf",
                    label: "data.find(col, limit)",
                    color: "#f97316",
                    desc: "Find up to limit rows (newest first)",
                    block: act("data.find")
                },
                {
                    kind: "leaf",
                    label: "data.find_one(col, id)",
                    color: "#f97316",
                    desc: "Find one row by its ID",
                    block: act("data.find_one")
                },
                {
                    kind: "leaf",
                    label: "data.count(col)",
                    color: "#f97316",
                    desc: "Count rows in a collection",
                    block: act("data.count")
                },
                {
                    kind: "leaf",
                    label: "data.clear(col)",
                    color: "#f97316",
                    desc: "Delete all rows in a collection",
                    block: act("data.clear")
                },
            ],
        },
        {
            kind: "category", label: "Counter  (named)", color: "#06b6d4",
            children: [
                {
                    kind: "leaf",
                    label: "counter.inc(name)",
                    color: "#06b6d4",
                    desc: "Increment a named counter",
                    block: act("counter.inc")
                },
                {
                    kind: "leaf",
                    label: "counter.reset(name)",
                    color: "#06b6d4",
                    desc: "Reset a named counter to 0",
                    block: act("counter.reset")
                },
            ],
        },
    ],
});

// ── 6. Utilities ──────────────────────────────────────────────────────────────
// Rand, Time, Event — general purpose utilities.

registerPaletteCategory({
    kind: "category", label: "Utilities", color: "#8b5cf6",
    children: [
        {
            kind: "category", label: "Rand", color: "#8b5cf6",
            children: [
                {
                    kind: "leaf",
                    label: "rand.int(lo, hi)",
                    color: "#8b5cf6",
                    desc: "Random integer in [lo, hi]",
                    block: act("rand.int")
                },
                {
                    kind: "leaf",
                    label: "rand.float()",
                    color: "#8b5cf6",
                    desc: "Random float in [0, 1)",
                    block: act("rand.float")
                },
                {
                    kind: "leaf",
                    label: "rand.pick(arr)",
                    color: "#8b5cf6",
                    desc: "Pick a random element from an array",
                    block: act("rand.pick")
                },
                {
                    kind: "leaf",
                    label: "rand.shuffle(arr)",
                    color: "#8b5cf6",
                    desc: "Shuffle an array in place",
                    block: act("rand.shuffle")
                },
            ],
        },
        {
            kind: "category", label: "Time", color: "#06b6d4",
            children: [
                {
                    kind: "leaf",
                    label: "time.now()",
                    color: "#06b6d4",
                    desc: "Current Unix timestamp in seconds",
                    block: act("time.now")
                },
                {
                    kind: "leaf",
                    label: "time.utc()",
                    color: "#06b6d4",
                    desc: "Current UTC datetime string",
                    block: act("time.utc")
                },
                {
                    kind: "leaf",
                    label: "time.date()",
                    color: "#06b6d4",
                    desc: "Current date as YYYY-MM-DD",
                    block: act("time.date")
                },
                {
                    kind: "leaf",
                    label: "time.elapsed(ts)",
                    color: "#06b6d4",
                    desc: "Seconds elapsed since timestamp ts",
                    block: act("time.elapsed")
                },
            ],
        },
        {
            kind: "category", label: "Web", color: "#38bdf8",
            children: [
                {
                    kind: "leaf",
                    label: "web.get(url)",
                    color: "#38bdf8",
                    desc: "HTTP GET — returns response body as a string",
                    block: act("web.get")
                },
                {
                    kind: "leaf",
                    label: "web.post(url, body)",
                    color: "#38bdf8",
                    desc: "HTTP POST with a plain-text body",
                    block: act("web.post")
                },
                {
                    kind: "leaf",
                    label: "web.get_json(url)",
                    color: "#38bdf8",
                    desc: "HTTP GET — parses JSON response into a Rhai map/array",
                    block: act("web.get_json")
                },
                {
                    kind: "leaf",
                    label: "web.post_json(url, body)",
                    color: "#38bdf8",
                    desc: "HTTP POST a JSON string, parses JSON response",
                    block: act("web.post_json")
                },
            ],
        },
        {
            kind: "category", label: "Event", color: "#ec4899",
            children: [
                {
                    kind: "leaf",
                    label: "event.emit(name, payload)",
                    color: "#ec4899",
                    desc: "Emit a named event to the UI overlay and WebSocket clients",
                    block: act("event.emit")
                },
            ],
        },
    ],
});

// ── 7. Notes ──────────────────────────────────────────────────────────────────
// Three visual styles — all use the comment node type.

function note(style: "note" | "comment" | "section", color = "#f59e0b"): Block {
    return {id: uid(), type: "comment", text: "", color, style} as any;
}

registerPaletteCategory({
    kind: "category", label: "Notes", color: "#f59e0b",
    children: [
        {
            kind: "leaf",
            label: "Sticky note",
            color: "#f59e0b",
            desc: "Resizable note with opacity control and color swatches",
            block: note("note")
        },
        {
            kind: "leaf",
            label: "Section label",
            color: "#f59e0b",
            desc: "Wide flat banner for grouping nodes under a heading",
            block: note("section")
        },
        {
            kind: "leaf",
            label: "Code comment",
            color: "#888",
            desc: "Minimal monospace annotation — dashed border, code style",
            block: note("comment", "#888")
        },
    ],
});
