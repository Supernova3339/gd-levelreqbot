import type {LayoutNode, WidgetAction} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useAction} from "../../hooks/useAction";
import {ActionBtn} from "../inputs/ActionBtn";

export function Toolbar({node}: { node: LayoutNode }) {
    const {state, navigate} = useModulePageContext();
    const {dispatch, busy} = useAction();

    const {data: statusRaw} = useEval(node.status_expr, state);
    const {data: countRaw} = useEval(node.count_expr, state);
    const {data: maxRaw} = useEval(node.max_expr, state);

    const isOpen = !!statusRaw;
    const count = typeof countRaw === "number" ? countRaw : 0;
    const max = typeof maxRaw === "number" ? maxRaw : null;

    const toggleKey = isOpen ? node.status_action_on : node.status_action_off;

    return (
        <div style={{
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: "1px solid #1c1c1c",
            flexShrink: 0,
        }}>
            {/* Open/close toggle */}
            {node.status_expr && (
                <button
                    onClick={() => dispatch(toggleKey ?? "")}
                    disabled={!!busy || !toggleKey}
                    style={{
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        backgroundColor: isOpen ? "#0f3a1f" : "#2a1515",
                        color: isOpen ? "#4ade80" : "#f87171",
                        border: `1px solid ${isOpen ? "#1a5a2f" : "#4a2020"}`,
                        cursor: "pointer",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        transition: "background-color 0.15s",
                    }}
                >
                    <span style={{
                        width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                        backgroundColor: isOpen ? "#4ade80" : "#f87171",
                    }}/>
                    {isOpen
                        ? (node.status_on_label ?? "Open")
                        : (node.status_off_label ?? "Closed")}
                </button>
            )}

            {/* Count badge */}
            {node.count_expr && (
                <span style={{
                    fontSize: 11, color: "#666", flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                    backgroundColor: "#161616",
                    border: "1px solid #1e1e1e",
                    borderRadius: 4, padding: "2px 7px",
                }}>
                    {count}{max != null ? <><span style={{color: "#3a3a3a"}}>/</span>{max}</> : ""}
                </span>
            )}

            <div style={{flex: 1}}/>

            {/* Action buttons */}
            {(node.actions ?? []).map((a: WidgetAction, i: number) => (
                <ActionBtn
                    key={i}
                    label={a.label}
                    icon={a.icon}
                    style={a.style}
                    disabled={a.navigate_to ? false : !!busy}
                    onClick={() => a.navigate_to ? navigate(a.navigate_to) : dispatch(a.action_key, a.args)}
                />
            ))}
        </div>
    );
}
