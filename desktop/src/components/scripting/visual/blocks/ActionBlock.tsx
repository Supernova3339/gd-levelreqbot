import type {Block} from "../block-types";
import {CloseIcon} from "../../../icons";

const ACTION_COLOR: Record<string, string> = {
    "queue.": "#22c55e",
    "counter.": "#06b6d4",
    "gd.": "#f59e0b",
};

function actionColor(name: string): string {
    for (const [prefix, color] of Object.entries(ACTION_COLOR)) {
        if (name.startsWith(prefix)) return color;
    }
    return "#818cf8";
}

interface Props {
    block: Extract<Block, { type: "action" }>;
    onChange: (b: Extract<Block, { type: "action" }>) => void;
    onDelete: () => void;
}

export function ActionBlock({block, onChange, onDelete}: Props) {
    const color = actionColor(block.name);

    return (
        <div className="flex items-center gap-2 px-3 py-2 rounded"
             style={{backgroundColor: "#0d0d0d", border: `1px solid ${color}44`}}>

            {/* Drag handle */}
            <span style={{color: "#333", cursor: "grab", fontSize: 12, userSelect: "none"}}>⠿</span>

            <input
                value={block.name}
                onChange={(e) => onChange({...block, name: e.target.value})}
                style={{
                    flex: 1, backgroundColor: "transparent", border: "none", outline: "none",
                    fontFamily: "monospace", fontSize: 12, color,
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
    );
}
