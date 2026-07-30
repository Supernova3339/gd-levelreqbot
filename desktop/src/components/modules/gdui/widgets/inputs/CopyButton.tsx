import {useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

export function CopyButton({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data} = useEval(node.copy_value_expr, state);
    const [copied, setCopied] = useState(false);

    const text = node.copy_value_expr
        ? (data !== null && data !== undefined ? String(data) : "")
        : (node.copy_value ?? "");

    const handleCopy = () => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        }).catch(() => {
        });
    };

    const variant = node.copy_variant ?? "default";
    const STYLES: Record<string, { bg: string; color: string; border: string }> = {
        default: {bg: "#1e1e1e", color: "#aaa", border: "#333"},
        accent: {
            bg: "color-mix(in srgb, var(--color-accent) 20%, transparent)",
            color: "var(--color-accent)",
            border: "color-mix(in srgb, var(--color-accent) 40%, transparent)"
        },
    };
    const s = STYLES[copied ? "success" : variant] ?? STYLES.default;
    const successStyle = {bg: "#0f3a1f", color: "#4ade80", border: "#1a4a2a"};
    const cs = copied ? successStyle : s;

    return (
        <button
            onClick={handleCopy}
            disabled={!text}
            title={copied ? "Copied!" : `Copy: ${text}`}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: 5,
                fontSize: 12,
                fontWeight: 500,
                backgroundColor: cs.bg,
                color: cs.color,
                border: `1px solid ${cs.border}`,
                cursor: !text ? "not-allowed" : "pointer",
                opacity: !text ? 0.4 : 1,
                transition: "background 0.2s, color 0.2s, border-color 0.2s",
            }}
        >
            {copied ? (
                <>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                              strokeLinejoin="round"/>
                    </svg>
                    Copied!
                </>
            ) : (
                <>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="4" y="1" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M1 4H3V11H8V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                    {node.copy_label ?? "Copy"}
                </>
            )}
        </button>
    );
}
