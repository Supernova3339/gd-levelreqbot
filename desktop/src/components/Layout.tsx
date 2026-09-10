import {lazy, type ReactNode, Suspense, useEffect, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import * as LucideIcons from "lucide-react";
import {StatusBar} from "./StatusBar";
import {CommandsIcon, GearIcon} from "./icons";
import {listDevWatches, listModules, restoreDevWatches} from "../lib/commands";
import {clearErrors, getErrorCount, subscribeErrors} from "../lib/console-errors";
import type {ModuleManifest, ModulePageRef} from "../lib/types";
import {DevReloadBar} from "./DevReloadBar";

const PageRenderer = lazy(() => import("./modules/PageRenderer").then(m => ({default: m.PageRenderer})));

export type Page = "modules" | "commands" | "libraries" | "console" | "screenshot";

interface ActiveModulePage {
    moduleId: string;
    pageId: string;
    /** Relative file path within the module directory, e.g. "ui/queue.gdui" */
    pageFile: string;
}

interface LayoutProps {
    children: (page: Page) => ReactNode;
    onOpenSettings: () => void;
}

// ── Module icon map ───────────────────────────────────────────────────────────

const MOD_ICON: Record<string, (s: number) => ReactNode> = {
    queue: s => <svg width={s} height={s} viewBox="0 0 18 18" fill="currentColor">
        <rect x="2" y="4" width="14" height="2" rx="1" opacity="0.9"/>
        <rect x="2" y="8" width="10" height="2" rx="1" opacity="0.6"/>
        <rect x="2" y="12" width="12" height="2" rx="1" opacity="0.35"/>
    </svg>,
    music: s => <svg width={s} height={s} viewBox="0 0 18 18" fill="currentColor">
        <path d="M7 3v9.5A3.5 3.5 0 1 0 9 16V6.5l5-1V3H7Z"/>
    </svg>,
    points: s => <svg width={s} height={s} viewBox="0 0 18 18" fill="currentColor">
        <polygon points="9,3 11,7 16,7.5 12.5,11 13.5,15.5 9,13 4.5,15.5 5.5,11 2,7.5 7,7"/>
    </svg>,
    polls: s => <svg width={s} height={s} viewBox="0 0 18 18" fill="currentColor">
        <rect x="3" y="12" width="3" height="4" rx="0.5" opacity="0.5"/>
        <rect x="7.5" y="8" width="3" height="8" rx="0.5" opacity="0.7"/>
        <rect x="12" y="3" width="3" height="13" rx="0.5"/>
    </svg>,
    coins: s => <svg width={s} height={s} viewBox="0 0 18 18" fill="currentColor">
        <circle cx="9" cy="9" r="7" opacity="0.25"/>
        <circle cx="9" cy="9" r="4.5" opacity="0.55"/>
        <circle cx="9" cy="9" r="2.5"/>
    </svg>,
};

function ModPageIcon({icon, size = 18}: { icon: string; size?: number }) {
    const render = MOD_ICON[icon];
    if (render) return <>{render(size)}</>;

    // Try Lucide icon by PascalCase name (e.g. "list" → "List", "music-2" → "Music2")
    const lucideName = icon.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("") as keyof typeof LucideIcons;
    const LucideIcon = LucideIcons[lucideName] as ((p: { size: number }) => ReactNode) | undefined;
    if (typeof LucideIcon === "function") return <LucideIcon size={size}/>;

    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
        </svg>
    );
}

// ── Core icons ────────────────────────────────────────────────────────────────

function ModulesIcon({size = 18}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="10" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="2" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="10" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
    );
}

function LibrariesIcon({size = 18}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
            <rect x="3" y="2" width="9" height="14" rx="1" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M6 2v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M12 5h2.5M12 8.5h2.5M12 12h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
    );
}

function ConsoleNavIcon({size = 18}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
            <rect x="2" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M5 7l3 2-3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                  strokeLinejoin="round"/>
            <path d="M10 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
    );
}

function ScreenshotIcon({size = 18}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
            <rect x="2" y="4" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="9" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M6.5 4l1-2h3l1 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
                  strokeLinejoin="round"/>
        </svg>
    );
}

