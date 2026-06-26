import {useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {invoke} from "@tauri-apps/api/core";
import {PERF_EVENT, PERF_KEY} from "../../components/PerfOverlay";
import {DEVTOOLS_EVENT, DEVTOOLS_KEY_EXPORT} from "../../components/ContextMenu";

async function setDevLogging(enabled: boolean): Promise<void> {
    return invoke("set_dev_logging", {enabled});
}

async function getDevLogs(): Promise<string[]> {
    return invoke("get_dev_logs");
}

async function clearDevLogs(): Promise<void> {
    return invoke("clear_dev_logs");
}

const DEMO_KEY = "gdlqbot_demo_mode";

export function DevelopmentSettings() {
    const [demoActive, setDemoActive] = useState(localStorage.getItem(DEMO_KEY) === "1");
    const [perfCounter, setPerfCounter] = useState(localStorage.getItem(PERF_KEY) === "1");
    const [devtools, setDevtools] = useState(localStorage.getItem(DEVTOOLS_KEY_EXPORT) === "1");

    const togglePerf = (v: boolean) => {
        setPerfCounter(v);
        if (v) localStorage.setItem(PERF_KEY, "1");
        else localStorage.removeItem(PERF_KEY);
        window.dispatchEvent(new Event(PERF_EVENT));
    };

    const toggleDevtools = (v: boolean) => {
        setDevtools(v);
        if (v) localStorage.setItem(DEVTOOLS_KEY_EXPORT, "1");
        else localStorage.removeItem(DEVTOOLS_KEY_EXPORT);
        window.dispatchEvent(new Event(DEVTOOLS_EVENT));
    };

    const toggleDemo = () => {
        if (demoActive) {
            localStorage.removeItem(DEMO_KEY);
            setDemoActive(false);
        } else {
            localStorage.setItem(DEMO_KEY, "1");
            setDemoActive(true);
        }
        // Reload so App.tsx picks up the change
        window.location.reload();
    };
    const [devLogging, setDevLoggingState] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getDevLogs().then(setLogs).catch(() => {
        });
        const stored = localStorage.getItem("gdlqbot.dev_logging") === "1";
        setDevLoggingState(stored);
        if (stored) setDevLogging(true).catch(() => {
        });
    }, []);

    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [logs]);

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

    const handleToggle = async (v: boolean) => {
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

    const [restarting, setRestarting] = useState(false);

    const handleRestart = async () => {
        setRestarting(true);
        try {
            await invoke("restart_app");
        } catch {
            setRestarting(false);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-sm font-semibold mb-1" style={{color: "#f1f1f1"}}>Development</h2>
                <p className="text-xs" style={{color: "#555"}}>Tools for debugging and testing.</p>
            </div>

            {/* Restart */}
            <div className="flex items-center justify-between p-3 rounded-lg"
                 style={{backgroundColor: "#111", border: "1px solid #2a2a2a"}}>
                <div>
                    <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>Restart app</p>
                    <p className="text-xs mt-0.5" style={{color: "#555"}}>
                        Fully closes and relaunches the app — useful after changing settings.
                    </p>
                </div>
                <button onClick={handleRestart} disabled={restarting}
                        className="px-3 py-1.5 text-xs font-medium rounded flex-shrink-0 ml-4"
                        style={{
                            backgroundColor: "#1a1a1a", color: restarting ? "#444" : "#c0c0c0",
                            border: "1px solid #2a2a2a", cursor: restarting ? "not-allowed" : "pointer",
                        }}>
                    {restarting ? "Restarting…" : "↺ Restart"}
                </button>
            </div>

            {/* Demo mode toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg"
                 style={{backgroundColor: "#111", border: `1px solid ${demoActive ? "#f59e0b44" : "#2a2a2a"}`}}>
                <div>
                    <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>
                        Demo mode {demoActive &&
                        <span className="text-xs ml-2" style={{color: "#f59e0b"}}>active</span>}
                    </p>
                    <p className="text-xs mt-0.5" style={{color: "#555"}}>
                        Load fake queue data for UI testing. Bot is disconnected.
                    </p>
                </div>
                <button
                    onClick={toggleDemo}
                    className="px-3 py-1.5 text-xs font-medium rounded flex-shrink-0 ml-4"
                    style={{
                        backgroundColor: demoActive ? "#2a1500" : "#1a2a1a",
                        color: demoActive ? "#f59e0b" : "#4ade80",
                        border: `1px solid ${demoActive ? "#f59e0b44" : "#22c55e44"}`,
                    }}
                >
                    {demoActive ? "Disable demo" : "Enable demo"}
                </button>
            </div>

            {/* Inspect element (devtools) */}
            <div className="flex items-start justify-between gap-4 p-3 rounded-lg"
                 style={{backgroundColor: "#111", border: `1px solid ${devtools ? "#ec489944" : "#2a2a2a"}`}}>
                <div>
                    <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>
                        Inspect element
                        {devtools && <span className="text-xs ml-2" style={{color: "#ec4899"}}>active</span>}
                    </p>
                    <p className="text-xs mt-0.5" style={{color: "#555"}}>
                        Adds "Inspect element" to the right-click menu — opens the WebView2 devtools.
                    </p>
                </div>
                <button onClick={() => toggleDevtools(!devtools)} className="flex-shrink-0 mt-0.5"
                        style={{cursor: "pointer", background: "none", border: "none", padding: 0}}>
                    <div className="w-9 h-5 rounded-full relative"
                         style={{backgroundColor: devtools ? "#ec4899" : "#333"}}>
                        <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                             style={{transform: devtools ? "translateX(18px)" : "translateX(2px)"}}/>
                    </div>
                </button>
            </div>

            {/* Performance counter */}
            <div className="flex items-start justify-between gap-4 p-3 rounded-lg"
                 style={{backgroundColor: "#111", border: `1px solid ${perfCounter ? "#818cf844" : "#2a2a2a"}`}}>
                <div>
                    <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>
                        Performance counter
                        {perfCounter && <span className="text-xs ml-2" style={{color: "#818cf8"}}>active</span>}
                    </p>
                    <p className="text-xs mt-0.5" style={{color: "#555"}}>
                        Shows FPS and JS heap memory in the bottom-right corner of the app.
                    </p>
                </div>
                <button onClick={() => togglePerf(!perfCounter)} className="flex-shrink-0 mt-0.5"
                        style={{cursor: "pointer", background: "none", border: "none", padding: 0}}>
                    <div className="w-9 h-5 rounded-full relative"
                         style={{backgroundColor: perfCounter ? "#818cf8" : "#333"}}>
                        <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                             style={{transform: perfCounter ? "translateX(18px)" : "translateX(2px)"}}/>
                    </div>
                </button>
            </div>

            <div className="flex items-center justify-between">
                <label className="flex items-start gap-3 cursor-pointer flex-1">
                    <div className="relative mt-0.5 flex-shrink-0" onClick={() => handleToggle(!devLogging)}>
                        <div className="w-9 h-5 rounded-full"
                             style={{backgroundColor: devLogging ? "var(--color-accent)" : "#333"}}>
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                 style={{transform: devLogging ? "translateX(18px)" : "translateX(2px)"}}/>
                        </div>
                    </div>
                    <div onClick={() => handleToggle(!devLogging)}>
                        <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>Verbose logging</p>
                        <p className="text-xs mt-0.5" style={{color: "#555"}}>
                            Logs the full Twitch IRC handshake — useful for diagnosing connection failures.
                        </p>
                    </div>
                </label>
                {logs.length > 0 && (
                    <button onClick={handleClear} className="text-xs px-2 py-1 rounded ml-4 flex-shrink-0"
                            style={{backgroundColor: "#222", color: "#666", border: "1px solid #2a2a2a"}}>
                        Clear
                    </button>
                )}
            </div>

            {(devLogging || logs.length > 0) && (
                <div
                    ref={logRef}
                    className="rounded overflow-y-auto font-mono text-xs"
                    style={{
                        backgroundColor: "#0a0a0a",
                        border: "1px solid #2a2a2a",
                        height: 280,
                        padding: "8px 10px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                    }}
                >
                    {logs.length === 0 ? (
                        <span style={{color: "#444"}}>
              Logs appear here. Start the bot or connect a platform.
            </span>
                    ) : (
                        logs.map((line, i) => (
                            <div key={i} style={{
                                lineHeight: 1.7,
                                color: line.startsWith("!") ? "#ef4444"
                                    : line.startsWith("===") ? "#22c55e"
                                        : line.startsWith("←") ? "#a0a0a0"
                                            : "#555",
                            }}>
                                {line}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
