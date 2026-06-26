// Shared drill-down palette — drill-down nav with descriptions shown.

import {useEffect, useRef, useState} from "react";
import {SearchIcon} from "../icons";
import type {Block} from "./visual/block-types";
import type {PaletteCategory, PaletteLeaf} from "../../lib/scripting/palette-registry";
import {flatLeaves, getNodeAt, getPaletteTree} from "../../lib/scripting/palette-registry";

const MONO = '"JetBrains Mono","Fira Code",monospace';

interface Props {
    onAdd: (b: Block) => void;
    onClose: () => void;
    style?: React.CSSProperties;
    divRef?: React.RefObject<HTMLDivElement | null>;
    autoFocus?: boolean;
}

export function PalettePanel({onAdd, onClose, style, divRef, autoFocus}: Props) {
    const [path, setPath] = useState<string[]>([]);
    const [search, setSearch] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const TREE = getPaletteTree();
    const q = search.toLowerCase();
    const current = getNodeAt(TREE, path);
    const allLeaves = flatLeaves(TREE);
    const displayed = q
        ? allLeaves.filter((l) => l.label.toLowerCase().includes(q) || l.desc.toLowerCase().includes(q))
        : current;
    const isSearch = q.length > 0;

    useEffect(() => {
        if (autoFocus) inputRef.current?.focus();
    }, [autoFocus]);

    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Backspace" && search === "" && path.length > 0) setPath((p) => p.slice(0, -1));
        };
        document.addEventListener("keydown", key);
        return () => document.removeEventListener("keydown", key);
    }, [onClose, search, path.length]);

    return (
        <div ref={divRef} style={{
            backgroundColor: "#111", border: "1px solid #1e1e1e", borderRadius: 8,
            boxShadow: "0 20px 60px rgba(0,0,0,0.85)",
            display: "flex", flexDirection: "column", overflow: "hidden",
            ...style,
        }}>

            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                 style={{borderBottom: "1px solid #1a1a1a"}}>
                <SearchIcon size={12} style={{color: "#333", flexShrink: 0}}/>
                <input ref={inputRef} value={search}
                       onChange={(e) => {
                           setSearch(e.target.value);
                           setPath([]);
                       }}
                       placeholder="Search blocks…"
                       className="flex-1 bg-transparent outline-none text-xs"
                       style={{color: "#c0c0c0"}}/>
                {search && (
                    <button onClick={() => setSearch("")} style={{color: "#444", fontSize: 11}}>✕</button>
                )}
            </div>

            {/* Breadcrumb path */}
            {!isSearch && (
                <div className="flex items-center gap-1 px-3 flex-shrink-0"
                     style={{height: 26, backgroundColor: "#0d0d0d", borderBottom: "1px solid #1a1a1a"}}>
                    <button onClick={() => setPath([])}
                            style={{fontSize: 11, color: path.length === 0 ? "#666" : "#444"}}
                            onMouseEnter={(e) => {
                                if (path.length > 0) e.currentTarget.style.color = "#aaa";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = path.length === 0 ? "#666" : "#444";
                            }}>
                        All
                    </button>
                    {path.map((seg, i) => (
                        <span key={seg} className="flex items-center gap-1">
              <span style={{color: "#2a2a2a", fontSize: 10}}>›</span>
              <button onClick={() => setPath(path.slice(0, i + 1))}
                      style={{fontSize: 11, color: i === path.length - 1 ? "#c0c0c0" : "#444"}}
                      onMouseEnter={(e) => {
                          if (i < path.length - 1) e.currentTarget.style.color = "#aaa";
                      }}
                      onMouseLeave={(e) => {
                          e.currentTarget.style.color = i === path.length - 1 ? "#c0c0c0" : "#444";
                      }}>
                {seg}
              </button>
            </span>
                    ))}
                </div>
            )}

            {/* Item list */}
            <div className="flex-1 overflow-y-auto">
                {displayed.length === 0 && (
                    <p className="text-xs text-center py-6" style={{color: "#333"}}>
                        {q ? `No results for "${search}"` : "Empty"}
                    </p>
                )}

                {displayed.map((node, i) => node.kind === "category" ? (
                    <CategoryRow key={i} node={node}
                                 onDrill={() => setPath([...path, node.label])}
                                 onAdd={(b) => {
                                     onAdd(b);
                                     onClose();
                                 }}/>
                ) : (
                    <button key={i}
                            onClick={() => {
                                onAdd(node.block);
                                onClose();
                            }}
                            className="w-full flex flex-col gap-0.5 px-3 py-1.5 text-left"
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#1a1a1a";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                            }}>
                        <div className="flex items-center gap-2">
                            <span style={{
                                width: 5,
                                height: 5,
                                borderRadius: "50%",
                                backgroundColor: node.color,
                                flexShrink: 0,
                                display: "inline-block",
                                marginTop: 1
                            }}/>
                            <span style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: node.color,
                                fontFamily: MONO
                            }}>{node.label}</span>
                        </div>
                        <p style={{fontSize: 10, color: "#444", margin: 0, paddingLeft: 13}}>{node.desc}</p>
                    </button>
                ))}
            </div>

            <div className="flex-shrink-0 px-3 py-1.5" style={{borderTop: "1px solid #1a1a1a"}}>
                <p style={{fontSize: 10, color: "#2a2a2a"}}>
                    Click to add · Esc to close{path.length > 0 ? " · Backspace to go back" : ""}
                </p>
            </div>
        </div>
    );
}

// A category row that collapses to a direct-action button when it has exactly one leaf child.

function CategoryRow({node, onDrill, onAdd}: {
    node: PaletteCategory;
    onDrill: () => void;
    onAdd: (b: Block) => void;
}) {
    const onlyLeaf: PaletteLeaf | null =
        node.children.length === 1 && node.children[0].kind === "leaf"
            ? node.children[0] as PaletteLeaf
            : null;

    if (onlyLeaf) {
        return (
            <button title={onlyLeaf.desc} onClick={() => onAdd(onlyLeaf.block)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#1a1a1a";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                    }}>
                {node.color && <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: node.color,
                    flexShrink: 0,
                    display: "inline-block"
                }}/>}
                <span style={{fontSize: 12, fontWeight: 500, color: node.color ?? "#d0d0d0"}}>{node.label}</span>
            </button>
        );
    }

    return (
        <button onClick={onDrill}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#1a1a1a";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                }}>
            <div className="flex items-center gap-2">
                {node.color && <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: node.color,
                    flexShrink: 0,
                    display: "inline-block"
                }}/>}
                <span style={{fontSize: 12, fontWeight: 500, color: "#d0d0d0"}}>{node.label}</span>
            </div>
            <span style={{color: "#333", fontSize: 13}}>›</span>
        </button>
    );
}
