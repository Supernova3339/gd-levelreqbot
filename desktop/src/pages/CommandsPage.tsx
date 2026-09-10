import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {useCommands} from "../hooks/useCommands";
import {useSnackbar} from "../components/Snackbar";
import {CloseIcon, PlusIcon, SearchIcon} from "../components/icons";
import {ScriptEditor} from "../components/scripting/index";
import {NewCommandModal} from "../components/scripting/NewCommandModal";
import {ModuleUpdateDiffModal} from "../components/scripting/ModuleUpdateDiffModal";
import {
    createCommand as createCommandApi,
    duplicateCommand as duplicateCommandApi,
    type ListenerDef,
    listModules,
    readModuleScriptForBuiltin,
    reorderCommands,
    saveScript,
    sortSectionCommands,
    updateCommand,
} from "../lib/commands";
import {buildScript, dbToRoles, type Directive, getBodyText, parseDirectives, rolesToDb,} from "../lib/scripting/index";
import {findLockViolations} from "../lib/scripting/lockRegions";
import type {ModuleManifest} from "../lib/types";

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
    script_mode: string;
    sort_order: number;
    chat_enabled: boolean;
    listeners: ListenerDef[];
}

type Selection = null | { mode: "new"; script: string } | Command;

// ─── Module icon set ──────────────────────────────────────────────────────────

const MODULE_SVG: Record<string, React.ReactElement> = {
    queue: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="3" width="14" height="2" rx="1" opacity="0.9"/>
        <rect x="1" y="7" width="10" height="2" rx="1" opacity="0.7"/>
        <rect x="1" y="11" width="12" height="2" rx="1" opacity="0.5"/>
    </svg>,
    music: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6 2v8.17A3 3 0 1 0 8 13V5l5-1V2H6Z"/>
    </svg>,
    points: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <polygon points="8,2 10,6 14,6.5 11,9.5 11.5,14 8,12 4.5,14 5,9.5 2,6.5 6,6"/>
    </svg>,
    polls: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <rect x="2" y="10" width="3" height="4" rx="0.5" opacity="0.5"/>
        <rect x="6.5" y="6" width="3" height="8" rx="0.5" opacity="0.7"/>
        <rect x="11" y="2" width="3" height="12" rx="0.5"/>
    </svg>,
    coins: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="8" r="6" opacity="0.3"/>
        <circle cx="8" cy="8" r="4" opacity="0.6"/>
        <circle cx="8" cy="8" r="2"/>
    </svg>,
};

