import React, {useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {getVersion} from "@tauri-apps/api/app";
import {isSetupComplete, startBot} from "./lib/commands";
import {ConfirmProvider} from "./components/ConfirmModal";
import {SnackbarProvider} from "./components/Snackbar";
import {LevelCopiedOverlay} from "./components/LevelCopiedOverlay";
import {Layout} from "./components/Layout";
import {ErrorBoundary} from "./components/ErrorBoundary";
import {SettingsModal} from "./components/SettingsModal";
import {ChangelogModal} from "./components/ChangelogModal";
import {PERF_EVENT, PERF_KEY, PerfOverlay} from "./components/PerfOverlay";
import {ContextMenu} from "./components/ContextMenu";
import {OpenedFileInstallListener} from "./components/OpenedFileInstallListener";
import {Setup} from "./pages/Setup";
import {KeybindContext, useKeybinds} from "./hooks/useKeybinds";
// Import consoleStore at app startup so the "console-log" listener is registered immediately,
// regardless of which page is open.
import "./lib/consoleStore";
// Preview remote-control bridge — defines window.__gdlqPreviewInput for the
// JetBrains /preview stream input forwarding (see src-tauri/src/api/preview.rs).
import "./lib/previewInput";

// perf: lazy-load heavy page bundles so the initial shell loads fast.
// Each page is only fetched when the user first navigates to it.
const ModulesPage = React.lazy(() => import("./pages/ModulesPage").then((m) => ({default: m.ModulesPage})));
const CommandsPage = React.lazy(() => import("./pages/CommandsPage").then((m) => ({default: m.CommandsPage})));
const LibrariesPage = React.lazy(() => import("./pages/LibrariesPage").then((m) => ({default: m.LibrariesPage})));
const ConsolePage = React.lazy(() => import("./pages/ConsolePage").then((m) => ({default: m.ConsolePage})));
const ScreenshotTool = React.lazy(() => import("./components/dev/ScreenshotTool").then((m) => ({default: m.ScreenshotTool})));

function PageFallback() {
    return (
        <div className="flex items-center justify-center h-full" style={{color: "#2a2a2a", fontSize: 12}}>
            Loading…
        </div>
    );
}

type AppState = "loading" | "setup" | "main" | "demo";

// How long to wait before treating "loading" as stuck rather than just slow.
// Generous — a cold start (first launch, marketplace stdlib fetch, etc.) can
// legitimately take a few seconds; this is only meant to catch a genuine hang.
const LOADING_STUCK_AFTER_MS = 15000;

function LoadingScreen() {
    const [status, setStatus] = useState("");
    const [stuck, setStuck] = useState(false);

    useEffect(() => {
        const unlisten = import("@tauri-apps/api/event")
            .then(({listen}) => listen<string>("splash-status", (e) => setStatus(e.payload)));
        return () => {
            unlisten.then((f) => f());
        };
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setStuck(true), LOADING_STUCK_AFTER_MS);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center gap-4 h-full" style={{backgroundColor: "#0f0f0f"}}>
            <div style={{
                width: 22, height: 22,
                border: "2px solid #1e1e1e",
                borderTopColor: "var(--color-accent)",
                borderRadius: "50%",
                animation: "spin 0.65s linear infinite",
            }}/>
            {status && (
                <p style={{fontSize: 11, color: "#333", letterSpacing: "0.04em"}}>{status}</p>
            )}
            {stuck && (
                <div className="flex flex-col items-center gap-2" style={{maxWidth: 280, textAlign: "center"}}>
                    <p style={{fontSize: 11, color: "#a05a2c", lineHeight: 1.6}}>
                        {status
                            ? <>This is taking longer than expected — still stuck on "{status}".</>
                            : <>This is taking longer than expected, and no startup progress has been
                                reported at all — the app may have failed to start its background
                                initialization.</>}
                    </p>
                    <button
                        onClick={() => invoke("open_log_dir").catch(() => {
                        })}
                        className="text-xs font-medium underline"
                        style={{color: "#c17a3d", background: "none", border: "none", cursor: "pointer"}}
                    >
                        Open log folder
                    </button>
                </div>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

const DEMO_KEY = "gdlqbot_demo_mode";

async function tryStartBot() {
    try {
        await startBot();
        console.log("[bot] Started successfully");
    } catch (err) {
        console.error("[bot] Failed to start:", err);
    }
}

export default function App() {
    const [appState, setAppState] = useState<AppState>("loading");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [demoSettingsNotice, setDemoSettingsNotice] = useState(false);
    const [changelogOpen, setChangelogOpen] = useState(false);
    const [changelogAuto, setChangelogAuto] = useState(false);
    const [appVersion, setAppVersion] = useState("");
    const [perfOn, setPerfOn] = useState(localStorage.getItem(PERF_KEY) === "1");
    const keybinds = useKeybinds();

    // Block the browser/WebView2 native Ctrl+F find bar globally.
    // The script editor handles Ctrl+F internally — if the editor textarea is focused
    // its own keydown handler fires first and calls e.preventDefault(). For all other
    // cases (e.g. the editor is visible but not focused) we still suppress the browser
    // default here so the native find bar never appears.
    useEffect(() => {
        const block = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "f") {
                e.preventDefault();
                // If no editor textarea is focused, dispatch the event to the editor so
                // it can open its own find bar.
                const editor = document.querySelector<HTMLTextAreaElement>("[data-rhai-editor]");
                if (editor && document.activeElement !== editor) {
                    editor.dispatchEvent(new KeyboardEvent("keydown", {
                        key: "f",
                        ctrlKey: true,
                        bubbles: true,
                        cancelable: true
                    }));
                }
            }
        };
        document.addEventListener("keydown", block, {capture: true});
        return () => document.removeEventListener("keydown", block, {capture: true});
    }, []);

    useEffect(() => {
        const handler = () => setPerfOn(localStorage.getItem(PERF_KEY) === "1");
        window.addEventListener(PERF_EVENT, handler);
        return () => window.removeEventListener(PERF_EVENT, handler);
    }, []);

    useEffect(() => {
        // Demo mode is an explicit opt-in stored separately
        if (localStorage.getItem(DEMO_KEY) === "1") {
            setAppState("demo");
            return;
        }

        // Setup state comes from the database, not localStorage.
        // Simultaneously refresh Twitch tokens so the bot connects immediately on startup.
        const startup = async () => {
            const [done] = await Promise.all([
                isSetupComplete(),
                // Silently refresh tokens in the background — errors are non-fatal
                import("./lib/commands").then(({checkTwitchToken}) => checkTwitchToken().catch(() => {
                })),
            ]);
            if (done) {
                setAppState("main");
                tryStartBot();
                // Install marketplace modules accepted on the installer's
                // "optional extras" page (one-shot; the backend clears the list).
                invoke<string[]>("take_pending_module_installs").then(async (ids) => {
                    if (!ids.length) return;
                    const {installMarketplaceModule} = await import("./lib/commands");
                    for (const id of ids) {
                        try {
                            await installMarketplaceModule(id);
                        } catch (err) {
                            console.error(`[app] offer install failed for ${id}:`, err);
                        }
                    }
                }).catch(() => { /* non-fatal */
                });
                // Honor the installer's "launch at login" checkbox, once
                // (one-shot; the backend marks it applied). Goes through the
                // same plugin the Settings toggle uses so there's no separate
                // autostart-registration path to keep in sync.
                invoke<boolean>("take_autostart_request").then(async (shouldEnable) => {
                    if (!shouldEnable) return;
                    const {enable} = await import("@tauri-apps/plugin-autostart");
                    await enable().catch(() => {
                    });
                }).catch(() => { /* non-fatal */
                });
                // Check if this is a new version to show What's New
                try {
                    const [current, lastSeen] = await Promise.all([
                        getVersion(),
                        invoke<string>("get_last_seen_version"),
                    ]);
                    setAppVersion(current);
                    if (current !== lastSeen) {
                        setChangelogAuto(true);
                        setChangelogOpen(true);
                    }
                } catch { /* non-fatal */
                }
            } else {
                setAppState("setup");
            }
        };
        startup().catch((err) => {
            console.error("[app] startup failed:", err);
            setAppState("setup");
        });
    }, []);

    const enterDemo = () => {
        localStorage.setItem(DEMO_KEY, "1");
        setAppState("demo");
    };
    const exitDemo = () => {
        localStorage.removeItem(DEMO_KEY);
        setAppState("setup");
    };

    const openChangelog = async () => {
        if (!appVersion) {
            const v = await getVersion().catch(() => "");
            setAppVersion(v);
        }
        setChangelogAuto(false);
        setChangelogOpen(true);
    };

    const openChangelogFromSettings = async () => {
        setSettingsOpen(false);
        await openChangelog();
    };

    const closeChangelog = async () => {
        setChangelogOpen(false);
        if (changelogAuto && appVersion) {
            await invoke("set_last_seen_version", {version: appVersion}).catch(() => {
            });
        }
        setChangelogAuto(false);
    };

    const completeSetup = (demo?: boolean) => {
        if (demo) {
            enterDemo();
            return;
        }
        setAppState("main");
        tryStartBot();
    };

    if (appState === "loading") {
        return <LoadingScreen/>;
    }

    if (appState === "setup") {
        return <Setup onComplete={completeSetup}/>;
    }

    const isDemo = appState === "demo";

    return (
        <KeybindContext.Provider value={keybinds.binds}>
            <ConfirmProvider>
                <SnackbarProvider>
                    <div className="flex flex-col h-full">
                        {isDemo && (
                            <div
                                className="flex items-center justify-between px-4 py-2 text-xs flex-shrink-0"
                                style={{
                                    backgroundColor: "#1a1500",
                                    borderBottom: "1px solid #3a2e00",
                                    color: "#a08000"
                                }}
                            >
                                <span>Demo mode — data is not saved and the bot is not connected.</span>
                                <button onClick={exitDemo} className="text-xs font-medium underline"
                                        style={{color: "#f59e0b"}}>
                                    Set up the bot
                                </button>
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <Layout onOpenSettings={() => isDemo ? setDemoSettingsNotice(true) : setSettingsOpen(true)}>
                                {(page) => (
                                    <ErrorBoundary label={page}>
                                        <React.Suspense fallback={<PageFallback/>}>
                                            {page === "commands" && <CommandsPage/>}
                                            {page === "libraries" && <LibrariesPage/>}
                                            {page === "console" && <ConsolePage/>}
                                            {page === "modules" && <ModulesPage/>}
                                            {page === "screenshot" && <ScreenshotTool moduleId="" pages={[]}/>}
                                        </React.Suspense>
                                    </ErrorBoundary>
                                )}
                            </Layout>
                        </div>
                        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)}
                                       onShowChangelog={openChangelogFromSettings} keybinds={keybinds}/>
                        {demoSettingsNotice && (
                            <div
                                className="fixed inset-0 flex items-center justify-center"
                                style={{backgroundColor: "rgba(0,0,0,0.6)", zIndex: 100, backdropFilter: "blur(2px)"}}
                                onClick={() => setDemoSettingsNotice(false)}
                            >
                                <div
                                    className="flex flex-col gap-4 rounded-xl p-6"
                                    style={{
                                        backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a",
                                        boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
                                        width: "min(380px, 90vw)",
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <p className="text-sm font-semibold" style={{color: "#f1f1f1"}}>Demo mode</p>
                                    <p className="text-sm" style={{color: "#a0a0a0", lineHeight: 1.6}}>
                                        Settings aren't available in demo mode.
                                    </p>
                                    <div className="flex gap-2 justify-end">
                                        <button
                                            onClick={() => setDemoSettingsNotice(false)}
                                            className="px-4 py-1.5 text-xs rounded"
                                            style={{
                                                backgroundColor: "#222",
                                                color: "#888",
                                                border: "1px solid #2a2a2a"
                                            }}
                                        >
                                            Close
                                        </button>
                                        <button
                                            onClick={() => {
                                                setDemoSettingsNotice(false);
                                                exitDemo();
                                            }}
                                            className="px-4 py-1.5 text-xs font-semibold rounded"
                                            style={{backgroundColor: "var(--color-accent)", color: "#fff"}}
                                        >
                                            Set up the bot
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        <ChangelogModal open={changelogOpen} onClose={closeChangelog}
                                        appVersion={appVersion} autoVersion={changelogAuto}/>
                        <LevelCopiedOverlay/>
                        {perfOn && <PerfOverlay/>}
                        <ContextMenu/>
                        <OpenedFileInstallListener/>
                    </div>
                </SnackbarProvider>
            </ConfirmProvider>
        </KeybindContext.Provider>
    );
}
