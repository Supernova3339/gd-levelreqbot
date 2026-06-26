// Scrollable row of library chips — each opens a grouped variable picker.

import {useCallback, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {computePosition, flip, offset, shift} from "@floating-ui/dom";

interface VarEntry {
    v: string;
    hint: string;
}

interface LibChip {
    label: string;
    color: string;
    entries: VarEntry[];
}

const CHIPS: LibChip[] = [
    {
        label: "user", color: "#c3e88d",
        entries: [{v: "user.name", hint: "login name"}, {v: "user.platform", hint: '"twitch" | "youtube"'},
            {v: "user.isMod()", hint: "bool"}, {v: "user.isSub()", hint: "bool"},
            {v: "user.isBroadcaster()", hint: "bool"}, {v: "user.isStaff()", hint: "mod or broadcaster"}]
    },
    {
        label: "args", color: "#82aaff",
        entries: [{v: "args[0]", hint: "first argument"}, {v: "args.len()", hint: "argument count"},
            {v: 'args.join(" ")', hint: "all args as string"}]
    },
    {
        label: "queue", color: "#22c55e",
        entries: [{v: "queue.size()", hint: "entry count"}, {v: "queue.has(args[0])", hint: "bool"},
            {v: "queue.add(args[0])", hint: "add level"}, {v: "queue.position(args[0])", hint: "i64, 0=not found"},
            {v: "queue.next()", hint: "pop next level"}, {v: "queue.list(1)", hint: "page 1 array"}]
    },
    {
        label: "time", color: "#f59e0b",
        entries: [{v: "time.now()", hint: "Unix timestamp"}, {v: "time.utc()", hint: '"14:23 UTC"'},
            {v: "time.date()", hint: '"2026-06-25"'}, {v: "time.elapsed(ts)", hint: "seconds since ts"}]
    },
    {
        label: "platform", color: "#89ddff",
        entries: [{v: "platform", hint: '"twitch" | "youtube"'}, {v: "command_trigger", hint: 'e.g. "!request"'},
            {v: "username", hint: "sender login name"}]
    },
    {
        label: "rand", color: "#f78c6c",
        entries: [{v: "rand.int(1, 100)", hint: "random int"}, {v: 'rand.pick(["a","b"])', hint: "random element"},
            {v: "rand.float()", hint: "0.0-1.0"}, {v: "rand.bool()", hint: "true/false"}]
    },
    {
        label: "store", color: "#6366f1",
        entries: [{v: 'store.get("key")', hint: "get value"}, {v: 'store.incr("key")', hint: "increment, return new"},
            {v: 'store.set("key", val)', hint: "set value"}, {v: 'store.get_or("key", 0)', hint: "with default"}]
    },
    {
        label: "gd", color: "#a78bfa",
        entries: [{v: "gd.fetch(args[0])", hint: "level map or ()"}, {v: "gd.isValidId(args[0])", hint: "bool"},
            {v: 'gd.search("name")', hint: "array of level maps"}]
    },
    {
        label: "web", color: "#22d3ee",
        entries: [{v: 'web.get("url")', hint: "body string or ()"}, {
            v: 'web.get_json("url")',
            hint: "parsed JSON or ()"
        },
            {v: 'web.post("url", body)', hint: "POST plain text"}, {v: 'web.post_json("url", body)', hint: "POST JSON"}]
    },
    {
        label: "data", color: "#fb7185",
        entries: [{v: 'data.insert("col", #{})', hint: "insert doc, returns UUID"},
            {v: 'data.find("col", 10)', hint: "array of docs"}, {v: 'data.count("col")', hint: "document count"},
            {v: 'data.delete(id)', hint: "delete by UUID"}]
    },
    {
        label: "console", color: "#a3a3a3",
        entries: [{v: 'console.log("msg")', hint: "log to script console"},
            {v: 'console.warn("msg")', hint: "log a warning"},
            {v: 'console.error("msg")', hint: "log an error"}]
    },
    {
        label: "event", color: "#34d399",
        entries: [{v: 'event.emit("name", "payload")', hint: "emit to frontend + WS"},
            {v: 'event.emit("name")', hint: "emit with no payload"}]
    },
];

interface Props {
    onInsert: (text: string) => void;
}

export function VarChipDropdown({onInsert}: Props) {
    const [openIdx, setOpenIdx] = useState<number | null>(null);
    const [pos, setPos] = useState({top: -9999, left: -9999});
    const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const cancelPos = useRef(false);

    const reposition = useCallback((idx: number) => {
        const btn = btnRefs.current[idx];
        if (!btn || !menuRef.current) return;
        cancelPos.current = false;
        computePosition(btn, menuRef.current, {
            placement: "bottom-start",
            middleware: [offset(4), flip(), shift({padding: 8})],
        }).then(({x, y}) => {
            if (!cancelPos.current) setPos({top: y, left: x});
        });
    }, []);

    const setMenuRef = useCallback((node: HTMLDivElement | null) => {
        menuRef.current = node;
        if (node && openIdx !== null) reposition(openIdx);
    }, [openIdx, reposition]);

    useEffect(() => {
        if (openIdx === null) {
            cancelPos.current = true;
            return;
        }
        const close = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node) &&
                !btnRefs.current[openIdx]?.contains(e.target as Node))
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
    }, [openIdx]);

    return (
        <>
            <div
                style={{display: "flex", alignItems: "center", gap: 3, overflow: "hidden", flexShrink: 1, minWidth: 0}}>
                {CHIPS.map((chip, i) => {
                    const active = openIdx === i;
                    return (
                        <button
                            key={chip.label}
                            ref={(el) => {
                                btnRefs.current[i] = el;
                            }}
                            onClick={() => setOpenIdx(active ? null : i)}
                            style={{
                                flexShrink: 0,
                                fontSize: 10,
                                padding: "2px 7px",
                                borderRadius: 4,
                                cursor: "pointer",
                                fontFamily: '"JetBrains Mono","Fira Code",monospace',
                                border: `1px solid ${active ? chip.color + "50" : "#1e1e1e"}`,
                                backgroundColor: active ? chip.color + "18" : "transparent",
                                color: active ? chip.color : "#3a3a3a",
                            }}
                            onMouseEnter={(e) => {
                                if (active) return;
                                e.currentTarget.style.color = chip.color;
                                e.currentTarget.style.borderColor = chip.color + "33";
                                e.currentTarget.style.backgroundColor = chip.color + "0e";
                            }}
                            onMouseLeave={(e) => {
                                if (active) return;
                                e.currentTarget.style.color = "#3a3a3a";
                                e.currentTarget.style.borderColor = "#1e1e1e";
                                e.currentTarget.style.backgroundColor = "transparent";
                            }}>
                            {chip.label}
                        </button>
                    );
                })}
            </div>

            {openIdx !== null && createPortal(
                <div ref={setMenuRef} style={{
                    position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
                    backgroundColor: "#111", border: "1px solid #1e1e1e", borderRadius: 6,
                    boxShadow: "0 8px 28px rgba(0,0,0,0.8)", minWidth: 240, maxHeight: 300,
                    overflow: "hidden auto",
                }}>
                    <p style={{
                        padding: "5px 10px 4px", fontSize: 10, fontWeight: 600,
                        color: CHIPS[openIdx].color, letterSpacing: "0.06em", textTransform: "uppercase",
                        borderBottom: "1px solid #1a1a1a", position: "sticky", top: 0,
                        backgroundColor: "#111",
                    }}>
                        {CHIPS[openIdx].label}
                    </p>
                    {CHIPS[openIdx].entries.map(({v, hint}) => (
                        <button key={v}
                                onClick={() => {
                                    onInsert(v);
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
                                fontFamily: '"JetBrains Mono","Fira Code",monospace'
                            }}>{v}</code>
                            <span style={{color: "#444", flexShrink: 0}}>{hint}</span>
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}
