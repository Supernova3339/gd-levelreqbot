import {useEffect, useRef} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useAction} from "../../hooks/useAction";

export function Checkbox({node}: { node: LayoutNode }) {
    const {state, setState} = useModulePageContext();
    const {dispatch} = useAction();
    const key = node.checkbox_key ?? "";
    const inited = useRef(false);

    const {data: initVal} = useEval(node.checkbox_value_expr, state);

    useEffect(() => {
        if (!inited.current && initVal !== null && initVal !== undefined && key && state[key] === undefined) {
            inited.current = true;
            setState(key, !!initVal);
        }
    }, [initVal, key, state, setState]);

    const checked = key ? Boolean(state[key]) : false;

    const handleChange = () => {
        const next = !checked;
        if (key) setState(key, next);
        if (node.checkbox_action_key) dispatch(node.checkbox_action_key, [String(next)]);
    };

    return (
        <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}>
            {/* Custom checkbox box */}
            <div
                onClick={handleChange}
                style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    border: `1.5px solid ${checked ? "var(--color-accent, #7c3aed)" : "#444"}`,
                    backgroundColor: checked ? "var(--color-accent, #7c3aed)" : "transparent",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background-color 0.15s, border-color 0.15s",
                }}
            >
                {checked && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"
                              strokeLinejoin="round"/>
                    </svg>
                )}
            </div>
            {node.checkbox_label && (
                <span style={{fontSize: 12, color: "#aaa", userSelect: "none"}}
                      onClick={handleChange}>
                    {node.checkbox_label}
                </span>
            )}
        </label>
    );
}
