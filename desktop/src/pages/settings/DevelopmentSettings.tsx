import {useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {invoke} from "@tauri-apps/api/core";
import {PERF_EVENT, PERF_KEY} from "../../components/PerfOverlay";
import {DEVTOOLS_EVENT, DEVTOOLS_KEY_EXPORT} from "../../components/ContextMenu";
import {getLicenseToken} from "../../lib/commands";
import {installLocalPackage} from "../../lib/commands";

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
export const DISABLE_UPDATES_KEY = "gdlqbot.disable_update_check";

export function DevelopmentSettings() {
    const [demoActive, setDemoActive] = useState(localStorage.getItem(DEMO_KEY) === "1");
    const [perfCounter, setPerfCounter] = useState(localStorage.getItem(PERF_KEY) === "1");
    const [devtools, setDevtools] = useState(localStorage.getItem(DEVTOOLS_KEY_EXPORT) === "1");
    const [disableUpdates, setDisableUpdates] = useState(localStorage.getItem(DISABLE_UPDATES_KEY) === "1");

    const toggleDisableUpdates = (v: boolean) => {
        setDisableUpdates(v);
        if (v) localStorage.setItem(DISABLE_UPDATES_KEY, "1");
        else localStorage.removeItem(DISABLE_UPDATES_KEY);
    };

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

    // ── Marketplace token ──────────────────────────────────────────────────────
    const [mpToken, setMpToken]       = useState<string | null>(null);
    const [tokenRevealed, setTokenRevealed] = useState(false);
    const [tokenCopied, setTokenCopied]     = useState(false);

    useEffect(() => {
        getLicenseToken().then(t => setMpToken(t ?? null)).catch(() => {});
    }, []);

    const copyToken = async () => {
        if (!mpToken) return;
        await navigator.clipboard.writeText(mpToken).catch(() => {});
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 1800);
    };

    // ── Manual package install ─────────────────────────────────────────────────
    const pkgFileRef = useRef<HTMLInputElement>(null);
    const [pkgInstalling, setPkgInstalling] = useState(false);
    const [pkgResult, setPkgResult]         = useState<{ ok: boolean; msg: string } | null>(null);

    const handlePkgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setPkgInstalling(true); setPkgResult(null);
        try {
            const buf = await file.arrayBuffer();
            const bytes = Array.from(new Uint8Array(buf));
            await installLocalPackage(bytes);
            setPkgResult({ ok: true, msg: `Installed "${file.name}" successfully.` });
        } catch (err) {
            setPkgResult({ ok: false, msg: String(err) });
        } finally {
            setPkgInstalling(false);
        }
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

            {/* Marketplace token */}
            <div className="p-3 rounded-lg" style={{backgroundColor: "#111", border: "1px solid #2a2a2a"}}>
                <p className="text-sm font-medium mb-1" style={{color: "#f1f1f1"}}>Marketplace token</p>
                <p className="text-xs mb-2" style={{color: "#555"}}>
                    Your license token for authenticating with the marketplace API.
                </p>
                {mpToken ? (
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs px-2 py-1 rounded overflow-hidden"
                            style={{
                                backgroundColor: "#0a0a0a", border: "1px solid #1e1e1e",
                                color: "#555", fontFamily: "monospace",
                                whiteSpace: "nowrap", textOverflow: "ellipsis", display: "block",
                            }}>
                            {tokenRevealed ? mpToken : "•".repeat(Math.min(mpToken.length, 40))}
                        </code>
                        <button onClick={() => setTokenRevealed(v => !v)}
                            className="text-xs px-2 py-1 rounded flex-shrink-0"
                            style={{backgroundColor: "#1a1a1a", color: "#666", border: "1px solid #2a2a2a"}}>
                            {tokenRevealed ? "Hide" : "Show"}
                        </button>
                        <button onClick={copyToken}
                            className="text-xs px-2 py-1 rounded flex-shrink-0"
                            style={{
                                backgroundColor: tokenCopied ? "#0a2010" : "#1a1a1a",
                                color: tokenCopied ? "#22c55e" : "#c0c0c0",
                                border: `1px solid ${tokenCopied ? "#22c55e44" : "#2a2a2a"}`,
                            }}>
                            {tokenCopied ? "Copied" : "Copy"}
                        </button>
                    </div>
                ) : (
                    <p className="text-xs" style={{color: "#333"}}>Not signed in — token unavailable.</p>
                )}
            </div>

            {/* Manual package install */}
            <div className="p-3 rounded-lg" style={{backgroundColor: "#111", border: "1px solid #2a2a2a"}}>
                <p className="text-sm font-medium mb-1" style={{color: "#f1f1f1"}}>Install package from file</p>
                <p className="text-xs mb-3" style={{color: "#555"}}>
                    Install a <code style={{color: "#888"}}>.gdmod</code>, <code style={{color: "#888"}}>.gdlib</code>,
                    or <code style={{color: "#888"}}>.gdpck</code> file directly from disk. Useful for local development and testing.
                </p>
                <input ref={pkgFileRef} type="file" accept=".gdmod,.gdlib,.gdpck" style={{display: "none"}}
                    onChange={handlePkgFile}/>
                <button
                    onClick={() => { setPkgResult(null); pkgFileRef.current?.click(); }}
                    disabled={pkgInstalling}
                    className="px-3 py-1.5 text-xs font-medium rounded"
                    style={{
                        backgroundColor: "#1a1a1a", color: pkgInstalling ? "#444" : "#c0c0c0",
                        border: "1px solid #2a2a2a", cursor: pkgInstalling ? "not-allowed" : "pointer",
                    }}>
                    {pkgInstalling ? "Installing…" : "Choose file…"}
                </button>
                {pkgResult && (
                    <p className="text-xs mt-2" style={{color: pkgResult.ok ? "#22c55e" : "#ef4444"}}>
                        {pkgResult.msg}
                    </p>
                )}
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

            {/* Disable update check */}
            <div className="flex items-start justify-between gap-4 p-3 rounded-lg"
                 style={{backgroundColor: "#111", border: `1px solid ${disableUpdates ? "#f59e0b44" : "#2a2a2a"}`}}>
                <div>
                    <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>
                        Disable update check
                        {disableUpdates && <span className="text-xs ml-2" style={{color: "#f59e0b"}}>active</span>}
                    </p>
                    <p className="text-xs mt-0.5" style={{color: "#555"}}>
                        Prevents the About page from checking for updates — useful during local development.
                    </p>
                </div>
                <button onClick={() => toggleDisableUpdates(!disableUpdates)} className="flex-shrink-0 mt-0.5"
                        style={{cursor: "pointer", background: "none", border: "none", padding: 0}}>
                    <div className="w-9 h-5 rounded-full relative"
                         style={{backgroundColor: disableUpdates ? "#f59e0b" : "#333"}}>
                        <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                             style={{transform: disableUpdates ? "translateX(18px)" : "translateX(2px)"}}/>
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
