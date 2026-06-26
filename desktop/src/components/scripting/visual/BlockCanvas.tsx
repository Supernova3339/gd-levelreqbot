import type {Block} from "./block-types";
import {RequireBlock} from "./blocks/RequireBlock";
import {ActionBlock} from "./blocks/ActionBlock";
import {OutputBlock} from "./blocks/OutputBlock";
import {IfBlock} from "./blocks/IfBlock";
import {RandomBlock} from "./blocks/RandomBlock";
import {PlusIcon} from "../../icons";

function uid() {
    return Math.random().toString(36).slice(2);
}

interface Props {
    blocks: Block[];
    onChange: (blocks: Block[]) => void;
    depth?: number;
}

// Self-referencing: BlockCanvas → IfBlock → BlockCanvas
export function BlockCanvas({blocks, onChange, depth = 0}: Props) {
    const update = (id: string, b: Block) =>
        onChange(blocks.map((x) => x.id === id ? b : x));

    const remove = (id: string) =>
        onChange(blocks.filter((x) => x.id !== id));

    const addStop = () =>
        onChange([...blocks, {id: uid(), type: "stop"}]);

    return (
        <div className="flex flex-col gap-1.5">
            {blocks.map((b) => {
                switch (b.type) {
                    case "require":
                        return (
                            <RequireBlock key={b.id} block={b}
                                          onChange={(nb) => update(b.id, nb)}
                                          onDelete={() => remove(b.id)}/>
                        );
                    case "action":
                        return (
                            <ActionBlock key={b.id} block={b}
                                         onChange={(nb) => update(b.id, nb)}
                                         onDelete={() => remove(b.id)}/>
                        );
                    case "say":
                    case "reply":
                        return (
                            <OutputBlock key={b.id} block={b}
                                         onChange={(nb) => update(b.id, nb as typeof b)}
                                         onDelete={() => remove(b.id)}/>
                        );
                    case "random":
                        return (
                            <RandomBlock key={b.id} block={b}
                                         onChange={(nb) => update(b.id, nb)}
                                         onDelete={() => remove(b.id)}/>
                        );
                    case "if":
                        return (
                            <IfBlock key={b.id} block={b}
                                     onChange={(nb) => update(b.id, nb)}
                                     onDelete={() => remove(b.id)}
                                     BlockCanvas={BlockCanvas}/>
                        );
                    case "stop":
                        return (
                            <div key={b.id} className="flex items-center gap-2 px-3 py-1.5 rounded"
                                 style={{backgroundColor: "#0d0d0d", border: "1px solid #2a2a2a"}}>
                                <span className="text-xs"
                                      style={{color: "#555", fontFamily: "monospace"}}>return;</span>
                                <div style={{flex: 1}}/>
                                <button onClick={() => remove(b.id)}
                                        style={{color: "#2a2a2a", cursor: "pointer", fontSize: 10}}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.color = "#ef4444";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.color = "#2a2a2a";
                                        }}>✕
                                </button>
                            </div>
                        );
                }
            })}

            {depth === 0 && (
                <button onClick={addStop}
                        className="flex items-center gap-1.5 text-xs px-2 py-1 rounded self-start"
                        style={{color: "#333", border: "1px dashed #1e1e1e", cursor: "pointer"}}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#888";
                            e.currentTarget.style.borderColor = "#444";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#333";
                            e.currentTarget.style.borderColor = "#1e1e1e";
                        }}>
                    <PlusIcon size={10}/> add stop
                </button>
            )}
        </div>
    );
}
