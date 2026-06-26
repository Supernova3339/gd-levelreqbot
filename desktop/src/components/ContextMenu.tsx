// Custom right-click context menu.
// Replaces the default browser context menu with a minimal, app-appropriate one.
// Items shown depend on what was right-clicked:
//   - Input / textarea: Cut, Copy, Paste, Select All
//   - Text selection:   Copy
//   - Anything:         nothing (no menu) unless devtools is enabled → Inspect

import {useEffect, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";

const DEVTOOLS_KEY = "gdlqbot.devtools";

interface MenuItem {
    label: string;
    shortcut?: string;
    onClick: () => void;
    danger?: boolean;
}

interface MenuState {
    x: number;
    y: number;
    items: MenuItem[];
}

export function ContextMenu() {
    const [menu, setMenu] = useState<MenuState | null>(null);
    const [devtools, setDevtools] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Read devtools preference from localStorage
    useEffect(() => {
        const check = () => setDevtools(localStorage.getItem(DEVTOOLS_KEY) === "1");
        check();
        window.addEventListener("gdlqbot:devtools-toggle", check);
        return () => window.removeEventListener("gdlqbot:devtools-toggle", check);
    }, []);

    // Block default context menu; show ours instead
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            e.preventDefault();

            const target = e.target as HTMLElement;
            const isEditable =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                (target as HTMLElement).isContentEditable;

            const selection = window.getSelection()?.toString().trim() ?? "";
            const items: MenuItem[] = [];

            if (isEditable) {
                items.push({label: "Cut", shortcut: "Ctrl+X", onClick: () => document.execCommand("cut")});
                items.push({label: "Copy", shortcut: "Ctrl+C", onClick: () => document.execCommand("copy")});
                items.push({
                    label: "Paste", shortcut: "Ctrl+V", onClick: async () => {
                        const text = await navigator.clipboard.readText().catch(() => "");
                        if (text) document.execCommand("insertText", false, text);
                    }
                });
                items.push({label: "Select All", shortcut: "Ctrl+A", onClick: () => document.execCommand("selectAll")});
            } else if (selection) {
                items.push({
                    label: "Copy",
                    shortcut: "Ctrl+C",
                    onClick: () => navigator.clipboard.writeText(selection)
                });
            }

            if (devtools) {
                if (items.length > 0) items.push({
                    label: "—", onClick: () => {
                    }
                });
                items.push({
                    label: "Inspect element",
                    onClick: () => {
                        invoke("open_devtools").catch(() => {
                        });
                    },
                });
            }

            if (items.length === 0) return; // nothing to show

            // Clamp so menu doesn't go off screen
            const W = 200, H = items.length * 34 + 16;
            setMenu({
                x: Math.min(e.clientX, window.innerWidth - W - 8),
                y: Math.min(e.clientY, window.innerHeight - H - 8),
                items,
            });
        };

        document.addEventListener("contextmenu", handler);
        return () => document.removeEventListener("contextmenu", handler);
    }, [devtools]);

    // Close on click outside / Escape
    useEffect(() => {
        if (!menu) return;
        const close = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
        };
        const esc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setMenu(null);
        };
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", esc);
        };
    }, [menu]);

    if (!menu) return null;

    return (
        <div ref={menuRef} style={{
            position: "fixed", top: menu.y, left: menu.x,
            zIndex: 99999,
            backgroundColor: "#111", border: "1px solid #222",
            borderRadius: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
            minWidth: 180, overflow: "hidden", padding: "4px 0",
        }}>
            {menu.items.map((item, i) =>
                item.label === "—" ? (
                    <div key={i} style={{height: 1, backgroundColor: "#1e1e1e", margin: "3px 0"}}/>
                ) : (
                    <button key={i}
                            onClick={() => {
                                item.onClick();
                                setMenu(null);
                            }}
                            className="w-full flex items-center justify-between text-left text-xs"
                            style={{padding: "6px 12px", color: item.danger ? "#ef4444" : "#c0c0c0"}}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#1a1a1a";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                            }}>
                        <span>{item.label}</span>
                        {item.shortcut && (
                            <span style={{color: "#444", marginLeft: 24}}>{item.shortcut}</span>
                        )}
                    </button>
                )
            )}
        </div>
    );
}

// Key to export so DevelopmentSettings can toggle it
export const DEVTOOLS_KEY_EXPORT = DEVTOOLS_KEY;
export const DEVTOOLS_EVENT = "gdlqbot:devtools-toggle";
