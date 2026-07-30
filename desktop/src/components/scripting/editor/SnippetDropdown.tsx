// Snippet picker — compact portal dropdown triggered by a toolbar button.

import {useCallback, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {computePosition, flip, offset, shift} from "@floating-ui/dom";
import {type Availability, isAvailable, type ScriptContext} from "../../../lib/scripting/proxy-api";

interface Snippet {
    label: string;
    category: string;
    body: string;
    /** Only offered when the current script has this in scope — see proxy-api.ts.
     *  Omit for snippets that only use always-available proxies. */
    requires?: Availability;
}

const SNIPPETS: Snippet[] = [
    // Guards
    {
        category: "Guards",
        label: "Staff guard",
        body: `if !user.isStaff() {\n    chat.reply("Staff only.");\n    return;\n}`
    },
    {
        category: "Guards",
        label: "Mod guard",
        body: `if !user.isMod() && !user.isBroadcaster() {\n    chat.reply("Mods only.");\n    return;\n}`
    },
    {
        category: "Guards",
        label: "Broadcaster guard",
        body: `if !user.isBroadcaster() {\n    chat.reply("Broadcaster only.");\n    return;\n}`
    },
    {
        category: "Guards",
        label: "Sub guard",
        body: `if !user.isSub() && !user.isStaff() {\n    chat.reply("Subs only.");\n    return;\n}`
    },
    {
        category: "Guards",
        label: "Args guard",
        body: `if args.len() == 0 {\n    chat.reply(\`Usage: \${command_trigger} <arg>\`);\n    return;\n}`
    },
    {
        category: "Guards",
        label: "Platform check",
        body: `if user.platform == "twitch" {\n    // Twitch only\n} else if user.platform == "youtube" {\n    // YouTube only\n}`
    },
    // Control
    {
        category: "Control",
        label: "If / else",
        body: `if user.isMod() {\n    chat.say("Mod action!");\n} else {\n    chat.say("Viewer action.");\n}`
    },
    {
        category: "Control",
        label: "Random pick",
        body: `let msg = rand.pick(["Pog!", "GG!", "Hype!", "Let's go!"]);\nchat.say(msg);`
    },
    // Queue (legacy — custom commands only, not available in module scripts)
    {
        category: "Queue",
        label: "Queue add",
        requires: "custom",
        body: `if args.len() == 0 {\n    chat.reply("Usage: !request <level ID>");\n    return;\n}\nif !gd.isValidId(args[0]) {\n    chat.reply("Invalid level ID.");\n    return;\n}\nlet result = queue.add(args[0]);\nchat.say(result);`
    },
    {
        category: "Queue",
        label: "Queue position",
        requires: "custom",
        body: `if args.len() == 0 { chat.reply("Usage: !pos <level ID>"); return; }\nlet pos = queue.position(args[0]);\nif pos == 0 {\n    chat.reply("That level is not in the queue.");\n} else {\n    chat.reply(\`Your level is at position \${pos}.\`);\n}`
    },
    // GD
    {
        category: "GD",
        label: "GD fetch level",
        body: `if args.len() == 0 { chat.reply("Provide a level ID."); return; }\nlet lvl = gd.fetch(args[0]);\nif lvl == () {\n    chat.reply("Level not found.");\n} else {\n    chat.say(\`\${lvl.name} by \${lvl.username} — \${lvl.stars}⭐ \${lvl.difficulty}\`);\n}`
    },
    // Storage — module store (ms) vs. legacy global store/data (custom commands only)
    {
        category: "Storage",
        label: "ms counter",
        requires: "module",
        body: `let key = "my_counter";\nms.incr(key);\nchat.say(\`Count: \${ms.get(key)}\`);`
    },
    {
        category: "Storage",
        label: "ms collection insert",
        requires: "module",
        body: `ms.collection("entries").push(#{\n    user: user.name,\n    level: args[0],\n    ts: time.now()\n});\nchat.say("Saved!");`
    },
    {
        category: "Storage",
        label: "Counter",
        requires: "custom",
        body: `let key = "my_counter";\nstore.incr(key);\nchat.say(\`Count: \${store.get(key)}\`);`
    },
    {
        category: "Storage",
        label: "Store get/set",
        requires: "custom",
        body: `let val = store.get_or("key", "0");\nstore.set("key", val);\nchat.say(\`Stored: \${val}\`);`
    },
    {
        category: "Storage",
        label: "Data insert",
        requires: "custom",
        body: `data.insert("entries", #{\n    user: user.name,\n    level: args[0],\n    ts: time.now()\n});\nchat.say("Saved!");`
    },
    // Web
    {
        category: "Web",
        label: "Web GET",
        body: `let res = web.get("https://api.example.com/data");\nif res != () {\n    chat.say(res);\n}`
    },
    {
        category: "Web",
        label: "Web GET JSON",
        body: `let data = web.get_json("https://api.example.com/json");\nif data != () {\n    chat.say(\`Got: \${data.message}\`);\n} else {\n    chat.say("Request failed.");\n}`
    },
    // Events
    {category: "Events", label: "Emit event", body: `event.emit("my-event", user.name);\nchat.say("Event fired!");`},
];

interface Props {
    onInsert: (text: string) => void;
    scriptCtx: ScriptContext;
}

export function SnippetDropdown({onInsert, scriptCtx}: Props) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({top: -9999, left: -9999});
    const [category, setCategory] = useState<string | null>(null);

    // Drop snippets that use proxies not in scope for this script (e.g. `queue.*`
    // snippets in a module script) — an inserted snippet should always at least run.
    const available = SNIPPETS.filter((s) => !s.requires || isAvailable(s.requires, scriptCtx));
    const CATEGORIES = [...new Set(available.map((s) => s.category))];
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

    const visible = category
        ? available.filter((s) => s.category === category)
        : available;

    return (
        <>
            <button
                ref={btnRef}
                onClick={() => {
                    setOpen((v) => !v);
                    setCategory(null);
                }}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: `1px solid ${open ? "#2a2a2a" : "#1a1a1a"}`,
                    backgroundColor: open ? "#1a1a1a" : "transparent",
                    color: open ? "#c0c0c0" : "#555",
                    fontSize: 11,
                    cursor: "pointer",
                    flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#c0c0c0";
                    e.currentTarget.style.borderColor = "#2a2a2a";
                    e.currentTarget.style.backgroundColor = "#1a1a1a";
                }}
                onMouseLeave={(e) => {
                    if (!open) {
                        e.currentTarget.style.color = "#555";
                        e.currentTarget.style.borderColor = "#1a1a1a";
                        e.currentTarget.style.backgroundColor = "transparent";
                    }
                }}>
                <span style={{fontSize: 9}}>✦</span>
                snippets
            </button>

            {open && createPortal(
                <div ref={setMenuRef} style={{
                    position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
                    backgroundColor: "#111", border: "1px solid #1e1e1e", borderRadius: 6,
                    boxShadow: "0 8px 28px rgba(0,0,0,0.8)", width: 210, overflow: "hidden",
                }}>
                    {/* Category filter */}
                    <div style={{
                        padding: "5px 8px 4px",
                        borderBottom: "1px solid #1a1a1a",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 3
                    }}>
                        <CategoryChip label="All" active={!category} onClick={() => setCategory(null)}/>
                        {CATEGORIES.map((c) => <CategoryChip key={c} label={c} active={category === c}
                                                             onClick={() => setCategory(c === category ? null : c)}/>)}
                    </div>

                    <div style={{maxHeight: 260, overflowY: "auto"}}>
                        {visible.map((s) => (
                            <button key={s.label}
                                    onClick={() => {
                                        onInsert(s.body);
                                        setOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-1.5"
                                    style={{fontSize: 12, color: "#888", cursor: "pointer"}}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = "#1a1a1a";
                                        e.currentTarget.style.color = "#d0d0d0";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                        e.currentTarget.style.color = "#888";
                                    }}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

function CategoryChip({label, active, onClick}: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} style={{
            padding: "1px 6px", borderRadius: 3, border: `1px solid ${active ? "#333" : "#1a1a1a"}`,
            backgroundColor: active ? "#1e1e1e" : "transparent",
            color: active ? "#c0c0c0" : "#444", fontSize: 10, cursor: "pointer",
        }}>
            {label}
        </button>
    );
}
