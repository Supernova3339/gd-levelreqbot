import React, {useMemo, useRef, useState} from "react";
import {useScriptingPrefs} from "../../../hooks/useScriptingPrefs";
import {useEditorErrors} from "./useEditorErrors";
import {useScriptingKeybinds} from "./useScriptingKeybinds";
import {TextEditor} from "./TextEditor";
import {DirectivePanel} from "./DirectivePanel";
import {ScriptTestPanel} from "./ScriptTestPanel";
import {parseFlow} from "../canvas/graphToRhai";
import type {Directive} from "../../../lib/scripting/directives";
import {buildScript, getBodyText, parseDirectives} from "../../../lib/scripting/directives";
import type {Edge, Node} from "reactflow";
import type {ScriptNodeData} from "../canvas/NodeDefinitions";

interface Props {
    initialText: string;
    onChange: (t: string) => void;
    commandName?: string;
    editorMode: "text" | "visual";   // set per-command, not switchable here
    cmdId?: number | "new";
}

export function ScriptEditor({initialText, onChange, commandName, editorMode, cmdId}: Props) {
    const [prefs] = useScriptingPrefs();

    // ── Parse initial text into directives + body ───────────────────────────────
    const [directive, setDirective] = useState<Directive>(() => parseDirectives(initialText));
    const [bodyText, setBodyText] = useState(() => getBodyText(initialText));

    // Combine directive + body into a full script string for saving
    const buildFull = (d: Directive, body: string) => buildScript(d, body);

    // Expose combined text to parent via onChange
    const emitChange = (d: Directive, body: string) => {
        onChange(buildFull(d, body));
    };

    const handleDirectiveChange = (d: Directive) => {
        setDirective(d);
        emitChange(d, bodyText);
    };

    const handleBodyChange = (body: string) => {
        setBodyText(body);
        emitChange(directive, body);
    };

    const errors = useEditorErrors(bodyText);

    // Used by text ref in CommandsPage to get current full text
    const fullTextRef = useRef(buildFull(directive, bodyText));
    fullTextRef.current = buildFull(directive, bodyText);

    // Canvas state
    const flow = useMemo(() => parseFlow(initialText), []);
    const savedNodes = useRef<Node<ScriptNodeData>[] | undefined>(flow?.nodes as Node<ScriptNodeData>[] | undefined);
    const savedEdges = useRef<Edge[] | undefined>(flow?.edges as Edge[] | undefined);

    // Test panel visibility — persisted so it stays open across navigation
    const [testOpen, setTestOpen] = useState(() => localStorage.getItem("gdlqbot.testpanel_open") === "1");
    // Ref to imperatively trigger a run from the keybind
    const runRef = useRef<(() => void) | null>(null);

    // Pass BODY text only to the keybinds hook — the comment toggle operates on what
    // the textarea actually shows, not the full script including directive lines.
    const bodyTextRef = useRef(bodyText);
    bodyTextRef.current = bodyText;

    useScriptingKeybinds({
        onSwitchMode: () => {
        },
        getText: () => bodyTextRef.current,
        setText: (body) => {
            setBodyText(body);
            emitChange(directive, body);
        },
    });

    const handleVisual = (rhai: string) => {
        // Visual editor produces full text including @editor directive; parse it
        const d = parseDirectives(rhai);
        const b = getBodyText(rhai);
        setDirective(d);
        setBodyText(b);
        onChange(rhai);
    };

    return (
        <div className="flex flex-col flex-1" style={{minHeight: 0}}>
            {editorMode === "visual" ? (
                <>
                    <NodeCanvasLazy
                        onChange={handleVisual}
                        savedNodes={savedNodes}
                        savedEdges={savedEdges}
                        initialText={initialText}
                    />
                </>
            ) : (
                <>
                    {/* Directive metadata panel */}
                    <DirectivePanel directive={directive} onChange={handleDirectiveChange}/>

                    {/* Text editor — shows only the Rhai body */}
                    <TextEditor
                        text={bodyText}
                        onChange={handleBodyChange}
                        errors={errors}
                        prefs={prefs}
                        commandName={commandName}
                        onRunTest={() => {
                            // Always open the panel and trigger a run
                            if (!testOpen) {
                                setTestOpen(true);
                                localStorage.setItem("gdlqbot.testpanel_open", "1");
                                // Run after the panel mounts (next tick)
                                setTimeout(() => runRef.current?.(), 50);
                            } else {
                                runRef.current?.();
                            }
                        }}
                    />

                    {/* Script tester */}
                    {testOpen && (
                        <ScriptTestPanel
                            getText={() => fullTextRef.current}
                            cmdId={cmdId ?? "new"}
                            onClose={() => {
                                setTestOpen(false);
                                localStorage.removeItem("gdlqbot.testpanel_open");
                            }}
                            onRunRef={(fn) => {
                                runRef.current = fn;
                            }}
                        />
                    )}
                </>
            )}
        </div>
    );
}

// ── Lazy canvas loader ────────────────────────────────────────────────────────

interface LazyProps {
    onChange: (rhai: string) => void;
    savedNodes: React.MutableRefObject<Node<ScriptNodeData>[] | undefined>;
    savedEdges: React.MutableRefObject<Edge[] | undefined>;
    initialText: string;
}

function NodeCanvasLazy({onChange, savedNodes, savedEdges, initialText}: LazyProps) {
    const [Canvas, setCanvas] = useState<React.ComponentType<any> | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        import("../canvas/NodeCanvas").then((m) => {
            if (!cancelled) setCanvas(() => m.NodeCanvas);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!Canvas) {
        return (
            <div className="flex-1 flex items-center justify-center" style={{backgroundColor: "#090909"}}>
                <span style={{color: "#1e1e1e", fontSize: 11}}>Loading canvas…</span>
            </div>
        );
    }
    return (
        <Canvas
            onChange={onChange}
            initialNodes={savedNodes.current}
            initialEdges={savedEdges.current}
            onStateChange={(nodes: Node<ScriptNodeData>[], edges: Edge[]) => {
                savedNodes.current = nodes;
                savedEdges.current = edges;
            }}
            initialText={initialText}
        />
    );
}
