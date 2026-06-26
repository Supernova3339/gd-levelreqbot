// Editor keybind definitions — default shortcuts, overridable from DB via settings.

import {createContext, useCallback, useContext, useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";

// ─── Action definitions ───────────────────────────────────────────────────────

export interface BindableAction {
    id: string;
    label: string;
    description: string;
    default: string;  // e.g. "Ctrl+S"
}

export const BINDABLE_ACTIONS: BindableAction[] = [
    {id: "editor.save", label: "Save", description: "Save the current command", default: "Ctrl+S"},
    {id: "editor.find", label: "Find", description: "Open the find bar in the text editor", default: "Ctrl+F"},
    {id: "editor.replace", label: "Find & Replace", description: "Open find bar with replace row", default: "Ctrl+H"},
    {
        id: "editor.comment",
        label: "Toggle comment",
        description: "Comment or uncomment the selected line(s)",
        default: "Ctrl+/"
    },
    {id: "editor.run", label: "Run script", description: "Run the script in the test runner", default: "Ctrl+Enter"},
];

// ─── Shortcut string helpers ──────────────────────────────────────────────────

/** Normalise a KeyboardEvent into a string like "Ctrl+Shift+F". */
export function eventToShortcut(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    const k = e.key;
    if (k === "Control" || k === "Alt" || k === "Shift" || k === "Meta") return "";
    parts.push(k === " " ? "Space" : k.length === 1 ? k.toUpperCase() : k);
    return parts.join("+");
}

/** Check whether a KeyboardEvent matches a shortcut string. */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
    if (!shortcut) return false;
    return eventToShortcut(e) === shortcut;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type KeybindMap = Record<string, string>;  // action → shortcut

const defaultMap = (): KeybindMap =>
    Object.fromEntries(BINDABLE_ACTIONS.map((a) => [a.id, a.default]));

export function useKeybinds(): {
    binds: KeybindMap;
    setBind: (action: string, shortcut: string) => Promise<void>;
    resetBind: (action: string) => Promise<void>;
} {
    const [binds, setBinds] = useState<KeybindMap>(defaultMap);

    useEffect(() => {
        invoke<{ action: string; shortcut: string }[]>("get_keybinds")
            .then((rows) => {
                const map = defaultMap();
                for (const {action, shortcut} of rows) {
                    if (action in map) map[action] = shortcut;
                }
                setBinds(map);
            })
            .catch(() => {
            });
    }, []);

    const setBind = useCallback(async (action: string, shortcut: string) => {
        await invoke("set_keybind", {action, shortcut});
        setBinds((prev) => ({...prev, [action]: shortcut}));
    }, []);

    const resetBind = useCallback(async (action: string) => {
        const def = BINDABLE_ACTIONS.find((a) => a.id === action)?.default ?? "";
        await invoke("set_keybind", {action, shortcut: def});
        setBinds((prev) => ({...prev, [action]: def}));
    }, []);

    return {binds, setBind, resetBind};
}

// ─── Context (used to share binds across the tree) ────────────────────────────

export const KeybindContext = createContext<KeybindMap>(defaultMap());

export function useEditorKeybind(action: string): string {
    const binds = useContext(KeybindContext);
    return binds[action] ?? BINDABLE_ACTIONS.find((a) => a.id === action)?.default ?? "";
}
