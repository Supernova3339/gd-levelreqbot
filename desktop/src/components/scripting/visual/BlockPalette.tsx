import {useState} from "react";
import type {Block, Condition} from "./block-types";

type Category = "Queue" | "User/Role" | "Flow" | "Messages" | "Counter" | "GD API";

interface PaletteEntry {
    label: string;
    category: Category;
    make: () => Block;
}

function uid() {
    return Math.random().toString(36).slice(2);
}

const DEFAULT_COND: Condition = {kind: "call", method: "user.isMod()"};

const ENTRIES: PaletteEntry[] = [
    // Queue
    {
        label: "queue.add(args[0])",
        category: "Queue",
        make: () => ({id: uid(), type: "action", name: "queue.add(args[0])"})
    },
    {label: "queue.next()", category: "Queue", make: () => ({id: uid(), type: "action", name: "queue.next()"})},
    {label: "queue.clear()", category: "Queue", make: () => ({id: uid(), type: "action", name: "queue.clear()"})},
    {
        label: "queue.remove(…)",
        category: "Queue",
        make: () => ({id: uid(), type: "action", name: "queue.remove(args[0])"})
    },
    // User/Role
    {
        label: "require (condition)",
        category: "User/Role",
        make: () => ({id: uid(), type: "require", condition: DEFAULT_COND})
    },
    {
        label: "if (condition)",
        category: "Flow",
        make: () => ({id: uid(), type: "if", condition: DEFAULT_COND, then: [], else: []})
    },
    {label: "stop", category: "Flow", make: () => ({id: uid(), type: "stop"})},
    // Messages
    {label: "say \"…\"", category: "Messages", make: () => ({id: uid(), type: "say", message: ""})},
    {label: "reply \"…\"", category: "Messages", make: () => ({id: uid(), type: "reply", message: ""})},
    // Counter
    {
        label: "counter.inc(\"…\")",
        category: "Counter",
        make: () => ({id: uid(), type: "action", name: 'counter.inc("name")'})
    },
    {
        label: "counter.get(\"…\")",
        category: "Counter",
        make: () => ({id: uid(), type: "action", name: 'counter.get("name")'})
    },
    // GD API
    {
        label: "gd.fetch(args[0])",
        category: "GD API",
        make: () => ({id: uid(), type: "action", name: "gd.fetch(args[0])"})
    },
    {
        label: "gd.isValidId(…)",
        category: "GD API",
        make: () => ({id: uid(), type: "action", name: "gd.isValidId(args[0])"})
    },
];

const CATEGORIES: Category[] = ["Queue", "User/Role", "Flow", "Messages", "Counter", "GD API"];

interface Props {
    onAdd: (b: Block) => void;
}

export function BlockPalette({onAdd}: Props) {
    const [cat, setCat] = useState<Category>("Queue");

    const visible = ENTRIES.filter((e) => e.category === cat);

    return (
        <div className="flex flex-col flex-shrink-0 overflow-hidden"
             style={{width: 180, borderRight: "1px solid #1e1e1e", backgroundColor: "#0a0a0a"}}>

            {/* Category tabs */}
            <div className="flex flex-col gap-0.5 p-2 flex-shrink-0" style={{borderBottom: "1px solid #1e1e1e"}}>
                {CATEGORIES.map((c) => (
                    <button key={c} onClick={() => setCat(c)}
                            className="text-left text-xs px-2 py-1 rounded"
                            style={{
                                backgroundColor: cat === c ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
                                color: cat === c ? "var(--color-accent)" : "#444",
                                cursor: "pointer",
                            }}
                            onMouseEnter={(e) => {
                                if (cat !== c) e.currentTarget.style.color = "#999";
                            }}
                            onMouseLeave={(e) => {
                                if (cat !== c) e.currentTarget.style.color = "#444";
                            }}>
                        {c}
                    </button>
                ))}
            </div>

            {/* Block list */}
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                {visible.map((e) => (
                    <button key={e.label} onClick={() => onAdd(e.make())}
                            className="text-left text-xs px-2 py-1.5 rounded w-full"
                            style={{
                                backgroundColor: "#111", border: "1px solid #1a1a1a", color: "#888",
                                fontFamily: "monospace", cursor: "pointer"
                            }}
                            onMouseEnter={(e2) => {
                                e2.currentTarget.style.borderColor = "var(--color-accent)44";
                                e2.currentTarget.style.color = "#d0d0d0";
                            }}
                            onMouseLeave={(e2) => {
                                e2.currentTarget.style.borderColor = "#1a1a1a";
                                e2.currentTarget.style.color = "#888";
                            }}>
                        {e.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
