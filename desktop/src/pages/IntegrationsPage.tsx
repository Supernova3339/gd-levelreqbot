import {useCallback, useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {CloseIcon, PlusIcon} from "../components/icons";
import {useSnackbar} from "../components/Snackbar";
import {useConfirm} from "../components/ConfirmModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Integration {
    id: number;
    name: string;
    kind: string;
    config: string;
    description: string;
    enabled: 0 | 1;
    cached_value: string | null;
    last_fetched: string | null;
}

type ConfigMap = Record<string, string | HeaderRow[]>;

interface HeaderRow {
    key: string;
    value: string
}

const KIND_META = {
    static: {label: "Static", color: "#818cf8", desc: "A fixed string value"},
    http: {label: "HTTP", color: "#22c55e", desc: "Fetch from a URL"},
    shell: {label: "Shell", color: "#f97316", desc: "Run a local command"},
    websocket: {label: "WebSocket", color: "#06b6d4", desc: "Live data stream"},
} as const;
type Kind = keyof typeof KIND_META;

const inputCss: React.CSSProperties = {
    backgroundColor: "#111", color: "#f1f1f1",
    border: "1px solid #2a2a2a", borderRadius: 6,
    padding: "7px 10px", fontSize: 13, width: "100%",
};

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Field({label, hint, children}: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>{label}</label>
            {children}
            {hint && <p className="text-xs" style={{color: "#555"}}>{hint}</p>}
        </div>
    );
}

function Toggle({value, onChange}: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button role="switch" aria-checked={value} onClick={() => onChange(!value)}
                style={{cursor: "pointer", background: "none", border: "none", padding: 0}}>
            <div className="w-8 h-4 rounded-full relative"
                 style={{
                     backgroundColor: value ? "var(--color-accent)" : "#1a1a1a",
                     border: "1px solid #2a2a2a",
                     transition: "background-color 0.15s"
                 }}>
                <div className="absolute top-0.5 w-3 h-3 bg-white rounded-full"
                     style={{
                         transform: value ? "translateX(17px)" : "translateX(1px)",
                         transition: "transform 0.15s"
                     }}/>
            </div>
        </button>
    );
}

// ─── Config editors per kind ──────────────────────────────────────────────────

function StaticConfig({config, onChange}: { config: ConfigMap; onChange: (c: ConfigMap) => void }) {
    return (
        <Field label="Value" hint="This exact string is substituted for {variable_name}">
            <input type="text" value={(config.value as string) ?? ""}
                   onChange={(e) => onChange({...config, value: e.target.value})}
                   placeholder="https://discord.gg/example" style={inputCss}/>
        </Field>
    );
}

