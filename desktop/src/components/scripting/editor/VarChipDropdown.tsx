// Scrollable row of proxy chips — each opens the same catalog used by the "."
// autocomplete (lib/scripting/proxy-api.ts), filtered to what's actually in
// scope for the current script. A trailing "libraries" chip lists installed
// Rhai libraries (stdlib globals + importable module-bundled ones) since
// those aren't proxies and wouldn't otherwise show up anywhere in the editor.

import {useCallback, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {computePosition, flip, offset, shift} from "@floating-ui/dom";
import {availableProxyNames, PROXY_API, PROXY_META, type ScriptContext} from "../../../lib/scripting/proxy-api";
import {getLibraries, type LibraryInfo} from "../../../lib/commands";

interface Props {
    onInsert: (text: string) => void;
    scriptCtx: ScriptContext;
}

const LIB_CHIP_COLOR = "#facc15";

export function VarChipDropdown({onInsert, scriptCtx}: Props) {
    const chipNames = availableProxyNames(scriptCtx);
    const [openIdx, setOpenIdx] = useState<number | null>(null); // index into chipNames, or -1 for libraries
    const [pos, setPos] = useState({top: -9999, left: -9999});
    const btnRefs = useRef<Record<string | number, HTMLButtonElement | null>>({});
    const menuRef = useRef<HTMLDivElement | null>(null);
    const cancelPos = useRef(false);

    const [libraries, setLibraries] = useState<LibraryInfo[] | null>(null);
    useEffect(() => {
        getLibraries().then(setLibraries).catch(() => setLibraries([]));
    }, []);

    const reposition = useCallback((key: string | number) => {
        const btn = btnRefs.current[key];
        if (!btn || !menuRef.current) return;
        cancelPos.current = false;
        computePosition(btn, menuRef.current, {
            placement: "bottom-start",
            middleware: [offset(4), flip(), shift({padding: 8})],
        }).then(({x, y}) => {
            if (!cancelPos.current) setPos({top: y, left: x});
        });
    }, []);

    const openKey: string | number | null = openIdx === null ? null : (openIdx === -1 ? "libraries" : chipNames[openIdx]);

    const setMenuRef = useCallback((node: HTMLDivElement | null) => {
        menuRef.current = node;
        if (node && openKey !== null) reposition(openKey);
    }, [openKey, reposition]);

    useEffect(() => {
        if (openIdx === null) {
            cancelPos.current = true;
            return;
        }
        const close = (e: MouseEvent) => {
            const key = openKey!;
            if (!menuRef.current?.contains(e.target as Node) &&
                !btnRefs.current[key]?.contains(e.target as Node))
                setOpenIdx(null);
        };
        const esc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpenIdx(null);
        };
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", esc);
        return () => {
            cancelPos.current = true;
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", esc);
        };
    }, [openIdx, openKey]);

    const chipBtnStyle = (active: boolean, color: string): React.CSSProperties => ({
        flexShrink: 0,
        fontSize: 10,
        padding: "2px 7px",
        borderRadius: 4,
        cursor: "pointer",
        fontFamily: '"JetBrains Mono","Fira Code",monospace',
        border: `1px solid ${active ? color + "50" : "#1e1e1e"}`,
        backgroundColor: active ? color + "18" : "transparent",
        color: active ? color : "#3a3a3a",
    });

    return (
        <>
            <div style={{
                display: "flex", alignItems: "center", gap: 3, flexShrink: 1, minWidth: 0,
                overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none",
            }}>
                {chipNames.map((name, i) => {
                    const meta = PROXY_META[name];
                    const active = openIdx === i;
                    return (
                        <button
                            key={name}
                            ref={(el) => {
                                btnRefs.current[name] = el;
                            }}
                            onClick={() => setOpenIdx(active ? null : i)}
                            title={meta.summary}
                            style={chipBtnStyle(active, meta.color)}
                            onMouseEnter={(e) => {
                                if (active) return;
                                e.currentTarget.style.color = meta.color;
                                e.currentTarget.style.borderColor = meta.color + "33";
                                e.currentTarget.style.backgroundColor = meta.color + "0e";
                            }}
                            onMouseLeave={(e) => {
                                if (active) return;
                                e.currentTarget.style.color = "#3a3a3a";
                                e.currentTarget.style.borderColor = "#1e1e1e";
                                e.currentTarget.style.backgroundColor = "transparent";
                            }}>
                            {name}
                        </button>
                    );
                })}

                {/* Libraries — not a proxy, so it gets its own chip */}
                <button
                    ref={(el) => {
                        btnRefs.current["libraries"] = el;
                    }}
                    onClick={() => setOpenIdx(openIdx === -1 ? null : -1)}
                    title="Installed libraries — stdlib globals and importable module libraries"
                    style={chipBtnStyle(openIdx === -1, LIB_CHIP_COLOR)}
                    onMouseEnter={(e) => {
                        if (openIdx === -1) return;
                        e.currentTarget.style.color = LIB_CHIP_COLOR;
                        e.currentTarget.style.borderColor = LIB_CHIP_COLOR + "33";
                        e.currentTarget.style.backgroundColor = LIB_CHIP_COLOR + "0e";
                    }}
                    onMouseLeave={(e) => {
                        if (openIdx === -1) return;
                        e.currentTarget.style.color = "#3a3a3a";
                        e.currentTarget.style.borderColor = "#1e1e1e";
                        e.currentTarget.style.backgroundColor = "transparent";
                    }}>
                    libraries
                </button>
            </div>

            {openIdx !== null && openIdx >= 0 && createPortal(
                <div ref={setMenuRef} style={{
                    position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
                    backgroundColor: "#111", border: "1px solid #1e1e1e", borderRadius: 6,
                    boxShadow: "0 8px 28px rgba(0,0,0,0.8)", minWidth: 260, maxHeight: 320,
                    overflow: "hidden auto",
                }}>
                    <div style={{
                        padding: "6px 10px 5px",
                        borderBottom: "1px solid #1a1a1a", position: "sticky", top: 0,
                        backgroundColor: "#111",
                    }}>
                        <p style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: PROXY_META[chipNames[openIdx]].color,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                        }}>
                            {chipNames[openIdx]}
                        </p>
                        <p style={{
                            fontSize: 10,
                            color: "#444",
                            marginTop: 2
                        }}>{PROXY_META[chipNames[openIdx]].summary}</p>
                    </div>
                    {PROXY_API[chipNames[openIdx]].map(({label, insert, docs}) => (
                        <button key={label}
                                onClick={() => {
                                    onInsert(`${chipNames[openIdx]}.${insert}`);
                                    setOpenIdx(null);
                                }}
                                className="w-full flex items-center justify-between px-3 py-1.5 text-xs gap-6"
                                style={{cursor: "pointer", color: "#d0d0d0"}}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "#1a1a1a";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                }}>
                            <code style={{
                                color: "#ffcb6b",
                                fontFamily: '"JetBrains Mono","Fira Code",monospace',
                                flexShrink: 0
                            }}>
                                {chipNames[openIdx]}.{label}
                            </code>
                            <span style={{color: "#444", flexShrink: 0, textAlign: "right"}}>{docs}</span>
                        </button>
                    ))}
                </div>,
                document.body
            )}

            {openIdx === -1 && createPortal(
                <div ref={setMenuRef} style={{
                    position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
                    backgroundColor: "#111", border: "1px solid #1e1e1e", borderRadius: 6,
                    boxShadow: "0 8px 28px rgba(0,0,0,0.8)", minWidth: 280, maxHeight: 320,
                    overflow: "hidden auto",
                }}>
                    <p style={{
                        padding: "5px 10px 4px", fontSize: 10, fontWeight: 600,
                        color: LIB_CHIP_COLOR, letterSpacing: "0.06em", textTransform: "uppercase",
                        borderBottom: "1px solid #1a1a1a", position: "sticky", top: 0,
                        backgroundColor: "#111",
                    }}>
                        Libraries
                    </p>
                    {libraries === null && (
                        <p style={{padding: "10px", fontSize: 11, color: "#333"}}>Loading…</p>
                    )}
                    {libraries?.length === 0 && (
                        <p style={{padding: "10px", fontSize: 11, color: "#333"}}>No libraries installed.</p>
                    )}
                    {libraries?.filter((l) => l.enabled).map((lib) => (
                        <button key={lib.name}
                                onClick={() => {
                                    if (!lib.is_stdlib) onInsert(`import "${lib.name}" as ${safeAlias(lib.name)};`);
                                    setOpenIdx(null);
                                }}
                                disabled={lib.is_stdlib}
                                title={lib.is_stdlib
                                    ? "Stdlib — its functions are already global, no import needed"
                                    : `Insert: import "${lib.name}" as ${safeAlias(lib.name)};`}
                                className="w-full flex items-start justify-between px-3 py-1.5 text-xs gap-3"
                                style={{
                                    cursor: lib.is_stdlib ? "default" : "pointer",
                                    color: "#d0d0d0",
                                    textAlign: "left"
                                }}
                                onMouseEnter={(e) => {
                                    if (!lib.is_stdlib) e.currentTarget.style.backgroundColor = "#1a1a1a";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                }}>
                            <span style={{minWidth: 0}}>
                                <code style={{
                                    color: "#ffcb6b",
                                    fontFamily: '"JetBrains Mono","Fira Code",monospace',
                                    display: "block"
                                }}>
                                    {lib.name}
                                </code>
                                {lib.description && (
                                    <span style={{
                                        color: "#444",
                                        fontSize: 10,
                                        display: "block",
                                        marginTop: 1
                                    }}>{lib.description}</span>
                                )}
                            </span>
                            <span style={{
                                flexShrink: 0, fontSize: 9, padding: "1px 5px", borderRadius: 3,
                                color: lib.is_stdlib ? "#888" : "#4ade80",
                                border: `1px solid ${lib.is_stdlib ? "#333" : "#1a4a2a"}`,
                            }}>
                                {lib.is_stdlib ? "global" : "import"}
                            </span>
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}

function safeAlias(name: string): string {
    const base = name.replace(/[^a-zA-Z0-9_]/g, "_");
    return /^[0-9]/.test(base) ? `_${base}` : (base || "lib");
}
