import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

export function ProgressRing({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data: rawValue} = useEval(node.progress_expr, state);
    const {data: rawMax} = useEval(node.progress_max_expr, state);

    const value = typeof rawValue === "number" ? rawValue : 0;
    const max = typeof rawMax === "number" && rawMax > 0 ? rawMax : 100;
    const pct = Math.min(1, Math.max(0, value / max));

    const size = (node.ring_size as number | undefined) ?? 80;
    const stroke = (node.ring_stroke as number | undefined) ?? 6;
    const color = (node.ring_color as string | undefined) ?? "var(--color-accent, #7c3aed)";
    const trackColor = (node.ring_track_color as string | undefined) ?? "#1a1a1a";
    const showValue = node.progress_show_value !== false;

    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - pct);

    const formatted = node.format === "percent"
        ? `${Math.round(pct * 100)}%`
        : String(value);

    return (
        <div style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
        }}>
            <div style={{position: "relative", width: size, height: size}}>
                <svg width={size} height={size} style={{transform: "rotate(-90deg)"}}>
                    {/* Track */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={trackColor}
                        strokeWidth={stroke}
                    />
                    {/* Progress arc */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={color}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        style={{transition: "stroke-dashoffset 0.4s ease"}}
                    />
                </svg>
                {/* Center label */}
                {showValue && (
                    <div style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "column",
                        gap: 2,
                    }}>
                        <span style={{
                            fontSize: Math.round(size * 0.18),
                            fontWeight: 700,
                            color: "#e0e0e0",
                            fontVariantNumeric: "tabular-nums",
                            lineHeight: 1,
                        }}>
                            {formatted}
                        </span>
                    </div>
                )}
            </div>
            {node.progress_label && (
                <span style={{fontSize: 11, color: "#555", textAlign: "center"}}>
                    {node.progress_label}
                </span>
            )}
        </div>
    );
}
