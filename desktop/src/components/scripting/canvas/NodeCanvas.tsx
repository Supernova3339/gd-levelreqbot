import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import ReactFlow, {
    addEdge,
    Background,
    BackgroundVariant,
    type Connection,
    type Edge,
    type Node,
    ReactFlowProvider,
    useEdgesState,
    useNodesState,
    useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import {Lock, Maximize2, Redo2, Trash2, Undo2, Unlock, ZoomIn, ZoomOut} from "lucide-react";
import {useHistory} from "./useHistory";

import {ScriptNode} from "./ScriptNode";
import {CommentNode} from "./CommentNode";
import {WaypointEdge} from "./WaypointEdge";
import {NodeUpdateContext} from "./NodeUpdateContext";
import {CanvasContextMenu} from "./CanvasContextMenu";
import {NodeContextMenu} from "./NodeContextMenu";
import {conditionToExpr, graphToRhai} from "./graphToRhai";
import {type NodeKind, type ScriptNodeData} from "./NodeDefinitions";
import {useScriptingPrefs} from "../../../hooks/useScriptingPrefs";
import {parseDirectives} from "../../../lib/scripting/directives";
import type {Block} from "../visual/block-types";

const NODE_TYPES_MAP = {
    entry: ScriptNode, say: ScriptNode, reply: ScriptNode,
    action: ScriptNode, variable: ScriptNode, condition: ScriptNode,
    stop: ScriptNode, random: ScriptNode, comment: CommentNode,
};

const EDGE_TYPES_MAP = {waypoint: WaypointEdge};

function buildEntryNode(d?: Partial<ScriptNodeData>): Node<ScriptNodeData> {
    return {
        id: "entry", type: "entry",
        position: {x: 80, y: 80},
        data: {
            kind: "entry",
            trigger: d?.trigger ?? "!command",
            aliases: d?.aliases ?? "",
            description: d?.description ?? "",
            roles: d?.roles ?? "everyone",
            platform: d?.platform ?? "all",
            cooldown: d?.cooldown ?? 0,
            userCooldown: d?.userCooldown ?? 0,
        },
    };
}

interface CtxMenu {
    x: number;
    y: number
}

interface NodeCtxMenu {
    x: number;
    y: number;
    nodeId: string;
    nodeLabel: string;
    isEntry: boolean
}

export interface NodeCanvasHandle {
    getNodes: () => Node<ScriptNodeData>[];
    getEdges: () => Edge[];
}

interface Props {
    onChange: (rhai: string) => void;
    initialNodes?: Node<ScriptNodeData>[];
    initialEdges?: Edge[];
    onStateChange?: (nodes: Node<ScriptNodeData>[], edges: Edge[]) => void;
    initialText?: string;
}

let _id = 100;
const uid = () => `n${++_id}`;

const EDGE_STYLE = {stroke: "#2a2a2a", strokeWidth: 1.5};

function Canvas({onChange, initialNodes, initialEdges, onStateChange, initialText}: Props) {
    const [prefs] = useScriptingPrefs();
    const {zoomIn, zoomOut, fitView, screenToFlowPosition} = useReactFlow();

    // Build entry node from parsed directives on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initialEntry = useMemo(() => {
        if (!initialText) return buildEntryNode();
        const d = parseDirectives(initialText);
        return buildEntryNode({
            trigger: d.trigger,
            aliases: (d.aliases ?? []).join(", "),
            description: d.description,
            roles: d.roles?.length ? d.roles.join(", ") : "everyone",
            platform: d.platform,
            cooldown: d.cooldown,
            userCooldown: d.user_cooldown,
        });
    }, []);                                   // intentional [] — once at mount

    const [nodes, setNodes, onNodesChange] = useNodesState<ScriptNodeData>(initialNodes ?? [initialEntry]);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges ?? []);
    const [locked, setLocked] = useState(false);
    const [ctx, setCtx] = useState<CtxMenu | null>(null);
    const [nodeCtx, setNodeCtx] = useState<NodeCtxMenu | null>(null);

    const nodeTypes = useMemo(() => NODE_TYPES_MAP, []);
    const edgeTypes = useMemo(() => EDGE_TYPES_MAP, []);
    const edgesRef = useRef(edges);
    edgesRef.current = edges;
    const hist = useHistory();

    const emit = useCallback((nds: Node<ScriptNodeData>[], eds: Edge[]) => {
        onChange(graphToRhai(nds, eds));
        onStateChange?.(nds, eds);
    }, [onChange, onStateChange]);

    // Push a history snapshot after every action that changes graph structure.
    const commit = useCallback((nds: Node<ScriptNodeData>[], eds: Edge[]) => {
        emit(nds, eds);
        hist.push(nds, eds);
    }, [emit, hist]);

    const applySnap = useCallback((snap: { nodes: Node<ScriptNodeData>[]; edges: Edge[] }) => {
        hist.busy.current = true;
        setNodes(snap.nodes);
        setEdges(snap.edges);
        emit(snap.nodes, snap.edges);
        hist.busy.current = false;
    }, [emit, hist, setEdges, setNodes]);

    // Debounce history pushes while typing so we don't create a snapshot per keystroke.
    const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const commitDebounced = useCallback((nds: Node<ScriptNodeData>[], eds: Edge[]) => {
        if (commitTimer.current) clearTimeout(commitTimer.current);
        commitTimer.current = setTimeout(() => hist.push(nds, eds), 600);
    }, [hist]);

    const updateNodeData = useCallback((nodeId: string, patch: Partial<ScriptNodeData>) => {
        setNodes((nds) => {
            const next = nds.map((n) => n.id === nodeId ? {...n, data: {...n.data, ...patch}} : n);
            emit(next, edgesRef.current);
            commitDebounced(next, edgesRef.current);
            return next;
        });
    }, [commitDebounced, emit, setNodes]);

    // Listen for waypoint updates dispatched by WaypointEdge.
    useEffect(() => {
        const handler = (e: Event) => {
            const {edgeId, waypoints} = (e as CustomEvent).detail;
            setEdges((eds) => {
                const next = eds.map((ed) =>
                    ed.id === edgeId ? {...ed, data: {...ed.data, waypoints}} : ed
                );
                setNodes((nds) => {
                    emit(nds, next);
                    commitDebounced(nds, next);
                    return nds;
                });
                return next;
            });
        };
        window.addEventListener("__rf_waypoints__", handler);
        return () => window.removeEventListener("__rf_waypoints__", handler);
    }, [commitDebounced, emit, setEdges, setNodes]);

    const onConnect = useCallback((params: Connection) => {
        setEdges((eds) => {
            const next = addEdge({
                ...params,
                type: "waypoint",
                animated: true,
                style: EDGE_STYLE,
                data: {waypoints: []}
            }, eds);
            setNodes((nds) => {
                commit(nds, next);
                return nds;
            });
            return next;
        });
    }, [commit, setEdges, setNodes]);

    const handleNodesChange: typeof onNodesChange = useCallback((changes) => {
        onNodesChange(changes);
        setNodes((nds) => {
            emit(nds, edgesRef.current);
            return nds;
        });
    }, [emit, onNodesChange, setNodes]);

    // Keyboard: Delete removes selected nodes/edges; Ctrl+Z/Y for undo/redo.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const inInput = (e.target as HTMLElement).closest("input, textarea, select");

            // Undo / Redo — work even inside inputs.
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
                e.preventDefault();
                const snap = hist.travel(-1);
                if (snap) applySnap(snap);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
                e.preventDefault();
                const snap = hist.travel(1);
                if (snap) applySnap(snap);
                return;
            }

            if (inInput) return;
            if (e.key !== "Delete" && e.key !== "Backspace") return;

            setNodes((nds) => {
                const toDelete = new Set(nds.filter((n) => n.selected && n.id !== "entry").map((n) => n.id));
                const nextNodes = toDelete.size > 0 ? nds.filter((n) => !toDelete.has(n.id)) : nds;
                setEdges((eds) => {
                    const nextEds = eds
                        .filter((ed) => !ed.selected)
                        .filter((ed) => !toDelete.has(ed.source) && !toDelete.has(ed.target));
                    if (nextNodes !== nds || nextEds.length !== eds.length) commit(nextNodes, nextEds);
                    return nextEds;
                });
                return nextNodes;
            });
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [applySnap, commit, hist, setEdges, setNodes]);

    // Click on an edge to remove it.
    const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
        setEdges((eds) => {
            const next = eds.filter((e) => e.id !== edge.id);
            setNodes((nds) => {
                commit(nds, next);
                return nds;
            });
            return next;
        });
    }, [commit, setEdges, setNodes]);

    const addNode = useCallback((block: Block, screenX: number, screenY: number) => {
        const kind = ((): NodeKind => {
            if (block.type === "if") return "condition";
            if (block.type === "require") return "condition";
            if (block.type === "stop") return "stop";
            if (block.type === "comment") return "comment";
            return block.type as NodeKind;
        })();

        const pos = screenToFlowPosition({x: screenX - 110, y: screenY - 30});

        const base: Node<ScriptNodeData> = {id: uid(), type: kind, position: pos, data: {kind}};

        if (kind === "comment") {
            const b = block as any;
            const cStyle: "note" | "comment" | "section" = b.style ?? "note";
            base.zIndex = -1;
            base.data = {
                kind, commentText: "", commentStyle: cStyle,
                commentColor: b.color ?? "#f59e0b",
                commentOpacity: 0.12,
                commentWidth: cStyle === "section" ? 340 : 220,
                commentHeight: cStyle === "section" ? 56 : cStyle === "comment" ? 44 : 120,
            };
        } else if (kind === "condition") {
            base.data = {kind, condition: conditionToExpr((block as any).condition) || "user.isMod()"};
        } else if (kind === "say" || kind === "reply") {
            base.data = {kind, message: ""};
        } else if (kind === "random") {
            base.data = {kind, messages: ["", ""]};
        } else if (kind === "action") {
            base.data = {kind, action: (block as any).name ?? "", actionArgs: ""};
        } else if (kind === "variable") {
            base.data = {kind, varName: "", varValue: ""};
        }

        setNodes((nds) => {
            const next = [...nds, base];
            commit(next, edgesRef.current);
            return next;
        });
    }, [commit, screenToFlowPosition, setNodes]);

    const deleteNode = useCallback((id: string) => {
        setNodes((nds) => {
            const next = nds.filter((n) => n.id !== id);
            setEdges((eds) => {
                const nextEds = eds.filter((e) => e.source !== id && e.target !== id);
                commit(next, nextEds);
                return nextEds;
            });
            return next;
        });
    }, [commit, setEdges, setNodes]);

    const duplicateNode = useCallback((id: string) => {
        setNodes((nds) => {
            const src = nds.find((n) => n.id === id);
            if (!src) return nds;
            const copy: Node<ScriptNodeData> = {
                ...src, id: uid(),
                position: {x: src.position.x + 40, y: src.position.y + 40}, data: {...src.data}
            };
            const next = [...nds, copy];
            commit(next, edgesRef.current);
            return next;
        });
    }, [commit, setNodes]);

    const disconnectNode = useCallback((id: string) => {
        setEdges((eds) => {
            const next = eds.filter((e) => e.source !== id && e.target !== id);
            setNodes((nds) => {
                commit(nds, next);
                return nds;
            });
            return next;
        });
    }, [commit, setEdges, setNodes]);

    const clearAll = () => {
        setNodes([initialEntry]);
        setEdges([]);
        commit([initialEntry], []);
    };

    const bringToFront = useCallback((id: string) => {
        setNodes((nds) => {
            const maxZ = Math.max(0, ...nds.map((n) => n.zIndex ?? 0));
            const next = nds.map((n) => n.id === id ? {...n, zIndex: maxZ + 1} : n);
            commit(next, edgesRef.current);
            return next;
        });
    }, [commit, setNodes]);

    const sendToBack = useCallback((id: string) => {
        setNodes((nds) => {
            const minZ = Math.min(0, ...nds.map((n) => n.zIndex ?? 0));
            const next = nds.map((n) => n.id === id ? {...n, zIndex: minZ - 1} : n);
            commit(next, edgesRef.current);
            return next;
        });
    }, [commit, setNodes]);

    const handlePaneContextMenu = useCallback((e: React.MouseEvent) => {
        if (prefs.palettePosition !== "right") {
            e.preventDefault();
            setNodeCtx(null);
            setCtx({x: e.clientX, y: e.clientY});
        }
    }, [prefs.palettePosition]);

    const handlePaneClick = useCallback((e: React.MouseEvent) => {
        setNodeCtx(null);
        if (prefs.palettePosition === "right") setCtx({x: e.clientX, y: e.clientY});
    }, [prefs.palettePosition]);

    const contextValue = useMemo(() => updateNodeData, [updateNodeData]);

    return (
        <NodeUpdateContext.Provider value={contextValue}>
            <div style={{display: "flex", flexDirection: "column", height: "100%", minHeight: 0}}>

                <div className="flex items-center gap-1 px-3 flex-shrink-0"
                     style={{height: 32, backgroundColor: "#090909", borderBottom: "1px solid #111"}}>
          <span style={{fontSize: 10, color: "#1e1e1e", flex: 1}}>
            {prefs.palettePosition === "right" ? "Left-click canvas to add" : "Right-click canvas to add"}
              {" · Click an edge to remove it · Delete key removes selection"}
          </span>
                    <Btn title="Undo (Ctrl+Z)" onClick={() => {
                        const s = hist.travel(-1);
                        if (s) applySnap(s);
                    }}><Undo2 size={12}/></Btn>
                    <Btn title="Redo (Ctrl+Y)" onClick={() => {
                        const s = hist.travel(1);
                        if (s) applySnap(s);
                    }}><Redo2 size={12}/></Btn>
                    <div style={{width: 1, height: 14, backgroundColor: "#1e1e1e", margin: "0 2px"}}/>
                    <Btn title="Fit view" onClick={() => fitView({duration: 300})}><Maximize2 size={12}/></Btn>
                    <Btn title="Zoom in" onClick={() => zoomIn({duration: 200})}><ZoomIn size={12}/></Btn>
                    <Btn title="Zoom out" onClick={() => zoomOut({duration: 200})}><ZoomOut size={12}/></Btn>
                    <Btn title={locked ? "Unlock" : "Lock"} onClick={() => setLocked((v) => !v)} active={locked}>
                        {locked ? <Lock size={12}/> : <Unlock size={12}/>}
                    </Btn>
                    <Btn title="Clear all nodes" onClick={clearAll} danger><Trash2 size={12}/></Btn>
                </div>

                <div style={{flex: 1, minHeight: 0}}>
                    <ReactFlow
                        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                        onNodesChange={handleNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onEdgeClick={onEdgeClick}
                        onNodeDragStop={(_e, _n, nds) => commit(nds, edgesRef.current)}
                        onPaneContextMenu={handlePaneContextMenu as any}
                        onPaneClick={handlePaneClick as any}
                        onNodeContextMenu={(e, node) => {
                            e.preventDefault();
                            setCtx(null);
                            setNodeCtx({
                                x: e.clientX, y: e.clientY,
                                nodeId: node.id,
                                nodeLabel: (node.data as ScriptNodeData).action
                                    ? (node.data as ScriptNodeData).action + "()"
                                    : (node.data as ScriptNodeData).kind,
                                isEntry: node.id === "entry",
                            });
                        }}
                        nodesDraggable={!locked}
                        nodesConnectable={!locked}
                        fitView
                        style={{backgroundColor: "#0a0a0a"}}
                        edgeTypes={edgeTypes}
                        defaultEdgeOptions={{
                            type: "waypoint",
                            animated: true,
                            style: EDGE_STYLE,
                            data: {waypoints: []}
                        }}
                        proOptions={{hideAttribution: true}}>
                        <Background variant={BackgroundVariant.Dots} color="#161616" gap={24} size={1}/>
                    </ReactFlow>
                </div>

                {ctx && (
                    <CanvasContextMenu x={ctx.x} y={ctx.y}
                                       onAdd={(b) => {
                                           addNode(b, ctx.x, ctx.y);
                                           setCtx(null);
                                       }}
                                       onClose={() => setCtx(null)}/>
                )}
                {nodeCtx && (
                    <NodeContextMenu
                        x={nodeCtx.x} y={nodeCtx.y}
                        nodeId={nodeCtx.nodeId} nodeLabel={nodeCtx.nodeLabel} isEntry={nodeCtx.isEntry}
                        onDelete={() => deleteNode(nodeCtx.nodeId)}
                        onDuplicate={() => duplicateNode(nodeCtx.nodeId)}
                        onDisconnect={() => disconnectNode(nodeCtx.nodeId)}
                        onBringToFront={() => bringToFront(nodeCtx.nodeId)}
                        onSendToBack={() => sendToBack(nodeCtx.nodeId)}
                        onClose={() => setNodeCtx(null)}/>
                )}
            </div>
        </NodeUpdateContext.Provider>
    );
}

function Btn({children, title, onClick, active, danger}: {
    children: React.ReactNode; title: string; onClick: () => void; active?: boolean; danger?: boolean;
}) {
    return (
        <button title={title} onClick={onClick} style={{
            width: 26, height: 26, borderRadius: 4, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            backgroundColor: active ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "transparent",
            color: active ? "var(--color-accent)" : "#3a3a3a",
            border: `1px solid ${active ? "color-mix(in srgb, var(--color-accent) 30%, transparent)" : "transparent"}`,
        }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.color = danger ? "#ef4444" : "#c0c0c0";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.color = active ? "var(--color-accent)" : "#3a3a3a";
                }}>
            {children}
        </button>
    );
}

export function NodeCanvas(props: Props) {
    return <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>;
}
