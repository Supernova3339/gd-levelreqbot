import {memo} from "react";
import type {LayoutNode} from "../../../../../lib/types";

const CALLOUT_STYLES = {
    tip: {borderColor: "#22c55e", bg: "#091a10", label: "Tip", labelColor: "#4ade80"},
    note: {borderColor: "#38bdf8", bg: "#091622", label: "Note", labelColor: "#7dd3fc"},
    warning: {borderColor: "#f59e0b", bg: "#1c1200", label: "Warning", labelColor: "#fbbf24"},
    danger: {borderColor: "#ef4444", bg: "#1a0909", label: "Danger", labelColor: "#f87171"},
    info: {borderColor: "#6366f1", bg: "#0e0e1c", label: "Info", labelColor: "#a5b4fc"},
} as const;

type CalloutKind = keyof typeof CALLOUT_STYLES;

export const CalloutBox = memo(function CalloutBox({node}: { node: LayoutNode }) {
    const kind = ((node.callout_kind as string | undefined) ?? "note") as CalloutKind;
    const s = CALLOUT_STYLES[kind] ?? CALLOUT_STYLES.note;
    const title = (node.callout_title as string | undefined) ?? s.label;
    const msg = node.callout_message as string | undefined;

    return (
        <div style={{
            borderLeft: `3px solid ${s.borderColor}`,
            backgroundColor: s.bg,
            borderRadius: "0 6px 6px 0",
            padding: "10px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
        }}>
            <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: s.labelColor,
                lineHeight: 1.4,
            }}>
                {title}
            </div>
            {msg && (
                <div style={{
                    fontSize: 12,
                    color: "#888",
                    lineHeight: 1.6,
                }}>
                    {msg}
                </div>
            )}
        </div>
    );
});
