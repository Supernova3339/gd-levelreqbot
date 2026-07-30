import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

const VARIANT_STYLES: Record<string, { bg: string; color: string; border: string }> = {
    default: {bg: "#1e1e1e", color: "#999", border: "#333"},
    accent: {
        bg: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
        color: "var(--color-accent)",
        border: "color-mix(in srgb, var(--color-accent) 30%, transparent)"
    },
    success: {bg: "#0f3a1f", color: "#4ade80", border: "#1a4a2a"},
    warn: {bg: "#2a1e00", color: "#fbbf24", border: "#3a2800"},
    danger: {bg: "#2a0f0f", color: "#f87171", border: "#3a1515"},
};

export function TagList({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data} = useEval(node.taglist_expr, state);
    const variant = node.taglist_variant ?? "default";
    const s = VARIANT_STYLES[variant] ?? VARIANT_STYLES.default;

    const tags: string[] = Array.isArray(data)
        ? data.map(t => String(t))
        : (typeof data === "string" && data ? [data] : []);

    if (tags.length === 0) {
        return node.taglist_empty
            ? <span style={{fontSize: 11, color: "#444"}}>{node.taglist_empty}</span>
            : null;
    }

    return (
        <div style={{display: "flex", flexWrap: "wrap", gap: 5}}>
            {tags.map((tag, i) => (
                <span key={i} style={{
                    padding: "2px 8px",
                    borderRadius: 100,
                    fontSize: 11,
                    fontWeight: 500,
                    backgroundColor: s.bg,
                    color: s.color,
                    border: `1px solid ${s.border}`,
                    whiteSpace: "nowrap",
                }}>
                    {tag}
                </span>
            ))}
        </div>
    );
}
