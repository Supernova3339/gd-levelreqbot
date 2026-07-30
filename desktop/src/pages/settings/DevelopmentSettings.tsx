import {useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {invoke} from "@tauri-apps/api/core";
import {PERF_EVENT, PERF_KEY} from "../../components/PerfOverlay";
import {DEVTOOLS_EVENT, DEVTOOLS_KEY_EXPORT} from "../../components/ContextMenu";
import type {DevWatch} from "../../lib/commands";
import {
    getLicenseToken,
    hardRefreshModule,
    installLocalPackage,
    installModuleFromDir,
    listDevWatches,
    pickDirectory,
    startModuleDevWatch,
    stopModuleDevWatch
} from "../../lib/commands";

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

    // ── Dev watches ───────────────────────────────────────────────────────────
    const [watches, setWatches] = useState<DevWatch[]>([]);
    const [watchAdding, setWatchAdding] = useState(false);
    const [watchError, setWatchError] = useState<string | null>(null);
    const [reloadedIds, setReloadedIds] = useState<Record<string, number>>({});
    const [refreshingId, setRefreshingId] = useState<string | null>(null);

    const refreshWatches = async () => {
        try {
            setWatches(await listDevWatches());
        } catch { /* ignore */
        }
    };

    useEffect(() => {
        refreshWatches();
    }, []);

    useEffect(() => {
        const unlisten = listen<{ module_id: string; files: string[] }>("module-dev-reloaded", (e) => {
            const id = e.payload.module_id;
            setReloadedIds(prev => ({...prev, [id]: Date.now()}));
        });
        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const handleAddWatch = async () => {
        setWatchError(null);
        const dir = await pickDirectory();
        if (!dir) return;
        setWatchAdding(true);
        try {
            const moduleId = await installModuleFromDir(dir);
            await startModuleDevWatch(moduleId, dir);
            await refreshWatches();
        } catch (err) {
            setWatchError(String(err));
        } finally {
            setWatchAdding(false);
        }
    };

    const handleStopWatch = async (moduleId: string) => {
        try {
            await stopModuleDevWatch(moduleId);
            setReloadedIds(prev => {
                const n = {...prev};
                delete n[moduleId];
                return n;
            });
            await refreshWatches();
        } catch { /* ignore */
        }
    };

    // Unlike the watch's own auto-sync (which only adds/overwrites files),
    // this wipes the installed copy first — fixes both "edited a file and it
    // didn't take" and "renamed/deleted a file and the old one lingers".
    const handleHardRefresh = async (moduleId: string, sourceDir: string) => {
        setWatchError(null);
        setRefreshingId(moduleId);
        try {
            await hardRefreshModule(sourceDir);
            setReloadedIds(prev => ({...prev, [moduleId]: Date.now()}));
        } catch (err) {
            setWatchError(String(err));
        } finally {
            setRefreshingId(null);
        }
    };

    const [restarting, setRestarting] = useState(false);

    // ── CLI PATH install ───────────────────────────────────────────────────────
    // const [cliStatus, setCliStatus]   = useState<CliInstallResult | null>(null);
    // const [cliWorking, setCliWorking] = useState(false);
    // const [cliMsg, setCliMsg]         = useState<{ ok: boolean; text: string } | null>(null);
    //
    // useEffect(() => {
    //     cliInstallStatus().then(setCliStatus).catch(() => {});
    // }, []);
    //
    // const handleCliInstall = async () => {
    //     setCliWorking(true); setCliMsg(null);
    //     try {
    //         const result = await installCliToPath();
    //         setCliStatus(result);
    //         setCliMsg(result.already_in_path
    //             ? { ok: true, text: "Already in PATH — no changes needed." }
    //             : { ok: true, text: "Added to PATH. Open a new terminal and run: gdlqbcli --help" });
    //     } catch (e) {
    //         setCliMsg({ ok: false, text: String(e) });
    //     } finally { setCliWorking(false); }
    // };
    //
    // const handleCliUninstall = async () => {
    //     setCliWorking(true); setCliMsg(null);
    //     try {
    //         await uninstallCliFromPath();
    //         const result = await cliInstallStatus();
    //         setCliStatus(result);
    //         setCliMsg({ ok: true, text: "Removed from PATH." });
    //     } catch (e) {
    //         setCliMsg({ ok: false, text: String(e) });
    //     } finally { setCliWorking(false); }
    // };

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

            {/* Developer CLI */}
            {/*<div className="p-3 rounded-lg" style={{backgroundColor: "#111", border: `1px solid ${cliStatus?.installed ? "#22c55e44" : "#2a2a2a"}`}}>*/}
            {/*    <div className="flex items-start justify-between gap-4 mb-2">*/}
            {/*        <div>*/}
            {/*            <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>*/}
            {/*                Developer CLI*/}
            {/*                {cliStatus?.installed && (*/}
            {/*                    <span className="text-xs ml-2" style={{color: "#22c55e"}}>in PATH</span>*/}
            {/*                )}*/}
            {/*            </p>*/}
            {/*            <p className="text-xs mt-0.5" style={{color: "#555"}}>*/}
            {/*                Adds <code style={{color: "#888"}}>gdlqbcli</code> to your system PATH so you can run*/}
            {/*                {" "}<code style={{color: "#888"}}>gdlqbcli build</code>,{" "}*/}
            {/*                <code style={{color: "#888"}}>gdlqbcli watch</code>, and other commands from any terminal.*/}
            {/*            </p>*/}
            {/*        </div>*/}
            {/*        <div className="flex gap-2 flex-shrink-0">*/}
            {/*            <button onClick={handleCliInstall}*/}
            {/*                disabled={cliWorking || cliStatus?.installed || cliStatus?.binary_found === false}*/}
            {/*                className="px-3 py-1.5 text-xs font-medium rounded"*/}
            {/*                style={{*/}
            {/*                    backgroundColor: "#1a2a1a",*/}
            {/*                    color: (cliWorking || cliStatus?.installed || cliStatus?.binary_found === false) ? "#333" : "#4ade80",*/}
            {/*                    border: "1px solid #22c55e22",*/}
            {/*                    cursor: (cliWorking || cliStatus?.installed || cliStatus?.binary_found === false) ? "not-allowed" : "pointer",*/}
            {/*                }}>*/}
            {/*                Add to PATH*/}
            {/*            </button>*/}
            {/*            <button onClick={handleCliUninstall}*/}
            {/*                disabled={cliWorking || !cliStatus?.installed}*/}
            {/*                className="px-3 py-1.5 text-xs font-medium rounded"*/}
            {/*                style={{*/}
            {/*                    backgroundColor: "#1a0a0a",*/}
            {/*                    color: (cliWorking || !cliStatus?.installed) ? "#333" : "#ef4444",*/}
            {/*                    border: "1px solid #ef444411",*/}
            {/*                    cursor: (cliWorking || !cliStatus?.installed) ? "not-allowed" : "pointer",*/}
            {/*                }}>*/}
            {/*                Remove from PATH*/}
            {/*            </button>*/}
            {/*        </div>*/}
            {/*    </div>*/}
            {/*    {cliStatus?.dir && (*/}
            {/*        <p className="text-xs mb-1" style={{color: "#444", fontFamily: "monospace", wordBreak: "break-all"}}>*/}
            {/*            {cliStatus.dir}*/}
            {/*        </p>*/}
            {/*    )}*/}
            {/*    {cliStatus?.binary_found === false && (*/}
            {/*        <p className="text-xs" style={{color: "#f59e0b"}}>*/}
            {/*            <code>gdlqbcli</code> not found — run <code>cargo build -p gdlqbot-cli</code> first, or install the app via <code>cargo tauri build</code>.*/}
            {/*        </p>*/}
            {/*    )}*/}
            {/*    {cliMsg && (*/}
            {/*        <p className="text-xs mt-1" style={{color: cliMsg.ok ? "#22c55e" : "#ef4444"}}>*/}
            {/*            {cliMsg.text}*/}
            {/*        </p>*/}
            {/*    )}*/}
            {/*</div>*/}

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

            {/* Dev watches */}
            <div className="p-3 rounded-lg" style={{backgroundColor: "#111", border: "1px solid #2a2a2a"}}>
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>Hot-reload watches</p>
                        <p className="text-xs mt-0.5" style={{color: "#555"}}>
                            Pick a module source directory — the app auto-reinstalls it when files change.
                        </p>
                    </div>
                    <button
                        onClick={handleAddWatch}
                        disabled={watchAdding}
                        className="px-3 py-1.5 text-xs font-medium rounded flex-shrink-0 ml-4"
                        style={{
                            backgroundColor: "#1a2a1a", color: watchAdding ? "#444" : "#4ade80",
                            border: "1px solid #22c55e44", cursor: watchAdding ? "not-allowed" : "pointer",
                        }}>
                        {watchAdding ? "Adding…" : "+ Add directory"}
                    </button>
                </div>
                {watchError && (
                    <p className="text-xs mb-2" style={{color: "#ef4444"}}>{watchError}</p>
                )}
                {watches.length === 0 ? (
                    <p className="text-xs py-2 text-center" style={{color: "#333"}}>No active watches.</p>
                ) : (
                    <div className="flex flex-col gap-1.5 mt-2">
                        {watches.map(w => {
                            const lastReload = reloadedIds[w.module_id];
                            return (
                                <div key={w.module_id}
                                     className="flex items-center gap-2 px-2 py-1.5 rounded"
                                     style={{backgroundColor: "#0d0d0d", border: "1px solid #1e1e1e"}}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate"
                                           style={{color: "#c0c0c0"}}>{w.module_id}</p>
                                        <p className="text-xs truncate"
                                           style={{color: "#444", fontFamily: "monospace"}}>{w.source_dir}</p>
                                    </div>
                                    {lastReload && (
                                        <span className="text-xs flex-shrink-0" style={{color: "#22c55e"}}>
                                            reloaded {new Date(lastReload).toLocaleTimeString()}
                                        </span>
                                    )}
                                    <button
                                        onClick={() => handleHardRefresh(w.module_id, w.source_dir)}
                                        disabled={refreshingId === w.module_id}
                                        title="Fully delete and reinstall from source — fixes stale files the normal watch sync missed"
                                        className="text-xs px-2 py-1 rounded flex-shrink-0"
                                        style={{
                                            backgroundColor: "#1a1a2a",
                                            color: refreshingId === w.module_id ? "#444" : "#a5b4fc",
                                            border: "1px solid #6366f144",
                                            cursor: refreshingId === w.module_id ? "not-allowed" : "pointer",
                                        }}>
                                        {refreshingId === w.module_id ? "Refreshing…" : "↻ Hard refresh"}
                                    </button>
                                    <button
                                        onClick={() => handleStopWatch(w.module_id)}
                                        className="text-xs px-2 py-1 rounded flex-shrink-0"
                                        style={{
                                            backgroundColor: "#1a0a0a",
                                            color: "#ef4444",
                                            border: "1px solid #ef444422"
                                        }}>
                                        Stop
                                    </button>
                                </div>
                            );
                        })}
                    </div>
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
