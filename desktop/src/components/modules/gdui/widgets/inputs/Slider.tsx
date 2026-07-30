import {useEffect, useRef} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useAction} from "../../hooks/useAction";

export function Slider({node}: { node: LayoutNode }) {
    const {state, setState} = useModulePageContext();
    const {dispatch} = useAction();
    const key = node.slider_key ?? "";
    const min = node.slider_min ?? 0;
    const max = node.slider_max ?? 100;
    const step = node.slider_step ?? 1;
    const inited = useRef(false);

    const {data: initVal} = useEval(node.slider_value_expr, state);

    useEffect(() => {
        if (!inited.current && initVal !== null && initVal !== undefined && key && state[key] === undefined) {
            inited.current = true;
            setState(key, Number(initVal));
        }
    }, [initVal, key, state, setState]);

    const rawVal = key ? state[key] : undefined;
    const value = typeof rawVal === "number" ? rawVal : min;
    const pct = max > min ? Math.round(((value - min) / (max - min)) * 100) : 0;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = Number(e.target.value);
        if (key) setState(key, v);
    };

    const handleRelease = () => {
        if (node.slider_action_key) dispatch(node.slider_action_key, [String(value)]);
    };

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 6}}>
            {(node.slider_label || node.slider_key) && (
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                    <label style={{fontSize: 11, color: "#666", fontWeight: 500}}>
                        {node.slider_label ?? node.slider_key}
                    </label>
                    <span style={{fontSize: 11, color: "#555", fontVariantNumeric: "tabular-nums"}}>
                        {value} <span style={{color: "#333"}}>/ {max}</span>
                        {pct > 0 && <span style={{color: "#2a2a2a", marginLeft: 4}}>({pct}%)</span>}
                    </span>
                </div>
            )}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={handleChange}
                onMouseUp={handleRelease}
                onTouchEnd={handleRelease}
                style={{
                    width: "100%",
                    accentColor: "var(--color-accent, #7c3aed)",
                    cursor: "pointer",
                    height: 4,
                }}
            />
        </div>
    );
}
