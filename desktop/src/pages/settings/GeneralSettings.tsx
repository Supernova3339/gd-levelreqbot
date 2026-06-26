import {useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {disable, enable, isEnabled} from "@tauri-apps/plugin-autostart";
import {invoke} from "@tauri-apps/api/core";
import {getVersion} from "@tauri-apps/api/app";
import {getKeybinds, setKeybind} from "../../lib/commands";
import type {Keybind} from "../../lib/types";

const APP_FLAIR = (import.meta.env.VITE_APP_FLAIR as string | undefined) ?? "nightly";
const FLAIR_COLOR: Record<string, string> = {
    stable: "#22c55e",
    beta: "#f59e0b",
    nightly: "#818cf8",
    dev: "#ec4899",
};

async function setDevLogging(enabled: boolean): Promise<void> {
    return invoke("set_dev_logging", {enabled});
}

async function getDevLogs(): Promise<string[]> {
    return invoke("get_dev_logs");
}

async function clearDevLogs(): Promise<void> {
    return invoke("clear_dev_logs");
}

function Toggle({label, description, checked, onChange}: {
    label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
    return (
        <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative mt-0.5 flex-shrink-0" onClick={() => onChange(!checked)}>
                <div className="w-9 h-5 rounded-full"
                     style={{backgroundColor: checked ? "var(--color-accent)" : "#333"}}>
                    <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                         style={{transform: checked ? "translateX(18px)" : "translateX(2px)"}}/>
                </div>
            </div>
            <div>
                <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>{label}</p>
                {description && <p className="text-xs mt-0.5" style={{color: "#555"}}>{description}</p>}
            </div>
        </label>
    );
}

const KEYBIND_LABELS: Record<string, string> = {
    next_level: "Next level",
    open_settings: "Open settings",
};

function KeybindRow({bind, onSave}: { bind: Keybind; onSave: (shortcut: string) => void }) {
    const [recording, setRecording] = useState(false);
    const [pending, setPending] = useState(bind.shortcut);

    const startRecord = () => {
        setPending("");
        setRecording(true);
    };
    const cancel = () => {
        setPending(bind.shortcut);
        setRecording(false);
    };
    const save = () => {
        onSave(pending);
        setRecording(false);
    };
    const clear = () => {
        onSave("");
        setPending("");
    };

    useEffect(() => {
        if (!recording) return;
        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            if (e.key === "Escape") {
                cancel();
                return;
            }
            const parts: string[] = [];
            if (e.ctrlKey) parts.push("Ctrl");
            if (e.altKey) parts.push("Alt");
            if (e.shiftKey) parts.push("Shift");
            if (e.metaKey) parts.push("Meta");
            const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
            if (!["Control", "Alt", "Shift", "Meta"].includes(key)) parts.push(key);
            if (parts.length > 0) setPending(parts.join("+"));
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [recording]);

    return (
        <div className="flex items-center gap-3">
      <span className="text-xs flex-1" style={{color: "#a0a0a0"}}>
        {KEYBIND_LABELS[bind.action] ?? bind.action}
      </span>
            {recording ? (
                <>
                    <div className="px-3 py-1 text-xs rounded font-mono"
                         style={{
                             backgroundColor: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
                             border: "1px solid var(--color-accent)", color: "var(--color-accent)", minWidth: 120
                         }}>
                        {pending || "Press keys..."}
                    </div>
                    <button onClick={save} className="text-xs px-2 py-1 rounded"
                            style={{backgroundColor: "var(--color-accent)", color: "#fff"}}>Save
                    </button>
                    <button onClick={cancel} className="text-xs px-2 py-1 rounded"
                            style={{backgroundColor: "#222", color: "#888", border: "1px solid #333"}}>Cancel
                    </button>
                </>
            ) : (
                <>
                    <div className="px-3 py-1 text-xs rounded font-mono cursor-pointer"
                         onClick={startRecord}
                         style={{
                             backgroundColor: "#111",
                             border: "1px solid #2a2a2a",
                             color: bind.shortcut ? "#f1f1f1" : "#444",
                             minWidth: 120
                         }}>
                        {bind.shortcut || "Not bound"}
                    </div>
                    {bind.shortcut && (
                        <button onClick={clear} className="text-xs" style={{color: "#555"}}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "#ef4444";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "#555";
                                }}>
                            Clear
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

export function GeneralSettings() {
    const [autostart, setAutostart] = useState(false);
    const [devLogging, setDevLoggingState] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [keybinds, setKeybinds] = useState<Keybind[]>([]);
    const [version, setVersion] = useState("…");
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getVersion().then(setVersion).catch(() => {
        });
    }, []);

    useEffect(() => {
        isEnabled().then(setAutostart).catch(() => {
        });
        getDevLogs().then(setLogs).catch(() => {
        });
        getKeybinds().then(setKeybinds).catch(() => {
        });

        // Dev logging is in-memory on the Rust side — restore from localStorage on mount.
        const stored = localStorage.getItem("gdlqbot.dev_logging") === "1";
        setDevLoggingState(stored);
        if (stored) setDevLogging(true).catch(() => {
        });
    }, []);

    // Auto-scroll log to bottom when new entries arrive
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs]);

    // Listen for new log entries emitted from Rust
    useEffect(() => {
        const unlisten = listen<string>("dev-log", (e) => {
            setLogs((prev) => {
                const next = [...prev, e.payload];
                return next.length > 500 ? next.slice(-500) : next;
            });
        });
        return () => {
            unlisten.then((f) => f());
        };
    }, []);

    const handleAutostartToggle = async (v: boolean) => {
        setAutostart(v);
        try {
            v ? await enable() : await disable();
        } catch {
            setAutostart(!v);
        }
    };

    const handleDevLoggingToggle = async (v: boolean) => {
        setDevLoggingState(v);
        localStorage.setItem("gdlqbot.dev_logging", v ? "1" : "0");
        try {
            await setDevLogging(v);
        } catch {
            setDevLoggingState(!v);
        }
    };

    const handleClear = async () => {
        await clearDevLogs().catch(() => {
        });
        setLogs([]);
    };

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h2 className="text-sm font-semibold mb-1" style={{color: "#f1f1f1"}}>General</h2>
            </div>

            {/* Startup */}
            <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{color: "#555"}}>Startup</p>
                <Toggle
                    label="Start on login"
                    description="Launch the bot automatically when you log in to your computer."
                    checked={autostart}
                    onChange={handleAutostartToggle}
                />
            </div>

            {/* Keybinds */}
            {keybinds.length > 0 && (
                <div className="flex flex-col gap-3" style={{paddingTop: 16, borderTop: "1px solid #2a2a2a"}}>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{color: "#555"}}>Keybinds</p>
                    <p className="text-xs" style={{color: "#444"}}>
                        Global shortcuts — work even when the app window is in the background. Click a binding to record
                        a new one.
                    </p>
                    <div className="flex flex-col gap-3">
                        {keybinds.map((bind) => (
                            <KeybindRow
                                key={bind.action}
                                bind={bind}
                                onSave={async (shortcut) => {
                                    await setKeybind(bind.action, shortcut).catch(() => {
                                    });
                                    setKeybinds((prev) => prev.map((k) => k.action === bind.action ? {
                                        ...k,
                                        shortcut
                                    } : k));
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* About */}
            <div className="flex items-center justify-between" style={{paddingTop: 16, borderTop: "1px solid #2a2a2a"}}>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{color: "#555"}}>About</p>
                    <div className="flex items-center gap-2">
                        <span className="text-xs" style={{color: "#888"}}>GD Level Request Bot</span>
                        <span className="text-xs" style={{color: "#444"}}>v{version}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                              style={{
                                  backgroundColor: `${FLAIR_COLOR[APP_FLAIR] ?? "#818cf8"}18`,
                                  color: FLAIR_COLOR[APP_FLAIR] ?? "#818cf8",
                                  border: `1px solid ${FLAIR_COLOR[APP_FLAIR] ?? "#818cf8"}33`,
                                  letterSpacing: "0.05em",
                                  textTransform: "uppercase",
                                  fontSize: 9,
                              }}>
              {APP_FLAIR}
            </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{color: "#2a2a2a"}}>one.superdev.gdlqbot</p>
                </div>
            </div>

            {/* Development */}
            <div className="flex flex-col gap-3" style={{paddingTop: 16, borderTop: "1px solid #2a2a2a"}}>
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider"
                       style={{color: "#555"}}>Development</p>
                    {logs.length > 0 && (
                        <button
                            onClick={handleClear}
                            className="text-xs px-2 py-0.5 rounded"
                            style={{backgroundColor: "#222", color: "#666", border: "1px solid #2a2a2a"}}
                        >
                            Clear
                        </button>
                    )}
                </div>

                <Toggle
                    label="Verbose logging"
                    description="Log the full Twitch IRC connection handshake and all incoming messages. Useful for debugging connection issues."
                    checked={devLogging}
                    onChange={handleDevLoggingToggle}
                />

                {/* Log viewer — only shown when logging is on or there are logs */}
                {(devLogging || logs.length > 0) && (
                    <div
                        ref={logRef}
                        className="rounded overflow-y-auto font-mono text-xs"
                        style={{
                            backgroundColor: "#0a0a0a",
                            border: "1px solid #2a2a2a",
                            height: 240,
                            padding: "8px 10px",
                            color: "#888",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                        }}
                    >
                        {logs.length === 0 ? (
                            <span style={{color: "#444"}}>
                Logs will appear here. Start the bot or connect to a platform to begin.
              </span>
                        ) : (
                            logs.map((line, i) => {
                                const isError = line.startsWith("!");
                                const isSuccess = line.startsWith("===");
                                const isArrow = line.startsWith("←");
                                const color = isError ? "#ef4444"
                                    : isSuccess ? "#22c55e"
                                        : isArrow ? "#a0a0a0"
                                            : "#666";
                                return (
                                    <div key={i} style={{color, lineHeight: 1.6}}>
                                        {line}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
