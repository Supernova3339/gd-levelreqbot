import {memo, useRef, useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {NodeRenderer} from "../NodeRenderer";

export const Tooltip = memo(function Tooltip({node}: { node: LayoutNode }) {
    const [visible, setVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const text = (node.tooltip_text as string | undefined) ?? "";
    const position = (node.tooltip_position as string | undefined) ?? "top";

    const posStyles: Record<string, React.CSSProperties> = {
        top: {bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)"},
        bottom: {top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)"},
        left: {right: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)"},
        right: {left: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)"},
    };

    return (
        <div
            ref={ref}
            style={{position: "relative", display: "inline-flex"}}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            {node.children?.[0] && <NodeRenderer node={node.children[0]}/>}

            {visible && text && (
                <div style={{
                    position: "absolute",
                    ...(posStyles[position] ?? posStyles.top),
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                    borderRadius: 5,
                    padding: "5px 9px",
                    fontSize: 11,
                    color: "#bbb",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    zIndex: 9999,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                    lineHeight: 1.4,
                }}>
                    {text}
                </div>
            )}
        </div>
    );
});
