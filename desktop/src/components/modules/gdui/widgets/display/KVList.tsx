import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

export function KVList({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data} = useEval(node.kvlist_expr, state);

    type KVItem = { key: string; value: unknown; label?: string };

    let items: KVItem[] = [];
    if (Array.isArray(data)) {
        items = data.map(row => {
            if (row && typeof row === "object") {
                const r = row as Record<string, unknown>;
                return {
                    key: String(r.key ?? r.name ?? ""),
                    value: r.value ?? r.val,
                    label: r.label != null ? String(r.label) : undefined
                };
            }
            return {key: String(row), value: ""};
        });
    } else if (data && typeof data === "object") {
        items = Object.entries(data as Record<string, unknown>).map(([k, v]) => ({key: k, value: v}));
    }

    if (items.length === 0) {
        return node.kvlist_empty
            ? <span style={{fontSize: 11, color: "#444"}}>{node.kvlist_empty}</span>
            : null;
    }

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 1}}>
            {node.kvlist_title && (
                <div style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#555",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 6
                }}>
                    {node.kvlist_title}
                </div>
            )}
            {items.map((item, i) => (
                <div key={i} style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    padding: "4px 0",
                    borderBottom: i < items.length - 1 ? "1px solid #131313" : "none",
                }}>
                    <span style={{fontSize: 11, color: "#555", flexShrink: 0, minWidth: 80}}>
                        {item.label ?? item.key}
                    </span>
                    <span style={{fontSize: 12, color: "#ddd", wordBreak: "break-all"}}>
                        {item.value == null ? <span style={{color: "#333"}}>—</span> : String(item.value)}
                    </span>
                </div>
            ))}
        </div>
    );
}
