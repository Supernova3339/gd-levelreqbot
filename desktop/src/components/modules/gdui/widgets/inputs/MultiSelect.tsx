import type {LayoutNode, SelectOption} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

export function MultiSelect({node}: { node: LayoutNode }) {
    const {state, setState} = useModulePageContext();
    const key = node.multi_key ?? "";

    const {data: dynamicOptions} = useEval(node.multi_options_expr, state);

    const options: SelectOption[] =
        Array.isArray(dynamicOptions)
            ? (dynamicOptions as Array<{ value: unknown; label: unknown }>).map(o => ({
                value: String(o.value ?? ""),
                label: String(o.label ?? o.value ?? ""),
            }))
            : (node.multi_options ?? []);

    const rawSelected = key ? state[key] : undefined;
    const selected: string[] = Array.isArray(rawSelected)
        ? (rawSelected as unknown[]).map(String)
        : [];

    const toggle = (value: string) => {
        const next = selected.includes(value)
            ? selected.filter(v => v !== value)
            : [...selected, value];
        if (key) setState(key, next);
    };

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 4}}>
            {node.multi_label && (
                <label style={{fontSize: 11, color: "#666", fontWeight: 500}}>{node.multi_label}</label>
            )}
            <div style={{display: "flex", flexDirection: "column", gap: 2}}>
                {options.map(o => {
                    const checked = selected.includes(o.value);
                    return (
                        <label
                            key={o.value}
                            style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "5px 8px", borderRadius: 5,
                                backgroundColor: checked ? "#1a1a2e" : "#0e0e0e",
                                border: `1px solid ${checked ? "var(--color-accent, #7c3aed)33" : "#1a1a1a"}`,
                                cursor: "pointer", fontSize: 12, color: checked ? "#c4b5fd" : "#666",
                                transition: "background-color 0.1s, border-color 0.1s",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggle(o.value)}
                                style={{accentColor: "var(--color-accent, #7c3aed)", cursor: "pointer"}}
                            />
                            {o.label}
                        </label>
                    );
                })}
            </div>
        </div>
    );
}
