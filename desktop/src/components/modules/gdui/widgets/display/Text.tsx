import type {CSSProperties} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

const STYLE_MAP: Record<string, CSSProperties> = {
    default: {color: "#e4e4e4"},
    title: {color: "#f1f1f1", fontSize: 15, fontWeight: 600},
    subtitle: {color: "#c0c0c0", fontSize: 13, fontWeight: 500},
    muted: {color: "#666"},
    accent: {color: "var(--color-accent, #7c3aed)"},
    error: {color: "#ef4444"},
    code: {
        color: "#c0c0c0", fontFamily: "monospace", backgroundColor: "#1a1a1a",
        padding: "1px 5px", borderRadius: 3
    },
};

export function Text({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data} = useEval(node.text_expr, state);

    const text = node.text_expr
        ? (data !== undefined && data !== null ? String(data) : "")
        : (node.text_value ?? "");

    const base: CSSProperties = STYLE_MAP[node.text_style ?? "default"] ?? STYLE_MAP.default;

    return (
        <span style={{
            ...base,
            fontSize: node.text_size ?? (base.fontSize as number | undefined) ?? 12,
            lineHeight: 1.5,
            overflow: node.text_wrap ? "visible" : "hidden",
            textOverflow: node.text_wrap ? "clip" : "ellipsis",
            whiteSpace: node.text_wrap ? "normal" : "nowrap",
            display: "block",
        }}>
            {text}
        </span>
    );
}
