import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useAction} from "../../hooks/useAction";
import {ActionBtn} from "../inputs/ActionBtn";

export function Table({node}: { node: LayoutNode }) {
    const {state, setState} = useModulePageContext();
    const {dispatch, busy} = useAction();

    const {data, loading, error} = useEval(node.table_data_expr, state);
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    const cols = node.table_columns ?? [];
    const selKey = node.table_selection_key;

    const getCellDisplay = (val: unknown, type?: string) => {
        if (val === null || val === undefined) return <span style={{color: "#2a2a2a"}}>—</span>;
        if (type === "badge") {
            return (
                <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
                    padding: "2px 6px", borderRadius: 3,
                    backgroundColor: "#1a1a1a", border: "1px solid #222", color: "#555",
                    textTransform: "uppercase" as const,
                }}>
                    {String(val)}
                </span>
            );
        }
        if (type === "number") {
            return <span style={{fontVariantNumeric: "tabular-nums"}}>{String(val)}</span>;
        }
        return String(val);
    };

    if (loading && rows.length === 0) {
        return <div style={{padding: 12, fontSize: 11, color: "#333"}}>Loading…</div>;
    }

    if (error && rows.length === 0) {
        return (
            <div style={{padding: 20, textAlign: "center", fontSize: 11, color: "#f87171"}}>
                Failed to load data: {error}
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div style={{padding: 20, textAlign: "center", fontSize: 11, color: "#333"}}>
                {node.table_empty ?? "No data"}
            </div>
        );
    }

    return (
        <div style={{overflowX: "auto", width: "100%"}}>
            <table style={{
                width: "100%", borderCollapse: "collapse",
                fontSize: 12, tableLayout: "auto" as const,
            }}>
                <thead>
                <tr style={{borderBottom: "1px solid #1a1a1a"}}>
                    {cols.map(c => (
                        <th key={c.key} style={{
                            padding: "5px 10px", textAlign: "left",
                            fontSize: 10, fontWeight: 600,
                            color: "#3a3a3a", letterSpacing: "0.04em", textTransform: "uppercase" as const,
                            whiteSpace: "nowrap" as const,
                        }}>
                            {c.label}
                        </th>
                    ))}
                    {(node.table_row_actions?.length ?? 0) > 0 && <th/>}
                </tr>
                </thead>
                <tbody>
                {rows.map((row, i) => {
                    const isSelected = selKey && state[selKey] === row;
                    return (
                        <tr
                            key={i}
                            onClick={() => {
                                if (selKey) setState(selKey, row);
                            }}
                            style={{
                                borderBottom: "1px solid #111",
                                backgroundColor: isSelected ? "#141414" : "transparent",
                                cursor: selKey ? "pointer" : "default",
                                transition: "background-color 0.1s",
                            }}
                            onMouseEnter={e => {
                                if (!isSelected) e.currentTarget.style.backgroundColor = "#0e0e0e";
                            }}
                            onMouseLeave={e => {
                                if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                            }}
                        >
                            {cols.map(c => (
                                <td key={c.key} style={{
                                    padding: "6px 10px", color: "#999",
                                    maxWidth: 200, overflow: "hidden",
                                    textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                                }}>
                                    {getCellDisplay(row[c.key], c.type)}
                                </td>
                            ))}
                            {(node.table_row_actions?.length ?? 0) > 0 && (
                                <td style={{padding: "4px 8px", textAlign: "right" as const}}>
                                    <div style={{display: "flex", gap: 4, justifyContent: "flex-end"}}>
                                        {node.table_row_actions!.map((a, j) => {
                                            const argVal = a.arg_field ? String(row[a.arg_field] ?? "") : undefined;
                                            return (
                                                <ActionBtn
                                                    key={j}
                                                    label={a.label}
                                                    icon={a.icon}
                                                    style={a.style}
                                                    small
                                                    disabled={!!busy}
                                                    onClick={() => dispatch(a.action_key, argVal ? [argVal] : a.args)}
                                                />
                                            );
                                        })}
                                    </div>
                                </td>
                            )}
                        </tr>
                    );
                })}
                </tbody>
            </table>
        </div>
    );
}
