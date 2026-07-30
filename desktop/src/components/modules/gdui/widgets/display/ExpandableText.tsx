import {useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

export function ExpandableText({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data} = useEval(node.expand_expr, state);
    const [open, setOpen] = useState(false);

    const text = node.expand_expr
        ? String(data ?? "")
        : String(node.expand_value ?? "");
    const lines = (node.expand_lines as number | undefined) ?? 2;

    if (!text) return null;

    return (
        <div>
            <div style={{
                fontSize: 12,
                color: "#888",
                lineHeight: 1.6,
                overflow: open ? undefined : "hidden",
                display: open ? undefined : "-webkit-box",
                WebkitLineClamp: open ? undefined : lines,
                WebkitBoxOrient: open ? undefined : ("vertical" as const),
            }}>
                {text}
            </div>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    marginTop: 4,
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 11,
                    color: "var(--color-accent, #7c3aed)",
                    cursor: "pointer",
                    opacity: 0.8,
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.opacity = "0.8";
                }}
            >
                {open ? "Show less ↑" : "Show more ↓"}
            </button>
        </div>
    );
}