function ModuleIcon({name, color}: { name: string; color: string }) {
    const icon = MODULE_SVG[name];
    return (
        <span style={{color, display: "flex", alignItems: "center", flexShrink: 0}}>
            {icon ?? <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <rect x="2" y="2" width="12" height="12" rx="2" opacity="0.5"/>
            </svg>}
        </span>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The DB row is always the source of truth for trigger/aliases/roles/platform/
 *  cooldowns/listener — module scripts carry no `// @` directives of their own,
 *  and a previously-saved override might have stale/wrong ones baked in from
 *  before this was fixed, so those must never be trusted over the DB row. */
function directiveFromCmd(cmd: Command): Directive {
    return {
        trigger: cmd.trigger, aliases: cmd.aliases,
        description: cmd.description, roles: dbToRoles(cmd.required_badges),
        platform: cmd.platform as Directive["platform"],
        cooldown: cmd.cooldown_seconds, user_cooldown: cmd.user_cooldown_seconds,
        chatEnabled: cmd.chat_enabled,
        listeners: cmd.listeners,
    };
}

function initialTextForCmd(cmd: Command): string {
    if (cmd.builtin_key) {
        // Module-owned: metadata always comes from the DB row, never from
        // whatever's embedded in the (possibly stale) override script text.
        const body = cmd.script ? getBodyText(cmd.script) : "";
        return buildScript(directiveFromCmd(cmd), body);
    }
    if (cmd.script) return cmd.script;
    const body = cmd.response ? `chat_say(${JSON.stringify(cmd.response)});` : "";
    return buildScript(directiveFromCmd(cmd), body);
}

// ─── Command row ──────────────────────────────────────────────────────────────

const CmdRow = React.memo(function CmdRow({
                                              cmd, active, onSelect, onToggle, indent = false,
                                              dragging, dragOver, sectionKey,
                                              onStartDrag,
                                          }: {
    cmd: Command; active: boolean; onSelect: (c: Command) => void;
    onToggle: (id: number, enabled: boolean) => void; indent?: boolean;
    dragging?: boolean; dragOver?: boolean; sectionKey?: string;
    onStartDrag?: (cmdId: number, sectionKey: string) => void;
}) {
    const [hovered, setHovered] = useState(false);
    return (
        <button
            onClick={() => onSelect(cmd)}
            data-cmd-id={String(cmd.id)}
            data-section-key={sectionKey}
            className="w-full flex items-center gap-2 text-left"
            style={{
                padding: indent ? "4px 10px 4px 28px" : "5px 10px",
                backgroundColor: dragOver
                    ? "color-mix(in srgb, var(--color-accent) 12%, #0d0d0d)"
                    : active
                        ? "color-mix(in srgb, var(--color-accent) 8%, #0d0d0d)"
                        : "transparent",
                borderLeft: `2px solid ${dragOver ? "var(--color-accent)" : active ? "var(--color-accent)" : "transparent"}`,
                opacity: dragging ? 0.35 : cmd.enabled ? 1 : 0.38,
                cursor: "pointer",
            }}
            onMouseEnter={e => {
                setHovered(true);
                if (!active && !dragOver) e.currentTarget.style.backgroundColor = "#0f0f0f";
            }}
            onMouseLeave={e => {
                setHovered(false);
                if (!active && !dragOver) e.currentTarget.style.backgroundColor = "transparent";
            }}
        >
            {onStartDrag && (
                <span
                    style={{
                        color: dragging ? "var(--color-accent)" : "#555",
                        flexShrink: 0, lineHeight: 1, fontSize: 9, letterSpacing: 0,
                        cursor: "grab", touchAction: "none",
                        opacity: hovered || dragging ? 1 : 0,
                        transition: "opacity 0.12s",
                    }}
                    title="Drag to reorder"
                    onPointerDown={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        onStartDrag(cmd.id, sectionKey ?? "");
                    }}
                >⣿</span>
            )}
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{backgroundColor: cmd.enabled ? "#22c55e" : "#1e1e1e"}}/>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                    <code className="text-xs font-medium truncate"
                          style={{color: active ? "var(--color-accent)" : "#777"}}>
                        {cmd.trigger}
                    </code>
                    {cmd.script && cmd.builtin_key && (
                        <span className="w-1 h-1 rounded-full flex-shrink-0"
                              style={{backgroundColor: "#4ade8066"}}/>
                    )}
                </div>
                {cmd.description && (
                    <p className="text-xs truncate" style={{color: "#2a2a2a", lineHeight: 1.2}}>
                        {cmd.description}
                    </p>
                )}
            </div>
            {cmd.counter > 0 && (
                <span className="text-xs flex-shrink-0 tabular-nums" style={{color: "#2a2a2a"}}>
                    {cmd.counter >= 1000 ? `${(cmd.counter / 1000).toFixed(1)}k` : cmd.counter}
                </span>
            )}
            <label
                className="relative flex-shrink-0"
                onClick={e => e.stopPropagation()}
                style={{cursor: "pointer"}}
            >
                <input type="checkbox" className="sr-only" checked={cmd.enabled}
                       onChange={e => onToggle(cmd.id, e.target.checked)}/>
                <div className="w-6 h-3 rounded-full" style={{
                    backgroundColor: cmd.enabled ? "var(--color-accent)" : "#1a1a1a",
                    border: "1px solid #2a2a2a",
                }}>
                    <div className="absolute top-0.5 w-2 h-2 bg-white rounded-full" style={{
                        transform: cmd.enabled ? "translateX(13px)" : "translateX(1px)",
                        transition: "transform 0.15s",
                    }}/>
                </div>
            </label>
        </button>
    );
});

// ─── Sort button ─────────────────────────────────────────────────────────────

function SortButton({label, title, active, onClick}: {
    label: string; title: string; active?: boolean;
    onClick: (e: React.MouseEvent) => void;
}) {
    const [hov, setHov] = useState(false);
    return (
        <button
            title={title}
            onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                fontSize: 9, padding: "1px 4px", borderRadius: 3,
                color: hov ? "#aaa" : active ? "#666" : "#333",
                backgroundColor: hov ? "#1a1a1a" : "transparent",
                lineHeight: 1.4, cursor: "pointer", transition: "color 0.1s",
            }}
        >{label}</button>
    );
}

// ─── Module section header ────────────────────────────────────────────────────

