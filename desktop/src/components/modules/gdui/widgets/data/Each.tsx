import type {LayoutNode} from "../../../../../lib/types";
import {ScopeProvider, useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {NodeRenderer} from "../NodeRenderer";

export function Each({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data} = useEval(node.items_expr, state);

    if (!Array.isArray(data) || !node.item_template) return null;

    const itemVar = node.item_var ?? "item";
    const keyField = node.item_key_field;
    const template = node.item_template;

    return (
        <>
            {data.map((item, index) => {
                const key = keyField && item != null && typeof item === "object"
                    ? String((item as Record<string, unknown>)[keyField] ?? index)
                    : String(index);

                const extra: Record<string, unknown> = {
                    [itemVar]: item,
                    [`${itemVar}_index`]: index,
                };

                return (
                    <ScopeProvider key={key} extra={extra}>
                        <NodeRenderer node={template}/>
                    </ScopeProvider>
                );
            })}
        </>
    );
}
