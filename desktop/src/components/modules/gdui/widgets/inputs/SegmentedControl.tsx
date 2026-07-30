import type {LayoutNode, SelectOption} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useAction} from "../../hooks/useAction";
import {useEval} from "../../hooks/useEval";

export function SegmentedControl({node}: { node: LayoutNode }) {
    const {state, setState} = useModulePageContext();
    const {dispatch, busy} = useAction();
    const {data: optsData} = useEval(node.segment_options_expr, state);

    const stateKey = node.segment_key as string | undefined ?? "";
    const current = state[stateKey] as string | undefined;

    const options: SelectOption[] = (() => {
        if (Array.isArray(optsData)) return optsData as SelectOption[];
        return (node.segment_options as SelectOption[] | undefined) ?? [];
    })();

    const handleSelect = (value: string) => {
        if (busy) return;
        setState(stateKey, value);
        if (node.segment_action_key) void dispatch(node.segment_action_key as string, [value]);
    };

    return (
        <div>
            {node.segment_label && (
                <div style={{fontSize: 11, color: "#555", marginBottom: 5}}>
                    {node.segment_label as string}
                </div>
            )}
            <div style={{
                display: "inline-flex",
                gap: 2,
                backgroundColor: "#0a0a0a",
                border: "1px solid #1c1c1c",
                borderRadius: 7,
                padding: 3,
            }}>
                {options.map(opt => {
                    const active = current === opt.value;
                    return (
                        <button
                            key={opt.value}
                            onClick={() => handleSelect(opt.value)}
                            disabled={!!busy}
                            style={{
                                padding: "4px 12px",
                                fontSize: 11,
                                fontWeight: active ? 600 : 400,
                                color: active ? "#e0e0e0" : "#555",
                                backgroundColor: active ? "#1e1e1e" : "transparent",
                                border: active ? "1px solid #2a2a2a" : "1px solid transparent",
                                borderRadius: 5,
                                cursor: busy ? "not-allowed" : "pointer",
                                transition: "all 0.15s",
                                opacity: busy ? 0.5 : 1,
                                whiteSpace: "nowrap",
                            }}
                            onMouseEnter={e => {
                                if (!active && !busy) e.currentTarget.style.color = "#aaa";
                            }}
                            onMouseLeave={e => {
                                if (!active) e.currentTarget.style.color = "#555";
                            }}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
