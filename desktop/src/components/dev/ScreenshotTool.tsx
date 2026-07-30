/**
 * Module Developer Screenshot Tool
 *
 * Lets module authors capture screenshots of their module UI for marketplace listings.
 * Renders the module's page content in a resizable preview, with a simple SVG
 * annotation layer (rectangles, arrows, text), then saves PNG files to
 * {module_dir}/store/screenshots/.
 *
 * Requires: npm install html2canvas @types/html2canvas
 * Until installed, the Capture button shows a prompt to install the package.
 */

import React, {useCallback, useEffect, useRef, useState} from "react";
import type {PageDef} from "../../lib/types";
import {saveModuleScreenshot} from "../../lib/commands";
import {useSnackbar} from "../Snackbar";

// ── Annotation types ──────────────────────────────────────────────────────────

type AnnotationTool = "none" | "rect" | "arrow" | "text";

interface RectAnnotation {
    type: "rect";
    x: number;
    y: number;
    w: number;
    h: number;
    color: string
}

interface ArrowAnnotation {
    type: "arrow";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string
}

interface TextAnnotation {
    type: "text";
    x: number;
    y: number;
    text: string;
    color: string
}

type Annotation = RectAnnotation | ArrowAnnotation | TextAnnotation;

// ── Annotation SVG overlay ────────────────────────────────────────────────────

function AnnotationOverlay({
                               annotations, drawing, activeTool,
                               onMouseDown, onMouseMove, onMouseUp,
                           }: {
    annotations: Annotation[];
    drawing: Annotation | null;
    activeTool: AnnotationTool;
    onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    onMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void;
}) {
    const renderAnnotation = (a: Annotation, i: number) => {
        if (a.type === "rect") return (
            <rect key={i} x={a.x} y={a.y} width={a.w} height={a.h}
                  fill="none" stroke={a.color} strokeWidth={2} strokeDasharray="0"/>
        );
        if (a.type === "arrow") {
            const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len, uy = dy / len;
            const hw = 10, hh = 6;
            const p1x = a.x2 - ux * hw - uy * hh, p1y = a.y2 - uy * hw + ux * hh;
            const p2x = a.x2 - ux * hw + uy * hh, p2y = a.y2 - uy * hw - ux * hh;
            return (
                <g key={i}>
                    <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={2}/>
                    <polygon points={`${a.x2},${a.y2} ${p1x},${p1y} ${p2x},${p2y}`} fill={a.color}/>
                </g>
            );
        }
        if (a.type === "text") return (
            <text key={i} x={a.x} y={a.y} fill={a.color} fontSize={14} fontWeight={600}
                  style={{fontFamily: "sans-serif"}} stroke="#000" strokeWidth={3}
                  paintOrder="stroke">{a.text}</text>
        );
        return null;
    };

    return (
        <svg
            style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                cursor: activeTool === "none" ? "default" : "crosshair",
                userSelect: "none",
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
        >
            {annotations.map((a, i) => renderAnnotation(a, i))}
            {drawing && renderAnnotation(drawing, -1)}
        </svg>
    );
}

// ── Tool button ───────────────────────────────────────────────────────────────

function ToolBtn({label, active, onClick}: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} style={{
            padding: "4px 10px", fontSize: 11, borderRadius: 4, cursor: "pointer",
            backgroundColor: active ? "color-mix(in srgb, var(--color-accent) 20%, transparent)" : "#1a1a1a",
            color: active ? "var(--color-accent)" : "#555",
            border: `1px solid ${active ? "color-mix(in srgb, var(--color-accent) 30%, transparent)" : "#2a2a2a"}`,
        }}>{label}</button>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ScreenshotToolProps {
    moduleId?: string;
    pages?: PageDef[];
}

