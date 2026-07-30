import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

const STYLES = {
    info: {bg: "#0a1628", border: "#1e3a5f", color: "#60a5fa", icon: "ℹ"},
    warn: {bg: "#1a1200", border: "#4a3500", color: "#fbbf24", icon: "⚠"},
    error: {bg: "#1a0808", border: "#4a1515", color: "#f87171", icon: "✕"},
    success: {bg: "#051a0a", border: "#0f3a1a", color: "#4ade80", icon: "✓"},
};

export function Alert({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const variant = node.alert_variant ?? "info";
    const s = STYLES[variant] ?? STYLES.info;

    const {data: exprMsg} = useEval(node.alert_expr, state);
    const message = node.alert_expr
        ? (exprMsg !== null && exprMsg !== undefined ? String(exprMsg) : "")
        : (node.alert_message ?? "");

    if (!message) return null;

    return (
        <div style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 6,
            backgroundColor: s.bg,
            border: `1px solid ${s.border}`,
        }}>
            <span style={{color: s.color, fontSize: 12, lineHeight: 1.4, flexShrink: 0, marginTop: 1}}>
                {s.icon}
            </span>
            <div style={{display: "flex", flexDirection: "column", gap: 2}}>
                {node.alert_title && (
                    <span style={{fontSize: 11, fontWeight: 600, color: s.color}}>{node.alert_title}</span>
                )}
                <span style={{fontSize: 11, color: s.color, opacity: node.alert_title ? 0.8 : 1, lineHeight: 1.5}}>
                    {message}
                </span>
            </div>
        </div>
    );
}
