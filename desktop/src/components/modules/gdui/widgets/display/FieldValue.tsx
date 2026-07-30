import type {CSSProperties, ReactNode} from "react";
import type {FieldDef} from "../../../../../lib/types";

const ACCENT: CSSProperties = {
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    backgroundColor: "#1e1e2e",
    color: "var(--color-accent)",
    border: "1px solid #2a2a4a",
};

const RENDERERS: Record<string, (val: unknown) => ReactNode | null> = {
    number: val =>
        <span style={{fontVariantNumeric: "tabular-nums"}}>
            {Number(val).toLocaleString()}
        </span>,

    stars: val => {
        const n = Math.min(Math.max(Number(val), 0), 10);
        if (n === 0) return <span style={{color: "#555", fontSize: 13}}>Unrated</span>;
        const filled = n;
        const empty = 10 - n;
        return (
            <span style={{display: "flex", alignItems: "center", gap: 6}}>
                <span>
                    <span style={{color: "#fbbf24"}}>{"★".repeat(filled)}</span>
                    <span style={{color: "#2a2a2a"}}>{"★".repeat(empty)}</span>
                </span>
                <span style={{color: "#555", fontSize: 11}}>{n}/10</span>
            </span>
        );
    },

    badge: val =>
        <span style={ACCENT}>{String(val)}</span>,

    boolean: val =>
        val ? <span style={ACCENT}>Yes</span> : null,

    image: val =>
        <img src={String(val)} style={{maxWidth: "100%", borderRadius: 6, marginTop: 4}} alt=""/>,

    text: val =>
        <span style={{wordBreak: "break-word"}}>{String(val)}</span>,
};

export function FieldValue({field, value}: { field: FieldDef; value: unknown }) {
    const render = RENDERERS[field.type ?? "text"] ?? RENDERERS.text;
    const content = render(value);
    if (content === null) return null;
    return (
        <div style={{backgroundColor: "#111", borderRadius: 8, padding: "10px 14px", border: "1px solid #1e1e1e"}}>
            <div style={{
                fontSize: 10, color: "#444", fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
            }}>
                {field.label}
            </div>
            <div style={{fontSize: 14, color: "#e0e0e0", fontWeight: 500}}>
                {content}
            </div>
        </div>
    );
}
