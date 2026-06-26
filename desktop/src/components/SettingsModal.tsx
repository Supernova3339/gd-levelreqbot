import {useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {getVersion} from "@tauri-apps/api/app";
import {ChevronRightIcon, CloseIcon} from "./icons";
import {TwitchSettings} from "../pages/settings/TwitchSettings";
import {YouTubeSettings} from "../pages/settings/YouTubeSettings";
import {QueueSettings} from "../pages/settings/QueueSettings";
import {StartupSettings} from "../pages/settings/StartupSettings";
import {DevelopmentSettings} from "../pages/settings/DevelopmentSettings";
import {AppearanceSettings} from "../pages/settings/AppearanceSettings";
import {ScriptingSettings} from "../pages/settings/ScriptingSettings";
import {WebSocketSettings} from "../pages/settings/WebSocketSettings";
import {KeybindsSettings} from "../pages/settings/KeybindsSettings";
import type {KeybindMap} from "../hooks/useKeybinds";

const APP_FLAIR = (import.meta.env.VITE_APP_FLAIR as string | undefined) ?? "nightly";
const FLAIR_COLOR: Record<string, string> = {
    stable: "#22c55e", beta: "#f59e0b", nightly: "#818cf8", dev: "#ec4899",
};

// ─── Navigation tree ──────────────────────────────────────────────────────────

type LeafId =
    | "appearance" | "startup" | "development"
    | "twitch" | "youtube"
    | "queue" | "scripting" | "websocket" | "keybinds";

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
    {kind: "leaf", id: "queue", label: "Queue"},
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
];

function parentOf(id: LeafId): string | null {
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
    keybinds: {
        binds: KeybindMap;
        setBind: (action: string, shortcut: string) => Promise<void>;
        resetBind: (action: string) => Promise<void>;
    };
}

export function SettingsModal({open, onClose, keybinds}: SettingsModalProps) {
    const [active, setActive] = useState<LeafId>("appearance");
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["general"]));
    const backdropRef = useRef<HTMLDivElement>(null);
    const [twitchRefresh, setTwitchRefresh] = useState(0);
    const [youtubeRefresh, setYoutubeRefresh] = useState(0);
    const [version, setVersion] = useState("…");

    useEffect(() => {
        getVersion().then(setVersion).catch(() => {
        });
    }, []);

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

    const navigate = (id: LeafId) => {
        setActive(id);
        const p = parentOf(id);
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
                            {NAV.map((item) =>
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

                        {/* Sticky version footer */}
                        <div className="flex-shrink-0 px-4 py-3"
                             style={{borderTop: "1px solid #1e1e1e"}}>
                            <div className="flex items-center gap-1.5">
                                <span style={{fontSize: 11, color: "#444"}}>v{version}</span>
                                <span style={{
                                    fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                                    textTransform: "uppercase",
                                    padding: "1px 5px", borderRadius: 4,
                                    backgroundColor: `${FLAIR_COLOR[APP_FLAIR] ?? "#818cf8"}18`,
                                    color: FLAIR_COLOR[APP_FLAIR] ?? "#818cf8",
                                    border: `1px solid ${FLAIR_COLOR[APP_FLAIR] ?? "#818cf8"}33`,
                                }}>
                  {APP_FLAIR}
                </span>
                            </div>
                        </div>
                    </nav>

                    {/* Content */}
                    <div className="flex-1 overflow-auto">
                        <div className="p-6" style={{maxWidth: 560}}>
                            {active === "appearance" && <AppearanceSettings/>}
                            {active === "startup" && <StartupSettings/>}
                            {active === "development" && <DevelopmentSettings/>}
                            {active === "twitch" && <TwitchSettings refreshKey={twitchRefresh}/>}
                            {active === "youtube" && <YouTubeSettings refreshKey={youtubeRefresh}/>}
                            {active === "queue" && <QueueSettings/>}
                            {active === "scripting" && <ScriptingSettings/>}
                            {active === "keybinds" &&
                                <KeybindsSettings binds={keybinds.binds} setBind={keybinds.setBind}
                                                  resetBind={keybinds.resetBind}/>}
                            {active === "websocket" && <WebSocketSettings/>}
                        </div>
                    </div>
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