// ── Nav button ────────────────────────────────────────────────────────────────

function NavBtn({icon, label, active = false, onClick, devDot, errorCount}: {
    icon: ReactNode; label: string; active?: boolean; onClick: () => void;
    devDot?: boolean; errorCount?: number;
}) {
    return (
        <button
            onClick={onClick}
            title={errorCount ? `${label} — ${errorCount} error${errorCount === 1 ? "" : "s"}` : label}
            className="flex items-center justify-center transition-colors flex-shrink-0"
            style={{
                width: 44, height: 44, position: "relative",
                backgroundColor: active ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "transparent",
                color: active ? "var(--color-accent)" : "#555",
                borderLeft: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
            }}
            onMouseEnter={e => {
                if (!active) {
                    e.currentTarget.style.backgroundColor = "#1c1c1c";
                    e.currentTarget.style.color = "#999";
                }
            }}
            onMouseLeave={e => {
                if (!active) {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "#555";
                }
            }}
        >
            {icon}
            {devDot && (
                <span style={{
                    position: "absolute", bottom: 7, right: 9,
                    width: 5, height: 5, borderRadius: "50%",
                    backgroundColor: "#22d3ee",
                    boxShadow: "0 0 4px #22d3ee88",
                }}/>
            )}
            {!devDot && !!errorCount && (
                <span style={{
                    position: "absolute", bottom: 7, right: 9,
                    width: 5, height: 5, borderRadius: "50%",
                    backgroundColor: "#f87171",
                    boxShadow: "0 0 4px #f8717188",
                }}/>
            )}
        </button>
    );
}

function NavDivider() {
    return <div style={{height: 1, margin: "4px 10px", backgroundColor: "#1e1e1e"}}/>;
}

// ── Layout ────────────────────────────────────────────────────────────────────

interface PageEntry {
    module: ModuleManifest;
    page: ModulePageRef
}

