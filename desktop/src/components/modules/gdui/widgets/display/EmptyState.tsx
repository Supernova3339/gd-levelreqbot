import type {LayoutNode} from "../../../../../lib/types";
import {useAction} from "../../hooks/useAction";
import {resolveLucideIcon} from "../lucide";

export function EmptyState({node}: { node: LayoutNode }) {
    const {dispatch, busy} = useAction();
    const IconComp = resolveLucideIcon(node.empty_icon ?? "inbox");

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "32px 20px",
            color: "#333",
        }}>
            {IconComp && <IconComp size={32} color="#2a2a2a"/>}
            <span style={{fontSize: 12, color: "#444"}}>
                {node.empty_state_message ?? "No items"}
            </span>
            {node.empty_action_key && node.empty_action_label && (
                <button
                    onClick={() => dispatch(node.empty_action_key!)}
                    disabled={busy !== null}
                    style={{
                        marginTop: 4,
                        padding: "5px 14px",
                        borderRadius: 5,
                        fontSize: 12,
                        fontWeight: 500,
                        backgroundColor: "var(--color-accent, #7c3aed)",
                        color: "#fff",
                        border: "none",
                        cursor: busy !== null ? "not-allowed" : "pointer",
                        opacity: busy !== null ? 0.5 : 1,
                    }}
                >
                    {node.empty_action_label}
                </button>
            )}
        </div>
    );
}
