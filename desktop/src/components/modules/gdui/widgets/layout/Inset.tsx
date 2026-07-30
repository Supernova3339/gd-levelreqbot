import {memo} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {NodeRenderer} from "../NodeRenderer";

export const Inset = memo(function Inset({node}: { node: LayoutNode }) {
    const raw = node.inset_padding as string | number | undefined;
    // If the value is a number string without units, add px to each part
    const padding = raw == null
        ? "12px 16px"
        : String(raw).replace(/(\d+(\.\d+)?(?!px|em|rem|%|vh|vw))\b/g, "$1px");
    return (
        <div style={{padding, flexShrink: 0}}>
            {(node.children ?? []).map((c, i) => <NodeRenderer key={i} node={c}/>)}
        </div>
    );
});
