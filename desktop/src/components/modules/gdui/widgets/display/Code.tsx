import {useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";

export function Code({node}: { node: LayoutNode }) {
    const {state} = useModulePageContext();
    const {data} = useEval(node.code_expr, state);
    const [copied, setCopied] = useState(false);

    const text = node.code_expr
        ? (data !== null && data !== undefined ? String(data) : "")
        : (node.code_value ?? "");

    const handleCopy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }).catch(() => {
        });
    };

    return (
        <div style={{
            position: "relative",
            backgroundColor: "#0d0d0d",
            border: "1px solid #1e1e1e",
            borderRadius: 6,
            padding: "8px 12px",
            fontFamily: "monospace",
            fontSize: 12,
            color: "#c0c0c0",
            wordBreak: "break-all",
            whiteSpace: node.code_wrap ? "pre-wrap" : "pre",
            overflow: "auto",
        }}>
            {text}
            {node.code_copyable && (
                <button
                    onClick={handleCopy}
                    title={copied ? "Copied!" : "Copy"}
                    style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        background: copied ? "#14532d" : "#1e1e1e",
                        border: "1px solid #333",
                        borderRadius: 4,
                        color: copied ? "#86efac" : "#555",
                        fontSize: 10,
                        padding: "2px 6px",
                        cursor: "pointer",
                        transition: "background 0.2s, color 0.2s",
                    }}
                >
                    {copied ? "✓" : "copy"}
                </button>
            )}
        </div>
    );
}
