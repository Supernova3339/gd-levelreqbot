import {Fragment} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {resolveLucideIcon} from "../lucide";

type StatDef = { icon?: string; value_expr: string; label?: string; suffix?: string };

// Per-item component so each can call useEval independently (hook rules)
function StatItem({stat}: { stat: StatDef }) {
    const {state} = useModulePageContext();
    const {data} = useEval(stat.value_expr, state);
    const value = data != null ? String(data) : "…";
    const Comp = stat.icon ? resolveLucideIcon(stat.icon) : undefined;
    return (
        <span style={{display: "inline-flex", alignItems: "center", gap: 4}}>
            {typeof Comp === "function" && (
                <span style={{color: "#555", display: "inline-flex", alignItems: "center"}}>
                    <Comp size={11}/>
                </span>
            )}
            <span style={{fontSize: 11, color: "#999", fontVariantNumeric: "tabular-nums"}}>
                {value}
            </span>
            {stat.label && <span style={{fontSize: 11, color: "#555"}}>{stat.label}</span>}
            {stat.suffix && <span style={{fontSize: 11, color: "#444"}}>{stat.suffix}</span>}
        </span>
    );
}

export function StatBar({node}: { node: LayoutNode }) {
    const stats = (node.stat_items ?? []) as StatDef[];
    if (stats.length === 0) return null;
    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "5px 12px", borderBottom: "1px solid #161616",
            flexShrink: 0, minHeight: 28,
        }}>
            {stats.map((stat, i) => (
                <Fragment key={i}>
                    {i > 0 &&
                        <span style={{color: "#252525", userSelect: "none", fontSize: 14, lineHeight: 1}}>·</span>}
                    <StatItem stat={stat}/>
                </Fragment>
            ))}
        </div>
    );
}
