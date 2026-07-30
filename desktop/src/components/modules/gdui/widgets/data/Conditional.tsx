import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {NodeRenderer} from "../NodeRenderer";

export function Conditional({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();

    // Client-side state check (no Rhai needed)
    const stateVisible = node.show_key
        ? Boolean(state[node.show_key])
        : undefined;

    const {data: exprResult} = useEval(
        stateVisible === undefined ? node.show_expr : undefined,
        state,
    );

    const visible = stateVisible !== undefined
        ? stateVisible
        : Boolean(exprResult);

    const children = node.children ?? [];
    // First child = "then", second child = optional "else"
    const thenChild = children[0];
    const elseChild = children[1] ?? node.else_child;

    if (visible) {
        return thenChild ? <NodeRenderer node={thenChild}/> : null;
    } else {
        return elseChild ? <NodeRenderer node={elseChild}/> : null;
    }
}
