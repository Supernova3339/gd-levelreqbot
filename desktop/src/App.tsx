import {useEffect, useState} from "react";
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
import {AboutModal} from "./components/AboutModal";
import {PERF_EVENT, PERF_KEY, PerfOverlay} from "./components/PerfOverlay";
import {ContextMenu} from "./components/ContextMenu";
import {Dashboard} from "./pages/Dashboard";
import {CommandsPage} from "./pages/CommandsPage";
import {IntegrationsPage} from "./pages/IntegrationsPage";
import {LibrariesPage} from "./pages/LibrariesPage";
import {ConsolePage} from "./pages/ConsolePage";
import {Setup} from "./pages/Setup";
import {KeybindContext, useKeybinds} from "./hooks/useKeybinds";
// Import consoleStore at app startup so the "console-log" listener is registered immediately,
// regardless of which page is open.
import "./lib/consoleStore";

type AppState = "loading" | "setup" | "main" | "demo";

function LoadingScreen() {
    const [status, setStatus] = useState("");

    useEffect(() => {
        const unlisten = import("@tauri-apps/api/event")
            .then(({listen}) => listen<string>("splash-status", (e) => setStatus(e.payload)));
        return () => {
            unlisten.then((f) => f());
        };
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
    const [aboutOpen, setAboutOpen] = useState(false);
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

    const openAbout = () => setAboutOpen(true);

    const openChangelog = async () => {
        if (!appVersion) {
            const v = await getVersion().catch(() => "");
            setAppVersion(v);
        }
        setChangelogAuto(false);
        setChangelogOpen(true);
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
                            <Layout onOpenSettings={() => setSettingsOpen(true)} onOpenAbout={openAbout}>
                                {(page) => (
                                    <ErrorBoundary label={page}>
                                        {page === "commands" && <CommandsPage/>}
                                        {page === "integrations" && <IntegrationsPage/>}
                                        {page === "libraries" && <LibrariesPage/>}
                                        {page === "console" && <ConsolePage/>}
                                        {page === "queue" && <Dashboard demo={isDemo}/>}
                                    </ErrorBoundary>
                                )}
                            </Layout>
                        </div>
                        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} keybinds={keybinds}/>
                        <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)}
                                    onShowChangelog={openChangelog}/>
                        <ChangelogModal open={changelogOpen} onClose={closeChangelog}
                                        appVersion={appVersion} autoVersion={changelogAuto}/>
                        <LevelCopiedOverlay/>
                        {perfOn && <PerfOverlay/>}
                        <ContextMenu/>
                    </div>
                </SnackbarProvider>
            </ConfirmProvider>
        </KeybindContext.Provider>
    );
}
