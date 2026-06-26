import {useState} from "react";

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
}

export interface CommandsSettingsProps {
    commands?: Command[];
    onToggle?: (id: number, enabled: boolean) => void;
    onEdit?: (command: Command) => void;
    onCreate?: (trigger: string, response: string) => void;
}

interface EditPanelProps {
    command: Command;
    onSave: (updated: Command) => void;
    onCancel: () => void;
}

function EditPanel({command, onSave, onCancel}: EditPanelProps) {
    const [trigger, setTrigger] = useState(command.trigger);
    const [response, setResponse] = useState(command.response ?? "");
    const [description, setDescription] = useState(command.description);
    const [cooldown, setCooldown] = useState(command.cooldown_seconds);

    return (
        <tr>
            <td colSpan={6} style={{padding: 0}}>
                <div
                    className="flex flex-col gap-3 p-4"
                    style={{backgroundColor: "#111", borderTop: "1px solid #2a2a2a", borderBottom: "1px solid #2a2a2a"}}
                >
                    <div className="text-xs font-semibold uppercase tracking-wider" style={{color: "#555"}}>
                        Edit command
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>Trigger</label>
                            <input
                                type="text"
                                value={trigger}
                                onChange={(e) => setTrigger(e.target.value)}
                                className="px-3 py-1.5 text-sm rounded"
                                style={{backgroundColor: "#1a1a1a", color: "#f1f1f1", border: "1px solid #333"}}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = "var(--color-accent)";
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = "#333";
                                }}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>Cooldown (seconds)</label>
                            <input
                                type="number"
                                min={0}
                                value={cooldown}
                                onChange={(e) => setCooldown(parseInt(e.target.value, 10) || 0)}
                                className="px-3 py-1.5 text-sm rounded"
                                style={{backgroundColor: "#1a1a1a", color: "#f1f1f1", border: "1px solid #333"}}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = "var(--color-accent)";
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = "#333";
                                }}
                            />
                        </div>
                        <div className="flex flex-col gap-1 col-span-2">
                            <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>Description</label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="px-3 py-1.5 text-sm rounded"
                                style={{backgroundColor: "#1a1a1a", color: "#f1f1f1", border: "1px solid #333"}}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = "var(--color-accent)";
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = "#333";
                                }}
                            />
                        </div>
                        {command.builtin_key === null && (
                            <div className="flex flex-col gap-1 col-span-2">
                                <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>Response</label>
                                <textarea
                                    value={response}
                                    onChange={(e) => setResponse(e.target.value)}
                                    rows={2}
                                    className="px-3 py-1.5 text-sm rounded resize-none"
                                    style={{backgroundColor: "#1a1a1a", color: "#f1f1f1", border: "1px solid #333"}}
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = "var(--color-accent)";
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = "#333";
                                    }}
                                />
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onSave({
                                ...command,
                                trigger,
                                response: response || null,
                                description,
                                cooldown_seconds: cooldown
                            })}
                            className="px-3 py-1.5 text-xs font-medium rounded"
                            style={{backgroundColor: "var(--color-accent)", color: "#fff"}}
                        >
                            Save
                        </button>
                        <button
                            onClick={onCancel}
                            className="px-3 py-1.5 text-xs rounded"
                            style={{backgroundColor: "#222", color: "#a0a0a0", border: "1px solid #333"}}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </td>
        </tr>
    );
}

interface NewCommandFormProps {
    onCreate: (trigger: string, response: string) => void;
    onCancel: () => void;
}