function ModuleSectionHeader({
                                 module, count, open, onToggle, onSort,
                             }: {
    module: ModuleManifest; count: number; open: boolean; onToggle: () => void;
    onSort: (strategy: "alpha" | "register") => void;
}) {
    const [hov, setHov] = useState(false);
    const defaultSort = module.default_sort ?? "register";
    return (
        <div
            className="w-full flex items-center gap-2 flex-shrink-0"
            style={{
                padding: "6px 10px",
                backgroundColor: hov ? "#111" : "transparent",
                borderLeft: "2px solid transparent",
            }}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
        >
            <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <span style={{
                    color: "#333",
                    fontSize: 9,
                    flexShrink: 0,
                    transform: open ? "rotate(90deg)" : "none",
                    transition: "transform 0.15s",
                }}>▶</span>
                <ModuleIcon name={module.icon} color={module.enabled ? "var(--color-accent)" : "#333"}/>
                <span className="flex-1 text-left text-xs font-semibold truncate"
                      style={{color: module.enabled ? "#888" : "#444"}}>
                    {module.name}
                </span>
                {!module.enabled && (
                    <span style={{fontSize: 9, color: "#333", fontStyle: "italic"}}>off</span>
                )}
            </button>
            {/* Sort buttons — fade in on row hover */}
            <div className="flex items-center gap-0.5 flex-shrink-0"
                 style={{opacity: hov ? 1 : 0, transition: "opacity 0.12s"}}>
                <SortButton label="A→Z" title="Sort alphabetically" active={defaultSort === "alpha"} onClick={e => {
                    e.stopPropagation();
                    onSort("alpha");
                }}/>
                <SortButton label="↺" title="Sort by module order" active={defaultSort === "register"} onClick={e => {
                    e.stopPropagation();
                    onSort("register");
                }}/>
            </div>
            <span className="text-xs tabular-nums flex-shrink-0" style={{color: "#2a2a2a"}}>
                {count}
            </span>
        </div>
    );
}

// ─── Custom section header ────────────────────────────────────────────────────

function CustomSectionHeader({
                                 count, open, onToggle, onSort,
                             }: { count: number; open: boolean; onToggle: () => void; onSort: () => void }) {
    const [hov, setHov] = useState(false);
    return (
        <div
            className="w-full flex items-center gap-2 flex-shrink-0"
            style={{
                padding: "6px 10px",
                backgroundColor: hov ? "#111" : "transparent",
                borderLeft: "2px solid transparent",
                borderTop: "1px solid #111",
                marginTop: 4,
            }}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
        >
            <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <span style={{
                    color: "#333", fontSize: 9, flexShrink: 0,
                    transform: open ? "rotate(90deg)" : "none",
                    transition: "transform 0.15s",
                }}>▶</span>
                <span className="flex-1 text-left text-xs font-semibold" style={{color: "#555"}}>
                    Custom
                </span>
            </button>
            <div className="flex items-center flex-shrink-0"
                 style={{opacity: hov ? 1 : 0, transition: "opacity 0.12s"}}>
                <SortButton label="A→Z" title="Sort alphabetically" onClick={e => {
                    e.stopPropagation();
                    onSort();
                }}/>
            </div>
            <span className="text-xs tabular-nums flex-shrink-0" style={{color: "#2a2a2a"}}>
                {count}
            </span>
        </div>
    );
}

