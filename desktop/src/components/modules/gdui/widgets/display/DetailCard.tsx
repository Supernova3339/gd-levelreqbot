import type {FieldDef, LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {FieldValue} from "./FieldValue";

function Placeholder({text}: { text: string }) {
    return (
        <div style={{flex: 1, display: "flex", alignItems: "center", justifyContent: "center"}}>
            <p style={{fontSize: 12, color: "#555", textAlign: "center", maxWidth: 220, lineHeight: 1.6}}>
                {text}
            </p>
        </div>
    );
}

export function DetailCard({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data, loading} = useEval(node.data_expr, state);
    const fields = node.fields ?? [];

    // No expression configured → static placeholder
    if (!node.data_expr) {
        return <Placeholder text={node.placeholder ?? "Select an item to view details."}/>;
    }

    // Waiting for selection or data
    if (data === null && !loading) {
        return <Placeholder text={node.placeholder ?? "Select an item to view details."}/>;
    }

    if (loading && !data) {
        return <Placeholder text="Loading…"/>;
    }

    const record =
        typeof data === "object" && data !== null && !Array.isArray(data)
            ? (data as Record<string, unknown>)
            : null;

    if (!record) {
        return <Placeholder text={node.placeholder ?? "Select an item to view details."}/>;
    }

    return (
        <div style={{padding: 16}}>
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 12,
            }}>
                {fields.map((f: FieldDef) => {
                    const val = record[f.key];
                    if (val === null || val === undefined) return null;
                    return <FieldValue key={f.key} field={f} value={val}/>;
                })}
            </div>
        </div>
    );
}
