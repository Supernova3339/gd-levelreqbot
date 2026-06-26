import {useCallback, useRef} from "react";
import type {Edge, Node} from "reactflow";
import type {ScriptNodeData} from "./NodeDefinitions";

type Snap = { nodes: Node<ScriptNodeData>[]; edges: Edge[] };
const MAX = 50;

export function useHistory() {
    const stack = useRef<Snap[]>([]);
    const idx = useRef(-1);
    // Set to true while applying an undo/redo so emit doesn't re-push.
    const busy = useRef(false);

    const push = useCallback((nodes: Node<ScriptNodeData>[], edges: Edge[]) => {
        if (busy.current) return;
        // Discard any redo branch.
        stack.current = stack.current.slice(0, idx.current + 1);
        stack.current.push({
            nodes: JSON.parse(JSON.stringify(nodes)),
            edges: JSON.parse(JSON.stringify(edges)),
        });
        if (stack.current.length > MAX) stack.current.shift();
        idx.current = stack.current.length - 1;
    }, []);

    const travel = useCallback((delta: -1 | 1): Snap | null => {
        const next = idx.current + delta;
        if (next < 0 || next >= stack.current.length) return null;
        idx.current = next;
        return stack.current[next];
    }, []);

    return {push, travel, busy};
}
