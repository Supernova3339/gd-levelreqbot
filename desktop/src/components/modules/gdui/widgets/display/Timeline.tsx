import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

const DOT_COLORS: Record<string, string> = {
    default: "#2a2a2a",
    accent: "var(--color-accent, #7c3aed)",
    success: "#22c55e",
    warn: "#f59e0b",
    danger: "#ef4444",
};

interface TimelineItem {
    label: string;
    sub?: string;
    time?: string;
    color?: string;
}

export function Timeline({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data} = useEval(node.timeline_expr, state);

    const items: TimelineItem[] = Array.isArray(data)
        ? (data as TimelineItem[])
        : [];

    if (items.length === 0) {
        return node.timeline_empty
            ? <span style={{fontSize: 11, color: "#444"}}>{node.timeline_empty as string}</span>
            : null;
    }

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 0}}>
            {items.map((item, i) => {
                const dotColor = DOT_COLORS[item.color ?? "default"] ?? DOT_COLORS.default;
                const isLast = i === items.length - 1;
                return (
                    <div key={i}
                         style={{display: "flex", gap: 10, paddingBottom: isLast ? 0 : 14, position: "relative"}}>
                        {/* Connecting line */}
                        {!isLast && (
                            <div style={{
                                position: "absolute",
                                left: 5,
                                top: 13,
                                bottom: 0,
                                width: 1,
                                backgroundColor: "#1e1e1e",
                            }}/>
                        )}
                        {/* Dot */}
                        <div style={{
                            width: 11,
                            height: 11,
                            borderRadius: "50%",
                            backgroundColor: dotColor,
                            flexShrink: 0,
                            marginTop: 3,
                            border: `1px solid ${dotColor === "#2a2a2a" ? "#333" : dotColor}`,
                            boxShadow: dotColor !== "#2a2a2a" ? `0 0 5px ${dotColor}44` : undefined,
                        }}/>
                        {/* Content */}
                        <div style={{flex: 1, minWidth: 0}}>
                            <div style={{fontSize: 12, color: "#ccc", lineHeight: 1.4}}>
                                {String(item.label ?? "")}
                            </div>
                            {item.sub && (
                                <div style={{fontSize: 11, color: "#555", marginTop: 2, lineHeight: 1.4}}>
                                    {String(item.sub)}
                                </div>
                            )}
                        </div>
                        {/* Timestamp */}
                        {item.time && (
                            <div style={{fontSize: 10, color: "#333", flexShrink: 0, paddingTop: 2}}>
                                {String(item.time)}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
