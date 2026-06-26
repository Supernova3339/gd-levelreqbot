// Shared script console — shows console.log/warn/error output from all running commands.
// Uses consoleStore (module singleton) so events are collected even when this page is closed.

import {useEffect, useRef, useState} from "react";
import type {ConsoleEntry} from "../lib/consoleStore";
import {consoleStore} from "../lib/consoleStore";

const LEVEL_STYLE: Record<string, { color: string; bg: string; icon: string }> = {
    log: {color: "#888", bg: "transparent", icon: "›"},
    warn: {color: "#fbbf24", bg: "transparent", icon: "⚠"},
    error: {color: "#f87171", bg: "#0f0505", icon: "✕"},
};

export function ConsolePage() {
    const [entries, setEntries] = useState<ConsoleEntry[]>(() => consoleStore.getEntries());
    const [filter, setFilter] = useState<"all" | "log" | "warn" | "error">("all");
    const [paused, setPaused] = useState(false);
    const pausedRef = useRef(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    pausedRef.current = paused;

    // Subscribe to store updates
    useEffect(() => {
        return consoleStore.subscribe((all) => {
            if (!pausedRef.current) setEntries(all);
        });
    }, []);

    // Auto-scroll on new entries
    useEffect(() => {
        if (!paused) bottomRef.current?.scrollIntoView({behavior: "instant"});
    }, [entries, paused]);

    const visible = filter === "all" ? entries : entries.filter((e) => e.level === filter);
    const counts = {
        log: entries.filter((e) => e.level === "log").length,
        warn: entries.filter((e) => e.level === "warn").length,
        error: entries.filter((e) => e.level === "error").length,
    };

    return (
        <div className="flex flex-col h-full" style={{backgroundColor: "#090909"}}>
            {/* ── Toolbar ── */}
            <div className="flex items-center gap-2 flex-shrink-0 px-3"
                 style={{height: 38, borderBottom: "1px solid #111", backgroundColor: "#0a0a0a"}}>

        <span className="text-xs font-semibold"
              style={{color: "#333", letterSpacing: "0.06em", textTransform: "uppercase"}}>
          Console
        </span>

                <div style={{width: 1, height: 14, backgroundColor: "#1e1e1e", margin: "0 4px"}}/>

                {(["all", "log", "warn", "error"] as const).map((f) => {
                    const active = filter === f;
                    const count = f === "all" ? entries.length : counts[f];
                    const color = f === "warn" ? "#fbbf24" : f === "error" ? "#f87171" : "#888";
                    return (
                        <button key={f} onClick={() => setFilter(f)} style={{
                            fontSize: 10, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
                            border: `1px solid ${active ? (f === "all" ? "#2a2a2a" : color + "55") : "#1a1a1a"}`,
                            backgroundColor: active ? (f === "all" ? "#1e1e1e" : color + "15") : "transparent",
                            color: active ? (f === "all" ? "#d0d0d0" : color) : "#444",
                        }}>
                            {f}{count > 0 ? ` (${count})` : ""}
                        </button>
                    );
                })}

                <div style={{flex: 1}}/>

                <button onClick={() => setPaused((v) => !v)} style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
                    border: "1px solid #1a1a1a", backgroundColor: "transparent",
                    color: paused ? "#fbbf24" : "#444",
                }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#d0d0d0";
                            e.currentTarget.style.borderColor = "#2a2a2a";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = paused ? "#fbbf24" : "#444";
                            e.currentTarget.style.borderColor = "#1a1a1a";
                        }}>
                    {paused ? "▶ Resume" : "⏸ Pause"}
                </button>

                <button onClick={() => {
                    consoleStore.clear();
                    setEntries([]);
                }} style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
                    border: "1px solid #1a1a1a", backgroundColor: "transparent", color: "#444",
                }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#f87171";
                            e.currentTarget.style.borderColor = "#2a1010";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#444";
                            e.currentTarget.style.borderColor = "#1a1a1a";
                        }}>
                    Clear
                </button>
            </div>

            {/* ── Entries ── */}
            <div className="flex-1 overflow-auto" style={{padding: "4px 0"}}>
                {visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full" style={{gap: 8}}>
                        <p style={{fontSize: 11, color: "#1e1e1e"}}>
                            {entries.length === 0 ? "No console output yet." : "No entries match the filter."}
                        </p>
                        {entries.length === 0 && (
                            <p style={{fontSize: 10, color: "#141414"}}>
                                Use <code style={{color: "#2a2a2a"}}>console.log("msg")</code> in any command script.
                            </p>
                        )}
                    </div>
                ) : (
                    visible.map((entry) => {
                        const s = LEVEL_STYLE[entry.level] ?? LEVEL_STYLE.log;
                        return (
                            <div key={entry.id} style={{
                                display: "flex", alignItems: "flex-start", gap: 8,
                                padding: "2px 14px", backgroundColor: s.bg,
                                borderLeft: entry.level !== "log" ? `2px solid ${s.color}40` : "2px solid transparent",
                            }}
                                 onMouseEnter={(e) => {
                                     (e.currentTarget as HTMLDivElement).style.backgroundColor = "#0d0d0d";
                                 }}
                                 onMouseLeave={(e) => {
                                     (e.currentTarget as HTMLDivElement).style.backgroundColor = s.bg;
                                 }}>
                <span style={{
                    fontSize: 9,
                    color: "#222",
                    fontFamily: "monospace",
                    marginTop: 2,
                    flexShrink: 0,
                    minWidth: 56
                }}>
                  {entry.ts}
                </span>
                                {entry.command && entry.command !== "unknown" && (
                                    <code style={{
                                        fontSize: 9,
                                        color: "#333",
                                        flexShrink: 0,
                                        fontFamily: "monospace",
                                        paddingTop: 2
                                    }}>
                                        {entry.command}
                                    </code>
                                )}
                                <span style={{fontSize: 12, color: s.color, flexShrink: 0}}>{s.icon}</span>
                                <span style={{
                                    fontSize: 11,
                                    color: s.color,
                                    fontFamily: '"JetBrains Mono","Fira Code",monospace',
                                    wordBreak: "break-all",
                                    flex: 1
                                }}>
                  {entry.message}
                </span>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef}/>
            </div>

            {/* ── Footer ── */}
            {entries.length > 0 && (
                <div className="flex items-center flex-shrink-0 px-3"
                     style={{height: 24, borderTop: "1px solid #0f0f0f"}}>
          <span style={{fontSize: 10, color: "#222"}}>
            {entries.length} entr{entries.length === 1 ? "y" : "ies"}
              {counts.warn > 0 && <span style={{marginLeft: 8, color: "#fbbf2466"}}>{counts.warn} warn</span>}
              {counts.error > 0 && <span style={{marginLeft: 8, color: "#f8717166"}}>{counts.error} error</span>}
          </span>
                    {paused && <span
                        style={{marginLeft: "auto", fontSize: 10, color: "#fbbf24", fontStyle: "italic"}}>paused</span>}
                </div>
            )}
        </div>
    );
}
