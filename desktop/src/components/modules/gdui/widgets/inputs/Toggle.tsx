import {useEffect, useRef} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useAction} from "../../hooks/useAction";

export function Toggle({node}: { node: LayoutNode }) {
    const {state, setState} = useModulePageContext();
    const {dispatch} = useAction();
    const key = node.toggle_key ?? "";
    const inited = useRef(false);

    const {data: initVal} = useEval(node.toggle_value_expr, state);

    useEffect(() => {
        if (!inited.current && initVal !== null && initVal !== undefined && key && state[key] === undefined) {
            inited.current = true;
            setState(key, !!initVal);
        }
    }, [initVal, key, state, setState]);

    const checked = key ? Boolean(state[key]) : false;

    const handleToggle = () => {
        const next = !checked;
        if (key) setState(key, next);
        if (node.toggle_action_key) {
            dispatch(node.toggle_action_key, [String(next)]);
        }
    };

    return (
        <div style={{display: "flex", alignItems: "center", gap: 10, cursor: "pointer"}}
             onClick={handleToggle}>
            {/* Track */}
            <div style={{
                width: 36,
                height: 20,
                borderRadius: 100,
                backgroundColor: checked ? "var(--color-accent, #7c3aed)" : "#2a2a2a",
                border: `1px solid ${checked ? "transparent" : "#333"}`,
                position: "relative",
                flexShrink: 0,
                transition: "background-color 0.2s",
            }}>
                {/* Thumb */}
                <div style={{
                    position: "absolute",
                    top: 2,
                    left: checked ? 16 : 2,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    backgroundColor: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                    transition: "left 0.2s",
                }}/>
            </div>
            {node.toggle_label && (
                <span style={{fontSize: 12, color: "#aaa", userSelect: "none"}}>
                    {node.toggle_label}
                </span>
            )}
        </div>
    );
}
