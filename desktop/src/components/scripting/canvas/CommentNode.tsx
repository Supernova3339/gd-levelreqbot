import {memo, useRef} from "react";
import {Lock, Unlock} from "lucide-react";
import type {NodeProps} from "reactflow";
import type {ScriptNodeData} from "./NodeDefinitions";
import {useNodeUpdate} from "./NodeUpdateContext";

const PALETTE = ["#f59e0b", "#22c55e", "#3b82f6", "#ec4899", "#8b5cf6", "#ef4444", "#06b6d4", "#888"];
const MONO = '"JetBrains Mono","Fira Code",monospace';

function hexRgba(hex: string, a: number): string {
    const h = hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex;
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
}

// ── Shared resize hook ────────────────────────────────────────────────────────

function useResize(id: string, width: number, height: number) {
    const update = useNodeUpdate();
    const origin = useRef<{ mx: number; my: number; w: number; h: number } | null>(null);

    return (e: React.MouseEvent, axis: "both" | "x" | "y") => {
        e.stopPropagation();
        e.preventDefault();
        origin.current = {mx: e.clientX, my: e.clientY, w: width, h: height};
        const move = (me: MouseEvent) => {
            if (!origin.current) return;
            const dx = me.clientX - origin.current.mx;
            const dy = me.clientY - origin.current.my;
            update(id, {
                commentWidth: axis !== "y" ? Math.max(120, origin.current.w + dx) : width,
                commentHeight: axis !== "x" ? Math.max(40, origin.current.h + dy) : height,
            });
        };
        const up = () => {
            origin.current = null;
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
    };
}

// ── Color swatches + lock — shared header controls ────────────────────────────

function HeaderControls({id, color, opacity, locked}: {
    id: string; color: string; opacity: number; locked: boolean;
}) {
    const update = useNodeUpdate();
    return (
        <div className="nodrag flex items-center gap-1.5">
            {PALETTE.map((c) => (
                <button key={c} onClick={() => update(id, {commentColor: c})} style={{
                    width: 8, height: 8, borderRadius: "50%", backgroundColor: c, border: "none",
                    opacity: c === color ? 1 : 0.3, outline: c === color ? `2px solid ${hexRgba(c, 0.5)}` : "none",
                    outlineOffset: 1, cursor: "pointer", flexShrink: 0, padding: 0,
                }}/>
            ))}
            <div style={{flex: 1}}/>
            <input type="range" min={4} max={60} value={Math.round(opacity * 100)}
                   title={`Fill: ${Math.round(opacity * 100)}%`}
                   onChange={(e) => update(id, {commentOpacity: +e.target.value / 100})}
                   style={{width: 44, accentColor: color, cursor: "pointer", margin: 0}}/>
            <button onClick={() => update(id, {commentLocked: !locked})} title={locked ? "Unlock" : "Lock in place"}
                    style={{
                        color: locked ? color : hexRgba(color, 0.4), cursor: "pointer", display: "flex",
                        padding: 0, border: "none", background: "none",
                    }}>
                {locked ? <Lock size={11}/> : <Unlock size={11}/>}
            </button>
        </div>
    );
}

// ── Resize handles ────────────────────────────────────────────────────────────

function ResizeHandles({id, color, width, height}: {
    id: string; color: string; width: number; height: number;
}) {
    const startResize = useResize(id, width, height);
    return (
        <>
            <div className="nodrag" onMouseDown={(e) => startResize(e, "y")}
                 style={{position: "absolute", bottom: 0, left: 12, right: 12, height: 7, cursor: "s-resize"}}/>
            <div className="nodrag" onMouseDown={(e) => startResize(e, "x")}
                 style={{position: "absolute", right: 0, top: 12, bottom: 12, width: 7, cursor: "e-resize"}}/>
            <div className="nodrag" onMouseDown={(e) => startResize(e, "both")} style={{
                position: "absolute", bottom: 3, right: 3, width: 14, height: 14,
                cursor: "se-resize", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
                <svg width="8" height="8">
                    <path d="M1 7L7 1M4.5 7L7 4.5" stroke={hexRgba(color, 0.4)} strokeWidth="1.5"
                          strokeLinecap="round"/>
                </svg>
            </div>
        </>
    );
}

// ── CommentNode — three visual styles ─────────────────────────────────────────

export const CommentNode = memo(({id, data, selected}: NodeProps<ScriptNodeData>) => {
    const update = useNodeUpdate();
    const style = data.commentStyle ?? "note";
    const color = data.commentColor ?? "#f59e0b";
    const opacity = data.commentOpacity ?? 0.12;
    const locked = data.commentLocked ?? false;
    const width = data.commentWidth ?? (style === "section" ? 340 : style === "comment" ? 220 : 220);
    const height = data.commentHeight ?? (style === "section" ? 56 : style === "comment" ? 44 : 120);

    const sel = selected ? hexRgba(color, 0.65) : hexRgba(color, 0.22);

    // ── Section: flat banner label ────────────────────────────────────────────
    if (style === "section") {
        return (
            <div className={locked ? "nodrag" : undefined}
                 style={{
                     width, height, borderRadius: 7, position: "relative", overflow: "visible",
                     backgroundColor: hexRgba(color, opacity * 0.6),
                     border: `2px solid ${sel}`,
                     boxShadow: selected ? `0 0 0 2px ${hexRgba(color, 0.1)}` : "none",
                 }}>
                <input className="nodrag" value={data.commentText ?? ""} readOnly={locked}
                       onChange={(e) => update(id, {commentText: e.target.value})}
                       placeholder="Section label…"
                       style={{
                           width: "100%", height: "100%", background: "none", border: "none", outline: "none",
                           color: hexRgba(color, 0.9), fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
                           textTransform: "uppercase", padding: "0 14px", boxSizing: "border-box",
                           cursor: locked ? "default" : "text",
                       }}/>
                {!locked && <ResizeHandles id={id} color={color} width={width} height={height}/>}
            </div>
        );
    }

    // ── Comment: minimal monospace annotation ─────────────────────────────────
    if (style === "comment") {
        return (
            <div className={locked ? "nodrag" : undefined}
                 style={{
                     width, minHeight: height, borderRadius: 5, position: "relative",
                     backgroundColor: hexRgba(color, 0.06),
                     border: `1px dashed ${sel}`,
                     boxShadow: selected ? `0 0 0 2px ${hexRgba(color, 0.08)}` : "none",
                 }}>
        <textarea className="nodrag" value={data.commentText ?? ""} readOnly={locked} rows={2}
                  onChange={(e) => update(id, {commentText: e.target.value})}
                  placeholder="// annotation…"
                  style={{
                      width: "100%", background: "none", border: "none", outline: "none", resize: "none",
                      color: hexRgba(color, 0.7), fontSize: 11, fontFamily: MONO,
                      padding: "7px 10px", lineHeight: 1.5, boxSizing: "border-box",
                      cursor: locked ? "default" : "text",
                  }}/>
                {!locked && <ResizeHandles id={id} color={color} width={width} height={height}/>}
            </div>
        );
    }

    // ── Note: sticky note with controls header ────────────────────────────────
    return (
        <div className={locked ? "nodrag" : undefined}
             style={{
                 width, height, display: "flex", flexDirection: "column", borderRadius: 9,
                 position: "relative", overflow: "visible",
                 backgroundColor: hexRgba(color, opacity),
                 border: `1.5px solid ${sel}`,
                 boxShadow: selected ? `0 0 0 2px ${hexRgba(color, 0.12)}, 0 4px 20px rgba(0,0,0,0.3)` : "0 2px 8px rgba(0,0,0,0.25)",
             }}>
            <div className="flex items-center gap-1.5 px-2 flex-shrink-0"
                 style={{height: 28, borderBottom: `1px solid ${hexRgba(color, 0.15)}`}}>
                <HeaderControls id={id} color={color} opacity={opacity} locked={locked}/>
            </div>
            <textarea className="nodrag" value={data.commentText ?? ""} readOnly={locked}
                      onChange={(e) => update(id, {commentText: e.target.value})}
                      placeholder="Add a note…"
                      style={{
                          flex: 1, background: "none", border: "none", outline: "none", resize: "none",
                          boxSizing: "border-box", width: "100%",
                          color: hexRgba(color, 0.9), fontSize: 11, fontFamily: "inherit",
                          padding: "6px 10px", lineHeight: 1.65,
                          cursor: locked ? "default" : "text",
                      }}/>
            {!locked && <ResizeHandles id={id} color={color} width={width} height={height}/>}
        </div>
    );
});
CommentNode.displayName = "CommentNode";