function HttpConfig({config, onChange}: { config: ConfigMap; onChange: (c: ConfigMap) => void }) {
    const headers = (config.headers as HeaderRow[]) ?? [];

    const setHeader = (i: number, field: keyof HeaderRow, val: string) => {
        const next = headers.map((h, idx) => idx === i ? {...h, [field]: val} : h);
        onChange({...config, headers: next});
    };
    const addHeader = () => onChange({...config, headers: [...headers, {key: "", value: ""}]});
    const removeHeader = (i: number) => onChange({...config, headers: headers.filter((_, idx) => idx !== i)});

    return (
        <>
            <Field label="URL" hint="The endpoint to request">
                <input type="text" value={(config.url as string) ?? ""}
                       onChange={(e) => onChange({...config, url: e.target.value})}
                       placeholder="https://api.example.com/data" style={inputCss}/>
            </Field>

            <div className="grid grid-cols-2 gap-3">
                <Field label="Method">
                    <select value={(config.method as string) ?? "GET"}
                            onChange={(e) => onChange({...config, method: e.target.value})}
                            style={{...inputCss, cursor: "pointer"}}>
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                    </select>
                </Field>
                <Field label="JSON path" hint="Dot notation, e.g. data.title">
                    <input type="text" value={(config.path as string) ?? ""}
                           onChange={(e) => onChange({...config, path: e.target.value})}
                           placeholder="data.song.title" style={inputCss}/>
                </Field>
            </div>

            {(config.method as string) === "POST" && (
                <Field label="Request body">
          <textarea value={(config.body as string) ?? ""}
                    onChange={(e) => onChange({...config, body: e.target.value})}
                    placeholder='{"key": "value"}' rows={3}
                    style={{...inputCss, fontFamily: "monospace", resize: "vertical"}}/>
                </Field>
            )}

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>Custom headers</label>
                    <button onClick={addHeader} className="text-xs px-2 py-0.5 rounded"
                            style={{
                                backgroundColor: "#1a1a1a",
                                color: "#888",
                                border: "1px solid #2a2a2a",
                                cursor: "pointer"
                            }}>
                        + Add
                    </button>
                </div>
                {headers.map((h, i) => (
                    <div key={i} className="flex gap-2 items-center">
                        <input type="text" placeholder="Key" value={h.key}
                               onChange={(e) => setHeader(i, "key", e.target.value)}
                               style={{...inputCss, flex: 1, fontFamily: "monospace"}}/>
                        <input type="text" placeholder="Value" value={h.value}
                               onChange={(e) => setHeader(i, "value", e.target.value)}
                               style={{...inputCss, flex: 2, fontFamily: "monospace"}}/>
                        <button onClick={() => removeHeader(i)}
                                style={{color: "#ef4444", cursor: "pointer", background: "none", border: "none"}}>
                            <CloseIcon size={10}/>
                        </button>
                    </div>
                ))}
                {headers.length === 0 && (
                    <p className="text-xs" style={{color: "#444"}}>No custom headers — click + Add to add one.</p>
                )}
            </div>
        </>
    );
}

function ShellConfig({config, onChange}: { config: ConfigMap; onChange: (c: ConfigMap) => void }) {
    return (
        <Field label="Command" hint="Runs on the host machine. stdout becomes the variable value.">
            <input type="text" value={(config.command as string) ?? ""}
                   onChange={(e) => onChange({...config, command: e.target.value})}
                   placeholder='powershell -c "(Get-Item NowPlaying).Name"'
                   style={{...inputCss, fontFamily: "monospace"}}/>
        </Field>
    );
}

function WebSocketConfig({config, onChange}: { config: ConfigMap; onChange: (c: ConfigMap) => void }) {
    return (
        <>
            <Field label="WebSocket URL">
                <input type="text" value={(config.url as string) ?? ""}
                       onChange={(e) => onChange({...config, url: e.target.value})}
                       placeholder="wss://example.com/live" style={inputCss}/>
            </Field>
            <Field label="JSON path" hint="Field to extract from each received message.">
                <input type="text" value={(config.path as string) ?? ""}
                       onChange={(e) => onChange({...config, path: e.target.value})}
                       placeholder="data.value" style={inputCss}/>
            </Field>
            <p className="text-xs" style={{color: "#555"}}>The latest received message is used when the variable is
                referenced.</p>
        </>
    );
}

// ─── Integration editor ───────────────────────────────────────────────────────

