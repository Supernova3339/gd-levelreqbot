// Keyboard shortcut reference popover — shows current (possibly remapped) shortcuts.

import {useCallback, useContext, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {computePosition, flip, offset, shift} from "@floating-ui/dom";
import {BINDABLE_ACTIONS, KeybindContext} from "../../../hooks/useKeybinds";

export function KeybindingsHelp() {
    const binds = useContext(KeybindContext);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({top: -9999, left: -9999});
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const cancelPos = useRef(false);

    const reposition = useCallback(() => {
        if (!btnRef.current || !menuRef.current) return;
        cancelPos.current = false;
        computePosition(btnRef.current, menuRef.current, {
            placement: "bottom-end",
            middleware: [offset(4), flip(), shift({padding: 8})],
        }).then(({x, y}) => {
            if (!cancelPos.current) setPos({top: y, left: x});
        });
    }, []);

    const setMenuRef = useCallback((node: HTMLDivElement | null) => {
        menuRef.current = node;
        if (node) reposition();
    }, [reposition]);

    useEffect(() => {
        if (!open) {
            cancelPos.current = true;
            return;
        }
        const close = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node))
                setOpen(false);
        };
        const esc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", esc);
        return () => {
            cancelPos.current = true;
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", esc);
        };
    }, [open]);

    // Build the list from BINDABLE_ACTIONS (dynamic) + fixed browser shortcuts
    const items: [string, string][] = [
        ...BINDABLE_ACTIONS.map((a) => [a.label, binds[a.id] ?? a.default] as [string, string]),
        ["Undo", "Ctrl+Z"],
        ["Redo", "Ctrl+Shift+Z"],
        ["Next match", "Enter  (in find bar)"],
        ["Prev match", "Shift+Enter  (in find bar)"],
        ["Close find / autocomplete", "Escape"],
    ];

    return (
        <>
            <button ref={btnRef} onClick={() => setOpen((v) => !v)}
                    title="Keyboard shortcuts"
                    style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 22, height: 22, borderRadius: 4, border: `1px solid ${open ? "#2a2a2a" : "#1a1a1a"}`,
                        backgroundColor: open ? "#1a1a1a" : "transparent",
                        color: open ? "#c0c0c0" : "#444", fontSize: 12, cursor: "pointer", flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#c0c0c0";
                        e.currentTarget.style.borderColor = "#2a2a2a";
                        e.currentTarget.style.backgroundColor = "#1a1a1a";
                    }}
                    onMouseLeave={(e) => {
                        if (!open) {
                            e.currentTarget.style.color = "#444";
                            e.currentTarget.style.borderColor = "#1a1a1a";
                            e.currentTarget.style.backgroundColor = "transparent";
                        }
                    }}>
                ?
            </button>

            {open && createPortal(
                <div ref={setMenuRef} style={{
                    position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
                    backgroundColor: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 6,
                    boxShadow: "0 8px 28px rgba(0,0,0,0.85)", width: 300, overflow: "hidden", padding: "6px 0",
                }}>
                    <p style={{
                        padding: "4px 10px 6px",
                        fontSize: 10,
                        color: "#2a2a2a",
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        borderBottom: "1px solid #1a1a1a"
                    }}>
                        Keyboard shortcuts
                    </p>
                    {items.map(([label, key]) => (
                        <div key={label} style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "4px 10px",
                            gap: 12
                        }}>
                            <span style={{fontSize: 11, color: "#555"}}>{label}</span>
                            <code style={{
                                fontSize: 10,
                                color: "#82aaff",
                                fontFamily: '"JetBrains Mono","Fira Code",monospace',
                                flexShrink: 0,
                                textAlign: "right"
                            }}>
                                {key}
                            </code>
                        </div>
                    ))}
                    <p style={{
                        padding: "6px 10px 2px",
                        fontSize: 10,
                        color: "#1e1e1e",
                        borderTop: "1px solid #141414",
                        marginTop: 4
                    }}>
                        Remap shortcuts in Settings → Keybinds
                    </p>
                </div>,
                document.body
            )}
        </>
    );
}
