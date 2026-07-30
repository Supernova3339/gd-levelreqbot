import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {computePosition, flip, offset, shift} from "@floating-ui/dom";
import * as LucideIcons from "lucide-react";
import {BUILTIN_CATEGORIES, BUILTIN_SVG, iconColor, IconRenderer} from "./icons";
import {inp} from "./shared";

function toKebab(pascal: string): string {
    return pascal.replace(/([A-Z])/g, (c, _m, i) => (i === 0 ? c.toLowerCase() : "-" + c.toLowerCase()));
}

// lucide-react re-exports the same icon component under multiple names —
// every icon has a "*Icon"-suffixed alias (Camera/CameraIcon), and on top
// of that ~2200 legacy rename-aliases point to the exact same component
// under an old name (AlarmClockCheck/AlarmCheck, ChartArea/AreaChart, …).
// Filtering by name pattern only catches the first kind; deduping by the
// actual component reference catches both and is what actually eliminates
// every icon appearing twice (or more) in the grid — 5951 exported names
// collapse to the real ~1739 unique icons this way.
export const ALL_LUCIDE_NAMES: string[] = (() => {
    const skip = new Set(["createLucideIcon", "default"]);
    const seen = new Set<unknown>();
    const names: string[] = [];
    for (const k of Object.keys(LucideIcons)) {
        if (skip.has(k) || !/^[A-Z]/.test(k)) continue;
        const comp = (LucideIcons as Record<string, unknown>)[k];
        if (seen.has(comp)) continue;
        seen.add(comp);
        names.push(toKebab(k));
    }
    return names.sort();
})();

function PickerCell({name, selected, color, onSelect}: {
    name: string; selected: boolean; color?: string; onSelect: () => void;
}) {
    const [hov, setHov] = useState(false);
    // Separate from the "selected" outline below — that one only reflects
    // which icon is currently picked, so tabbing through the grid showed no
    // visible focus indicator at all (selected and focused aren't the same
    // cell most of the time). box-shadow, not outline, so the two states
    // can't collide on the same CSS property.
    const [focused, setFocused] = useState(false);
    const bg = selected ? `${color ?? "var(--color-accent)"}22` : hov ? "#1e1e1e" : "transparent";
    const fg = selected ? (color ?? "var(--color-accent)") : hov ? "#888" : "#444";
    return (
        <button
            title={name}
            onClick={onSelect}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
                width: 36, height: 36, borderRadius: 6, border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: bg, color: fg,
                outline: selected ? `1.5px solid ${color ?? "var(--color-accent)"}55` : "none",
                outlineOffset: -1,
                boxShadow: focused ? "0 0 0 2px var(--color-accent)" : "none",
                transition: "background 0.1s, color 0.1s",
            }}
        >
            <IconRenderer name={name} size={15}/>
        </button>
    );
}

/**
 * Icon picker — a trigger button plus a floating, portaled menu, same
 * pattern as Select.tsx (see that file's docblock for why: this needs to
 * work correctly regardless of what scrollable/overflow-hidden ancestor it
 * ends up nested inside, not just when it happens to already be inside a
 * portaled modal like Submit/Create). Plain CSS position:absolute here
 * would get clipped or scroll away oddly inside e.g. ModuleDetail's Edit tab.
 */
