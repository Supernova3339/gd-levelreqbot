// Shown when a module command's saved override differs from what the module
// currently ships (the module updated, the user hand-edited it, or both —
// content diff can't tell which, so it just shows what's different and lets
// the user decide) — a unified line diff plus "keep mine" / "update" actions.

import {diffLines} from "../../lib/scripting/lineDiff";

export function ModuleUpdateDiffModal({
                                          trigger, oldText, newText, onUpdate, onKeep, onClose,
                                      }: {
    trigger: string;
    /** The user's current override body. */
    oldText: string;
    /** The module's current on-disk default body. */
    newText: string;
    onUpdate: () => void;
    onKeep: () => void;
    onClose: () => void;
}) {
    const ops = diffLines(oldText, newText);
    const added = ops.filter((o) => o.kind === "add").length;
    const removed = ops.filter((o) => o.kind === "remove").length;

    return (
        <div
            className="fixed inset-0 flex items-center justify-center"
            style={{backgroundColor: "rgba(0,0,0,0.6)", zIndex: 100, backdropFilter: "blur(2px)"}}
            onClick={onClose}
        >
            <div
                className="flex flex-col rounded-xl overflow-hidden"
                style={{
                    backgroundColor: "#111", border: "1px solid #2a2a2a",
                    boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
                    width: "min(720px, 92vw)", maxHeight: "80vh",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-2 px-4 py-3" style={{borderBottom: "1px solid #1e1e1e"}}>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{color: "#f1f1f1"}}>
                            <code>{trigger}</code> differs from the module's current version
                        </p>
                        <p className="text-xs mt-0.5" style={{color: "#666"}}>
                            <span style={{color: "#4ade80"}}>+{added}</span>{" "}
                            <span style={{color: "#f87171"}}>-{removed}</span>{" "}
                            — could be your own edits, a module update, or both.
                        </p>
                    </div>
                </div>

                <div className="flex-1 overflow-auto" style={{minHeight: 0}}>
                    <pre className="text-xs" style={{margin: 0, fontFamily: "var(--font-mono, monospace)"}}>
                        {ops.map((op, i) => (
                            <div key={i} style={{
                                display: "flex",
                                backgroundColor: op.kind === "add" ? "rgba(74,222,128,0.08)" : op.kind === "remove" ? "rgba(248,113,113,0.08)" : "transparent",
                                color: op.kind === "add" ? "#4ade80" : op.kind === "remove" ? "#f87171" : "#888",
                            }}>
                                <span style={{
                                    width: 20,
                                    flexShrink: 0,
                                    textAlign: "center",
                                    opacity: 0.7,
                                    userSelect: "none"
                                }}>
                                    {op.kind === "add" ? "+" : op.kind === "remove" ? "−" : ""}
                                </span>
                                <span
                                    style={{whiteSpace: "pre-wrap", wordBreak: "break-word", padding: "1px 8px 1px 0"}}>
                                    {op.text || " "}
                                </span>
                            </div>
                        ))}
                    </pre>
                </div>

                <div className="flex items-center gap-2 px-4 py-3" style={{borderTop: "1px solid #1e1e1e"}}>
                    <span className="text-xs flex-1" style={{color: "#555"}}>
                        Left (red) is what you have now; right (green) is the module's current default.
                    </span>
                    <button onClick={onClose} className="text-xs px-3 py-1.5 rounded"
                            style={{color: "#888", border: "1px solid #2a2a2a", background: "none"}}>
                        Close
                    </button>
                    <button onClick={onKeep} className="text-xs px-3 py-1.5 rounded"
                            style={{backgroundColor: "#1e1e1e", color: "#c0c0c0", border: "1px solid #2a2a2a"}}>
                        Keep mine
                    </button>
                    <button onClick={onUpdate} className="text-xs px-3 py-1.5 rounded font-semibold"
                            style={{backgroundColor: "var(--color-accent)", color: "#fff"}}>
                        Update to latest
                    </button>
                </div>
            </div>
        </div>
    );
}
