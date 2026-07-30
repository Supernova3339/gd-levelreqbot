import {useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {NodeRenderer} from "../NodeRenderer";
import {resolveLucideIcon} from "../lucide";

const TRIGGER_STYLES: Record<string, { bg: string; color: string; border: string }> = {
    ghost: {bg: "transparent", color: "#aaa", border: "1px solid #333"},
    primary: {bg: "var(--color-accent, #7c3aed)", color: "#fff", border: "none"},
    danger: {bg: "#7f1d1d", color: "#fca5a5", border: "none"},
    default: {bg: "#222", color: "#ddd", border: "1px solid #333"},
};

export function Drawer({node}: { node: LayoutNode }) {
    const [open, setOpen] = useState(false);

    const triggerVariant = node.drawer_trigger_variant ?? "default";
    const ts = TRIGGER_STYLES[triggerVariant] ?? TRIGGER_STYLES.default;

    let iconEl: React.ReactNode = null;
    if (node.drawer_trigger_icon) {
        const Icon = resolveLucideIcon(node.drawer_trigger_icon);
        if (Icon) iconEl = <Icon size={13}/>;
    }

    const content = (node.children as LayoutNode[] | undefined)?.[0];

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                style={{
                    ...ts,
                    display: "flex", alignItems: "center", gap: iconEl ? 6 : 0,
                    padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                    cursor: "pointer", flexShrink: 0, lineHeight: 1.4,
                }}
            >
                {iconEl}
                {node.drawer_trigger_label ?? "Open"}
            </button>

            {/* Backdrop */}
            {open && (
                <div
                    onClick={() => setOpen(false)}
                    style={{
                        position: "fixed", inset: 0, zIndex: 200,
                        backgroundColor: "rgba(0,0,0,0.6)",
                        backdropFilter: "blur(2px)",
                    }}
                />
            )}

            {/* Drawer panel */}
            <div style={{
                position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201,
                width: 360, maxWidth: "90vw",
                backgroundColor: "#111",
                borderLeft: "1px solid #1e1e1e",
                display: "flex", flexDirection: "column",
                transform: open ? "translateX(0)" : "translateX(100%)",
                transition: "transform 0.2s ease",
                boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.5)" : "none",
            }}>
                {/* Drawer header */}
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", borderBottom: "1px solid #1a1a1a", flexShrink: 0,
                }}>
                    <span style={{fontSize: 13, fontWeight: 600, color: "#bbb"}}>
                        {node.drawer_title ?? node.drawer_trigger_label ?? "Panel"}
                    </span>
                    <button
                        onClick={() => setOpen(false)}
                        style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "#555", fontSize: 16, lineHeight: 1, padding: "2px 6px", borderRadius: 3,
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.color = "#999";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.color = "#555";
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Drawer content */}
                <div style={{flex: 1, overflow: "auto", padding: 16}}>
                    {content && <NodeRenderer node={content}/>}
                </div>
            </div>
        </>
    );
}