export function MIconPicker({value, onChange}: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<"builtin" | "lucide">("builtin");
    const [search, setSearch] = useState("");
    const [pos, setPos] = useState({top: -9999, left: -9999, width: 0});
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const cancelPos = useRef(false);

    const reposition = useCallback(() => {
        if (!btnRef.current || !menuRef.current) return;
        cancelPos.current = false;
        computePosition(btnRef.current, menuRef.current, {
            placement: "bottom-start",
            middleware: [offset(4), flip(), shift({padding: 8})],
        }).then(({x, y}) => {
            if (!cancelPos.current) setPos({top: y, left: x, width: 296});
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
        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
        return () => {
            cancelPos.current = true;
            window.removeEventListener("resize", reposition);
            window.removeEventListener("scroll", reposition, true);
        };
    }, [open, reposition]);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const esc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", esc);
        };
    }, [open]);

    const lucideResults = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (q ? ALL_LUCIDE_NAMES.filter(n => n.includes(q)) : ALL_LUCIDE_NAMES).slice(0, 120);
    }, [search]);

    const color = iconColor(value);

    const menu = open && createPortal(
        <div ref={setMenuRef} style={{
            position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999,
            backgroundColor: "#0d0d0d", border: "1px solid #222", borderRadius: 12,
            boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
            display: "flex", flexDirection: "column",
        }}>
            <div style={{display: "flex", borderBottom: "1px solid #181818", flexShrink: 0}}>
                {(["builtin", "lucide"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                        flex: 1, padding: "7px 0", fontSize: 10, fontWeight: tab === t ? 600 : 400,
                        color: tab === t ? "#aaa" : "#3a3a3a",
                        background: "none", border: "none", cursor: "pointer",
                        borderBottom: `2px solid ${tab === t ? "var(--color-accent)" : "transparent"}`,
                        marginBottom: -1,
                    }}>
                        {t === "builtin" ? "Built-ins" : "Lucide"}
                    </button>
                ))}
            </div>

            {tab === "builtin" && (
                <div style={{padding: "10px 10px 12px", overflowY: "auto", maxHeight: 320}}>
                    {BUILTIN_CATEGORIES.map(cat => (
                        <div key={cat.label} style={{marginBottom: 10}}>
                            <div style={{
                                fontSize: 9,
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                color: "#2a2a2a",
                                textTransform: "uppercase" as const,
                                marginBottom: 5
                            }}>
                                {cat.label}
                            </div>
                            <div style={{display: "flex", flexWrap: "wrap", gap: 3}}>
                                {cat.icons.map(name => (
                                    <PickerCell
                                        key={name} name={name}
                                        selected={value === name}
                                        color={BUILTIN_SVG[name] ? iconColor(name) : undefined}
                                        onSelect={() => {
                                            onChange(name);
                                            setOpen(false);
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === "lucide" && (
                <div style={{padding: "10px 10px 12px", display: "flex", flexDirection: "column", gap: 8}}>
                    <input
                        autoFocus
                        aria-label="Search lucide icons"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search lucide icons…"
                        style={{...inp, fontSize: 11, padding: "5px 8px"}}
                    />
                    <div style={{display: "flex", flexWrap: "wrap", gap: 3, maxHeight: 240, overflowY: "auto"}}>
                        {lucideResults.length === 0 ? (
                            <span style={{fontSize: 11, color: "#2e2e2e", padding: "8px 4px"}}>No results</span>
                        ) : lucideResults.map(name => (
                            <PickerCell
                                key={name} name={name} selected={value === name}
                                onSelect={() => {
                                    onChange(name);
                                    setOpen(false);
                                    setSearch("");
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div style={{
                padding: "8px 10px",
                borderTop: "1px solid #181818",
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0
            }}>
                <span style={{fontSize: 9, color: "#2a2a2a", flexShrink: 0, letterSpacing: "0.04em"}}>NAME</span>
                <input
                    aria-label="Icon name"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder="any-lucide-name"
                    style={{...inp, fontSize: 11, padding: "4px 8px", flex: 1}}
                />
            </div>
        </div>,
        document.body
    );

    return (
        <div style={{marginBottom: 12}}>
            <label style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#555",
                letterSpacing: "0.04em",
                display: "block",
                marginBottom: 4
            }}>Icon</label>

            <button ref={btnRef} onClick={() => setOpen(o => !o)} style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "6px 10px", backgroundColor: "#111",
                border: `1px solid ${open ? "#333" : "#242424"}`, borderRadius: 6,
                cursor: "pointer", textAlign: "left",
            }}>
                <div style={{
                    width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                    backgroundColor: `${color}18`,
                    display: "flex", alignItems: "center", justifyContent: "center", color,
                }}>
                    <IconRenderer name={value || "custom"} size={15}/>
                </div>
                <span style={{fontSize: 12, color: value ? "#aaa" : "#444", flex: 1, fontFamily: "monospace"}}>
                    {value || "pick an icon…"}
                </span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                     style={{
                         color: "#333",
                         transform: open ? "rotate(180deg)" : undefined,
                         transition: "transform 0.15s",
                         flexShrink: 0
                     }}>
                    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                          strokeLinejoin="round"/>
                </svg>
            </button>

            {menu}
        </div>
    );
}
