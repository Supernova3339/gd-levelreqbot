import type {LayoutNode} from "../../../../../lib/types";
import {NodeRenderer} from "../NodeRenderer";

export function Grid({node}: { node: LayoutNode }) {
    const cols = node.grid_columns ?? 2;
    const gap = node.grid_gap ?? 12;
    const minWidth = node.grid_min_width as number | undefined;

    // minWidth triggers auto-fit: columns shrink/grow to fit the container
    const colsStr = minWidth
        ? `repeat(auto-fill, minmax(${minWidth}px, 1fr))`
        : typeof cols === "number"
            ? `repeat(${cols}, 1fr)`
            : cols;

    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: colsStr,
            gap,
        }}>
            {(node.children ?? []).map((child, i) => (
                <NodeRenderer key={i} node={child}/>
            ))}
        </div>
    );
}
