import type {Block} from "../block-types";
import {CloseIcon} from "../../../icons";

interface Props {
    block: Extract<Block, { type: "random" }>;
    onChange: (b: Extract<Block, { type: "random" }>) => void;
    onDelete: () => void;
}

export function RandomBlock({block, onChange, onDelete}: Props) {
    const set = (messages: string[]) => onChange({...block, messages});

    return (
        <div className="flex flex-col gap-1.5 px-3 py-2 rounded"
             style={{backgroundColor: "#0d0a1a", border: "1px solid #8b5cf644"}}>

            <div className="flex items-center gap-2">
        <span className="text-xs font-semibold flex-shrink-0"
              style={{color: "#8b5cf6", fontFamily: "monospace"}}>say random</span>
                <div style={{flex: 1}}/>
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

            {block.messages.map((msg, i) => (
                <div key={i} className="flex items-center gap-1">
          <span style={{fontSize: 10, color: "#444", fontFamily: "monospace", width: 14, flexShrink: 0}}>
            {i + 1}.
          </span>
                    <input
                        value={msg}
                        onChange={(e) => {
                            const n = [...block.messages];
                            n[i] = e.target.value;
                            set(n);
                        }}
                        placeholder={`Option ${i + 1}`}
                        style={{
                            flex: 1, backgroundColor: "#111", border: "1px solid #1e1e1e",
                            borderRadius: 4, color: "#d0d0d0", fontSize: 12,
                            fontFamily: "monospace", padding: "2px 6px", outline: "none",
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = "#8b5cf666";
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = "#1e1e1e";
                        }}
                    />
                    {block.messages.length > 2 && (
                        <button onClick={() => set(block.messages.filter((_, j) => j !== i))}
                                style={{color: "#2a2a2a", cursor: "pointer", fontSize: 10}}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "#ef4444";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "#2a2a2a";
                                }}>
                            ✕
                        </button>
                    )}
                </div>
            ))}

            <button onClick={() => set([...block.messages, ""])}
                    style={{
                        fontSize: 10,
                        color: "#444",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        padding: 0
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#8b5cf6";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = "#444";
                    }}>
                + add option
            </button>
        </div>
    );
}
