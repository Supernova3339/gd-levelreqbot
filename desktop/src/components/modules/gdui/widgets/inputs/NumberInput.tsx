import {useEffect, useRef} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useAction} from "../../hooks/useAction";

export function NumberInput({node}: { node: LayoutNode }) {
    const {state, setState} = useModulePageContext();
    const {dispatch} = useAction();
    const key = node.numInput_key ?? "";
    const min = node.numInput_min ?? -Infinity;
    const max = node.numInput_max ?? Infinity;
    const step = node.numInput_step ?? 1;
    const inited = useRef(false);

    const {data: initVal} = useEval(node.numInput_value_expr, state);

    useEffect(() => {
        if (!inited.current && initVal !== null && initVal !== undefined && key && state[key] === undefined) {
            inited.current = true;
            setState(key, Number(initVal));
        }
    }, [initVal, key, state, setState]);

    const current = key ? Number(state[key] ?? 0) : 0;

    const clamp = (v: number) => Math.min(max === Infinity ? v : max, Math.max(min === -Infinity ? v : min, v));

    const commit = (val: number) => {
        const clamped = clamp(val);
        if (key) setState(key, clamped);
        if (node.numInput_action_key) dispatch(node.numInput_action_key, [String(clamped)]);
    };

    const btnStyle = (disabled: boolean) => ({
        width: 28,
        height: 28,
        borderRadius: 4,
        border: "1px solid #333",
        backgroundColor: "#1e1e1e",
        color: disabled ? "#333" : "#888",
        fontSize: 16,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        flexShrink: 0,
    });

    const atMin = current <= (min === -Infinity ? current - 1 : min);
    const atMax = current >= (max === Infinity ? current + 1 : max);

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 4}}>
            {node.numInput_label && (
                <label style={{fontSize: 11, color: "#666", fontWeight: 500}}>
                    {node.numInput_label}
                </label>
            )}
            <div style={{display: "flex", alignItems: "center", gap: 4}}>
                <button style={btnStyle(atMin)} onClick={() => commit(current - step)} disabled={atMin}>−</button>
                <input
                    type="number"
                    value={current}
                    min={min === -Infinity ? undefined : min}
                    max={max === Infinity ? undefined : max}
                    step={step}
                    onChange={e => setState(key, Number(e.target.value))}
                    onBlur={e => commit(Number(e.target.value))}
                    style={{
                        width: 64,
                        textAlign: "center",
                        backgroundColor: "#111",
                        color: "#ccc",
                        border: "1px solid #2a2a2a",
                        borderRadius: 5,
                        padding: "4px 8px",
                        fontSize: 12,
                        outline: "none",
                    }}
                />
                <button style={btnStyle(atMax)} onClick={() => commit(current + step)} disabled={atMax}>+</button>
            </div>
        </div>
    );
}
