import type {LayoutNode} from "../../../../../lib/types";

export function Spacer({node}: { node: LayoutNode }) {
    if (node.spacer_size != null) {
        return <div style={{flexShrink: 0, width: node.spacer_size, height: node.spacer_size}}/>;
    }
    return <div style={{flex: 1}}/>;
}
