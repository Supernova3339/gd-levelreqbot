// Searchable combobox for the "Internal event" listener config — type to
// filter events modules have declared (resolved to the namespaced form
// dispatch matches against, e.g. "gdlqbot-team.level-queue.level-nexted"),
// or keep typing past what's suggested to use a raw custom name (a custom
// command emitting its own, or a module that hasn't declared one yet).

import {useEffect, useMemo, useRef, useState} from "react";
import {listModuleEvents, type ModuleEventOption} from "../lib/commands";

export function EventListenerPicker({value, onChange, disabled}: {
    value: string;
    onChange: (name: string) => void;
    disabled?: boolean;
}) {
    const [options, setOptions] = useState<ModuleEventOption[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState(value);
    const [highlight, setHighlight] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        listModuleEvents().then(setOptions).catch(() => setOptions([])).finally(() => setLoaded(true));
    }, []);

    // Keep the visible text in sync when the value changes from outside
    // (e.g. switching which listener row this is) while not editing.
    useEffect(() => {
        if (!open) setQuery(value);
    }, [value, open]);

    useEffect(() => {
        if (!open) return;
        const onClickOutside = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQuery(value);
            }
        };
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, [open, value]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((o) =>
            o.label.toLowerCase().includes(q) ||
            o.module_name.toLowerCase().includes(q) ||
            o.full_name.toLowerCase().includes(q)
        );
    }, [options, query]);

    const select = (o: ModuleEventOption) => {
        onChange(o.full_name);
        setQuery(o.full_name);
        setOpen(false);
    };

    const commitCustom = () => {
        onChange(query.trim());
        setOpen(false);
    };

    const selected = options.find((o) => o.full_name === value);

    return (
        <div ref={rootRef} className="relative" style={{width: 260}}>
            <input
                ref={inputRef}
                value={query}
                disabled={disabled}
                placeholder="Search events, or type a custom name…"
                onFocus={() => {
                    setOpen(true);
                    setHighlight(0);
                }}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                    setHighlight(0);
                }}
                onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlight((h) => Math.min(h + 1, filtered.length - 1));
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlight((h) => Math.max(h - 1, 0));
                    } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (open && filtered[highlight]) select(filtered[highlight]);
                        else commitCustom();
                    } else if (e.key === "Escape") {
                        setOpen(false);
                        setQuery(value);
                        inputRef.current?.blur();
                    }
                }}
                className="text-xs px-2.5 py-1.5 rounded w-full"
                style={{
                    backgroundColor: "#0d0d0d",
                    color: "#c0c0c0",
                    border: `1px solid ${open ? "var(--color-accent)" : "#1e1e1e"}`,
                    boxSizing: "border-box"
                }}
            />

            {!open && selected && (
                <div className="text-xs mt-1" style={{color: "#555"}}>{selected.module_name}: {selected.label}</div>
            )}
            {!open && value && !selected && (
                <div className="text-xs mt-1" style={{color: "#2a2a2a"}}>Custom event name — no module declares
                    this.</div>
            )}

            {open && (
                <div className="absolute z-10 mt-1 rounded overflow-hidden"
                     style={{
                         backgroundColor: "#111",
                         border: "1px solid #2a2a2a",
                         width: "100%",
                         maxHeight: 220,
                         overflowY: "auto",
                         boxShadow: "0 4px 16px rgba(0,0,0,0.4)"
                     }}>
                    {!loaded && <div className="text-xs px-2.5 py-2" style={{color: "#555"}}>Loading…</div>}
                    {loaded && filtered.length === 0 && (
                        <div className="text-xs px-2.5 py-2" style={{color: "#555"}}>
                            No declared events match — press Enter to use "{query.trim() || "…"}" as a custom name.
                        </div>
                    )}
                    {filtered.map((o, i) => (
                        <button
                            key={o.full_name}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                select(o);
                            }}
                            onMouseEnter={() => setHighlight(i)}
                            className="w-full text-left px-2.5 py-1.5 flex flex-col gap-0.5"
                            style={{backgroundColor: i === highlight ? "color-mix(in srgb, var(--color-accent) 15%, #111)" : "transparent"}}>
                            <span className="text-xs" style={{color: "#e0e0e0"}}>{o.label}</span>
                            <span className="text-xs"
                                  style={{color: "#555"}}>{o.module_name} · <code>{o.full_name}</code></span>
                        </button>
                    ))}
                    {loaded && query.trim() && !options.some((o) => o.full_name === query.trim()) && (
                        <button
                            onMouseDown={(e) => {
                                e.preventDefault();
                                commitCustom();
                            }}
                            onMouseEnter={() => setHighlight(-1)}
                            className="w-full text-left px-2.5 py-1.5"
                            style={{
                                borderTop: filtered.length > 0 ? "1px solid #1e1e1e" : "none",
                                backgroundColor: highlight === -1 ? "color-mix(in srgb, var(--color-accent) 15%, #111)" : "transparent"
                            }}>
                            <span className="text-xs"
                                  style={{color: "#888"}}>Use custom name "<code>{query.trim()}</code>"</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
