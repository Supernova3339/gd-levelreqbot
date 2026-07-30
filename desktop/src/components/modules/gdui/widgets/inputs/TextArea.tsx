import {useEffect, useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useAction} from "../../hooks/useAction";
import {useEval} from "../../hooks/useEval";

export function TextArea({node}: { node: LayoutNode }) {
    const {state, setState} = useModulePageContext();
    const {dispatch} = useAction();
    const {data: initialData} = useEval(node.textarea_value_expr, state);
    const [val, setVal] = useState("");

    useEffect(() => {
        if (initialData !== null && initialData !== undefined) {
            setVal(String(initialData));
        }
    }, [initialData]);

    const stateKey = node.textarea_key as string | undefined;
    const actionKey = node.textarea_action_key as string | undefined;

    const handleChange = (v: string) => {
        setVal(v);
        if (stateKey) setState(stateKey, v);
    };

    const handleBlur = () => {
        if (actionKey) void dispatch(actionKey, [val]);
    };

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 5}}>
            {node.textarea_label && (
                <label style={{fontSize: 11, color: "#555"}}>
                    {node.textarea_label as string}
                </label>
            )}
            <textarea
                value={val}
                onChange={e => handleChange(e.target.value)}
                onBlur={handleBlur}
                placeholder={node.textarea_placeholder as string | undefined}
                rows={(node.textarea_rows as number | undefined) ?? 4}
                style={{
                    width: "100%",
                    backgroundColor: "#0a0a0a",
                    border: "1px solid #1e1e1e",
                    borderRadius: 5,
                    color: "#ccc",
                    fontSize: 12,
                    padding: "8px 10px",
                    resize: "vertical",
                    fontFamily: "inherit",
                    outline: "none",
                    boxSizing: "border-box",
                    lineHeight: 1.6,
                    transition: "border-color 0.15s",
                }}
                onFocus={e => {
                    e.currentTarget.style.borderColor = "#333";
                }}
                onBlurCapture={e => {
                    e.currentTarget.style.borderColor = "#1e1e1e";
                }}
            />
        </div>
    );
}
