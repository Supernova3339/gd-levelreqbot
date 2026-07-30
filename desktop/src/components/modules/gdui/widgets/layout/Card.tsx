import {memo} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {NodeRenderer} from "../NodeRenderer";

export const Card = memo(function Card({node}: { node: LayoutNode }) {
    return (
        <div style={{
            backgroundColor: "#0d0d0d",
            border: "1px solid #1c1c1c",
            borderRadius: 8,
            padding: node.card_padding ?? 14,
            display: "flex",
            flexDirection: "column",
            gap: node.card_gap ?? 10,
        }}>
            {node.card_title && (
                <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#555",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid #1a1a1a",
                    paddingBottom: 8,
                    marginBottom: 2,
                }}>
                    {node.card_title as string}
                </div>
            )}
            {node.children?.map((c, i) => <NodeRenderer key={i} node={c}/>)}
        </div>
    );
});
