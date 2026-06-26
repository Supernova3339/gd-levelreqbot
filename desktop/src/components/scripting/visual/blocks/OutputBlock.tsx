import type {Block} from "../block-types";
import {CloseIcon} from "../../../icons";

const VARS = ["user.name", "user.display", "args[0]", "command.trigger", "queue.size()"];

interface Props {
    block: Extract<Block, { type: "say" }> | Extract<Block, { type: "reply" }>;
    onChange: (b: Extract<Block, { type: "say" }> | Extract<Block, { type: "reply" }>) => void;
    onDelete: () => void;
}

export function OutputBlock({block, onChange, onDelete}: Props) {
    const isSay = block.type === "say";
    const color = isSay ? "#3b82f6" : "#6366f1";
    const label = isSay ? "say" : "reply";

    const insertVar = (v: string) => {
        onChange({...block, message: block.message + "${" + v + "}"} as typeof block);
    };

    return (
        <div className="flex flex-col gap-1.5 px-3 py-2 rounded"
             style={{backgroundColor: "#0a0f1e", border: `1px solid ${color}44`}}>

            <div className="flex items-center gap-2">
        <span className="text-xs font-semibold flex-shrink-0"
              style={{color, fontFamily: "monospace", width: 36}}>{label}</span>

                <input
                    value={block.message}
                    onChange={(e) => onChange({...block, message: e.target.value} as typeof block)}
                    placeholder={`${label === "say" ? "message" : "@user reply"} text…`}
                    style={{
                        flex: 1, backgroundColor: "#111", border: "1px solid #1e1e1e",
                        borderRadius: 4, color: "#d0d0d0", fontSize: 12,
                        fontFamily: "monospace", padding: "2px 6px", outline: "none",
                    }}
                    onFocus={(e) => {
                        e.currentTarget.style.borderColor = `${color}66`;
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#1e1e1e";
                    }}
                />

                <button onClick={onDelete} style={{color: "#2a2a2a", cursor: "pointer"}}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#ef4444";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#2a2a2a";
                        }}>
                    <CloseIcon size={10}/>
                </button>
            </div>

            {/* Variable insertion chips */}
            <div className="flex items-center gap-1 flex-wrap">
                {VARS.map((v) => (
                    <button key={v} onClick={() => insertVar(v)}
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                                backgroundColor: "#111",
                                color: "#ffcb6b",
                                border: "1px solid #222",
                                cursor: "pointer",
                                fontFamily: "monospace"
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = "#ffcb6b44";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = "#222";
                            }}>
                        {v}
                    </button>
                ))}
            </div>
        </div>
    );
}