// ─── Detail panel (unchanged) ─────────────────────────────────────────────────

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
    const [resolvedInitial, setResolvedInitial] = useState<string>(initialText);
    const [editorVersion, setEditorVersion] = useState(0);
    const [moduleDefaultBody, setModuleDefaultBody] = useState<string | null>(null);
    const [showDiffModal, setShowDiffModal] = useState(false);
    const [dismissedDiff, setDismissedDiff] = useState(false);

    useEffect(() => {
        if (!isBuiltin || cmd!.script) return;
        readModuleScriptForBuiltin(cmd!.builtin_key!).then(src => {
            if (src) {
                // Metadata still comes from the DB row (see initialTextForCmd) —
                // only the body swaps in from the real module script on disk.
                const merged = buildScript(directiveFromCmd(cmd!), getBodyText(src));
                setResolvedInitial(merged);
                textRef.current = merged;
                setEditorVersion(v => v + 1);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Independent of the effect above (which only fetches when there's no
    // override yet) — this always knows what the module currently ships, so
    // an existing override can be compared against it regardless of whether
    // it diverged because the module updated, the user hand-edited it, or both.
    useEffect(() => {
        if (!isBuiltin) return;
        readModuleScriptForBuiltin(cmd!.builtin_key!).then(src => {
            if (src) setModuleDefaultBody(getBodyText(src));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const overrideBody = hasOverride ? getBodyText(cmd!.script!) : null;
    const hasDiff = hasOverride && moduleDefaultBody !== null && overrideBody !== moduleDefaultBody;
    const editorMode: "text" | "visual" = isNew
        ? (parseDirectives(initialText).editor ?? "text")
        : (cmd!.script_mode === "visual" ? "visual" : "text");

    useEffect(() => {
        try {
            const saved = localStorage.getItem(DRAFT_KEY(cmdId));
            if (saved && saved !== initialText) setDraft(saved);
        } catch { /* ignore */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
            const chatEnabled = d.chatEnabled !== false;
            const listeners: ListenerDef[] = d.listeners ?? [];

            if (isNew) {
                const newMode = parseDirectives(text).editor ?? "text";
                const raw = await createCommandApi(trigger, "", desc, newMode);
                await updateCommand(raw.id, trigger, aliases, true, desc, null, roles, cd, ucd, platform, chatEnabled, listeners);
                await saveScript(raw.id, text);
                const createdCmd: Command = {
                    id: raw.id, trigger, aliases: JSON.parse(aliases), enabled: true,
                    description: desc, builtin_key: null, response: null,
                    required_badges: rolesToDb(d.roles ?? []),
                    cooldown_seconds: cd, user_cooldown_seconds: ucd, platform,
                    counter: 0, script: text, script_mode: newMode, sort_order: raw.sort_order ?? 0,
                    chat_enabled: chatEnabled, listeners,
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
                // Module scripts carry no directive header of their own — only ever store
                // the body as the override, so a future load doesn't parse stale directives
                // back out of it (see initialTextForCmd).
                const bodyToSave = isBuiltin ? getBodyText(text) : text;

                // In-script `// @lock` / `// @unlock` blocks — content-based, not
                // whole-script: everything outside a locked block stays freely
                // editable, but a locked block must survive verbatim into the save.
                if (isBuiltin && moduleDefaultBody !== null) {
                    const violations = findLockViolations(moduleDefaultBody, bodyToSave);
                    if (violations.length > 0) {
                        const lines = violations.map(v => v.startLine === v.endLine ? `line ${v.startLine}` : `lines ${v.startLine}-${v.endLine}`).join(", ");
                        throw new Error(`This module locks part of this script (${lines}) — that part was changed or removed, please remove any changes and try saving again. If you have only made changes here, your changes will not be saved.`);
                    }
                }

                // Module-owned commands' directive fields are always seeded from the DB
                // row (initialTextForCmd/directiveFromCmd), never from a module script's
                // own content — so this is always safe to persist, including for builtin
                // commands, unlike the old skip-for-isBuiltin approach which silently
                // discarded real edits (e.g. a newly added alias never actually saved).
                await updateCommand(cmd!.id, trigger, aliases, cmd!.enabled, desc, null, roles, cd, ucd, platform, chatEnabled, listeners);
                await saveScript(cmd!.id, bodyToSave);
                snackbar({message: "Saved.", variant: "success"});
                try {
                    localStorage.removeItem(DRAFT_KEY(cmd!.id));
                } catch { /* ignore */
                }
                setDirty(false);
                setDraft(null);
                onSaved();
            }
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
            const src = cmd!.builtin_key
                ? await readModuleScriptForBuiltin(cmd!.builtin_key)
                : null;
            if (src) {
                const merged = buildScript(directiveFromCmd(cmd!), getBodyText(src));
                setResolvedInitial(merged);
                textRef.current = merged;
                setEditorVersion(v => v + 1);
                setDirty(false);
            }
            snackbar({message: "Reset to module default.", variant: "info"});
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
            <div className="flex items-center flex-shrink-0" style={{
                height: 34, backgroundColor: "#090909",
                borderBottom: "1px solid #111", paddingLeft: 12, paddingRight: 6, gap: 6,
            }}>
                <code className="text-xs font-semibold truncate flex-1 min-w-0" style={{color: "#888"}}>
                    {isNew ? "new command" : cmd!.trigger}
                </code>
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
                        overriding module default
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
                                    fontSize: 11
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = "#666"}
                                onMouseLeave={e => e.currentTarget.style.color = "#222"}>↺
                        </button>
                    </div>
                )}
                <button onClick={onClose} className="flex-shrink-0 p-1" style={{color: "#2a2a2a"}}
                        onMouseEnter={e => e.currentTarget.style.color = "#c0c0c0"}
                        onMouseLeave={e => e.currentTarget.style.color = "#2a2a2a"}>
                    <CloseIcon size={11}/>
                </button>
            </div>

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
                    }} className="text-xs" style={{color: "#444"}}>Discard
                    </button>
                </div>
            )}

            {hasDiff && !dismissedDiff && (
                <div className="flex items-center gap-2 flex-shrink-0 px-3 py-1.5"
                     style={{backgroundColor: "#0a1520", borderBottom: "1px solid #1a2a3a", fontSize: 11}}>
                    <span style={{color: "#7dd3fc"}}>This differs from the module's current version.</span>
                    <button onClick={() => setShowDiffModal(true)}
                            className="px-2 py-0.5 rounded text-xs"
                            style={{backgroundColor: "#7dd3fc22", color: "#7dd3fc", border: "1px solid #7dd3fc44"}}>
                        View diff
                    </button>
                    <button onClick={() => setDismissedDiff(true)} className="text-xs" style={{color: "#444"}}>Dismiss
                    </button>
                </div>
            )}

            {showDiffModal && overrideBody !== null && moduleDefaultBody !== null && (
                <ModuleUpdateDiffModal
                    trigger={cmd!.trigger}
                    oldText={overrideBody}
                    newText={moduleDefaultBody}
                    onClose={() => setShowDiffModal(false)}
                    onKeep={() => {
                        setShowDiffModal(false);
                        setDismissedDiff(true);
                    }}
                    onUpdate={() => {
                        setShowDiffModal(false);
                        setDismissedDiff(true);
                        handleReset();
                    }}
                />
            )}

            <div className="flex-1 flex flex-col" style={{minHeight: 0}}>
                <ScriptEditor
                    key={`${isNew ? "new" : cmd!.id}-${editorMode}-${editorVersion}`}
                    initialText={draft ?? resolvedInitial}
                    onChange={handleChange}
                    commandName={commandName}
                    editorMode={editorMode}
                    cmdId={cmdId}
                    isModuleScript={isBuiltin}
                />
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 px-3"
                 style={{height: 34, backgroundColor: "#080808", borderTop: "1px solid #141414"}}>
                <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-1.5 text-xs px-3 py-1 rounded font-semibold"
                        style={{backgroundColor: "var(--color-accent)", color: "#fff", opacity: saving ? 0.5 : 1}}>
                    {dirty && !saving && (
                        <span style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            backgroundColor: "#fff",
                            flexShrink: 0,
                            display: "inline-block"
                        }}/>
                    )}
                    {saving ? "Saving…" : isNew ? "Create" : "Save"}
                </button>
                <button onClick={onClose} className="text-xs px-2 py-1 rounded"
                        style={{color: "#555", border: "1px solid #1e1e1e"}}
                        onMouseEnter={e => e.currentTarget.style.color = "#f1f1f1"}
                        onMouseLeave={e => e.currentTarget.style.color = "#555"}>
                    Cancel
                </button>
                <div style={{flex: 1}}/>
                {!isNew && !isBuiltin && (
                    <button onClick={handleDuplicate} className="text-xs px-2 py-1 rounded"
                            title="Duplicate command"
                            style={{color: "#444", border: "1px solid #1e1e1e"}}
                            onMouseEnter={e => e.currentTarget.style.color = "#c0c0c0"}
                            onMouseLeave={e => e.currentTarget.style.color = "#444"}>⧉ Duplicate</button>
                )}
                {!isNew && isBuiltin && (
                    <button onClick={handleReset} className="text-xs px-2 py-1 rounded"
                            style={{color: "#444"}}
                            onMouseEnter={e => e.currentTarget.style.color = "#f1f1f1"}
                            onMouseLeave={e => e.currentTarget.style.color = "#444"}>
                        Reset to default
                    </button>
                )}
                {!isNew && !isBuiltin && (
                    <button onClick={handleDelete} className="text-xs px-2 py-1 rounded"
                            style={{
                                color: confirm ? "#fff" : "#ef4444",
                                backgroundColor: confirm ? "#ef4444" : "transparent",
                                border: `1px solid ${confirm ? "#ef4444" : "#2a1010"}`,
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
    const [modules, setModules] = useState<ModuleManifest[]>([]);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Selection>(null);
    const [showModal, setShowModal] = useState(false);
    const [openSections, setOpenSections] = useState<Set<string>>(new Set());
    const snackbar = useSnackbar();

    // ── Drag state ────────────────────────────────────────────────────────────
    const draggingIdRef = useRef<number | null>(null);
    const draggingSectionRef = useRef<string | null>(null);
    const localOrderRef = useRef<number[] | null>(null);
    const commandsRef = useRef(commands);
    useEffect(() => {
        commandsRef.current = commands;
    }, [commands]);
    // Snapshot of row Y positions taken immediately before each reorder, for FLIP animation.
    const posSnapRef = useRef<Map<number, number> | null>(null);

    const [draggingId, setDraggingId] = useState<number | null>(null);
    const [draggingSection, setDraggingSection] = useState<string | null>(null);
    const [overId, setOverId] = useState<number | null>(null);
    const [localOrder, setLocalOrder] = useState<number[] | null>(null);

    useEffect(() => {
        localOrderRef.current = null;
        setLocalOrder(null);
    }, [commands]);

    // FLIP — after React reorders the DOM, invert the delta then transition to natural position.
    useLayoutEffect(() => {
        const snap = posSnapRef.current;
        if (!snap || snap.size === 0) return;
        posSnapRef.current = null;

        const animated: HTMLElement[] = [];
        document.querySelectorAll<HTMLElement>('[data-cmd-id]').forEach(el => {
            const id = Number(el.dataset.cmdId);
            const oldY = snap.get(id);
            if (oldY === undefined) return;
            const newY = el.getBoundingClientRect().top;
            const dy = oldY - newY;
            if (Math.abs(dy) < 1) return;

            el.style.transition = 'none';
            el.style.transform = `translateY(${dy}px)`;
            el.getBoundingClientRect(); // force reflow
            el.style.transition = 'transform 160ms cubic-bezier(0.25,0.46,0.45,0.94)';
            el.style.transform = '';
            animated.push(el);
        });

        if (animated.length === 0) return;
        const timer = setTimeout(() => {
            animated.forEach(el => {
                el.style.transition = '';
                el.style.transform = '';
            });
        }, 180);
        return () => clearTimeout(timer);
    }, [localOrder]);

    // Commands displayed — uses optimistic order while dragging
    const displayCommands = useMemo(() => {
        if (!localOrder) return commands;
        const map = new Map(commands.map(c => [c.id, c]));
        return localOrder.map(id => map.get(id)).filter(Boolean) as Command[];
    }, [commands, localOrder]);

    // Stable section-membership map (keyed by sectionKey → Set<cmdId>).
    // Computed from server commands (not displayCommands) so it doesn't drift during a drag.
    const sectionIdsMap = useMemo(() => {
        const map = new Map<string, Set<number>>();
        const used = new Set<number>();
        for (const m of modules) {
            const triggers = new Set(m.commands.flatMap(d => [d.trigger, ...(d.aliases ?? [])]));
            const ids = new Set(commands.filter(c => {
                const owns = triggers.has(c.trigger) || c.aliases.some(a => triggers.has(a));
                if (owns) used.add(c.id);
                return owns;
            }).map(c => c.id));
            if (ids.size > 0) map.set(m.id, ids);
        }
        const customIds = new Set(commands.filter(c => !used.has(c.id) && !c.builtin_key).map(c => c.id));
        if (customIds.size > 0) map.set("custom", customIds);
        return map;
    }, [commands, modules]);
    const sectionIdsMapRef = useRef(sectionIdsMap);
    useEffect(() => {
        sectionIdsMapRef.current = sectionIdsMap;
    }, [sectionIdsMap]);

    useEffect(() => {
        listModules().then(mods => {
            setModules(mods);
            setOpenSections(new Set([...mods.filter(m => m.enabled).map(m => m.id), "custom"]));
        }).catch(e => console.error("Failed to load modules", e));
    }, []);

    // Group displayCommands by owning module vs custom
    const {grouped, custom: customCmds, searchResults} = useMemo(() => {
        const q = search.toLowerCase();

        if (q) {
            const flat = displayCommands.filter(c =>
                c.trigger.toLowerCase().includes(q)
                || c.description.toLowerCase().includes(q)
                || c.aliases.some(a => a.toLowerCase().includes(q))
            );
            return {grouped: [], custom: [], searchResults: flat};
        }

        const used = new Set<number>();
        const grouped: { module: ModuleManifest; cmds: Command[] }[] = [];

        for (const m of modules) {
            const moduleTriggers = new Set(m.commands.flatMap(d => [d.trigger, ...(d.aliases ?? [])]));
            const cmds = displayCommands.filter(c => {
                const owns = moduleTriggers.has(c.trigger)
                    || c.aliases.some(a => moduleTriggers.has(a));
                if (owns) used.add(c.id);
                return owns;
            });
            if (cmds.length > 0) grouped.push({module: m, cmds});
        }

        const custom = displayCommands.filter(c => !used.has(c.id) && !c.builtin_key);
        return {grouped, custom, searchResults: null};
    }, [displayCommands, modules, search]);

    const toggleSection = useCallback((id: string) => {
        setOpenSections(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleToggle = useCallback(async (id: number, enabled: boolean) => {
        try {
            await toggleCommand(id, enabled);
        } catch (err) {
            snackbar({message: String(err), variant: "error"});
        }
    }, [toggleCommand, snackbar]);

    const handleSort = useCallback(async (
        sectionCmds: Command[],
        strategy: "alpha" | "register",
        module?: ModuleManifest,
    ) => {
        const ids = sectionCmds.map(c => c.id);
        // For "register" compute manifest order client-side and pass to backend
        let registerOrder: number[] | undefined;
        if (strategy === "register" && module) {
            const pos = new Map<string, number>();
            module.commands.forEach((def, i) => {
                pos.set(def.trigger, i);
                def.aliases?.forEach(a => pos.set(a, i));
            });
            registerOrder = [...sectionCmds]
                .sort((a, b) => {
                    const pa = pos.get(a.trigger) ?? Number.MAX_SAFE_INTEGER;
                    const pb = pos.get(b.trigger) ?? Number.MAX_SAFE_INTEGER;
                    return pa - pb;
                })
                .map(c => c.id);
        }
        try {
            await sortSectionCommands(ids, strategy, registerOrder);
            reload();
        } catch (err) {
            snackbar({message: String(err), variant: "error"});
        }
    }, [reload, snackbar]);

    // Start a pointer-based drag from the handle icon.
    const startDrag = useCallback((cmdId: number, sectionKey: string) => {
        draggingIdRef.current = cmdId;
        draggingSectionRef.current = sectionKey;
        setDraggingId(cmdId);
        setDraggingSection(sectionKey);
    }, []);

    // Window-level pointer listeners — attached only while a drag is active.
    useEffect(() => {
        if (!draggingId) return;

        const onMove = (e: PointerEvent) => {
            const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
            const row = el?.closest('[data-cmd-id]') as HTMLElement | null;
            if (!row) return;
            const targetId = Number(row.dataset.cmdId);
            const sectionKey = row.dataset.sectionKey ?? "";
            if (sectionKey !== draggingSectionRef.current) return;

            const dragId = draggingIdRef.current;
            if (!dragId || dragId === targetId) return;

            const sectionIds = sectionIdsMapRef.current.get(sectionKey);
            if (!sectionIds) return;

            const cmds = commandsRef.current;
            const curOrder = localOrderRef.current;
            const current = curOrder
                ? (curOrder.map(id => cmds.find(c => c.id === id)).filter(Boolean) as Command[])
                : cmds;
            const section = current.filter(c => sectionIds.has(c.id));
            const from = section.findIndex(c => c.id === dragId);
            const to = section.findIndex(c => c.id === targetId);
            if (from === -1 || to === -1 || from === to) return;

            // Only swap once the pointer has crossed the target row's midpoint.
            // This prevents rapid back-and-forth swapping when hovering near a border.
            const rect = row.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (from < to && e.clientY < midY) return; // moving down, not past midpoint
            if (from > to && e.clientY > midY) return; // moving up, not past midpoint

            const reordered = [...section];
            const [moved] = reordered.splice(from, 1);
            reordered.splice(to, 0, moved);
            let ri = 0;
            const newOrder = current
                .map(c => sectionIds.has(c.id) ? reordered[ri++]! : c)
                .map(c => c.id);

            // FLIP — snapshot positions before the DOM update
            const snap = new Map<number, number>();
            document.querySelectorAll<HTMLElement>('[data-cmd-id]').forEach(el => {
                snap.set(Number(el.dataset.cmdId), el.getBoundingClientRect().top);
            });
            posSnapRef.current = snap;

            localOrderRef.current = newOrder;
            setLocalOrder(newOrder);
            setOverId(targetId);
        };

        const onUp = () => {
            const order = localOrderRef.current;
            draggingIdRef.current = null;
            draggingSectionRef.current = null;
            localOrderRef.current = null;
            setDraggingId(null);
            setDraggingSection(null);
            setOverId(null);
            if (order) {
                reorderCommands(order).then(reload).catch(err => {
                    setLocalOrder(null);
                    snackbar({message: String(err), variant: "error"});
                });
            } else {
                setLocalOrder(null);
            }
        };

        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return () => {
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
    }, [draggingId, reload, snackbar]); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-sync selected with the fresh command object after any reload
    useEffect(() => {
        if (!selected || !("id" in selected)) return;
        const id = (selected as Command).id;
        const fresh = commands.find(c => c.id === id);
        if (fresh && fresh !== selected) setSelected(fresh);
    }, [commands]); // eslint-disable-line react-hooks/exhaustive-deps

    const isActiveCmd = (cmd: Command) =>
        selected !== null && "id" in selected && (selected as Command).id === cmd.id;

    const handleSelect = useCallback((cmd: Command) => setSelected(cmd), []);

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
                        <input value={search} onChange={e => setSearch(e.target.value)}
                               placeholder="Filter commands…"
                               className="w-full py-1 text-xs rounded"
                               style={{
                                   backgroundColor: "#111", color: "#c0c0c0",
                                   border: "1px solid #1a1a1a", paddingLeft: 24,
                                   paddingRight: search ? 22 : 8,
                               }}
                               onFocus={e => e.currentTarget.style.borderColor = "var(--color-accent)44"}
                               onBlur={e => e.currentTarget.style.borderColor = "#1a1a1a"}/>
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

                {/* Command list */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <p className="text-xs text-center py-8" style={{color: "#222"}}>Loading…</p>
                    ) : searchResults !== null ? (
                        /* Flat search results — no reordering in search mode */
                        searchResults.length === 0 ? (
                            <p className="text-xs text-center py-8" style={{color: "#222"}}>No matches</p>
                        ) : searchResults.map(cmd => (
                            <CmdRow key={cmd.id} cmd={cmd} active={isActiveCmd(cmd)}
                                    onSelect={handleSelect} onToggle={handleToggle}/>
                        ))
                    ) : (
                        /* Grouped by module */
                        <>
                            {grouped.map(({module, cmds}) => (
                                <div key={module.id}>
                                    <ModuleSectionHeader
                                        module={module} count={cmds.length}
                                        open={openSections.has(module.id)}
                                        onToggle={() => toggleSection(module.id)}
                                        onSort={s => handleSort(cmds, s, module)}
                                    />
                                    {openSections.has(module.id) && cmds.map(cmd => (
                                        <CmdRow key={cmd.id} cmd={cmd} active={isActiveCmd(cmd)}
                                                onSelect={handleSelect} onToggle={handleToggle}
                                                indent sectionKey={module.id}
                                                dragging={draggingId === cmd.id}
                                                dragOver={overId === cmd.id && draggingSection === module.id && draggingId !== cmd.id}
                                                onStartDrag={startDrag}
                                        />
                                    ))}
                                </div>
                            ))}

                            {customCmds.length > 0 && (() => {
                                return (
                                    <div>
                                        <CustomSectionHeader
                                            count={customCmds.length}
                                            open={openSections.has("custom")}
                                            onToggle={() => toggleSection("custom")}
                                            onSort={() => handleSort(customCmds, "alpha")}
                                        />
                                        {openSections.has("custom") && customCmds.map(cmd => (
                                            <CmdRow key={cmd.id} cmd={cmd} active={isActiveCmd(cmd)}
                                                    onSelect={handleSelect} onToggle={handleToggle}
                                                    indent sectionKey="custom"
                                                    dragging={draggingId === cmd.id}
                                                    dragOver={overId === cmd.id && draggingSection === "custom" && draggingId !== cmd.id}
                                                    onStartDrag={startDrag}
                                            />
                                        ))}
                                    </div>
                                );
                            })()}

                            {grouped.length === 0 && customCmds.length === 0 && (
                                <p className="text-xs text-center py-8" style={{color: "#222"}}>No commands</p>
                            )}
                        </>
                    )}
                </div>

                {/* Footer: total count */}
                <div className="flex-shrink-0 px-3 py-1.5"
                     style={{borderTop: "1px solid #111"}}>
                    <span className="text-xs" style={{color: "#2a2a2a"}}>
                        {commands.length} command{commands.length !== 1 ? "s" : ""}
                    </span>
                </div>
            </div>

            {/* ── Right panel ── */}
            <div className="flex-1 min-w-0 flex flex-col" style={{minHeight: 0}}>
                {selected === null && <EmptyState onNew={() => setShowModal(true)}/>}
                {selected !== null && (
                    <DetailPanel
                        key={"id" in selected ? (selected as Command).id : "new"}
                        selection={selected as { mode: "new"; script: string } | Command}
                        onClose={() => setSelected(null)}
                        onSaved={created => {
                            reload();
                            if (created) setSelected(created);
                        }}
                    />
                )}
            </div>

            {showModal && (
                <NewCommandModal
                    onPick={script => {
                        setSelected({mode: "new", script});
                        setShowModal(false);
                    }}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
}
