import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useAction} from "../../hooks/useAction";

export function RadioGroup({node}: { node: LayoutNode }) {
    const {state, setState} = useModulePageContext();
    const {dispatch} = useAction();
    const key = node.radio_key ?? "";
    const current = key ? String(state[key] ?? "") : "";

    const {data: dynamicOptions} = useEval(node.radio_options_expr, state);

    const options: Array<{ value: string; label: string }> =
        Array.isArray(dynamicOptions)
            ? (dynamicOptions as Array<{ value: unknown; label: unknown }>).map(o => ({
                value: String(o.value ?? ""),
                label: String(o.label ?? o.value ?? ""),
            }))
            : (node.radio_options ?? []);

    const handleChange = (val: string) => {
        if (key) setState(key, val);
        if (node.radio_action_key) dispatch(node.radio_action_key, [val]);
    };

    const direction = node.radio_direction ?? "vertical";

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 6}}>
            {node.radio_label && (
                <label style={{fontSize: 11, color: "#666", fontWeight: 500}}>{node.radio_label}</label>
            )}
            <div style={{
                display: "flex",
                flexDirection: direction === "horizontal" ? "row" : "column",
                flexWrap: direction === "horizontal" ? "wrap" : "nowrap",
                gap: direction === "horizontal" ? 12 : 8,
            }}>
                {options.map(opt => {
                    const isChecked = current === opt.value;
                    return (
                        <label
                            key={opt.value}
                            style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer"}}
                            onClick={() => handleChange(opt.value)}
                        >
                            <div style={{
                                width: 16,
                                height: 16,
                                borderRadius: "50%",
                                border: `1.5px solid ${isChecked ? "var(--color-accent, #7c3aed)" : "#444"}`,
                                backgroundColor: "transparent",
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}>
                                {isChecked && (
                                    <div style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: "50%",
                                        backgroundColor: "var(--color-accent, #7c3aed)",
                                    }}/>
                                )}
                            </div>
                            <span style={{fontSize: 12, color: "#aaa", userSelect: "none"}}>
                                {opt.label}
                            </span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
}
