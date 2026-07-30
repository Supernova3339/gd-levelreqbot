import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

export function Progress({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();

    const {data: rawValue} = useEval(node.progress_expr, state);
    const {data: rawMax} = useEval(node.progress_max_expr, state);

    const value = typeof rawValue === "number" ? rawValue : 0;
    const max = typeof rawMax === "number" && rawMax > 0 ? rawMax : 100;
    const pct = Math.min(100, Math.max(0, (value / max) * 100));

    const color = node.progress_color ?? "var(--color-accent, #7c3aed)";

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 5}}>
            {(node.progress_label || node.progress_show_value) && (
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                    {node.progress_label && (
                        <span style={{fontSize: 11, color: "#555", fontWeight: 500}}>{node.progress_label}</span>
                    )}
                    {node.progress_show_value && (
                        <span style={{fontSize: 10, color: "#444", fontVariantNumeric: "tabular-nums"}}>
                            {value} / {max}
                        </span>
                    )}
                </div>
            )}
            <div style={{
                height: 6, borderRadius: 3,
                backgroundColor: "#1a1a1a",
                overflow: "hidden",
                position: "relative",
            }}>
                <div style={{
                    height: "100%",
                    width: `${pct}%`,
                    borderRadius: 3,
                    backgroundColor: color,
                    transition: "width 0.3s ease",
                }}/>
            </div>
            {node.progress_show_value && (
                <div style={{display: "flex", justifyContent: "flex-end"}}>
                    <span style={{fontSize: 10, color: "#333"}}>{Math.round(pct)}%</span>
                </div>
            )}
        </div>
    );
}
