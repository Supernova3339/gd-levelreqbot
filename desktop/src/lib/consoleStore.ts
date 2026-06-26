// Module-level console event store.
// Subscribes to "console-log" Tauri events exactly ONCE at import time,
// so entries are collected regardless of which page is currently visible.

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

class ConsoleStore {
    private entries: ConsoleEntry[] = [];
    private listeners: Set<Listener> = new Set();
    private seq = 0;

    constructor() {
        // Subscribe once — this survives page navigation forever
        listen<{ level: string; message: string; command?: string }>("console-log", (e) => {
            const level = (["log", "warn", "error"].includes(e.payload.level)
                ? e.payload.level : "log") as "log" | "warn" | "error";
            const entry: ConsoleEntry = {
                id: ++this.seq,
                level,
                message: e.payload.message,
                ts: timestamp(),
                command: e.payload.command ?? "unknown",
            };
            this.entries = [...this.entries.slice(-1999), entry];
            this.listeners.forEach((fn) => fn(this.entries));
        }).catch(() => {
            // Not in Tauri context (e.g. browser dev) — silently ignore
        });
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
        this.listeners.forEach((fn) => fn(this.entries));
    }
}

// Singleton — created once when the module first imports
export const consoleStore = new ConsoleStore();
