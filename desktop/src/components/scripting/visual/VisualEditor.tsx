import {useState} from "react";
import type {Block} from "./block-types";
import {BlockCanvas} from "./BlockCanvas";
import {blocksToRhai, buildScript} from "./RhaiCodegen";
import {AddBlockButton} from "../BlockPalette";

interface Props {
    onChange: (rhai: string) => void;
    initialBlocks?: Block[];
}

export function VisualEditor({onChange, initialBlocks}: Props) {
    const [blocks, setBlocks] = useState<Block[]>(initialBlocks ?? []);
    const [rhaiOpen, setRhaiOpen] = useState(false);

    const handleBlocks = (next: Block[]) => {
        setBlocks(next);
        onChange(buildScript(next));
    };

    const addBlock = (b: Block) => handleBlocks([...blocks, b]);

    return (
        <div className="flex flex-col h-full" style={{minHeight: 0}}>

            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 flex-shrink-0"
                 style={{height: 36, borderBottom: "1px solid #111", backgroundColor: "#090909"}}>
                <AddBlockButton onAdd={addBlock}/>
                {blocks.length > 0 && (
                    <>
                        <div style={{flex: 1}}/>
                        <button
                            onClick={() => handleBlocks([])}
                            className="text-xs"
                            style={{color: "#2a2a2a", cursor: "pointer"}}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = "#ef4444";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = "#2a2a2a";
                            }}>
                            clear all
                        </button>
                    </>
                )}
            </div>

            {/* Block list */}
            <div className="flex-1 overflow-y-auto p-3" style={{minHeight: 0}}>
                {blocks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                        <p className="text-xs" style={{color: "#1e1e1e"}}>
                            Click "Add block" to start building
                        </p>
                    </div>
                ) : (
                    <BlockCanvas blocks={blocks} onChange={handleBlocks}/>
                )}
            </div>

            {/* Generated Rhai — collapsible */}
            {blocks.length > 0 && (
                <div className="flex-shrink-0" style={{borderTop: "1px solid #111"}}>
                    <button
                        onClick={() => setRhaiOpen((o) => !o)}
                        className="w-full text-left px-3 py-1.5 text-xs"
                        style={{backgroundColor: "#080808", color: "#2a2a2a", cursor: "pointer"}}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#555";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#2a2a2a";
                        }}>
                        {rhaiOpen ? "▾ hide generated Rhai" : "▸ view generated Rhai"}
                    </button>
                    {rhaiOpen && (
                        <pre className="text-xs p-3 overflow-x-auto m-0"
                             style={{
                                 backgroundColor: "#060606", color: "#555",
                                 fontFamily: '"JetBrains Mono","Fira Code",monospace',
                                 lineHeight: 1.5, maxHeight: 200, borderTop: "1px solid #111",
                             }}>
              {blocksToRhai(blocks) || "// (no blocks)"}
            </pre>
                    )}
                </div>
            )}
        </div>
    );
}
