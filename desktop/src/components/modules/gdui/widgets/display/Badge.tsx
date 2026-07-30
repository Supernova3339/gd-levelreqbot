import type {CSSProperties} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

const VARIANT_STYLES: Record<string, CSSProperties> = {
    default: {backgroundColor: "#2a2a2a", color: "#aaa", border: "1px solid #333"},
    success: {backgroundColor: "#14532d22", color: "#86efac", border: "1px solid #14532d"},
    warn: {backgroundColor: "#78350f22", color: "#fde68a", border: "1px solid #78350f"},
    danger: {backgroundColor: "#7f1d1d22", color: "#fca5a5", border: "1px solid #7f1d1d"},
    accent: {
        backgroundColor: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
        color: "var(--color-accent, #7c3aed)",
        border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)"
    },
};

export function Badge({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data} = useEval(node.badge_expr, state);

    const text = node.badge_expr
        ? (data !== undefined && data !== null ? String(data) : "")
        : (node.badge_value ?? "");

    const base = VARIANT_STYLES[node.badge_variant ?? "default"] ?? VARIANT_STYLES.default;
    const style: CSSProperties = node.badge_color
        ? {
            backgroundColor: `${node.badge_color}22`, color: node.badge_color,
            border: `1px solid ${node.badge_color}55`
        }
        : base;

    return (
        <span style={{
            ...style,
            fontSize: 11,
            fontWeight: 500,
            padding: "2px 7px",
            borderRadius: 99,
            display: "inline-block",
            lineHeight: 1.6,
            whiteSpace: "nowrap",
        }}>
            {text}
        </span>
    );
}
