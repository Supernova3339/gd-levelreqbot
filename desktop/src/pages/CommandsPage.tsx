import {useEffect, useRef, useState} from "react";
import {useCommands} from "../hooks/useCommands";
import {useSnackbar} from "../components/Snackbar";
import {CloseIcon, PlusIcon, SearchIcon} from "../components/icons";
import {ScriptEditor} from "../components/scripting/index";
import {NewCommandModal} from "../components/scripting/NewCommandModal";
import {
    createCommand as createCommandApi,
    duplicateCommand as duplicateCommandApi,
    saveScript,
    updateCommand
} from "../lib/commands";
import {
    buildScript,
    BUILTIN_SCRIPTS,
    dbToRoles,
    type Directive,
    parseDirectives,
    rolesToDb,
} from "../lib/scripting/index";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Command {
    id: number;
    trigger: string;
    aliases: string[];
    enabled: boolean;
    description: string;
    builtin_key: string | null;
    response: string | null;
    required_badges: string[];
    cooldown_seconds: number;
    user_cooldown_seconds: number;
    platform: string;
    counter: number;
    script: string | null;
    script_mode: string;   // "text" | "visual" — locked at creation
}

type Category = "all" | "queue" | "custom";
type Selection = null | { mode: "new"; script: string } | Command;

const QUEUE_KEYS = new Set(["request", "next", "list", "position", "remove", "clear", "info"]);
const isQueue = (c: Command) => !!(c.builtin_key && QUEUE_KEYS.has(c.builtin_key));


// ─── Helpers ──────────────────────────────────────────────────────────────────

function initialTextForCmd(cmd: Command): string {
    // Scripts are now raw Rhai text — store and display as-is
    if (cmd.script) return cmd.script;
    // Built-in with no override → show the default Rhai script
    if (cmd.builtin_key && BUILTIN_SCRIPTS[cmd.builtin_key]) return BUILTIN_SCRIPTS[cmd.builtin_key];
    // Custom command with only a plain response text → wrap it
    const d: Directive = {
        trigger: cmd.trigger, aliases: cmd.aliases,
        description: cmd.description, roles: dbToRoles(cmd.required_badges),
        platform: cmd.platform as Directive["platform"],
        cooldown: cmd.cooldown_seconds, user_cooldown: cmd.user_cooldown_seconds,
    };
    const body = cmd.response ? `chat_say(${JSON.stringify(cmd.response)});` : "";
    return buildScript(d, body);
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
    selection: { mode: "new"; script: string } | Command;
    onClose: () => void;
    onSaved: (created?: Command) => void;
}

const DRAFT_KEY = (id: number | "new") => `gdlqbot.draft.${id}`;

