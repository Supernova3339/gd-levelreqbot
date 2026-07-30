import type {LayoutNode} from "../../../../../lib/types";

export function Divider({node}: { node: LayoutNode }) {
    const label = node.divider_label;
    if (!label) {
        return (
            <div style={{
                borderTop: "1px solid #222",
                margin: "6px 0",
            }}/>
        );
    }
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            margin: "8px 0",
        }}>
            <div style={{flex: 1, borderTop: "1px solid #222"}}/>
            <span style={{
                fontSize: 10,
                color: "#555",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.06em"
            }}>
                {label}
            </span>
            <div style={{flex: 1, borderTop: "1px solid #222"}}/>
        </div>
    );
}
