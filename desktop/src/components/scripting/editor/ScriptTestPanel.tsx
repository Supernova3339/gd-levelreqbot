// Script test panel — runs the current script with mock inputs.
// Tabs: Run | Console. Resizable via drag handle. Heights and tab state persisted.

import {useCallback, useEffect, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";

interface TestResult {
    output: string[];
    console: string[];
    errors: string[];
    elapsed_ms: number;
}

interface RunEntry {
    id: number;
    ts: string;
    username: string;
    args: string;
    result: TestResult;
}

interface MockInputs {
    username: string;
    args: string;
    platform: "twitch" | "youtube";
    is_mod: boolean;
    is_sub: boolean;
    is_broadcaster: boolean;
}

const INPUTS_KEY = (id: number | "new") => `gdlqbot.testinputs.${id}`;
const TAB_KEY = "gdlqbot.testpanel_tab";
const HEIGHT_KEY = "gdlqbot.testpanel_height";
const MIN_H = 140, MAX_H = 480, DEFAULT_H = 240;

const DEFAULT_INPUTS: MockInputs = {
    username: "testuser", args: "", platform: "twitch",
    is_mod: false, is_sub: false, is_broadcaster: false,
};

function loadInputs(id: number | "new"): MockInputs {
    try {
        const raw = localStorage.getItem(INPUTS_KEY(id));
        if (raw) return {...DEFAULT_INPUTS, ...JSON.parse(raw)};
    } catch { /* ignore */
    }
    return DEFAULT_INPUTS;
}

function ts(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

let runSeq = 0;

interface Props {
    getText: () => string;
    cmdId: number | "new";
    onClose: () => void;
    onRunRef?: (fn: () => void) => void;  // lets parent trigger a run imperatively
}

const FIELD: React.CSSProperties = {
    backgroundColor: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 5,
    color: "#c0c0c0", fontSize: 11, padding: "5px 9px", outline: "none",
    fontFamily: "inherit",
};

function Badge({label, active, onClick}: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} style={{
            padding: "2px 8px", borderRadius: 3, fontSize: 10, cursor: "pointer",
            border: `1px solid ${active ? "#3a3a5a" : "#1a1a1a"}`,
            backgroundColor: active ? "#1a1a2e" : "transparent",
            color: active ? "#a5b4fc" : "#444",
            transition: "all 0.1s",
        }}>
            {label}
        </button>
    );
}

