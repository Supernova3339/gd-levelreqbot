import type {LayoutNode} from "../../../../../lib/types";
import {NodeRenderer} from "../NodeRenderer";

function parseCssString(s: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const decl of s.split(";")) {
        const colon = decl.indexOf(":");
        if (colon < 0) continue;
        const prop = decl.slice(0, colon).trim();
        const value = decl.slice(colon + 1).trim();
        if (!prop || !value) continue;
        const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        result[camel] = value;
    }
    return result;
}

export function Stack({node}: { node: LayoutNode }) {
    const horizontal = node.stack_direction === "horizontal";
    const gap = node.stack_gap ?? 0;
    const fill = node.stack_fill === true;
    const padding = node.stack_padding as number | undefined;
    const align = node.stack_align as string | undefined;
    const wrap = node.stack_wrap === true && horizontal;
    const justify = node.stack_justify as string | undefined;
    const styleString = node.stack_style as string | undefined;
    const extraStyle = styleString ? parseCssString(styleString) : {};

    return (
        <div style={{
            display: "flex",
            flexDirection: horizontal ? "row" : "column",
            gap: gap > 0 ? gap : undefined,
            padding: padding ? padding : undefined,
            alignItems: align ?? undefined,
            justifyContent: justify ?? undefined,
            flexWrap: wrap ? "wrap" : undefined,
            // fill=true: grow to fill parent flex space (layout stacks — left/right panels, page roots)
            // fill=false (default): shrink to content height (content stacks — headers, button rows)
            flex: fill ? "1 1 0%" : undefined,
            flexShrink: fill ? undefined : 0,
            minHeight: fill ? 0 : undefined,
            overflow: fill ? "hidden" : undefined,
            ...extraStyle,
        }}>
            {(node.children ?? []).map((child, i) => (
                <NodeRenderer key={i} node={child}/>
            ))}
        </div>
    );
}
