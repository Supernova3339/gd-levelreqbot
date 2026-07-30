import {useEffect, useRef, useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {evalModulePanelData} from "../../../../../lib/commands";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useAction} from "../../hooks/useAction";

export function Input({node}: { node: LayoutNode }) {
    const {moduleId, state, setState} = useModulePageContext();
    const {dispatch} = useAction();
    const key = node.input_key ?? "";
    const inited = useRef(false);

    const {data: initVal} = useEval(node.input_value_expr, state);

    // Set initial value from Rhai expr on mount
    useEffect(() => {
        if (!inited.current && initVal !== null && initVal !== undefined && key && state[key] === undefined) {
            inited.current = true;
            setState(key, initVal);
        }
    }, [initVal, key, state, setState]);

    const rawVal = key ? state[key] : undefined;
    const value = rawVal !== undefined ? String(rawVal) : "";
    const [localVal, setLocalVal] = useState(value);

    // Sync from page state when it changes externally
    useEffect(() => {
        setLocalVal(value);
    }, [value]);

    // Blur only syncs state — it does NOT dispatch actionKey. If it did, clicking
    // a nearby "Add"-style button after typing would double-dispatch: the browser
    // fires this element's blur before the button's own click, so both would fire.
    const commitState = () => {
        if (key) setState(key, node.input_type === "number" ? Number(localVal) : localVal);
    };

    // Enter is the one unambiguous "submit" signal.
    const submit = () => {
        commitState();
        if (!node.input_action_key) return;
        const actionKey = node.input_action_key;
        const submittedVal = localVal;
        (async () => {
            const ok = await dispatch(actionKey, [submittedVal]);
            if (ok && node.input_after_state_key && node.input_after_state_expr) {
                try {
                    const result = await evalModulePanelData(moduleId, node.input_after_state_expr, state);
                    setState(node.input_after_state_key, result);
                } catch {
                    // non-fatal — the action itself already succeeded
                }
            }
        })();
    };

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 4}}>
            {node.input_label && (
                <label style={{fontSize: 11, color: "#666", fontWeight: 500}}>{node.input_label}</label>
            )}
            <input
                type={node.input_type ?? "text"}
                value={localVal}
                placeholder={node.input_placeholder}
                min={node.input_min}
                max={node.input_max}
                onChange={e => {
                    setLocalVal(e.target.value);
                    if (key) setState(key, node.input_type === "number" ? Number(e.target.value) : e.target.value);
                }}
                onKeyDown={e => {
                    if (e.key === "Enter") submit();
                }}
                onBlur={commitState}
                style={{
                    backgroundColor: "#111",
                    color: "#ccc",
                    border: "1px solid #2a2a2a",
                    borderRadius: 5,
                    padding: "5px 8px",
                    fontSize: 12,
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box" as const,
                }}
                onFocus={e => {
                    e.target.style.borderColor = "var(--color-accent, #7c3aed)";
                }}
            />
        </div>
    );
}