export function ScreenshotTool({moduleId = ""}: ScreenshotToolProps) {
    const snackbar = useSnackbar();
    const previewRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [zoom, setZoom] = useState(1);
    const [activeTool, setTool] = useState<AnnotationTool>("none");
    const [color, setColor] = useState("#ef4444");
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [drawing, setDrawing] = useState<Annotation | null>(null);
    const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
    const [capturing, setCapturing] = useState(false);
    const [html2canvasReady, setHtml2canvasReady] = useState(false);
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const [imgSize, setImgSize] = useState<{ w: number; h: number }>({w: 1200, h: 750});

    // Probe for html2canvas on mount
    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — html2canvas is optional; install with: npm install html2canvas
        import("html2canvas").then(() => setHtml2canvasReady(true)).catch(() => {
        });
    }, []);

    const handleAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            setImgSize({w: img.naturalWidth, h: img.naturalHeight});
            setAttachedImage(url);
            setAnnotations([]);
        };
        img.src = url;
        e.target.value = "";
    }, []);

    const getSvgPoint = (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        return {x: e.clientX - rect.left, y: e.clientY - rect.top};
    };

    const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if (activeTool === "none") return;
        const pt = getSvgPoint(e);
        if (activeTool === "text") {
            setPendingText(pt);
            return;
        }
        if (activeTool === "rect") {
            setDrawing({type: "rect", x: pt.x, y: pt.y, w: 0, h: 0, color});
        } else if (activeTool === "arrow") {
            setDrawing({type: "arrow", x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, color});
        }
    }, [activeTool, color]);

    const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if (!drawing) return;
        const pt = getSvgPoint(e);
        if (drawing.type === "rect") {
            setDrawing({...drawing, w: pt.x - drawing.x, h: pt.y - drawing.y});
        } else if (drawing.type === "arrow") {
            setDrawing({...drawing, x2: pt.x, y2: pt.y});
        }
    }, [drawing]);

    const handleMouseUp = useCallback(() => {
        if (!drawing) return;
        setAnnotations(prev => [...prev, drawing]);
        setDrawing(null);
    }, [drawing]);

    const capture = useCallback(async () => {
        if (!previewRef.current || !html2canvasReady) return;
        setCapturing(true);
        try {
            // @ts-ignore — html2canvas is optional; install with: npm install html2canvas
            const {default: html2canvas} = await import("html2canvas");
            const canvas = await html2canvas(previewRef.current, {
                backgroundColor: "#0f0f0f",
                scale: window.devicePixelRatio || 1,
                useCORS: true,
            });
            const blob: Blob = await new Promise(res => canvas.toBlob((b: Blob | null) => res(b!), "image/png"));
            const buf = await blob.arrayBuffer();
            const bytes = Array.from(new Uint8Array(buf));
            const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            const path = await saveModuleScreenshot(moduleId, `screenshot-${ts}`, bytes);
            snackbar({message: `Saved to ${path}`, variant: "success"});
        } catch (e) {
            snackbar({message: String(e), variant: "error"});
        } finally {
            setCapturing(false);
        }
    }, [moduleId, html2canvasReady, snackbar]);

    return (
        <div style={{display: "flex", flexDirection: "column", height: "100%", backgroundColor: "#0f0f0f"}}>
            {/* Toolbar */}
            <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                borderBottom: "1px solid #1a1a1a", flexShrink: 0, flexWrap: "wrap",
            }}>
                <span style={{
                    fontSize: 11,
                    color: "#2a2a2a",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase" as const
                }}>
                    Screenshot
                </span>

                {/* Attach image */}
                <input ref={fileInputRef} type="file" accept="image/*" style={{display: "none"}}
                       onChange={handleAttach}/>
                <button onClick={() => fileInputRef.current?.click()} style={{...btnStyle, color: "#777"}}>
                    📎 Attach Image
                </button>

                {/* Zoom */}
                <div style={{display: "flex", alignItems: "center", gap: 4, marginLeft: 8}}>
                    <button onClick={() => setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)))} style={btnStyle}>−
                    </button>
                    <span style={{fontSize: 11, color: "#555", minWidth: 36, textAlign: "center"}}>
                        {Math.round(zoom * 100)}%
                    </span>
                    <button onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))} style={btnStyle}>+
                    </button>
                    <button onClick={() => setZoom(1)} style={{...btnStyle, marginLeft: 2}}>Reset</button>
                </div>

                <div style={{width: 1, height: 16, backgroundColor: "#2a2a2a", margin: "0 4px"}}/>

                {/* Annotation tools */}
                <ToolBtn label="Select" active={activeTool === "none"} onClick={() => setTool("none")}/>
                <ToolBtn label="Rect" active={activeTool === "rect"} onClick={() => setTool("rect")}/>
                <ToolBtn label="Arrow" active={activeTool === "arrow"} onClick={() => setTool("arrow")}/>
                <ToolBtn label="Text" active={activeTool === "text"} onClick={() => setTool("text")}/>

                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                       title="Annotation color"
                       style={{
                           width: 24,
                           height: 24,
                           border: "none",
                           padding: 0,
                           borderRadius: 4,
                           cursor: "pointer",
                           backgroundColor: "transparent"
                       }}/>

                <button onClick={() => setAnnotations([])} style={{...btnStyle, color: "#555"}}>
                    Clear
                </button>

                <div style={{flex: 1}}/>

                {!html2canvasReady && (
                    <span style={{fontSize: 10, color: "#444"}}>
                        Run: <code style={{color: "#555"}}>npm install html2canvas</code>
                    </span>
                )}
                <button
                    onClick={capture}
                    disabled={capturing || !html2canvasReady}
                    style={{
                        padding: "5px 16px", fontSize: 12, fontWeight: 600,
                        backgroundColor: html2canvasReady ? "var(--color-accent)" : "#222",
                        color: html2canvasReady ? "#fff" : "#444",
                        border: "none", borderRadius: 5,
                        cursor: capturing || !html2canvasReady ? "not-allowed" : "pointer",
                    }}
                >
                    {capturing ? "Capturing…" : "Capture"}
                </button>
            </div>

            {/* Preview area */}
            <div style={{
                flex: 1,
                overflow: "auto",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                padding: 24
            }}>
                <div style={{position: "relative", transformOrigin: "top center", transform: `scale(${zoom})`}}>
                    {/* Preview canvas */}
                    <div
                        ref={previewRef}
                        style={{
                            width: imgSize.w,
                            height: imgSize.h,
                            overflow: "hidden",
                            position: "relative",
                            backgroundColor: "#0f0f0f"
                        }}
                    >
                        {attachedImage ? (
                            <img src={attachedImage} style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                display: "block",
                                userSelect: "none",
                                pointerEvents: "none"
                            }} draggable={false}/>
                        ) : (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    height: "100%",
                                    gap: 10,
                                    cursor: "pointer",
                                    color: "#2a2a2a"
                                }}
                            >
                                <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     strokeWidth={1.2}>
                                    <rect x="3" y="3" width="18" height="18" rx="3"/>
                                    <path d="M9 3v18M3 9h18M3 15h18M15 3v18"/>
                                </svg>
                                <span style={{fontSize: 12}}>Click to attach an image</span>
                            </div>
                        )}
                    </div>

                    {/* SVG annotation overlay */}
                    <div style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: activeTool === "none" ? "none" : "auto"
                    }}>
                        <AnnotationOverlay
                            annotations={annotations}
                            drawing={drawing}
                            activeTool={activeTool}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                        />
                    </div>
                </div>
            </div>

            {/* Pending text input */}
            {pendingText && (
                <TextInputPopup
                    color={color}
                    onConfirm={text => {
                        if (text.trim()) {
                            setAnnotations(prev => [...prev, {
                                type: "text",
                                x: pendingText.x,
                                y: pendingText.y,
                                text,
                                color
                            }]);
                        }
                        setPendingText(null);
                        setTool("none");
                    }}
                    onCancel={() => setPendingText(null)}
                />
            )}
        </div>
    );
}

