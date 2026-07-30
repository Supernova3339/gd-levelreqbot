import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

function formatValue(raw: unknown, format: string | undefined): string {
    const n = Number(raw);
    switch (format) {
        case "number":
            return isNaN(n) ? String(raw ?? "—") : n.toLocaleString();
        case "percent":
            return isNaN(n) ? "—" : `${(n * 100).toFixed(1)}%`;
        case "duration": {
            if (isNaN(n)) return "—";
            const h = Math.floor(n / 3600);
            const m = Math.floor((n % 3600) / 60);
            const s = n % 60;
            return h > 0
                ? `${h}h ${m}m`
                : m > 0
                    ? `${m}m ${s}s`
                    : `${s}s`;
        }
        default:
            return raw != null ? String(raw) : "—";
    }
}

export function StatCard({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data, loading} = useEval(node.value_expr, state);

    const display = loading && data == null ? "…" : formatValue(data, node.format);

    return (
        <div style={{
            backgroundColor: "#111",
            border: "1px solid #1a1a1a",
            borderRadius: 10,
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
        }}>
            <div style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#e8e8e8",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
                letterSpacing: "-0.5px",
            }}>
                {display}
            </div>
            {node.value_label && (
                <div style={{
                    fontSize: 11,
                    color: "#444",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                }}>
                    {node.value_label}
                </div>
            )}
        </div>
    );
}
