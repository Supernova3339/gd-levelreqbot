import React, {lazy, Suspense, useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {invoke} from "@tauri-apps/api/core";
import {getVersion} from "@tauri-apps/api/app";
import {ChevronRightIcon, CloseIcon} from "./icons";
import type {KeybindMap} from "../hooks/useKeybinds";
import {listModules} from "../lib/commands";
import type {ModuleManifest} from "../lib/types";

const PageRenderer = lazy(() => import("./modules/PageRenderer").then(m => ({default: m.PageRenderer})));

// perf: lazy-load settings panels so they don't bloat the initial bundle.
// Each panel is only fetched when the user first opens that settings section.
const TwitchSettings = React.lazy(() => import("../pages/settings/TwitchSettings").then((m) => ({default: m.TwitchSettings})));
const YouTubeSettings = React.lazy(() => import("../pages/settings/YouTubeSettings").then((m) => ({default: m.YouTubeSettings})));
const StartupSettings = React.lazy(() => import("../pages/settings/StartupSettings").then((m) => ({default: m.StartupSettings})));
const DevelopmentSettings = React.lazy(() => import("../pages/settings/DevelopmentSettings").then((m) => ({default: m.DevelopmentSettings})));
const AppearanceSettings = React.lazy(() => import("../pages/settings/AppearanceSettings").then((m) => ({default: m.AppearanceSettings})));
const ScriptingSettings = React.lazy(() => import("../pages/settings/ScriptingSettings").then((m) => ({default: m.ScriptingSettings})));
const WebSocketSettings = React.lazy(() => import("../pages/settings/WebSocketSettings").then((m) => ({default: m.WebSocketSettings})));
const KeybindsSettings = React.lazy(() => import("../pages/settings/KeybindsSettings").then((m) => ({default: m.KeybindsSettings})));
const AboutSettings = React.lazy(() => import("../pages/settings/AboutSettings").then((m) => ({default: m.AboutSettings})));
const GDSettings = React.lazy(() => import("../pages/settings/GDSettings").then((m) => ({default: m.GDSettings})));
const AccountSettings = React.lazy(() => import("../pages/settings/AccountSettings").then((m) => ({default: m.AccountSettings})));

const APP_FLAIR = (import.meta.env.VITE_APP_FLAIR as string | undefined) ?? "nightly";
const FLAIR_COLOR: Record<string, string> = {
    stable: "#22c55e", beta: "#f59e0b", nightly: "#818cf8", dev: "#ec4899",
};

// ─── Navigation tree ──────────────────────────────────────────────────────────

type LeafId =
    | "appearance" | "startup" | "development"
    | "twitch" | "youtube"
    | "scripting" | "websocket" | "keybinds"
    | "gd"
    | "account"
    | "about";

interface Leaf {
    kind: "leaf";
    id: LeafId;
    label: string
}

interface Group {
    kind: "group";
    id: string;
    label: string;
    children: Leaf[]
}

type NavItem = Leaf | Group;

const NAV: NavItem[] = [
    {
        kind: "group",
        id: "general",
        label: "General",
        children: [
            {kind: "leaf", id: "appearance", label: "Appearance"},
            {kind: "leaf", id: "startup", label: "Startup"},
            {kind: "leaf", id: "development", label: "Development"},
        ],
    },
    {
        kind: "group",
        id: "platforms",
        label: "Platforms",
        children: [
            {kind: "leaf", id: "twitch", label: "Twitch"},
            {kind: "leaf", id: "youtube", label: "YouTube"},
        ],
    },
    {
        kind: "group",
        id: "editor",
        label: "Scripting",
        children: [
            {kind: "leaf", id: "scripting", label: "Editor"},
            {kind: "leaf", id: "keybinds", label: "Keybinds"},
        ],
    },
    {kind: "leaf", id: "websocket", label: "WebSocket"},
    {
        kind: "group",
        id: "integrations",
        label: "Integrations",
        children: [
            {kind: "leaf", id: "gd", label: "Geometry Dash"},
        ],
    },
    {kind: "leaf", id: "account", label: "Account"},
];

function parentOf(id: LeafId | string): string | null {
    if (id.startsWith("module:")) return "modules";
    for (const item of NAV) {
        if (item.kind === "group" && item.children.some((c) => c.id === id))
            return item.id;
    }
    return null;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
    onShowChangelog: () => void;
    keybinds: {
        binds: KeybindMap;
        setBind: (action: string, shortcut: string) => Promise<void>;
        resetBind: (action: string) => Promise<void>;
    };
}

export function SettingsModal({open, onClose, onShowChangelog, keybinds}: SettingsModalProps) {
    const [active, setActive] = useState<LeafId | string>("appearance");
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["general"]));
    const backdropRef = useRef<HTMLDivElement>(null);
    const [twitchRefresh, setTwitchRefresh] = useState(0);
    const [youtubeRefresh, setYoutubeRefresh] = useState(0);
    const [version, setVersion] = useState("…");
    const [moduleSettings, setModuleSettings] = useState<ModuleManifest[]>([]);
    // Development tab is only available when the installer enabled developer
    // options (is_dev_install; always true in debug builds).
    const [devInstall, setDevInstall] = useState(import.meta.env.DEV);

    useEffect(() => {
        getVersion().then(setVersion).catch(() => {
        });
        invoke<boolean>("is_dev_install").then(setDevInstall).catch(() => {
        });
    }, []);

    const nav: NavItem[] = devInstall ? NAV : NAV.map((item) =>
        item.kind === "group"
            ? {...item, children: item.children.filter((c) => c.id !== "development")}
            : item
    );

    useEffect(() => {
        if (!open) return;
        listModules().then(mods => {
            setModuleSettings(mods.filter(m => m.enabled && m.settings_page));
        }).catch(e => console.error("Failed to load module settings entries", e));
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose]);

    useEffect(() => {
        const unT = listen("twitch-token-saved", () => {
            setTwitchRefresh((n) => n + 1);
            navigate("twitch");
        });
        const unY = listen("youtube-token-saved", () => {
            setYoutubeRefresh((n) => n + 1);
            navigate("youtube");
        });
        return () => {
            unT.then((f) => f());
            unY.then((f) => f());
        };
    }, []);

    const navigate = (id: LeafId | string) => {
        setActive(id);
        const p = parentOf(id as LeafId);
        if (p) setExpanded((prev) => new Set([...prev, p]));
    };

    const toggleGroup = (id: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    if (!open) return null;

    return (
        <div
            ref={backdropRef}
            className="fixed inset-0 flex items-center justify-center"
            style={{backgroundColor: "rgba(0,0,0,0.72)", zIndex: 50, backdropFilter: "blur(2px)"}}
            onClick={(e) => {
                if (e.target === backdropRef.current) onClose();
            }}
        >
            <div
                className="flex flex-col rounded-xl overflow-hidden"
                style={{
                    width: "min(860px, 92vw)", height: "min(580px, 88vh)",
                    backgroundColor: "#141414", border: "1px solid #2a2a2a",
                    boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 flex-shrink-0"
                     style={{height: 44, borderBottom: "1px solid #222"}}>
                    <span className="text-sm font-semibold" style={{color: "#f1f1f1"}}>Settings</span>
                    <button onClick={onClose} title="Close"
                            className="flex items-center justify-center w-6 h-6 rounded"
                            style={{color: "#666", backgroundColor: "transparent"}}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#333";
                                e.currentTarget.style.color = "#f1f1f1";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                                e.currentTarget.style.color = "#666";
                            }}
                    >
                        <CloseIcon/>
                    </button>
                </div>

                <div className="flex flex-1 min-h-0">
                    {/* Sidebar */}
                    <nav className="flex flex-col flex-shrink-0"
                         style={{width: 188, borderRight: "1px solid #222", backgroundColor: "#0f0f0f"}}>
                        {/* Scrollable nav items */}
                        <div className="flex-1 overflow-y-auto py-2">
                            {nav.map((item) =>
                                item.kind === "leaf" ? (
                                    <NavLeafBtn key={item.id} label={item.label}
                                                active={active === item.id} onClick={() => navigate(item.id)}/>
                                ) : (
                                    <NavGroupItem key={item.id} label={item.label}
                                                  open={expanded.has(item.id)} onToggle={() => toggleGroup(item.id)}>
                                        {item.children.map((child) => (
                                            <NavLeafBtn key={child.id} label={child.label}
                                                        active={active === child.id} onClick={() => navigate(child.id)}
                                                        indent/>
                                        ))}
                                    </NavGroupItem>
                                )
                            )}
                        </div>

                        {/* Module settings entries */}
                        {moduleSettings.length > 0 && (
                            <>
                                <div style={{height: 1, margin: "6px 12px", backgroundColor: "#1e1e1e"}}/>
                                <div style={{
                                    padding: "4px 16px 2px",
                                    fontSize: 10,
                                    fontWeight: 600,
                                    letterSpacing: "0.07em",
                                    textTransform: "uppercase",
                                    color: "#444"
                                }}>
                                    Modules
                                </div>
                                {moduleSettings.map(m => (
                                    <NavLeafBtn
                                        key={m.id}
                                        label={m.name}
                                        active={active === `module:${m.id}`}
                                        onClick={() => navigate(`module:${m.id}`)}
                                    />
                                ))}
                            </>
                        )}

                        {/* Sticky footer: version chip + info/About icon */}
                        <div className="flex-shrink-0 flex items-center px-4 py-3 gap-1.5"
                             style={{borderTop: "1px solid #1e1e1e"}}>
                            <span style={{fontSize: 11, color: "#444"}}>v{version}</span>
                            <span style={{
                                fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                                textTransform: "uppercase", padding: "1px 5px", borderRadius: 4,
                                backgroundColor: `${FLAIR_COLOR[APP_FLAIR] ?? "#818cf8"}18`,
                                color: FLAIR_COLOR[APP_FLAIR] ?? "#818cf8",
                                border: `1px solid ${FLAIR_COLOR[APP_FLAIR] ?? "#818cf8"}33`,
                            }}>
                                {APP_FLAIR}
                            </span>
                            <button
                                title="About"
                                onClick={() => navigate("about")}
                                className="flex items-center justify-center rounded ml-auto"
                                style={{
                                    width: 20, height: 20, background: "none", border: "none",
                                    cursor: "pointer", flexShrink: 0,
                                    color: active === "about" ? "var(--color-accent)" : "#2e2e2e",
                                }}
                                onMouseEnter={(e) => {
                                    if (active !== "about") e.currentTarget.style.color = "#666";
                                }}
                                onMouseLeave={(e) => {
                                    if (active !== "about") e.currentTarget.style.color = "#2e2e2e";
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                                    <path d="M8 7v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                                    <circle cx="8" cy="5" r="0.75" fill="currentColor"/>
                                </svg>
                            </button>
                        </div>
                    </nav>

                    {/* Content */}
                    {(() => {
                        const modMatch = active.startsWith("module:") ? active.slice(7) : null;
                        const modManifest = modMatch ? moduleSettings.find(m => m.id === modMatch) : null;
                        if (modManifest && modManifest.settings_page) {
                            return (
                                <div className="flex-1 min-h-0 overflow-hidden" style={{position: "relative"}}>
                                    <Suspense fallback={<div
                                        style={{color: "#2a2a2a", fontSize: 12, padding: 24}}>Loading…</div>}>
                                        <PageRenderer moduleId={modManifest.id} pageFile={modManifest.settings_page}/>
                                    </Suspense>
                                </div>
                            );
                        }
                        return (
                            <div className="flex-1 overflow-auto">
                                <div className="p-6" style={{maxWidth: 560}}>
                                    <React.Suspense fallback={
                                        <div style={{color: "#2a2a2a", fontSize: 12, paddingTop: 24}}>Loading…</div>
                                    }>
                                        {active === "appearance" && <AppearanceSettings/>}
                                        {active === "startup" && <StartupSettings/>}
                                        {active === "development" && <DevelopmentSettings/>}
                                        {active === "twitch" && <TwitchSettings refreshKey={twitchRefresh}/>}
                                        {active === "youtube" && <YouTubeSettings refreshKey={youtubeRefresh}/>}
                                        {active === "scripting" && <ScriptingSettings/>}
                                        {active === "keybinds" &&
                                            <KeybindsSettings binds={keybinds.binds} setBind={keybinds.setBind}
                                                              resetBind={keybinds.resetBind}/>}
                                        {active === "websocket" && <WebSocketSettings/>}
                                        {active === "gd" && <GDSettings/>}
                                        {active === "account" && <AccountSettings/>}
                                        {active === "about" && <AboutSettings onShowChangelog={onShowChangelog}/>}
                                    </React.Suspense>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}

// ─── Nav primitives ───────────────────────────────────────────────────────────

function NavGroupItem({label, open, onToggle, children}: {
    label: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
    return (
        <div>
            <button onClick={onToggle} className="w-full flex items-center gap-2 text-left text-sm"
                    style={{
                        padding: "7px 14px", color: open ? "#c0c0c0" : "#666",
                        backgroundColor: "transparent", fontWeight: 500
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#d0d0d0";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = open ? "#c0c0c0" : "#666";
                    }}
            >
                <ChevronRightIcon
                    style={{transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0}}/>
                {label}
            </button>
            {open && <div>{children}</div>}
        </div>
    );
}

function NavLeafBtn({label, active, onClick, indent = false}: {
    label: string; active: boolean; onClick: () => void; indent?: boolean;
}) {
    return (
        <button onClick={onClick} className="w-full text-left text-sm"
                style={{
                    padding: "6px 16px", paddingLeft: indent ? 28 : 16,
                    backgroundColor: active ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
                    color: active ? "#f1f1f1" : "#888",
                    borderLeft: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
                    fontWeight: active ? 500 : 400,
                }}
                onMouseEnter={(e) => {
                    if (!active) {
                        e.currentTarget.style.backgroundColor = "#1a1a1a";
                        e.currentTarget.style.color = "#c0c0c0";
                    }
                }}
                onMouseLeave={(e) => {
                    if (!active) {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "#888";
                    }
                }}
        >
            {label}
        </button>
    );
}
