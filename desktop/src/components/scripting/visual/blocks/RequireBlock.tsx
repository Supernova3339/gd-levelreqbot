import type {Block, Condition} from "../block-types";
import {ConditionSlot} from "../ConditionSlot";
import {CloseIcon} from "../../../icons";

interface Props {
    block: Extract<Block, { type: "require" }>;
    onChange: (b: Extract<Block, { type: "require" }>) => void;
    onDelete: () => void;
}

export function RequireBlock({block, onChange, onDelete}: Props) {
    const handleCondition = (condition: Condition) => onChange({...block, condition});

    return (
        <div className="flex items-center gap-2 px-3 py-2 rounded"
             style={{backgroundColor: "#1c1400", border: "1px solid #f59e0b44"}}>
      <span className="text-xs font-semibold flex-shrink-0"
            style={{color: "#f59e0b", fontFamily: "monospace"}}>require</span>

            <ConditionSlot value={block.condition} onChange={handleCondition}/>

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
    );
}