export function ScriptTestPanel({getText, cmdId, onClose, onRunRef}: Props) {
    const [tab, setTab] = useState<"run" | "console">(() =>
        (localStorage.getItem(TAB_KEY) as "run" | "console" | null) ?? "run"
    );
    const [height, setHeight] = useState(() => {
        const saved = parseInt(localStorage.getItem(HEIGHT_KEY) ?? "", 10);
        return isNaN(saved) ? DEFAULT_H : Math.max(MIN_H, Math.min(MAX_H, saved));
    });
    const [inputs, setInputs] = useState<MockInputs>(() => loadInputs(cmdId));
    const [running, setRunning] = useState(false);
    const [lastResult, setLastResult] = useState<TestResult | null>(null);
    const [log, setLog] = useState<RunEntry[]>([]);
    const consoleRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef(false);

    // ── Drag-to-resize ────────────────────────────────────────────────────────
    const dragRef = useRef<{ startY: number; startH: number } | null>(null);

    const onDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dragRef.current = {startY: e.clientY, startH: height};

        const onMove = (ev: MouseEvent) => {
            if (!dragRef.current) return;
            // Dragging UP increases height (panel grows toward top of editor)
            const delta = dragRef.current.startY - ev.clientY;
            const next = Math.max(MIN_H, Math.min(MAX_H, dragRef.current.startH + delta));
            setHeight(next);
        };
        const onUp = () => {
            if (dragRef.current) {
                localStorage.setItem(HEIGHT_KEY, String(Math.round(
                    Math.max(MIN_H, Math.min(MAX_H, dragRef.current.startH +
                        (dragRef.current.startY - ((dragRef.current as unknown as {
                            lastY: number
                        }).lastY ?? dragRef.current.startY))))
                )));
                dragRef.current = null;
            }
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        const onMoveWithSave = (ev: MouseEvent) => {
            onMove(ev);
            (dragRef.current as unknown as { lastY: number }).lastY = ev.clientY;
        };

        window.addEventListener("mousemove", onMoveWithSave);
        window.addEventListener("mouseup", onUp);
    }, [height]);

    // Persist height changes
    useEffect(() => {
        localStorage.setItem(HEIGHT_KEY, String(height));
    }, [height]);

    const switchTab = (t: "run" | "console") => {
        setTab(t);
        localStorage.setItem(TAB_KEY, t);
    };

    // Expose `run` to parent so Ctrl+Enter keybind can trigger it
    useEffect(() => {
        onRunRef?.(run);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onRunRef]);

    // Auto-scroll console
    useEffect(() => {
        if (tab === "console") consoleRef.current?.scrollTo({top: 9999, behavior: "instant"});
    }, [log, tab]);

    const updInputs = (patch: Partial<MockInputs>) => {
        setInputs((prev) => {
            const next = {...prev, ...patch};
            try {
                localStorage.setItem(INPUTS_KEY(cmdId), JSON.stringify(next));
            } catch { /* ignore */
            }
            return next;
        });
    };

    const run = async () => {
        abortRef.current = false;
        setRunning(true);
        setLastResult(null);
        try {
            const full = getText();
            const body = full.split("\n").filter((l) => !/^\s*\/\/\s*@/.test(l)).join("\n").trim();
            const args = inputs.args.trim() ? inputs.args.trim().split(/\s+/) : [];
            const res = await invoke<TestResult>("test_script", {
                script: body, username: inputs.username || "testuser", args,
                platform: inputs.platform, isMod: inputs.is_mod,
                isSub: inputs.is_sub, isBroadcaster: inputs.is_broadcaster,
            });
            if (!abortRef.current) {
                setLastResult(res);
                setLog((prev) => [...prev.slice(-99), {
                    id: ++runSeq, ts: ts(), username: inputs.username || "testuser", args: inputs.args, result: res,
                }]);
                if (res.errors.length > 0) switchTab("console");
            }
        } catch (e) {
            if (!abortRef.current) {
                const res: TestResult = {output: [], console: [], errors: [String(e)], elapsed_ms: 0};
                setLastResult(res);
                setLog((prev) => [...prev.slice(-99), {
                    id: ++runSeq,
                    ts: ts(),
                    username: inputs.username || "testuser",
                    args: inputs.args,
                    result: res
                }]);
                switchTab("console");
            }
        } finally {
            setRunning(false);
        }
    };

    const hasErrors = log.some((e) => e.result.errors.length > 0);

    return (
        <div style={{
            borderTop: "1px solid #111", backgroundColor: "#090909",
            flexShrink: 0, display: "flex", flexDirection: "column",
            height, minHeight: MIN_H, maxHeight: MAX_H,
        }}>

            {/* ── Drag handle ── */}
            <div
                onMouseDown={onDragStart}
                style={{
                    height: 5, cursor: "ns-resize", flexShrink: 0,
                    borderBottom: "1px solid #111",
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}
                title="Drag to resize">
                <div style={{width: 32, height: 2, borderRadius: 2, backgroundColor: "#1e1e1e"}}/>
            </div>

            {/* ── Tab bar + run button + close ── */}
            <div style={{
                display: "flex", alignItems: "center", height: 34,
                borderBottom: "1px solid #111", flexShrink: 0, paddingLeft: 8,
            }}>
                <Tab label="Run" active={tab === "run"} onClick={() => switchTab("run")}/>
                <Tab label="Console" active={tab === "console"} onClick={() => switchTab("console")}
                     badge={hasErrors ? "!" : log.length > 0 ? String(log.length) : undefined}
                     badgeErr={hasErrors}/>
                <div style={{flex: 1}}/>

                {/* Spinner + run */}
                <button onClick={run} disabled={running} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "3px 12px", borderRadius: 4, marginRight: 6,
                    border: `1px solid ${running ? "#1e2e1e" : "#1e3a1e"}`,
                    backgroundColor: running ? "#0a150a" : "#0c1f0c",
                    color: running ? "#2a5a2a" : "#4ade80",
                    fontSize: 11, cursor: running ? "not-allowed" : "pointer", flexShrink: 0,
                }}
                        onMouseEnter={(e) => {
                            if (!running) e.currentTarget.style.backgroundColor = "#112211";
                        }}
                        onMouseLeave={(e) => {
                            if (!running) e.currentTarget.style.backgroundColor = "#0c1f0c";
                        }}>
                    {running
                        ? <span style={{
                            width: 8,
                            height: 8,
                            border: "1.5px solid #4ade80",
                            borderTopColor: "transparent",
                            borderRadius: "50%",
                            display: "inline-block",
                            animation: "tspin 0.5s linear infinite"
                        }}/>
                        : <span style={{fontSize: 10}}>▶</span>}
                    {running ? "Running…" : "Run"}
                </button>

                <button onClick={onClose} style={{
                    padding: "0 8px", color: "#2a2a2a", background: "none", border: "none",
                    cursor: "pointer", fontSize: 16, lineHeight: "34px", flexShrink: 0,
                }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#888";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#2a2a2a";
                        }}>
                    ×
                </button>
            </div>

            {/* ── Run tab ── */}
            {tab === "run" && (
                <div style={{flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 0}}>
                    {/* Inputs grid */}
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8, padding: "10px 12px 8px",
                        borderBottom: "1px solid #0f0f0f",
                    }}>
                        {/* Left col */}
                        <div style={{display: "flex", flexDirection: "column", gap: 6}}>
                            <Row label="Username">
                                <input value={inputs.username} onChange={(e) => updInputs({username: e.target.value})}
                                       placeholder="testuser" style={{...FIELD, flex: 1}}
                                       onFocus={(e) => {
                                           e.target.style.borderColor = "#2a2a2a";
                                       }}
                                       onBlur={(e) => {
                                           e.target.style.borderColor = "#1a1a1a";
                                       }}
                                       onKeyDown={(e) => {
                                           if (e.key === "Enter") run();
                                       }}/>
                            </Row>
                            <Row label="Args">
                                <input value={inputs.args} onChange={(e) => updInputs({args: e.target.value})}
                                       placeholder="arg1 arg2…" style={{...FIELD, flex: 1}}
                                       onFocus={(e) => {
                                           e.target.style.borderColor = "#2a2a2a";
                                       }}
                                       onBlur={(e) => {
                                           e.target.style.borderColor = "#1a1a1a";
                                       }}
                                       onKeyDown={(e) => {
                                           if (e.key === "Enter") run();
                                       }}/>
                            </Row>
                        </div>
                        {/* Right col */}
                        <div style={{display: "flex", flexDirection: "column", gap: 6}}>
                            <Row label="Platform">
                                <div style={{display: "flex", gap: 3}}>
                                    {(["twitch", "youtube"] as const).map((p) => (
                                        <Badge key={p} label={p[0].toUpperCase() + p.slice(1)}
                                               active={inputs.platform === p} onClick={() => updInputs({platform: p})}/>
                                    ))}
                                </div>
                            </Row>
                            <Row label="Roles">
                                <div style={{display: "flex", gap: 3}}>
                                    {([["is_mod", "Mod"], ["is_sub", "Sub"], ["is_broadcaster", "Owner"]] as const).map(([k, label]) => (
                                        <Badge key={k} label={label} active={inputs[k]}
                                               onClick={() => updInputs({[k]: !inputs[k]})}/>
                                    ))}
                                </div>
                            </Row>
                        </div>
                    </div>

                    {/* Results */}
                    <div style={{
                        flex: 1,
                        overflow: "auto",
                        padding: "8px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4
                    }}>
                        {!lastResult && (
                            <p style={{fontSize: 11, color: "#1e1e1e", fontStyle: "italic", marginTop: 4}}>
                                Configure inputs above, then press ▶ Run (or Ctrl+Enter).
                            </p>
                        )}
                        {lastResult && (
                            <>
                                <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 2}}>
                                    <span style={{fontSize: 10, color: "#1e1e1e"}}>{lastResult.elapsed_ms}ms</span>
                                    {lastResult.errors.length > 0 && <span style={{
                                        fontSize: 10,
                                        color: "#f87171"
                                    }}>{lastResult.errors.length} error{lastResult.errors.length !== 1 ? "s" : ""}</span>}
                                    {lastResult.output.length > 0 &&
                                        <span style={{fontSize: 10, color: "#4ade80"}}>{lastResult.output.length} chat message{lastResult.output.length !== 1 ? "s" : ""}</span>}
                                    {lastResult.console.length > 0 && <span style={{
                                        fontSize: 10,
                                        color: "#888"
                                    }}>{lastResult.console.length} log{lastResult.console.length !== 1 ? "s" : ""}</span>}
                                </div>
                                {lastResult.output.length === 0 && lastResult.errors.length === 0 && lastResult.console.length === 0 && (
                                    <span style={{fontSize: 11, color: "#2a2a2a", fontStyle: "italic"}}>No output</span>
                                )}
                                {lastResult.errors.map((err, i) => (
                                    <ResultLine key={`e${i}`} type="error" text={err}/>
                                ))}
                                {lastResult.output.map((line, i) => (
                                    <ResultLine key={`o${i}`} type="chat" text={line}/>
                                ))}
                                {lastResult.console.map((line, i) => (
                                    <ResultLine key={`c${i}`} type="log" text={line}/>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Console tab ── */}
            {tab === "console" && (
                <div style={{flex: 1, display: "flex", flexDirection: "column", minHeight: 0}}>
                    <div ref={consoleRef} style={{
                        flex: 1,
                        overflow: "auto",
                        padding: "6px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 5
                    }}>
                        {log.length === 0 ? (
                            <p style={{fontSize: 11, color: "#1e1e1e", fontStyle: "italic", marginTop: 4}}>
                                No runs yet. Results will accumulate here.
                            </p>
                        ) : log.map((entry) => (
                            <div key={entry.id} style={{
                                borderLeft: `2px solid ${entry.result.errors.length > 0 ? "#3a1010" : "#0f2a0f"}`,
                                paddingLeft: 8, paddingBottom: 4,
                            }}>
                                <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 3}}>
                                    <span style={{
                                        fontSize: 9,
                                        color: "#1e1e1e",
                                        fontFamily: "monospace"
                                    }}>{entry.ts}</span>
                                    <code style={{fontSize: 10, color: "#444"}}>{entry.username}</code>
                                    {entry.args && <code style={{fontSize: 10, color: "#2a2a2a"}}>{entry.args}</code>}
                                    <span style={{
                                        marginLeft: "auto",
                                        fontSize: 9,
                                        color: "#1a1a1a"
                                    }}>{entry.result.elapsed_ms}ms</span>
                                </div>
                                {entry.result.errors.map((err, i) => <ResultLine key={`e${i}`} type="error"
                                                                                 text={err}/>)}
                                {entry.result.output.map((l, i) => <ResultLine key={`o${i}`} type="chat" text={l}/>)}
                                {entry.result.console.map((l, i) => <ResultLine key={`c${i}`} type="log" text={l}/>)}
                                {entry.result.output.length === 0 && entry.result.console.length === 0 && entry.result.errors.length === 0 && (
                                    <span style={{fontSize: 11, color: "#1e1e1e", fontStyle: "italic"}}>No output</span>
                                )}
                            </div>
                        ))}
                    </div>
                    {log.length > 0 && (
                        <div style={{
                            borderTop: "1px solid #0f0f0f",
                            padding: "4px 12px",
                            display: "flex",
                            justifyContent: "flex-end"
                        }}>
                            <button onClick={() => setLog([])}
                                    style={{
                                        fontSize: 10,
                                        color: "#2a2a2a",
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer"
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.color = "#f87171";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.color = "#2a2a2a";
                                    }}>
                                Clear
                            </button>
                        </div>
                    )}
                </div>
            )}

            <style>{`@keyframes tspin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Tab({label, active, onClick, badge, badgeErr}: {
    label: string; active: boolean; onClick: () => void; badge?: string; badgeErr?: boolean;
}) {
    return (
        <button onClick={onClick} style={{
            padding: "0 12px", height: "100%", fontSize: 11,
            color: active ? "#c0c0c0" : "#444",
            borderBottom: active ? "1px solid var(--color-accent)" : "1px solid transparent",
            background: "none",
            outline: "none",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
        }}
                onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.color = "#888";
                }}
                onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.color = "#444";
                }}>
            {label}
            {badge && (
                <span style={{
                    fontSize: 9, fontWeight: 700, padding: "0 4px", borderRadius: 3,
                    lineHeight: "14px", backgroundColor: badgeErr ? "#3a1010" : "#1a1a1a",
                    color: badgeErr ? "#f87171" : "#555",
                }}>{badge}</span>
            )}
        </button>
    );
}

function Row({label, children}: { label: string; children: React.ReactNode }) {
    return (
        <div style={{display: "flex", alignItems: "center", gap: 8}}>
      <span style={{
          fontSize: 9,
          color: "#333",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontWeight: 600,
          minWidth: 52,
          flexShrink: 0
      }}>
        {label}
      </span>
            {children}
        </div>
    );
}

function ResultLine({type, text}: { type: "chat" | "log" | "error"; text: string }) {
    const styles = {
        chat: {bg: "#081508", border: "#1a2a1a", color: "#86efac", icon: "💬"},
        log: {bg: "#0a0a0a", border: "#141414", color: "#666", icon: "›"},
        error: {bg: "#150808", border: "#2a1010", color: "#f87171", icon: "✕"},
    }[type];
    return (
        <div style={{
            display: "flex", alignItems: "flex-start", gap: 6,
            padding: "3px 8px", borderRadius: 4,
            backgroundColor: styles.bg, border: `1px solid ${styles.border}`,
            fontSize: 11, color: styles.color,
            fontFamily: '"JetBrains Mono","Fira Code",monospace',
        }}>
            <span style={{flexShrink: 0, fontSize: type === "log" ? 14 : 11}}>{styles.icon}</span>
            <span style={{wordBreak: "break-all"}}>{text}</span>
        </div>
    );
}
