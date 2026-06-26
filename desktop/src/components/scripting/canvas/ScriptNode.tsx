// ScriptNode — unified component for all non-comment canvas node types.

import {memo} from "react";
import {Handle, type NodeProps, Position} from "reactflow";
import {CONDITION_PRESETS, NODE_DEFS, PORT, type ScriptNodeData} from "./NodeDefinitions";
import {useNodeUpdate} from "./NodeUpdateContext";
import {EntryConfig} from "./configs/EntryConfig";
import {ActionConfig} from "./configs/ActionConfig";
import {VariableConfig} from "./configs/VariableConfig";

const MONO = '"JetBrains Mono","Fira Code",monospace';
const INPUT: React.CSSProperties = {
    backgroundColor: "#0a0a0a", color: "#c0c0c0",
    border: "1px solid #252525", borderRadius: 3,
    padding: "3px 7px", fontSize: 11, fontFamily: MONO,
    width: "100%", outline: "none",
};

// Port row constants — used both for layout and handle bottom-offset computation.
const PORT_ROW_H = 24;
const PORT_PAD = 6;

function ExecPort({type, position, id, style}: {
    type: "source" | "target"; position: Position; id: string; style: React.CSSProperties;
}) {
    return (
        <Handle type={type} position={position} id={id} style={{
            width: 8, height: 8, borderRadius: 2, border: "none",
            backgroundColor: "#3a3a3a", ...style,
        }}/>
    );
}

function MessageConfig({value, onChange, label}: { value: string; onChange: (v: string) => void; label: string }) {
    return (
        <div>
            <p style={{
                fontSize: 9,
                color: "#444",
                margin: "0 0 4px",
                textTransform: "uppercase",
                letterSpacing: "0.05em"
            }}>{label}</p>
            <textarea value={value} onChange={(e) => onChange(e.target.value)}
                      className="nodrag" rows={2} placeholder={`Hello \${username}!`}
                      style={{...INPUT, resize: "none", lineHeight: 1.5}}/>
        </div>
    );
}

