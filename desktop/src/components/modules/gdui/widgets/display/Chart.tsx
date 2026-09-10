import {useMemo} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

type Row = Record<string, unknown>;

// Rounds a raw step up to a "nice" 1/2/5 × 10^n value instead of an arbitrary
// integer (e.g. 3, 7, 13) — axis ticks read as round numbers a human would
// actually pick, not whatever Math.ceil(max/4) happened to land on.
function niceStep(raw: number): number {
    if (raw <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / magnitude;
    const rounded = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return rounded * magnitude;
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function BarChart({
                      rows, xKey, yKey, color,
                  }: {
    rows: Row[];
    xKey: string;
    yKey: string;
    color: string;
}) {
    const values = rows.map(r => Number(r[yKey] ?? 0));
    const maxVal = Math.max(...values, 1);
    const W = 480;
    const H = 160;
    const PAD = {top: 10, right: 10, bottom: 36, left: 40};
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;
    const barW = Math.max(2, Math.floor(chartW / rows.length) - 4);

    const yTicks = useMemo(() => {
        const step = niceStep(maxVal / 4);
        return Array.from({length: 5}, (_, i) => i * step);
    }, [maxVal]);
    const niceMax = yTicks[yTicks.length - 1] || maxVal;

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{width: "100%", height: "auto", overflow: "visible"}}
        >
            {/* Y-axis ticks */}
            {yTicks.map(tick => {
                const y = PAD.top + chartH - (tick / niceMax) * chartH;
                return (
                    <g key={tick}>
                        <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
                              stroke="#1c1c1c" strokeWidth={1}/>
                        <text x={PAD.left - 6} y={y + 4} textAnchor="end"
                              fill="#3a3a3a" fontSize={9} fontFamily="monospace">
                            {tick.toLocaleString()}
                        </text>
                    </g>
                );
            })}

            {/* Bars */}
            {rows.map((row, i) => {
                const val = Number(row[yKey] ?? 0);
                const barH = (val / niceMax) * chartH;
                const x = PAD.left + (i * (chartW / rows.length)) + (chartW / rows.length - barW) / 2;
                const y = PAD.top + chartH - barH;
                const label = String(row[xKey] ?? "");

                const rx = Math.min(4, barW / 2, barH / 2);
                return (
                    <g key={i}>
                        <rect x={x} y={y} width={barW} height={barH}
                              fill={color} rx={rx} opacity={0.85}/>
                        <title>{label}: {val.toLocaleString()}</title>
                        {/* X label — truncated */}
                        <text
                            x={x + barW / 2}
                            y={PAD.top + chartH + 14}
                            textAnchor="middle"
                            fill="#3a3a3a"
                            fontSize={9}
                            fontFamily="system-ui, sans-serif"
                        >
                            {label.length > 8 ? label.slice(0, 7) + "…" : label}
                        </text>
                    </g>
                );
            })}

            {/* Y-axis line */}
            <line
                x1={PAD.left} y1={PAD.top}
                x2={PAD.left} y2={PAD.top + chartH}
                stroke="#2a2a2a" strokeWidth={1}
            />
        </svg>
    );
}

// ── Line chart ────────────────────────────────────────────────────────────────

function LineChart({
                       rows, xKey, yKey, color,
                   }: {
    rows: Row[];
    xKey: string;
    yKey: string;
    color: string;
}) {
    const values = rows.map(r => Number(r[yKey] ?? 0));
    const maxVal = Math.max(...values, 1);
    const minVal = Math.min(...values, 0);
    const range = maxVal - minVal || 1;
    const W = 480;
    const H = 120;
    const PAD = {top: 10, right: 10, bottom: 28, left: 36};
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const pts = values.map((v, i) => ({
        x: PAD.left + (i / Math.max(rows.length - 1, 1)) * chartW,
        y: PAD.top + chartH - ((v - minVal) / range) * chartH,
        label: String(rows[i][xKey] ?? ""),
        val: v,
    }));

    const polyline = pts.map(p => `${p.x},${p.y}`).join(" ");
    const area = [
        `M ${pts[0]?.x ?? 0},${PAD.top + chartH}`,
        pts.map(p => `L ${p.x},${p.y}`).join(" "),
        `L ${pts[pts.length - 1]?.x ?? 0},${PAD.top + chartH}`,
        "Z",
    ].join(" ");

    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{width: "100%", height: "auto"}}>
            {/* Area fill */}
            <path d={area} fill={color} opacity={0.08}/>
            {/* Line */}
            <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round"/>
            {/* Points */}
            {pts.map((p, i) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r={3} fill={color}/>
                    <title>{p.label}: {p.val.toLocaleString()}</title>
                </g>
            ))}
        </svg>
    );
}

// ── Chart widget ──────────────────────────────────────────────────────────────

export function Chart({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data, loading} = useEval(node.data_expr, state);

    const rows = Array.isArray(data) ? (data as Row[]).slice(0, 50) : [];
    const xKey = node.x_key ?? "label";
    const yKey = node.y_key ?? "value";
    const color = node.chart_color ?? "var(--color-accent)";

    if (loading && rows.length === 0) {
        return (
            <div style={{padding: "16px 20px", fontSize: 11, color: "#2a2a2a"}}>
                Loading chart…
            </div>
        );
    }

    if (!rows.length) {
        return (
            <div style={{padding: "16px 20px", fontSize: 11, color: "#333", textAlign: "center"}}>
                No data to display
            </div>
        );
    }

    return (
        <div style={{
            margin: "8px 12px",
            backgroundColor: "#0d0d0d",
            border: "1px solid #1a1a1a",
            borderRadius: 10,
            padding: "12px 16px",
            overflow: "hidden",
        }}>
            {node.chart_type === "line"
                ? <LineChart rows={rows} xKey={xKey} yKey={yKey} color={color}/>
                : <BarChart rows={rows} xKey={xKey} yKey={yKey} color={color}/>
            }
        </div>
    );
}
