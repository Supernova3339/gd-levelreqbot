import {useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import type {DevWatch} from "../lib/commands";
import {listDevWatches, openDebugConsole} from "../lib/commands";
import {createErrorTracker} from "../lib/console-errors";

const devConsoleTracker = createErrorTracker();

interface ReloadEvent {
    module_id: string;
    files: string[];
}

interface WatchStatus {
    watch: DevWatch;
    lastReload: { files: string[]; at: number } | null;
}

export function DevReloadBar() {
    const [statuses, setStatuses] = useState<WatchStatus[]>([]);
    const [errors, setErrors] = useState(devConsoleTracker.getCount);
    const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    const refreshWatches = async () => {
        try {
            const watches = await listDevWatches();
            setStatuses(prev => {
                const prevMap = new Map(prev.map(s => [s.watch.module_id, s]));
                return watches.map(w => ({
                    watch: w,
                    lastReload: prevMap.get(w.module_id)?.lastReload ?? null,
                }));
            });
        } catch { /* backend not ready */
        }
    };

    useEffect(() => {
        refreshWatches();
    }, []);

    // Listen for new watches being started/stopped
    useEffect(() => {
        const unsub = listen("module-updated", () => refreshWatches());
        return () => {
            unsub.then(f => f());
        };
    }, []);

    // Listen for reloads — flash the relevant module's status
    useEffect(() => {
        const unsub = listen<ReloadEvent>("module-dev-reloaded", (e) => {
            const {module_id, files} = e.payload;

            setStatuses(prev =>
                prev.map(s =>
                    s.watch.module_id === module_id
                        ? {...s, lastReload: {files, at: Date.now()}}
                        : s
                )
            );

            // Auto-clear "reloaded" status after 4s back to "watching"
            if (timerRef.current[module_id]) clearTimeout(timerRef.current[module_id]);
            timerRef.current[module_id] = setTimeout(() => {
                setStatuses(prev =>
                    prev.map(s =>
                        s.watch.module_id === module_id
                            ? {...s, lastReload: null}
                            : s
                    )
                );
            }, 4000);

            // Also refresh the watch list in case something changed
            refreshWatches();
        });
        return () => {
            unsub.then(f => f());
        };
    }, []);

    useEffect(() => {
        const timers = timerRef.current;
        return () => {
            Object.values(timers).forEach(clearTimeout);
        };
    }, []);

    useEffect(() => {
        const unsub = devConsoleTracker.subscribe(setErrors);
        return () => {
            unsub();
        };
    }, []);

    return (
        <div style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 0,
            backgroundColor: "#090909",
            borderTop: "1px solid #141414",
            height: 26,
            overflow: "hidden",
        }}>
            {statuses.map((s, i) => {
                const reloaded = s.lastReload !== null;
                const files = s.lastReload?.files ?? [];
                const short = s.watch.source_dir.split(/[\\/]/).slice(-2).join("/");

                return (
                    <div
                        key={s.watch.module_id}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "0 10px",
                            height: "100%",
                            borderRight: i < statuses.length - 1 ? "1px solid #1a1a1a" : undefined,
                            transition: "background-color 0.3s",
                            backgroundColor: reloaded ? "#0a1a0a" : "transparent",
                        }}
                    >
                        {/* Status dot */}
                        <span style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            flexShrink: 0,
                            backgroundColor: reloaded ? "#22c55e" : "#22d3ee",
                            boxShadow: reloaded ? "0 0 5px #22c55e" : undefined,
                        }}/>

                        <span style={{fontSize: 10, color: reloaded ? "#22c55e" : "#333", fontFamily: "monospace"}}>
                            {s.watch.module_id}
                        </span>

                        {reloaded ? (
                            <span style={{fontSize: 10, color: "#1a5f1a"}}>
                                — reloaded
                                {files.length > 0 && (
                                    <span style={{color: "#22c55e", marginLeft: 4}}>
                                        {files.slice(0, 2).map(f => f.split(/[\\/]/).pop()).join(", ")}
                                        {files.length > 2 && ` +${files.length - 2}`}
                                    </span>
                                )}
                            </span>
                        ) : (
                            <span style={{fontSize: 10, color: "#222"}}>
                                — watching <span style={{color: "#2a2a2a"}}>{short}</span>
                            </span>
                        )}
                    </div>
                );
            })}

            {/* Spacer pushes console button to the right */}
            <div style={{flex: 1}}/>

            {/* Debug console toggle */}
            <button
                onClick={() => {
                    devConsoleTracker.clear();
                    openDebugConsole().catch(() => {
                    });
                }}
                title={errors ? `Open Debug Console — ${errors} error${errors === 1 ? "" : "s"}` : "Open Debug Console"}
                style={{
                    height: "100%",
                    padding: "0 10px",
                    background: "none",
                    border: "none",
                    borderLeft: "1px solid #141414",
                    cursor: "pointer",
                    color: errors ? "#f87171" : "#2a2a2a",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 10,
                    flexShrink: 0,
                    position: "relative",
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.color = errors ? "#fca5a5" : "#555";
                    e.currentTarget.style.backgroundColor = "#0f0f0f";
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.color = errors ? "#f87171" : "#2a2a2a";
                    e.currentTarget.style.backgroundColor = "transparent";
                }}
            >
                {/* Terminal icon */}
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                     strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="2" width="14" height="12" rx="2"/>
                    <polyline points="4,6 7,9 4,12"/>
                    <line x1="9" y1="12" x2="13" y2="12"/>
                </svg>
                Console
                {!!errors && (
                    <span style={{
                        width: 5, height: 5, borderRadius: "50%",
                        backgroundColor: "#f87171",
                        boxShadow: "0 0 4px #f8717188",
                        flexShrink: 0,
                    }}/>
                )}
            </button>
        </div>
    );
}