function IntegrationEditor({initial, onSave, onCancel}: {
    initial?: Integration;
    onSave: (name: string, kind: string, config: string, description: string) => void;
    onCancel: () => void;
}) {
    const [name, setName] = useState(initial?.name ?? "");
    const [kind, setKind] = useState<Kind>((initial?.kind as Kind) ?? "static");
    const [config, setConfig] = useState<ConfigMap>(() => {
        try {
            return JSON.parse(initial?.config ?? "{}") as ConfigMap;
        } catch {
            return {};
        }
    });
    const [description, setDescription] = useState(initial?.description ?? "");

    const kindColor = KIND_META[kind].color;
    const canSave = name.trim().length > 0;

    return (
        <div className="flex flex-col gap-5 p-5">
            <div className="grid grid-cols-2 gap-3">
                <Field label="Variable name" hint={`Used in responses as {${name || "name"}}`}>
                    <input type="text" value={name}
                           onChange={(e) => setName(e.target.value.replace(/[^a-z0-9_]/gi, "_"))}
                           placeholder="song_title"
                           style={{...inputCss, fontFamily: "monospace"}}/>
                </Field>
                <Field label="Description">
                    <input type="text" value={description}
                           onChange={(e) => setDescription(e.target.value)}
                           placeholder="Current song playing" style={inputCss}/>
                </Field>
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>Source type</label>
                <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(KIND_META) as Kind[]).map((k) => (
                        <button key={k} onClick={() => setKind(k)}
                                className="flex items-start gap-3 p-3 rounded-lg text-left"
                                style={{
                                    backgroundColor: kind === k ? `${KIND_META[k].color}15` : "#111",
                                    border: `1px solid ${kind === k ? KIND_META[k].color + "44" : "#2a2a2a"}`,
                                    cursor: "pointer",
                                }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                    style={{backgroundColor: KIND_META[k].color}}/>
                            <div>
                                <p className="text-xs font-semibold"
                                   style={{color: kind === k ? KIND_META[k].color : "#d0d0d0"}}>
                                    {KIND_META[k].label}
                                </p>
                                <p className="text-xs mt-0.5" style={{color: "#555"}}>{KIND_META[k].desc}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{color: kindColor}}>
                    {KIND_META[kind].label} settings
                </p>
                {kind === "static" && <StaticConfig config={config} onChange={setConfig}/>}
                {kind === "http" && <HttpConfig config={config} onChange={setConfig}/>}
                {kind === "shell" && <ShellConfig config={config} onChange={setConfig}/>}
                {kind === "websocket" && <WebSocketConfig config={config} onChange={setConfig}/>}
            </div>

            <div className="flex gap-2 pt-2" style={{borderTop: "1px solid #1e1e1e"}}>
                <button onClick={() => onSave(name, kind, JSON.stringify(config), description)}
                        disabled={!canSave}
                        className="px-4 py-1.5 text-xs font-semibold rounded"
                        style={{
                            backgroundColor: "var(--color-accent)", color: "#fff",
                            opacity: canSave ? 1 : 0.4, cursor: canSave ? "pointer" : "default"
                        }}>
                    {initial ? "Save changes" : "Create"}
                </button>
                <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded"
                        style={{
                            backgroundColor: "#1a1a1a",
                            color: "#888",
                            border: "1px solid #2a2a2a",
                            cursor: "pointer"
                        }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({integ, liveValue, testing, onEdit, onDelete, onTest, onToggle}: {
    integ: Integration;
    liveValue: string | null;
    testing: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onTest: () => void;
    onToggle: (enabled: boolean) => void;
}) {
    const meta = KIND_META[integ.kind as Kind] ?? {label: integ.kind, color: "#888"};
    const enabled = integ.enabled !== 0;

    return (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg"
             style={{backgroundColor: "#111", border: "1px solid #1e1e1e", opacity: enabled ? 1 : 0.6}}>

            {/* Enable toggle */}
            <div className="flex-shrink-0 pt-0.5">
                <Toggle value={enabled} onChange={onToggle}/>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <code className="text-sm font-bold" style={{color: "var(--color-accent)"}}>
                        {`{${integ.name}}`}
                    </code>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{
                        backgroundColor: meta.color + "15", color: meta.color, border: `1px solid ${meta.color}33`,
                    }}>
            {meta.label}
          </span>
                    {!enabled && (
                        <span className="text-xs px-1.5 py-0.5 rounded"
                              style={{backgroundColor: "#1a1a1a", color: "#555", border: "1px solid #222"}}>
              disabled
            </span>
                    )}
                </div>
                {integ.description && (
                    <p className="text-xs" style={{color: "#666"}}>{integ.description}</p>
                )}
                {/* Live test result */}
                {liveValue !== null && (
                    <p className="text-xs font-mono mt-1 truncate"
                       style={{color: "#4ade80", backgroundColor: "#0a1a0a", padding: "2px 6px", borderRadius: 4}}>
                        → {liveValue || "(empty)"}
                    </p>
                )}
                {integ.cached_value && liveValue === null && (
                    <p className="text-xs font-mono mt-0.5 truncate" style={{color: "#444"}}>
                        → {integ.cached_value}
                    </p>
                )}
            </div>

            {/* Actions */}
            <div className="flex gap-1.5 flex-shrink-0 items-center">
                <button onClick={onTest} disabled={testing} title="Test — fetch live value"
                        className="text-xs px-2.5 py-1 rounded"
                        style={{
                            backgroundColor: "#1a1a1a", color: testing ? "#555" : "#888",
                            border: "1px solid #2a2a2a", cursor: testing ? "default" : "pointer"
                        }}>
                    {testing ? "…" : "Test"}
                </button>
                <button onClick={onEdit} className="text-xs px-2.5 py-1 rounded"
                        style={{
                            backgroundColor: "#1a1a1a",
                            color: "#888",
                            border: "1px solid #2a2a2a",
                            cursor: "pointer"
                        }}>
                    Edit
                </button>
                <button onClick={onDelete} title="Delete integration"
                        className="text-xs px-2 py-1 rounded"
                        style={{
                            backgroundColor: "#2a1a1a",
                            color: "#ef4444",
                            border: "1px solid #3a2020",
                            cursor: "pointer"
                        }}>
                    <CloseIcon size={10}/>
                </button>
            </div>
        </div>
    );
}

// ─── Integrations page ────────────────────────────────────────────────────────

export function IntegrationsPage() {
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [editing, setEditing] = useState<Integration | "new" | null>(null);
    const [liveValues, setLiveValues] = useState<Record<number, string>>({});
    const [testing, setTesting] = useState<Record<number, boolean>>({});
    const [refreshing, setRefreshing] = useState(false);
    const snackbar = useSnackbar();
    const confirm = useConfirm();

    const load = useCallback(() =>
        invoke<Integration[]>("get_integrations").then(setIntegrations).catch(() => {
        }), []);

    useEffect(() => {
        load();
    }, [load]);

    const handleSave = async (name: string, kind: string, config: string, description: string) => {
        try {
            if (editing === "new") {
                await invoke("create_integration", {name, kind, config, description});
                snackbar({message: `Integration {${name}} created.`, variant: "success"});
            } else if (editing) {
                await invoke("update_integration", {
                    id: editing.id, name, kind, config, description, enabled: editing.enabled === 1,
                });
                snackbar({message: "Integration updated.", variant: "success"});
            }
            setEditing(null);
            load();
        } catch (err) {
            snackbar({message: String(err), variant: "error"});
        }
    };

    const handleDelete = async (id: number, name: string) => {
        const ok = await confirm({
            title: "Delete integration",
            message: `Delete {${name}}? Commands using it will lose the variable.`,
            confirmLabel: "Delete", destructive: true,
        });
        if (!ok) return;
        try {
            await invoke("delete_integration", {id});
            setLiveValues((v) => {
                const n = {...v};
                delete n[id];
                return n;
            });
            snackbar({message: `{${name}} deleted.`, variant: "info"});
            load();
        } catch (err) {
            snackbar({message: String(err), variant: "error"});
        }
    };

    const handleTest = async (integ: Integration) => {
        setTesting((t) => ({...t, [integ.id]: true}));
        try {
            const val = await invoke<string>("fetch_integration_value", {id: integ.id});
            setLiveValues((v) => ({...v, [integ.id]: val}));
        } catch (err) {
            snackbar({message: `Test failed: ${err}`, variant: "error"});
        } finally {
            setTesting((t) => ({...t, [integ.id]: false}));
        }
    };

    const handleToggle = async (integ: Integration, enabled: boolean) => {
        try {
            await invoke("update_integration", {
                id: integ.id, name: integ.name, kind: integ.kind,
                config: integ.config, description: integ.description, enabled,
            });
            load();
        } catch (err) {
            snackbar({message: String(err), variant: "error"});
        }
    };

    const handleRefreshAll = async () => {
        setRefreshing(true);
        const newValues: Record<number, string> = {};
        for (const integ of integrations.filter((i) => i.enabled !== 0)) {
            try {
                const val = await invoke<string>("fetch_integration_value", {id: integ.id});
                newValues[integ.id] = val;
            } catch { /* skip failures silently */
            }
        }
        setLiveValues(newValues);
        setRefreshing(false);
    };

    const editingInteg = editing !== "new" ? editing : null;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
                 style={{borderBottom: "1px solid #1e1e1e"}}>
                <div>
                    <h1 className="text-sm font-semibold" style={{color: "#f1f1f1"}}>Integrations</h1>
                    <p className="text-xs mt-0.5" style={{color: "#555"}}>
                        Dynamic variables usable as{" "}
                        <code style={{color: "#818cf8"}}>{"{variable_name}"}</code> in any command response
                    </p>
                </div>
                <div className="flex gap-2">
                    {integrations.some((i) => i.enabled !== 0) && (
                        <button onClick={handleRefreshAll} disabled={refreshing}
                                className="text-xs px-3 py-1.5 rounded"
                                style={{
                                    backgroundColor: "#1a1a1a", color: refreshing ? "#555" : "#888",
                                    border: "1px solid #2a2a2a", cursor: refreshing ? "default" : "pointer"
                                }}>
                            {refreshing ? "Refreshing…" : "Refresh all"}
                        </button>
                    )}
                    <button onClick={() => setEditing("new")}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded"
                            style={{backgroundColor: "var(--color-accent)", color: "#fff", cursor: "pointer"}}>
                        <PlusIcon size={12}/> New
                    </button>
                </div>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                    {integrations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3">
                            <p className="text-sm" style={{color: "#444"}}>No integrations yet</p>
                            <p className="text-xs text-center" style={{color: "#555", maxWidth: 320, lineHeight: 1.6}}>
                                Create variables that pull values from APIs, shell commands, or static strings.
                                Reference them in commands as <code
                                style={{color: "#818cf8"}}>{"{variable_name}"}</code>.
                            </p>
                            <button onClick={() => setEditing("new")}
                                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded mt-2"
                                    style={{backgroundColor: "var(--color-accent)", color: "#fff", cursor: "pointer"}}>
                                <PlusIcon size={12}/> Create your first integration
                            </button>
                        </div>
                    ) : (
                        integrations.map((integ) => (
                            <IntegrationCard
                                key={integ.id}
                                integ={integ}
                                liveValue={liveValues[integ.id] ?? null}
                                testing={testing[integ.id] ?? false}
                                onEdit={() => setEditing(integ)}
                                onDelete={() => handleDelete(integ.id, integ.name)}
                                onTest={() => handleTest(integ)}
                                onToggle={(enabled) => handleToggle(integ, enabled)}
                            />
                        ))
                    )}
                </div>

                {/* Editor panel */}
                {editing && (
                    <div className="flex-shrink-0 overflow-y-auto"
                         style={{width: 500, borderLeft: "1px solid #1e1e1e", backgroundColor: "#0f0f0f"}}>
                        <div className="flex items-center justify-between px-5 py-3"
                             style={{borderBottom: "1px solid #1e1e1e"}}>
              <span className="text-xs font-semibold" style={{color: "#f1f1f1"}}>
                {editing === "new" ? "New integration" : `Edit {${editing.name}}`}
              </span>
                            <button onClick={() => setEditing(null)} style={{color: "#555", cursor: "pointer"}}>
                                <CloseIcon size={12}/>
                            </button>
                        </div>
                        <IntegrationEditor
                            initial={editingInteg ?? undefined}
                            onSave={handleSave}
                            onCancel={() => setEditing(null)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