// ── Text input popup ──────────────────────────────────────────────────────────

function TextInputPopup({color, onConfirm, onCancel}: {
    color: string;
    onConfirm: (text: string) => void;
    onCancel: () => void;
}) {
    const [val, setVal] = useState("");
    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
        }}
             onClick={e => {
                 if (e.target === e.currentTarget) onCancel();
             }}
        >
            <div style={{
                backgroundColor: "#111",
                border: "1px solid #222",
                borderRadius: 8,
                padding: "12px 16px",
                display: "flex",
                gap: 8
            }}>
                <input
                    autoFocus
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter") onConfirm(val);
                        if (e.key === "Escape") onCancel();
                    }}
                    placeholder="Label text…"
                    style={{
                        backgroundColor: "#0d0d0d", color: color, border: "1px solid #222",
                        borderRadius: 4, padding: "5px 10px", fontSize: 13, outline: "none",
                    }}
                />
                <button onClick={() => onConfirm(val)} style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: "var(--color-accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer"
                }}>
                    Add
                </button>
            </div>
        </div>
    );
}

const btnStyle: React.CSSProperties = {
    padding: "3px 8px", fontSize: 11, borderRadius: 4,
    backgroundColor: "#1a1a1a", color: "#555",
    border: "1px solid #2a2a2a", cursor: "pointer",
};
