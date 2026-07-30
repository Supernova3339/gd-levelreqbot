import {type CSSProperties, memo} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {NodeRenderer} from "../NodeRenderer";

// Single div doing double duty as both the scroll container AND the flex
// layout for its children (gap, column direction) — mirrors List.tsx's
// working scroll container exactly, rather than nesting a separate
// scrolling div around a separate flex-layout div.
export const ScrollArea = memo(function ScrollArea({node}: { node: LayoutNode }) {
    const base: CSSProperties = {
        display: "flex",
        flexDirection: "column",
        gap: node.scroll_gap ?? 0,
        overflowY: "auto",
        overflowX: "hidden",
        scrollbarWidth: "thin",
        scrollbarColor: "#2a2a2a transparent",
    };
    const style: CSSProperties = node.scroll_fill
        ? {...base, flex: 1, minHeight: 0}
        : {...base, maxHeight: node.scroll_max_height ?? 300};

    return (
        <div style={style}>
            {node.children?.map((c, i) => <NodeRenderer key={i} node={c}/>)}
        </div>
    );
});