function DetailPanel({selection, onClose, onSaved}: DetailPanelProps) {
    const isNew = "mode" in selection;
    const cmd = isNew ? null : selection as Command;
    const isBuiltin = !isNew && !!cmd?.builtin_key;
    const hasOverride = !isNew && isBuiltin && !!cmd?.script;
    const cmdId: number | "new" = isNew ? "new" : cmd!.id;

    const snackbar = useSnackbar();
    const initialText = isNew ? selection.script : initialTextForCmd(cmd!);
    const textRef = useRef<string>(initialText);
    const [saving, setSaving] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [draft, setDraft] = useState<string | null>(null);
    // For saved commands read from DB column; for new commands parse from the script directive.
    const editorMode: "text" | "visual" = isNew
        ? (parseDirectives(initialText).editor ?? "text")
        : (cmd!.script_mode === "visual" ? "visual" : "text");

    // Check for saved draft on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(DRAFT_KEY(cmdId));
            if (saved && saved !== initialText) setDraft(saved);
        } catch { /* ignore */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-save draft debounced
    const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleChange = (t: string) => {
        textRef.current = t;
        setDirty(t !== initialText);
        if (draftTimer.current) clearTimeout(draftTimer.current);
        draftTimer.current = setTimeout(() => {
            try {
                localStorage.setItem(DRAFT_KEY(cmdId), t);
            } catch { /* ignore */
            }
        }, 5000);
    };

    // Ctrl+S / Cmd+S → save without closing
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const text = textRef.current;
            const d = parseDirectives(text);
            const trigger = (d.trigger || cmd?.trigger || "!newcommand").trim();
            const aliases = JSON.stringify(d.aliases ?? []);
            const desc = d.description ?? "";
            const roles = JSON.stringify(rolesToDb(d.roles ?? []));
            const platform = d.platform ?? "all";
            const cd = d.cooldown ?? 0;
            const ucd = d.user_cooldown ?? 0;

            // Save the full Rhai text (including // @directive lines) directly
            if (isNew) {
                const newMode = parseDirectives(text).editor ?? "text";
                const raw = await createCommandApi(trigger, "", desc, newMode);
                await updateCommand(raw.id, trigger, aliases, true, desc, null, roles, cd, ucd, platform);
                await saveScript(raw.id, text);
                const createdCmd: Command = {
                    id: raw.id, trigger, aliases: JSON.parse(aliases), enabled: true,
                    description: desc, builtin_key: null, response: null,
                    required_badges: rolesToDb(d.roles ?? []),
                    cooldown_seconds: cd, user_cooldown_seconds: ucd, platform,
                    counter: 0, script: text, script_mode: newMode,
                };
                snackbar({message: "Command created.", variant: "success"});
                try {
                    localStorage.removeItem(DRAFT_KEY("new"));
                } catch { /* ignore */
                }
                setDirty(false);
                setDraft(null);
                onSaved(createdCmd);
            } else {
                await updateCommand(cmd!.id, trigger, aliases, cmd!.enabled, desc, null, roles, cd, ucd, platform);
                await saveScript(cmd!.id, text);
                snackbar({message: "Saved.", variant: "success"});
                try {
                    localStorage.removeItem(DRAFT_KEY(cmd!.id));
                } catch { /* ignore */
                }
                setDirty(false);
                setDraft(null);
                onSaved();
            }
            // Stay on the command after saving — don't close
        } catch (err) {
            snackbar({message: String(err), variant: "error"});
        } finally {
            setSaving(false);
        }
    };

    const handleDuplicate = async () => {
        if (!cmd) return;
        try {
            const dup = await duplicateCommandApi(cmd.id);
            snackbar({message: `Duplicated as ${dup.trigger}.`, variant: "success"});
            onSaved();
        } catch (err) {
            snackbar({message: String(err), variant: "error"});
        }
    };

    const handleDelete = async () => {
        if (!confirm) {
            setConfirm(true);
            return;
        }
        try {
            const {invoke} = await import("@tauri-apps/api/core");
            await invoke("delete_command", {id: cmd!.id});
            snackbar({message: "Command deleted.", variant: "info"});
            onSaved();
            onClose();
        } catch (err) {
            snackbar({message: String(err), variant: "error"});
        }
    };

    const handleReset = async () => {
        try {
            await saveScript(cmd!.id, null);
            snackbar({message: "Reset to built-in behavior.", variant: "info"});
            onSaved();
        } catch (err) {
            snackbar({message: String(err), variant: "error"});
        }
    };

    const handleResetCounter = async () => {
        try {
            const {invoke} = await import("@tauri-apps/api/core");
            await invoke("reset_counter", {id: cmd!.id});
            snackbar({message: "Counter reset.", variant: "info"});
            onSaved();
        } catch (err) {
            snackbar({message: String(err), variant: "error"});
        }
    };

    const commandName = isNew ? "newcommand" : cmd!.trigger.replace(/^!/, "");

    return (
        <div className="flex flex-col h-full" style={{minHeight: 0}}>

            {/* ── Editor header ── */}
            <div className="flex items-center flex-shrink-0"
                 style={{
                     height: 34,
                     backgroundColor: "#090909",
                     borderBottom: "1px solid #111",
                     paddingLeft: 12,
                     paddingRight: 6,
                     gap: 6
                 }}>

                {/* Command trigger */}
                <code className="text-xs font-semibold truncate flex-1 min-w-0" style={{color: "#888"}}>
                    {isNew ? "new command" : cmd!.trigger}
                </code>

                {/* Badges — only show what adds real info */}
                {isBuiltin && !hasOverride && (
                    <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{backgroundColor: "#111", color: "#444", border: "1px solid #1e1e1e", fontSize: 10}}>
            built-in
          </span>
                )}
                {hasOverride && (
                    <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{
                              backgroundColor: "#0a1a0a",
                              color: "#4ade80",
                              border: "1px solid #1a2a1a",
                              fontSize: 10
                          }}
                          title="Script override active">
            overriding built-in
          </span>
                )}
                {editorMode === "visual" && (
                    <span className="text-xs flex-shrink-0" style={{color: "#333", fontSize: 10}}>⬡ flow</span>
                )}
                {!isNew && cmd!.counter > 0 && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs" style={{color: "#2a2a2a"}}>{cmd!.counter.toLocaleString()}×</span>
                        <button onClick={handleResetCounter} title="Reset counter"
                                style={{
                                    color: "#222",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: 11,
                                    lineHeight: 1
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "#666";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "#222";
                                }}>↺
                        </button>
                    </div>
                )}

                {/* Close */}
                <button onClick={onClose} className="flex-shrink-0 p-1"
                        style={{color: "#2a2a2a"}}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#c0c0c0";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#2a2a2a";
                        }}>
                    <CloseIcon size={11}/>
                </button>
            </div>

            {/* ── Draft restore banner ── */}
            {draft && (
                <div className="flex items-center gap-2 flex-shrink-0 px-3 py-1.5"
                     style={{backgroundColor: "#1a1500", borderBottom: "1px solid #2a2000", fontSize: 11}}>
                    <span style={{color: "#f59e0b"}}>Unsaved draft from a previous session.</span>
                    <button onClick={() => {
                        handleChange(draft);
                        setDraft(null);
                    }}
                            className="px-2 py-0.5 rounded text-xs"
                            style={{backgroundColor: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44"}}>
                        Restore
                    </button>
                    <button onClick={() => {
                        try {
                            localStorage.removeItem(DRAFT_KEY(cmdId));
                        } catch { /* ignore */
                        }
                        setDraft(null);
                    }}
                            className="text-xs" style={{color: "#444"}}>
                        Discard
                    </button>
                </div>
            )}

            {/* ── Editor (fills remaining space) ── */}
            <div className="flex-1 flex flex-col" style={{minHeight: 0}}>
                <ScriptEditor
                    key={`${isNew ? "new" : cmd!.id}-${editorMode}`}
                    initialText={draft ?? initialText}
                    onChange={handleChange}
                    commandName={commandName}
                    editorMode={editorMode}
                    cmdId={cmdId}
                />
            </div>

            {/* ── Status bar ── */}
            <div className="flex items-center gap-1.5 flex-shrink-0 px-3"
                 style={{height: 34, backgroundColor: "#080808", borderTop: "1px solid #141414"}}>
                <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-1.5 text-xs px-3 py-1 rounded font-semibold"
                        style={{backgroundColor: "var(--color-accent)", color: "#fff", opacity: saving ? 0.5 : 1}}>
                    {dirty && !saving && <span style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        backgroundColor: "#fff",
                        flexShrink: 0,
                        display: "inline-block"
                    }}/>}
                    {saving ? "Saving…" : isNew ? "Create" : "Save"}
                </button>
                <button onClick={onClose} className="text-xs px-2 py-1 rounded"
                        style={{color: "#555", border: "1px solid #1e1e1e"}}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#f1f1f1";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#555";
                        }}>
                    Cancel
                </button>

                <div style={{flex: 1}}/>

                {/* Duplicate */}
                {!isNew && !isBuiltin && (
                    <button onClick={handleDuplicate} className="text-xs px-2 py-1 rounded"
                            title="Duplicate command"
                            style={{color: "#444", border: "1px solid #1e1e1e"}}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = "#c0c0c0";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = "#444";
                            }}>
                        ⧉ Duplicate
                    </button>
                )}

                {!isNew && isBuiltin && (
                    <button onClick={handleReset} className="text-xs px-2 py-1 rounded"
                            style={{color: "#444"}}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = "#f1f1f1";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = "#444";
                            }}>
                        Reset to default
                    </button>
                )}
                {!isNew && !isBuiltin && (
                    <button onClick={handleDelete} className="text-xs px-2 py-1 rounded"
                            style={{
                                color: confirm ? "#fff" : "#ef4444",
                                backgroundColor: confirm ? "#ef4444" : "transparent",
                                border: `1px solid ${confirm ? "#ef4444" : "#2a1010"}`
                            }}
                            onBlur={() => setConfirm(false)}>
                        {confirm ? "Confirm delete" : "Delete"}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({onNew}: { onNew: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-3"
             style={{backgroundColor: "#0d0d0d"}}>
            <p className="text-xs" style={{color: "#2a2a2a"}}>select a command to edit</p>
            <button onClick={onNew}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded"
                    style={{backgroundColor: "var(--color-accent)", color: "#fff"}}>
                <PlusIcon size={12}/> New command
            </button>
        </div>
    );
}

// ─── Commands page ────────────────────────────────────────────────────────────

export function CommandsPage() {
    const {commands, loading, toggleCommand, reload} = useCommands();
    const [filter, setFilter] = useState<Category>("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Selection>(null);
    const [showModal, setShowModal] = useState(false);
    const snackbar = useSnackbar();

    const filtered = commands.filter((c) => {
        if (filter === "queue" && !isQueue(c)) return false;
        if (filter === "custom" && isQueue(c)) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return c.trigger.toLowerCase().includes(q)
            || c.description.toLowerCase().includes(q)
            || c.aliases.some((a) => a.toLowerCase().includes(q));
    });

    const counts = {
        all: commands.length,
        queue: commands.filter(isQueue).length,
        custom: commands.filter((c) => !isQueue(c)).length,
    };

    const handleToggle = async (id: number, enabled: boolean) => {
        try {
            await toggleCommand(id, enabled);
        } catch (err) {
            snackbar({message: String(err), variant: "error"});
        }
    };

    const isActiveCmd = (cmd: Command) =>
        selected !== null &&
        "id" in selected && (selected as Command).id === cmd.id;

    return (
        <div className="flex h-full" style={{minHeight: 0}}>

            {/* ── Left panel ── */}
            <div className="flex flex-col flex-shrink-0"
                 style={{width: 240, borderRight: "1px solid #111", backgroundColor: "#0a0a0a"}}>

                {/* Search + new */}
                <div className="flex items-center gap-1.5 px-2 py-1.5 flex-shrink-0"
                     style={{borderBottom: "1px solid #111"}}>
                    <div className="relative flex-1">
                        <SearchIcon size={11} className="absolute"
                                    style={{
                                        left: 7,
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        color: "#2a2a2a",
                                        pointerEvents: "none"
                                    }}/>
                        <input value={search} onChange={(e) => setSearch(e.target.value)}
                               placeholder="Filter commands…"
                               className="w-full py-1 text-xs rounded"
                               style={{
                                   backgroundColor: "#111",
                                   color: "#c0c0c0",
                                   border: "1px solid #1a1a1a",
                                   paddingLeft: 24,
                                   paddingRight: search ? 22 : 8
                               }}
                               onFocus={(e) => {
                                   e.currentTarget.style.borderColor = "var(--color-accent)44";
                               }}
                               onBlur={(e) => {
                                   e.currentTarget.style.borderColor = "#1a1a1a";
                               }}
                        />
                        {search && (
                            <button onClick={() => setSearch("")} className="absolute"
                                    style={{right: 5, top: "50%", transform: "translateY(-50%)", color: "#444"}}>
                                <CloseIcon size={9}/>
                            </button>
                        )}
                    </div>
                    <button onClick={() => setShowModal(true)}
                            title="New command"
                            className="flex items-center justify-center rounded flex-shrink-0"
                            style={{backgroundColor: "var(--color-accent)", color: "#fff", width: 24, height: 24}}>
                        <PlusIcon size={12}/>
                    </button>
                </div>

                {/* Filter tabs */}
                <div className="flex flex-shrink-0" style={{borderBottom: "1px solid #111"}}>
                    {(["all", "queue", "custom"] as Category[]).map((cat) => (
                        <button key={cat} onClick={() => setFilter(cat)}
                                className="flex-1 py-1 text-xs capitalize"
                                style={{
                                    color: filter === cat ? "var(--color-accent)" : "#333",
                                    borderBottom: filter === cat ? "1px solid var(--color-accent)" : "1px solid transparent",
                                    backgroundColor: "transparent",
                                }}>
                            {cat}
                            <span className="ml-1"
                                  style={{color: filter === cat ? "color-mix(in srgb, var(--color-accent) 50%, transparent)" : "#1e1e1e"}}>
                {counts[cat]}
              </span>
                        </button>
                    ))}
                </div>

                {/* Command list */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <p className="text-xs text-center py-8" style={{color: "#222"}}>Loading…</p>
                    ) : filtered.length === 0 ? (
                        <p className="text-xs text-center py-8" style={{color: "#222"}}>
                            {search ? "No matches" : "No commands"}
                        </p>
                    ) : filtered.map((cmd) => {
                        const active = isActiveCmd(cmd);
                        return (
                            <button key={cmd.id} onClick={() => setSelected(cmd)}
                                    className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
                                    style={{
                                        backgroundColor: active ? "color-mix(in srgb, var(--color-accent) 6%, #0d0d0d)" : "transparent",
                                        borderLeft: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
                                        opacity: cmd.enabled ? 1 : 0.35,
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!active) e.currentTarget.style.backgroundColor = "#0f0f0f";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!active) e.currentTarget.style.backgroundColor = "transparent";
                                    }}>

                                {/* Status dot */}
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{backgroundColor: cmd.enabled ? "#22c55e" : "#1e1e1e"}}/>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <code className="text-xs font-medium truncate"
                                              style={{color: active ? "var(--color-accent)" : "#888"}}>
                                            {cmd.trigger}
                                        </code>
                                        {/* Script override dot on built-ins */}
                                        {cmd.script && cmd.builtin_key && (
                                            <span className="w-1 h-1 rounded-full flex-shrink-0"
                                                  style={{backgroundColor: "#4ade8066"}}/>
                                        )}
                                    </div>
                                    {cmd.description && (
                                        <p className="text-xs truncate mt-0.5" style={{color: "#2a2a2a"}}>
                                            {cmd.description}
                                        </p>
                                    )}
                                </div>

                                {/* Counter */}
                                {cmd.counter > 0 && (
                                    <span className="text-xs flex-shrink-0 tabular-nums" style={{color: "#2a2a2a"}}>
                    {cmd.counter >= 1000 ? `${(cmd.counter / 1000).toFixed(1)}k` : cmd.counter}
                  </span>
                                )}

                                {/* Toggle */}
                                <label className="relative flex-shrink-0"
                                       onClick={(e) => e.stopPropagation()}
                                       style={{cursor: "pointer"}}>
                                    <input type="checkbox" className="sr-only" checked={cmd.enabled}
                                           onChange={(e) => handleToggle(cmd.id, e.target.checked)}/>
                                    <div className="w-6 h-3 rounded-full"
                                         style={{
                                             backgroundColor: cmd.enabled ? "var(--color-accent)" : "#1a1a1a",
                                             border: "1px solid #2a2a2a"
                                         }}>
                                        <div className="absolute top-0.5 w-2 h-2 bg-white rounded-full"
                                             style={{
                                                 transform: cmd.enabled ? "translateX(13px)" : "translateX(1px)",
                                                 transition: "transform 0.15s"
                                             }}/>
                                    </div>
                                </label>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Right panel ── */}
            <div className="flex-1 min-w-0 flex flex-col" style={{minHeight: 0}}>
                {selected === null && (
                    <EmptyState onNew={() => setShowModal(true)}/>
                )}
                {selected !== null && (
                    <DetailPanel
                        key={"id" in selected ? (selected as Command).id : "new"}
                        selection={selected as { mode: "new"; script: string } | Command}
                        onClose={() => setSelected(null)}
                        onSaved={(created) => {
                            reload();
                            if (created) setSelected(created);
                        }}
                    />
                )}
            </div>

            {/* ── New command modal ── */}
            {showModal && (
                <NewCommandModal
                    onPick={(script) => {
                        setSelected({mode: "new", script});
                        setShowModal(false);
                    }}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
}
