import type {LayoutNode} from "../../../../../lib/types";
import {NodeRenderer} from "../NodeRenderer";

export function TwoColumn({node}: { node: LayoutNode }) {
    return (
        <div style={{display: "flex", height: "100%", overflow: "hidden"}}>
            <div style={{
                width: node.left_width ?? 280,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                borderRight: "1px solid #1c1c1c",
                overflow: "hidden",
            }}>
                {node.left && <NodeRenderer node={node.left}/>}
            </div>
            <div style={{flex: 1, display: "flex", flexDirection: "column", overflow: "hidden"}}>
                {node.right && <NodeRenderer node={node.right}/>}
            </div>
        </div>
    );
}