export function Layout({children, onOpenSettings}: LayoutProps) {
    const [corePage, setCorePage] = useState<Page>("modules");
    const [activeModulePage, setActiveModulePage] = useState<ActiveModulePage | null>(null);
    const [modulePages, setModulePages] = useState<PageEntry[]>([]);
    const [devWatchIds, setDevWatchIds] = useState<Set<string>>(new Set());
    const [botScriptError, setBotScriptError] = useState<string | null>(null);
    const [consoleErrors, setConsoleErrors] = useState(getErrorCount);

    const loadModulePages = () => {
        Promise.all([listModules(), listDevWatches()]).then(([mods, watches]) => {
            const pages: PageEntry[] = [];
            for (const m of mods) {
                if (!m.enabled) continue;
                for (const p of m.pages ?? []) pages.push({module: m, page: p});
            }
            setModulePages(pages);
            setDevWatchIds(new Set(watches.map(w => w.module_id)));
        }).catch(e => console.error("Failed to load module pages", e));
    };

    useEffect(() => {
        // Restore persisted dev watches from DB, then load pages
        restoreDevWatches().catch(e => console.error("Failed to restore dev watches", e)).finally(loadModulePages);
        const unsub = listen("module-updated", loadModulePages);
        return () => {
            unsub.then(f => f());
        };
    }, []);

    useEffect(() => {
        const unsub = listen("module-dev-reloaded", loadModulePages);
        return () => {
            unsub.then(f => f());
        };
    }, []);

    useEffect(() => {
        const unsub = listen<string>("bot-script-error", e => {
            setBotScriptError(e.payload);
            setTimeout(() => setBotScriptError(null), 8000);
        });
        return () => {
            unsub.then(f => f());
        };
    }, []);

    useEffect(() => subscribeErrors(setConsoleErrors), []);

    // When module pages change, clear active module page if it no longer exists
    useEffect(() => {
        if (!activeModulePage) return;
        const still = modulePages.some(e => e.module.id === activeModulePage.moduleId && e.page.id === activeModulePage.pageId);
        if (!still) setActiveModulePage(null);
    }, [modulePages, activeModulePage]);

    const navigateCore = (p: Page) => {
        if (p === "console") clearErrors();
        setCorePage(p);
        setActiveModulePage(null);
    };

    const navigateModulePage = (entry: PageEntry) => {
        setActiveModulePage({moduleId: entry.module.id, pageId: entry.page.id, pageFile: entry.page.file});
    };

    const isModulePageActive = (entry: PageEntry) =>
        activeModulePage?.moduleId === entry.module.id && activeModulePage?.pageId === entry.page.id;

    return (
        <div className="flex flex-col h-full" style={{backgroundColor: "#0f0f0f"}}>
            <StatusBar/>

            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Primary sidebar */}
                <nav
                    className="flex flex-col flex-shrink-0"
                    style={{width: 44, backgroundColor: "#111", borderRight: "1px solid #222"}}
                >
                    {/* Scrollable nav area */}
                    <div className="flex flex-col flex-1 overflow-y-auto pt-1" style={{scrollbarWidth: "none"}}>
                        {/* Core pages */}
                        <NavBtn icon={<ModulesIcon/>} label="Modules"
                                active={corePage === "modules" && !activeModulePage}
                                onClick={() => navigateCore("modules")}/>
                        <NavBtn icon={<CommandsIcon/>} label="Commands"
                                active={corePage === "commands" && !activeModulePage}
                                onClick={() => navigateCore("commands")}/>
                        <NavBtn icon={<LibrariesIcon/>} label="Libraries"
                                active={corePage === "libraries" && !activeModulePage}
                                onClick={() => navigateCore("libraries")}/>
                        <NavBtn icon={<ConsoleNavIcon/>} label="Console"
                                active={corePage === "console" && !activeModulePage}
                                onClick={() => navigateCore("console")}
                                errorCount={consoleErrors}/>

                        {/* Module page entries */}
                        {modulePages.length > 0 && <NavDivider/>}
                        {modulePages.map(entry => (
                            <NavBtn
                                key={`${entry.module.id}/${entry.page.id}`}
                                icon={<ModPageIcon icon={entry.page.icon ?? entry.module.icon}/>}
                                label={`${entry.page.label} — ${entry.module.name}`}
                                active={isModulePageActive(entry)}
                                onClick={() => navigateModulePage(entry)}
                                devDot={devWatchIds.has(entry.module.id)}
                            />
                        ))}
                    </div>

                    {/* Settings + dev tools pinned at bottom */}
                    <div className="pb-1 flex-shrink-0">
                        <NavBtn icon={<ScreenshotIcon/>} label="Screenshot Tool"
                                active={corePage === "screenshot" && !activeModulePage}
                                onClick={() => navigateCore("screenshot")}/>
                        <NavBtn icon={<GearIcon/>} label="Settings" onClick={onOpenSettings}/>
                    </div>
                </nav>

                {/* Content area */}
                <main className="flex-1 min-h-0 overflow-hidden relative" style={{backgroundColor: "#0f0f0f"}}>
                    {activeModulePage ? (
                        <Suspense fallback={<div style={{color: "#2a2a2a", fontSize: 12, padding: 24}}>Loading…</div>}>
                            <PageRenderer
                                moduleId={activeModulePage.moduleId}
                                pageFile={activeModulePage.pageFile}
                            />
                        </Suspense>
                    ) : (
                        children(corePage)
                    )}
                </main>
            </div>
            <DevReloadBar/>

            {/* Bot script error toast */}
            {botScriptError && (
                <div style={{
                    position: "fixed", bottom: 48, left: "50%", transform: "translateX(-50%)",
                    backgroundColor: "#1a0808", border: "1px solid #4a1515",
                    color: "#f87171", fontSize: 11, padding: "7px 14px",
                    borderRadius: 6, zIndex: 9999, maxWidth: 480,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
                    display: "flex", alignItems: "center", gap: 8,
                }}>
                    <span style={{fontWeight: 700}}>Bot error:</span>
                    {botScriptError}
                </div>
            )}
        </div>
    );
}
