// Keybinds settings page — lets users remap editor shortcuts.

import {useState} from "react";
import type {KeybindMap} from "../../hooks/useKeybinds";
import {BINDABLE_ACTIONS, eventToShortcut} from "../../hooks/useKeybinds";

interface Props {
    binds: KeybindMap;
    setBind: (action: string, shortcut: string) => Promise<void>;
    resetBind: (action: string) => Promise<void>;
}

export function KeybindsSettings({binds, setBind, resetBind}: Props) {
    const [recording, setRecording] = useState<string | null>(null);  // action id being recorded
    const [conflict, setConflict] = useState<string | null>(null);

    const startRecord = (actionId: string) => {
        setRecording(actionId);
        setConflict(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, actionId: string) => {
        if (!recording) return;
        e.preventDefault();
        e.stopPropagation();

        if (e.key === "Escape") {
            setRecording(null);
            return;
        }

        const shortcut = eventToShortcut(e.nativeEvent);
        if (!shortcut) return;

        // Check for conflicts with other actions
        const existing = Object.entries(binds).find(([id, s]) => id !== actionId && s === shortcut);
        if (existing) {
            const label = BINDABLE_ACTIONS.find((a) => a.id === existing[0])?.label ?? existing[0];
            setConflict(`Already used by "${label}"`);
            setTimeout(() => {
                setConflict(null);
                setRecording(null);
            }, 2000);
            return;
        }

        setBind(actionId, shortcut)
            .then(() => setRecording(null))
            .catch(() => setRecording(null));
    };

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-sm font-semibold mb-1" style={{color: "#f1f1f1"}}>Keybinds</h2>
                <p className="text-xs" style={{color: "#555"}}>
                    Customize keyboard shortcuts for the script editor. Click a shortcut to re-record it.
                </p>
            </div>

            <div className="flex flex-col gap-2">
                {BINDABLE_ACTIONS.map((action) => {
                    const isRecording = recording === action.id;
                    const current = binds[action.id] ?? action.default;
                    const isDefault = current === action.default;

                    return (
                        <div key={action.id}
                             className="flex items-center justify-between p-3 rounded-lg gap-4"
                             style={{
                                 backgroundColor: "#111",
                                 border: `1px solid ${isRecording ? "var(--color-accent)44" : "#222"}`
                             }}>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm" style={{color: "#d0d0d0", fontWeight: 500}}>{action.label}</p>
                                <p className="text-xs mt-0.5" style={{color: "#444"}}>{action.description}</p>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                                {/* Reset to default */}
                                {!isDefault && !isRecording && (
                                    <button
                                        onClick={() => resetBind(action.id)}
                                        className="text-xs px-2 py-0.5 rounded"
                                        style={{color: "#555", border: "1px solid #222"}}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.color = "#f87171";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.color = "#555";
                                        }}
                                        title="Reset to default"
                                    >
                                        ↺
                                    </button>
                                )}

                                {/* Shortcut button */}
                                <button
                                    onKeyDown={(e) => handleKeyDown(e, action.id)}
                                    onClick={() => isRecording ? setRecording(null) : startRecord(action.id)}
                                    style={{
                                        minWidth: 90,
                                        padding: "4px 10px",
                                        borderRadius: 5,
                                        border: `1px solid ${isRecording ? "var(--color-accent)88" : "#2a2a2a"}`,
                                        backgroundColor: isRecording ? "color-mix(in srgb, var(--color-accent) 8%, #111)" : "#181818",
                                        color: isRecording ? "var(--color-accent)" : isDefault ? "#888" : "#c0c0c0",
                                        fontSize: 11,
                                        fontFamily: '"JetBrains Mono","Fira Code",monospace',
                                        cursor: "pointer",
                                        textAlign: "center",
                                        outline: isRecording ? "1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)" : "none",
                                        outlineOffset: 2,
                                        transition: "all 0.1s",
                                    }}
                                >
                                    {isRecording ? (conflict ?? "Press keys…") : current}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <p className="text-xs" style={{color: "#333"}}>
                Press Escape while recording to cancel. Undo (Ctrl+Z) and Redo (Ctrl+Shift+Z) use the browser's native
                history and cannot be remapped.
            </p>
        </div>
    );
}