function ConditionConfig({value, onChange}: { value: string; onChange: (v: string) => void }) {
    const isPreset = CONDITION_PRESETS.some((p) => p.value === value);
    return (
        <div className="flex flex-col gap-1.5">
            <p style={{
                fontSize: 9,
                color: "#444",
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.05em"
            }}>condition</p>
            <select value={isPreset ? value : "__custom__"}
                    onChange={(e) => {
                        if (e.target.value !== "__custom__") onChange(e.target.value);
                    }}
                    className="nodrag" style={INPUT}>
                {CONDITION_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                {!isPreset && <option value="__custom__">{value}</option>}
                <option value="__custom__">custom…</option>
            </select>
            {!isPreset && (
                <input value={value} onChange={(e) => onChange(e.target.value)}
                       className="nodrag" placeholder="any Rhai expression" style={INPUT}/>
            )}
        </div>
    );
}

function RandomConfig({messages, onChange}: { messages: string[]; onChange: (m: string[]) => void }) {
    return (
        <div className="flex flex-col gap-1.5">
            <p style={{
                fontSize: 9,
                color: "#444",
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.05em"
            }}>options</p>
            {messages.map((msg, i) => (
                <div key={i} className="flex gap-1 items-center">
                    <input value={msg} onChange={(e) => {
                        const n = [...messages];
                        n[i] = e.target.value;
                        onChange(n);
                    }}
                           className="nodrag" placeholder={`Option ${i + 1}`} style={{...INPUT, flex: 1}}/>
                    {messages.length > 2 && (
                        <button className="nodrag" onClick={() => onChange(messages.filter((_, j) => j !== i))}
                                style={{
                                    color: "#333",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: 11
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "#ef4444";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "#333";
                                }}>✕</button>
                    )}
                </div>
            ))}
            <button className="nodrag" onClick={() => onChange([...messages, ""])}
                    style={{
                        fontSize: 10,
                        color: "#333",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        padding: 0
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#888";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = "#333";
                    }}>
                + add option
            </button>
        </div>
    );
}

export const ScriptNode = memo(({id, data, selected}: NodeProps<ScriptNodeData>) => {
    const update = useNodeUpdate();
    const def = NODE_DEFS[data.kind] ?? NODE_DEFS.action;
    const c = def.color;
    const set = (patch: Partial<ScriptNodeData>) => update(id, patch);

    const title = data.kind === "action" && data.action ? data.action + "()" : def.label;
    const hasBody = def.config !== "none";

    return (
        <div style={{
            minWidth: 220, maxWidth: 300, backgroundColor: "#111", borderRadius: 7,
            border: `1px solid ${selected ? c + "66" : "#1e1e1e"}`,
            boxShadow: selected ? `0 0 0 2px ${c}22, 0 8px 32px rgba(0,0,0,0.6)` : "0 2px 12px rgba(0,0,0,0.4)",
            overflow: "visible",
        }}>
            {def.hasExecIn && (
                <ExecPort type="target" position={Position.Left} id={PORT.execIn}
                          style={{left: -4, top: "50%", transform: "translateY(-50%)"}}/>
            )}

            {/* Header */}
            <div style={{
                backgroundColor: c + "22", padding: "8px 12px",
                borderBottom: (hasBody || def.hasTrueFalse) ? `1px solid ${c}18` : "none",
                borderRadius: (hasBody || def.hasTrueFalse) ? "6px 6px 0 0" : 6,
                display: "flex", alignItems: "center", gap: 8,
            }}>
                <div style={{width: 7, height: 7, borderRadius: "50%", backgroundColor: c, flexShrink: 0}}/>
                <code style={{
                    flex: 1, fontSize: 12, fontWeight: 700, color: "#ebebeb", fontFamily: MONO,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                }}>
                    {title}
                </code>
                <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 10, flexShrink: 0,
                    backgroundColor: c + "15", color: c + "cc", border: `1px solid ${c}25`,
                    fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase"
                }}>
          {def.category}
        </span>
            </div>

            {/* Config body */}
            {hasBody && (
                <div style={{padding: "10px 12px", borderBottom: def.hasTrueFalse ? "1px solid #1e1e1e" : "none"}}>
                    {def.config === "entry" && <EntryConfig data={data} onChange={set}/>}
                    {def.config === "message" &&
                        <MessageConfig value={data.message ?? ""} onChange={(v) => set({message: v})}
                                       label={data.kind === "reply" ? "message (prefixed with @username)" : "message"}/>}
                    {def.config === "action" && <ActionConfig data={data} onChange={set}/>}
                    {def.config === "variable" && <VariableConfig data={data} onChange={set}/>}
                    {def.config === "condition" && <ConditionConfig value={data.condition ?? CONDITION_PRESETS[0].value}
                                                                    onChange={(v) => set({condition: v})}/>}
                    {def.config === "random" && <RandomConfig messages={data.messages ?? ["", ""]}
                                                              onChange={(msgs) => set({messages: msgs})}/>}
                </div>
            )}

            {/* True/false port rows — fixed height so handles stay aligned */}
            {def.hasTrueFalse && (
                <div style={{padding: `${PORT_PAD}px 12px`}}>
                    {(["true", "false"] as const).map((side) => (
                        <div key={side} style={{
                            height: PORT_ROW_H,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            gap: 6
                        }}>
                            <span style={{
                                fontSize: 10,
                                color: side === "true" ? "#22c55e" : "#ef4444",
                                fontFamily: MONO
                            }}>{side}</span>
                            <div style={{
                                width: 8,
                                height: 8,
                                borderRadius: 2,
                                backgroundColor: side === "true" ? "#22c55e" : "#ef4444"
                            }}/>
                        </div>
                    ))}
                </div>
            )}

            {def.hasExecOut && (
                <ExecPort type="source" position={Position.Right} id={PORT.execOut}
                          style={{right: -4, top: "50%", transform: "translateY(-50%)"}}/>
            )}

            {def.hasTrueFalse && (
                <>
                    <Handle type="source" position={Position.Right} id={PORT.trueOut} style={{
                        width: 8, height: 8, borderRadius: 2, border: "none", backgroundColor: "#22c55e",
                        right: -4, top: "auto", bottom: PORT_PAD + PORT_ROW_H + PORT_ROW_H / 2,
                    }}/>
                    <Handle type="source" position={Position.Right} id={PORT.falseOut} style={{
                        width: 8, height: 8, borderRadius: 2, border: "none", backgroundColor: "#ef4444",
                        right: -4, top: "auto", bottom: PORT_PAD + PORT_ROW_H / 2,
                    }}/>
                </>
            )}
        </div>
    );
});
ScriptNode.displayName = "ScriptNode";
