// Module-level console event store.
// Subscribes to Tauri events exactly ONCE at import time and seeds from the
// backend ConsoleBuf on init, so entries are collected regardless of which
// page is visible and survive webview reloads (Rust keeps the buffer).

import {listen} from "@tauri-apps/api/event";

export interface ConsoleEntry {
    id: number;
    level: "log" | "warn" | "error";
    message: string;
    ts: string;
    command: string;   // command trigger that produced this log, or "test" for test runs
}

type Listener = (entries: ConsoleEntry[]) => void;

function pad(n: number) {
    return String(n).padStart(2, "0");
}

function timestamp() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toLevel(raw: string): "log" | "warn" | "error" {
    return (["log", "warn", "error"].includes(raw) ? raw : "log") as "log" | "warn" | "error";
}

class ConsoleStore {
    private entries: ConsoleEntry[] = [];
    private listeners: Set<Listener> = new Set();
    private seq = 0;

    constructor() {
        // Seed from the backend ConsoleBuf — captures events from before JS loaded
        // (e.g. startup errors, previous-session errors still in the ring buffer).
        fetch("http://localhost:24363/api/dev/console/events?after=0")
            .then(r => r.json())
            .then((events: Array<{ level: string; message: string; command: string; ts: string }>) => {
                if (events.length === 0) return;
                const seeded: ConsoleEntry[] = events.map(e => ({
                    id: ++this.seq,
                    level: toLevel(e.level),
                    message: e.message,
                    ts: e.ts,
                    command: e.command,
                }));
                // Prepend seeded entries before any live events already collected.
                this.entries = [...seeded, ...this.entries].slice(-2000);
                this.listeners.forEach(fn => fn(this.entries));
            })
            .catch(() => {
            });

        // Live console-log events (scripts calling chat.say / log / warn / error)
        listen<{ level: string; message: string; command?: string }>("console-log", (e) => {
            this.push(toLevel(e.payload.level), e.payload.message, e.payload.command ?? "unknown");
        }).catch(() => {
        });

        // Runtime script errors — same data, different Tauri event
        listen<{ message: string; command?: string }>("bot-runtime-error", (e) => {
            this.push("error", e.payload.message, e.payload.command ?? "unknown");
        }).catch(() => {
        });
    }

    push(level: "log" | "warn" | "error", message: string, command: string) {
        const entry: ConsoleEntry = {
            id: ++this.seq,
            level,
            message,
            ts: timestamp(),
            command,
        };
        this.entries = [...this.entries.slice(-1999), entry];
        this.listeners.forEach(fn => fn(this.entries));
    }

    subscribe(fn: Listener): () => void {
        this.listeners.add(fn);
        fn(this.entries); // immediately provide current entries
        return () => this.listeners.delete(fn);
    }

    getEntries(): ConsoleEntry[] {
        return this.entries;
    }

    clear() {
        this.entries = [];
        this.listeners.forEach(fn => fn(this.entries));
    }
}

// Singleton — created once when the module first imports
export const consoleStore = new ConsoleStore();
