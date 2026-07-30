import {useEffect, useRef} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useAction} from "../../hooks/useAction";

export function Select({node}: { node: LayoutNode }) {
    const {state, setState} = useModulePageContext();
    const {dispatch} = useAction();
    const key = node.select_key ?? "";
    const current = key ? String(state[key] ?? "") : "";
    const inited = useRef(false);

    const {data: dynamicOptions} = useEval(node.select_options_expr, state);
    const {data: initVal} = useEval(node.select_value_expr, state);

    // Set initial value once from Rhai expr
    useEffect(() => {
        if (!inited.current && initVal !== null && initVal !== undefined && key && state[key] === undefined) {
            inited.current = true;
            setState(key, initVal);
        }
    }, [initVal, key, state, setState]);

    const options: Array<{ value: string; label: string }> =
        Array.isArray(dynamicOptions)
            ? (dynamicOptions as Array<{ value: unknown; label: unknown }>).map(o => ({
                value: String(o.value ?? ""),
                label: String(o.label ?? o.value ?? ""),
            }))
            : (node.select_options ?? []);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (key) setState(key, val);
        if (node.select_action_key) {
            dispatch(node.select_action_key, [val]);
        }
    };

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 4}}>
            {node.select_label && (
                <label style={{fontSize: 11, color: "#666", fontWeight: 500}}>{node.select_label}</label>
            )}
            <select
                value={current}
                onChange={handleChange}
                style={{
                    backgroundColor: "#111",
                    color: current ? "#ccc" : "#444",
                    border: "1px solid #2a2a2a",
                    borderRadius: 5,
                    padding: "5px 8px",
                    fontSize: 12,
                    outline: "none",
                    cursor: "pointer",
                    width: "100%",
                    appearance: "none",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5L5 6.5L8 3.5' stroke='%23555' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 8px center",
                    paddingRight: 28,
                }}
            >
                {node.select_placeholder && (
                    <option value="" disabled style={{color: "#444"}}>{node.select_placeholder}</option>
                )}
                {options.map(o => (
                    <option key={o.value} value={o.value} style={{backgroundColor: "#111", color: "#ccc"}}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
