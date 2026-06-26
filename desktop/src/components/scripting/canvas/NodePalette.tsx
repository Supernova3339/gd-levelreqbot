// Side panel for adding new nodes to the canvas.
// Uses the same drill-down portal picker style as the block palette.

import {useState} from "react";
import {NODE_COLORS, type NodeKind} from "./nodeTypes";

interface PaletteEntry {
    kind: NodeKind;
    label: string;
    desc: string;
    action?: string;
}

const ENTRIES: { group: string; items: PaletteEntry[] }[] = [
    {
        group: "Queue",
        items: [
            {kind: "action", label: "queue.add()", desc: "Add {args} to the queue", action: "queue.add"},
            {kind: "action", label: "queue.next()", desc: "Pop the next level", action: "queue.next"},
            {kind: "action", label: "queue.remove()", desc: "Remove {args} from queue", action: "queue.remove"},
            {kind: "action", label: "queue.clear()", desc: "Clear the entire queue", action: "queue.clear"},
        ],
    },
    {
        group: "Messages",
        items: [
            {kind: "say", label: "say", desc: "Send a message in chat"},
            {kind: "reply", label: "reply", desc: "Reply with @mention"},
            {kind: "random", label: "say random", desc: "Pick a message at random"},
        ],
    },
    {
        group: "Flow",
        items: [
            {kind: "condition", label: "if / else", desc: "Branch on a condition"},
            {kind: "return", label: "return", desc: "Stop execution here"},
        ],
    },
    {
        group: "Counter",
        items: [
            {kind: "action", label: "counter.inc()", desc: "Increment counter", action: "counter.inc"},
            {kind: "action", label: "counter.reset()", desc: "Reset counter", action: "counter.reset"},
        ],
    },
    {
        group: "GD API",
        items: [
            {
                kind: "action",
                label: "gd.level.fetch()",
                desc: "Fetch GD level data for {args}",
                action: "gd.level.fetch"
            },
        ],
    },
];

interface Props {
    onAdd: (entry: PaletteEntry) => void;
}

export function NodePalette({onAdd}: Props) {
    const [search, setSearch] = useState("");
    const q = search.toLowerCase();

    const filtered = ENTRIES.map((g) => ({
        ...g,
        items: g.items.filter((i) =>
            !q || i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)
        ),
    })).filter((g) => g.items.length > 0);

    return (
        <div className="flex flex-col h-full flex-shrink-0"
             style={{width: 200, borderRight: "1px solid #111", backgroundColor: "#0a0a0a"}}>

            <div className="flex-shrink-0 px-2 py-2" style={{borderBottom: "1px solid #111"}}>
                <input
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search nodes…"
                    style={{
                        width: "100%", fontSize: 11, backgroundColor: "#111", color: "#c0c0c0",
                        border: "1px solid #1a1a1a", borderRadius: 4, padding: "4px 8px", outline: "none",
                    }}
                />
            </div>

            <div className="flex-1 overflow-y-auto">
                {filtered.map((g) => (
                    <div key={g.group}>
                        <p className="px-3 pt-3 pb-1"
                           style={{
                               fontSize: 9, fontWeight: 700, color: "#333",
                               textTransform: "uppercase", letterSpacing: "0.08em"
                           }}>
                            {g.group}
                        </p>
                        {g.items.map((item) => {
                            const color = NODE_COLORS[item.kind];
                            return (
                                <button key={item.label}
                                        onClick={() => onAdd(item)}
                                        className="w-full flex items-start gap-2 px-3 py-2 text-left"
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = "#111";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = "transparent";
                                        }}>
                  <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      backgroundColor: color, flexShrink: 0, marginTop: 3,
                  }}/>
                                    <div>
                                        <p style={{
                                            fontSize: 11, color: "#c0c0c0", margin: 0,
                                            fontFamily: '"JetBrains Mono","Fira Code",monospace'
                                        }}>
                                            {item.label}
                                        </p>
                                        <p style={{fontSize: 10, color: "#444", margin: 0, marginTop: 1}}>
                                            {item.desc}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