function NewCommandForm({onCreate, onCancel}: NewCommandFormProps) {
    const [trigger, setTrigger] = useState("!");
    const [response, setResponse] = useState("");

    return (
        <div
            className="flex flex-col gap-3 p-4 rounded-lg mt-3"
            style={{backgroundColor: "#111", border: "1px solid #2a2a2a"}}
        >
            <div className="text-xs font-semibold uppercase tracking-wider" style={{color: "#555"}}>New command</div>
            <div className="flex gap-3">
                <div className="flex flex-col gap-1" style={{width: 160}}>
                    <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>Trigger</label>
                    <input
                        type="text"
                        value={trigger}
                        onChange={(e) => setTrigger(e.target.value)}
                        className="px-3 py-1.5 text-sm rounded"
                        style={{backgroundColor: "#1a1a1a", color: "#f1f1f1", border: "1px solid #333"}}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = "var(--color-accent)";
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = "#333";
                        }}
                    />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>Response</label>
                    <input
                        type="text"
                        value={response}
                        onChange={(e) => setResponse(e.target.value)}
                        placeholder="Bot reply text"
                        className="px-3 py-1.5 text-sm rounded"
                        style={{backgroundColor: "#1a1a1a", color: "#f1f1f1", border: "1px solid #333"}}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = "var(--color-accent)";
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = "#333";
                        }}
                    />
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => {
                        if (trigger.trim() && response.trim()) onCreate(trigger.trim(), response.trim());
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded"
                    style={{backgroundColor: "var(--color-accent)", color: "#fff"}}
                >
                    Create
                </button>
                <button
                    onClick={onCancel}
                    className="px-3 py-1.5 text-xs rounded"
                    style={{backgroundColor: "#222", color: "#a0a0a0", border: "1px solid #333"}}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

export function CommandsSettings({commands, onToggle, onEdit, onCreate}: CommandsSettingsProps) {
    const [editingId, setEditingId] = useState<number | null>(null);
    const [showNewForm, setShowNewForm] = useState(false);

    const handleEdit = (command: Command) => {
        setEditingId(command.id);
    };

    const handleSaveEdit = (updated: Command) => {
        onEdit?.(updated);
        setEditingId(null);
    };

    const handleCreate = (trigger: string, response: string) => {
        onCreate?.(trigger, response);
        setShowNewForm(false);
    };

    const isEmpty = !commands || commands.length === 0;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold mb-1" style={{color: "#f1f1f1"}}>Commands</h2>
                    <p className="text-xs" style={{color: "#555"}}>Chat commands the bot responds to.</p>
                </div>
                <button
                    onClick={() => setShowNewForm((v) => !v)}
                    className="px-3 py-1.5 text-xs font-medium rounded"
                    style={{backgroundColor: "var(--color-accent)", color: "#fff"}}
                >
                    New command
                </button>
            </div>

            <div
                className="rounded-lg overflow-hidden"
                style={{border: "1px solid #2a2a2a"}}
            >
                <table className="w-full text-sm border-collapse">
                    <thead>
                    <tr style={{backgroundColor: "#1a1a1a", borderBottom: "1px solid #2a2a2a"}}>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{color: "#555"}}>Trigger</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{color: "#555"}}>Aliases</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{color: "#555"}}>Type</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold"
                            style={{color: "#555"}}>Description
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{color: "#555"}}>Enabled</th>
                        <th className="px-4 py-2.5"/>
                    </tr>
                    </thead>
                    <tbody>
                    {isEmpty ? (
                        <tr>
                            <td
                                colSpan={6}
                                className="px-4 py-8 text-center text-xs"
                                style={{color: "#555", backgroundColor: "#0f0f0f"}}
                            >
                                Commands settings will appear here
                            </td>
                        </tr>
                    ) : (
                        commands!.map((cmd) => (
                            <>
                                <tr
                                    key={cmd.id}
                                    style={{
                                        backgroundColor: editingId === cmd.id ? "#111" : "#0f0f0f",
                                        borderBottom: editingId === cmd.id ? "none" : "1px solid #1e1e1e",
                                    }}
                                >
                                    <td className="px-4 py-2.5">
                                        <span className="text-xs font-mono"
                                              style={{color: "#f1f1f1"}}>{cmd.trigger}</span>
                                    </td>
                                    <td className="px-4 py-2.5">
                      <span className="text-xs" style={{color: "#666"}}>
                        {cmd.aliases.length > 0 ? cmd.aliases.join(", ") : "—"}
                      </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                      <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                              backgroundColor: cmd.builtin_key ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : "#222",
                              color: cmd.builtin_key ? "var(--color-accent)" : "#666",
                              border: cmd.builtin_key ? "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)" : "1px solid #333",
                          }}
                      >
                        {cmd.builtin_key ? "built-in" : "custom"}
                      </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className="text-xs"
                                              style={{color: "#a0a0a0"}}>{cmd.description || "—"}</span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <label className="relative inline-block cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={cmd.enabled}
                                                onChange={(e) => onToggle?.(cmd.id, e.target.checked)}
                                            />
                                            <div
                                                className="w-8 h-4 rounded-full transition-colors relative"
                                                style={{backgroundColor: cmd.enabled ? "var(--color-accent)" : "#333"}}
                                            >
                                                <div
                                                    className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                                                    style={{transform: cmd.enabled ? "translateX(18px)" : "translateX(2px)"}}
                                                />
                                            </div>
                                        </label>
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                        <button
                                            onClick={() => editingId === cmd.id ? setEditingId(null) : handleEdit(cmd)}
                                            className="text-xs px-2 py-1 rounded"
                                            style={{
                                                backgroundColor: "#222",
                                                color: "#a0a0a0",
                                                border: "1px solid #333"
                                            }}
                                        >
                                            {editingId === cmd.id ? "Cancel" : "Edit"}
                                        </button>
                                    </td>
                                </tr>
                                {editingId === cmd.id && (
                                    <EditPanel
                                        key={`edit-${cmd.id}`}
                                        command={cmd}
                                        onSave={handleSaveEdit}
                                        onCancel={() => setEditingId(null)}
                                    />
                                )}
                            </>
                        ))
                    )}
                    </tbody>
                </table>
            </div>

            {showNewForm && (
                <NewCommandForm
                    onCreate={handleCreate}
                    onCancel={() => setShowNewForm(false)}
                />
            )}
        </div>
    );
}
