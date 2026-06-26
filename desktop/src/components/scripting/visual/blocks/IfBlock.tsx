import {useState} from "react";
import type {Block, Condition} from "../block-types";
import {ConditionSlot} from "../ConditionSlot";
import {CloseIcon} from "../../../icons";

// BlockCanvas is imported lazily to avoid circular refs
interface BlockCanvasProps {
    blocks: Block[];
    onChange: (blocks: Block[]) => void;
    depth: number;
}

interface Props {
    block: Extract<Block, { type: "if" }>;
    onChange: (b: Extract<Block, { type: "if" }>) => void;
    onDelete: () => void;
    BlockCanvas: React.ComponentType<BlockCanvasProps>;
}

export function IfBlock({block, onChange, onDelete, BlockCanvas}: Props) {
    const [showElse, setShowElse] = useState(block.else.length > 0);

    const handleCondition = (condition: Condition) => onChange({...block, condition});
    const handleThen = (then: Block[]) => onChange({...block, then});
    const handleElse = (els: Block[]) => onChange({...block, else: els});

    const toggleElse = () => {
        const next = !showElse;
        setShowElse(next);
        if (!next) onChange({...block, else: []});
    };

    return (
        <div className="rounded overflow-hidden"
             style={{border: "1px solid #ec489944", backgroundColor: "#0f0a0e"}}>

            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-1.5"
                 style={{backgroundColor: "#1a0d17", borderBottom: "1px solid #ec489933"}}>
        <span className="text-xs font-semibold flex-shrink-0"
              style={{color: "#ec4899", fontFamily: "monospace"}}>if</span>
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

            {/* THEN */}
            <div className="px-3 py-2">
                <p className="text-xs mb-1.5" style={{color: "#333", fontFamily: "monospace"}}>then</p>
                <BlockCanvas blocks={block.then} onChange={handleThen} depth={1}/>
            </div>

            {/* ELSE toggle */}
            <div className="px-3 pb-1.5">
                <button onClick={toggleElse} className="text-xs"
                        style={{color: showElse ? "#ec4899" : "#333", cursor: "pointer", fontFamily: "monospace"}}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#ec4899";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = showElse ? "#ec4899" : "#333";
                        }}>
                    {showElse ? "− else" : "+ else"}
                </button>

                {showElse && (
                    <div className="mt-1.5">
                        <BlockCanvas blocks={block.else} onChange={handleElse} depth={1}/>
                    </div>
                )}
            </div>
        </div>
    );
}
