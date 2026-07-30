import {memo} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useAction} from "../../hooks/useAction";
import {useEval} from "../../hooks/useEval";

export const SectionHeader = memo(function SectionHeader({node}: { node: LayoutNode }) {
    const {state, setState} = useModulePageContext();
    const {dispatch, busy} = useAction();
    const {data: countData} = useEval(node.section_count_expr, state);

    const label = (node.section_label as string | undefined) ?? "";
    const count = countData !== null && countData !== undefined ? String(countData) : null;
    const actionKey = node.section_action_key as string | undefined;
    const actionLabel = node.section_action_label as string | undefined;
    const collapsible = node.section_collapsible === true;
    const stateKey = node.section_state_key as string | undefined;
    const isOpen = stateKey ? state[stateKey] !== false : true;

    const handleToggle = () => {
        if (collapsible && stateKey) setState(stateKey, !isOpen);
    };

    const handleAction = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (actionKey) void dispatch(actionKey);
    };

    return (
        <div
            onClick={collapsible ? handleToggle : undefined}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 0",
                cursor: collapsible ? "pointer" : undefined,
                userSelect: "none",
            }}
        >
            {collapsible && (
                <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    stroke="#555" strokeWidth="1.5" strokeLinecap="round"
                    style={{
                        transition: "transform 0.15s",
                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                        flexShrink: 0,
                    }}
                >
                    <polyline points="3,2 7,5 3,8"/>
                </svg>
            )}

            <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#555",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                flex: 1,
            }}>
                {label}
            </span>

            {count !== null && (
                <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#444",
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #222",
                    borderRadius: 99,
                    padding: "1px 6px",
                    fontVariantNumeric: "tabular-nums",
                    flexShrink: 0,
                }}>
                    {count}
                </span>
            )}

            {actionKey && actionLabel && (
                <button
                    onClick={handleAction}
                    disabled={!!busy}
                    style={{
                        background: "none",
                        border: "none",
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontSize: 10,
                        color: "#444",
                        cursor: busy ? "not-allowed" : "pointer",
                        flexShrink: 0,
                        transition: "color 0.1s",
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.color = "#888";
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.color = "#444";
                    }}
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
});
