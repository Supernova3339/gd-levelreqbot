// Visual manager/picker for the streamer's actual Twitch channel-point
// rewards — clickable cards instead of a dropdown/typed title, with inline
// create/edit/delete. Falls back to a plain text field only when the bot
// isn't connected at all (nothing to manage or pick from in that case).
//
// Note: Twitch's Custom Rewards API has no field for setting a reward's icon
// on create or update — icons can only be set from the Twitch Creator
// Dashboard. Nothing here pretends otherwise; there's no icon control because
// there's nothing it could actually do.

import {useEffect, useState} from "react";
import {
    createTwitchReward,
    deleteTwitchReward,
    listTwitchRewards,
    updateTwitchReward,
    type TwitchReward
} from "../lib/commands";

const CARD: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: 2,
    padding: "8px 10px", borderRadius: 6,
    border: "1px solid #1e1e1e", backgroundColor: "#0d0d0d",
    minWidth: 130, textAlign: "left", position: "relative",
};

function IconBtn({label, onClick, color = "#555", hoverColor}: {
    label: string;
    onClick: () => void;
    color?: string;
    hoverColor?: string
}) {
    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            title={label}
            className="text-xs"
            style={{color, background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1}}
            onMouseEnter={(e) => {
                e.currentTarget.style.color = hoverColor ?? "#c0c0c0";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.color = color;
            }}>
            {label}
        </button>
    );
}

function EditRewardForm({reward, onSaved, onCancel}: {
    reward: TwitchReward;
    onSaved: (r: TwitchReward) => void;
    onCancel: () => void;
}) {
    const [title, setTitle] = useState(reward.title);
    const [cost, setCost] = useState(reward.cost);
    const [enabled, setEnabled] = useState(reward.is_enabled);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!title.trim() || saving) return;
        setSaving(true);
        setError(null);
        try {
            const r = await updateTwitchReward(reward.id, {title: title.trim(), cost, isEnabled: enabled});
            onSaved(r);
        } catch (e) {
            setError(String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{...CARD, cursor: "default", minWidth: 200, gap: 6, borderColor: "var(--color-accent)"}}>
            <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                className="text-xs px-2 py-1 rounded"
                style={{backgroundColor: "#111", color: "#e0e0e0", border: "1px solid #2a2a2a"}}
                onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                    if (e.key === "Escape") onCancel();
                }}
            />
            <div className="flex items-center gap-2">
                <input
                    type="number" min={1} value={cost}
                    onChange={(e) => setCost(Math.max(1, parseInt(e.target.value) || 1))}
                    className="text-xs px-2 py-1 rounded"
                    style={{backgroundColor: "#111", color: "#e0e0e0", border: "1px solid #2a2a2a", width: 70}}
                />
                <span className="text-xs" style={{color: "#555"}}>pts</span>
                <label className="flex items-center gap-1 text-xs" style={{color: "#888"}}>
                    <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}/>
                    Enabled
                </label>
            </div>
            {error && <span className="text-xs" style={{color: "#ef4444"}}>{error}</span>}
            <div className="flex items-center gap-2">
                <button onClick={submit} disabled={!title.trim() || saving}
                        className="text-xs px-2.5 py-1 rounded font-medium"
                        style={{
                            backgroundColor: "var(--color-accent)",
                            color: "#fff",
                            opacity: !title.trim() || saving ? 0.5 : 1
                        }}>
                    {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={onCancel} className="text-xs" style={{color: "#555"}}>Cancel</button>
            </div>
        </div>
    );
}

function RewardCard({reward, selected, selectable, onClick, onUpdated, onDeleted}: {
    reward: TwitchReward;
    selected: boolean;
    selectable: boolean;
    onClick: () => void;
    onUpdated: (r: TwitchReward) => void;
    onDeleted: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    if (editing) {
        return <EditRewardForm reward={reward} onSaved={(r) => {
            onUpdated(r);
            setEditing(false);
        }} onCancel={() => setEditing(false)}/>;
    }

    const doDelete = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }
        setDeleting(true);
        try {
            await deleteTwitchReward(reward.id);
            onDeleted();
        } catch {
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    return (
        <div
            onClick={selectable ? onClick : undefined}
            style={{
                ...CARD,
                cursor: selectable ? "pointer" : "default",
                borderColor: selected ? "var(--color-accent)" : "#1e1e1e",
                backgroundColor: selected ? "color-mix(in srgb, var(--color-accent) 12%, #0d0d0d)" : "#0d0d0d",
                opacity: reward.is_enabled ? 1 : 0.5,
            }}>
            <div className="flex items-center gap-1.5">
                {selected && <span style={{color: "var(--color-accent)", fontSize: 11}}>✓</span>}
                {(() => {
                    const src = (reward.image ?? reward.default_image)?.url_2x;
                    return src ? (
                        <img src={src} alt="" width={16} height={16} className="rounded flex-shrink-0"
                             style={{objectFit: "contain"}}/>
                    ) : null;
                })()}
                <span className="text-xs font-medium truncate flex-1" style={{color: "#e0e0e0"}}>{reward.title}</span>
            </div>
            <div className="flex items-center justify-between">
                <span className="text-xs" style={{color: "#666"}}>
                    {reward.cost.toLocaleString()} pts{!reward.is_enabled && " · disabled"}
                </span>
                <div className="flex items-center gap-1.5">
                    <IconBtn label="✎" onClick={() => setEditing(true)}/>
                    <IconBtn label={confirmDelete ? "sure?" : "×"} onClick={doDelete} hoverColor="#ef4444"
                             color={confirmDelete ? "#ef4444" : "#555"}/>
                </div>
            </div>
            {deleting && <span className="text-xs" style={{color: "#555"}}>Deleting…</span>}
        </div>
    );
}

function CreateRewardCard({onCreated}: { onCreated: (r: TwitchReward) => void }) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [cost, setCost] = useState(100);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} style={{
                ...CARD,
                alignItems: "center",
                justifyContent: "center",
                color: "#555",
                borderStyle: "dashed"
            }}>
                <span className="text-xs">+ New reward</span>
            </button>
        );
    }

    const submit = async () => {
        if (!title.trim() || saving) return;
        setSaving(true);
        setError(null);
        try {
            const r = await createTwitchReward(title.trim(), cost);
            onCreated(r);
            setOpen(false);
            setTitle("");
            setCost(100);
        } catch (e) {
            setError(String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{...CARD, cursor: "default", minWidth: 200, gap: 6}}>
            <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Reward title"
                autoFocus
                className="text-xs px-2 py-1 rounded"
                style={{backgroundColor: "#111", color: "#e0e0e0", border: "1px solid #2a2a2a"}}
                onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                    if (e.key === "Escape") setOpen(false);
                }}
            />
            <div className="flex items-center gap-2">
                <input
                    type="number" min={1} value={cost}
                    onChange={(e) => setCost(Math.max(1, parseInt(e.target.value) || 1))}
                    className="text-xs px-2 py-1 rounded"
                    style={{backgroundColor: "#111", color: "#e0e0e0", border: "1px solid #2a2a2a", width: 70}}
                />
                <span className="text-xs" style={{color: "#555"}}>pts</span>
            </div>
            {error && <span className="text-xs" style={{color: "#ef4444"}}>{error}</span>}
            <div className="flex items-center gap-2">
                <button onClick={submit} disabled={!title.trim() || saving}
                        className="text-xs px-2.5 py-1 rounded font-medium"
                        style={{
                            backgroundColor: "var(--color-accent)",
                            color: "#fff",
                            opacity: !title.trim() || saving ? 0.5 : 1
                        }}>
                    {saving ? "Creating…" : "Create"}
                </button>
                <button onClick={() => setOpen(false)} className="text-xs" style={{color: "#555"}}>Cancel</button>
            </div>
        </div>
    );
}

export function TwitchRewardPicker({value, onChange, disabled}: {
    /** Omit both value and onChange to use this purely as a management UI
     *  (create/edit/delete, no selection) — e.g. embedded in Settings → Twitch. */
    value?: string;
    onChange?: (title: string) => void;
    disabled?: boolean;
}) {
    const selectable = !!onChange;
    const [rewards, setRewards] = useState<TwitchReward[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        listTwitchRewards().then(setRewards).catch((e) => setLoadError(String(e)));
    }, []);

    // Bot not connected (or the call otherwise failed) — nothing to manage or
    // pick from, so a manual title is the only option left in picker mode.
    if (loadError) {
        if (!selectable) {
            return <span className="text-xs" style={{color: "#555"}}>
                Couldn't load rewards ({loadError.includes("not connected") ? "bot not connected" : "see logs"}).
            </span>;
        }
        return (
            <div className="flex flex-col gap-1">
                <input
                    value={value ?? ""}
                    onChange={(e) => onChange!(e.target.value)}
                    disabled={disabled}
                    placeholder="Exact reward title"
                    className="px-2.5 py-1.5 text-xs rounded"
                    style={{backgroundColor: "#0d0d0d", color: "#c0c0c0", border: "1px solid #1e1e1e", width: 220}}
                />
                <span className="text-xs" style={{color: "#555"}}>
                    Couldn't load your rewards ({loadError.includes("not connected") ? "bot not connected" : "see logs"}) — type the title exactly as it appears on Twitch.
                </span>
            </div>
        );
    }

    if (rewards === null) {
        return <span className="text-xs" style={{color: "#555"}}>Loading rewards…</span>;
    }

    // The configured title might not match any currently-fetched reward (renamed/deleted
    // on Twitch since this was set) — still show it as a selected-but-unlisted card so it's
    // not silently discarded, rather than pretending nothing is selected.
    const known = selectable && value ? rewards.find((r) => r.title === value) : undefined;
    const orphaned: TwitchReward | null = selectable && value && !known
        ? {
            id: "__orphaned__",
            title: value,
            cost: 0,
            prompt: "",
            is_enabled: true,
            image: null,
            default_image: null
        } : null;

    return (
        <div className="flex flex-col gap-2">
            {orphaned && (
                <span className="text-xs" style={{color: "#f59e0b"}}>
                    "{value}" isn't in your current rewards — renamed or deleted on Twitch?
                </span>
            )}
            <div className="flex flex-wrap gap-2">
                {orphaned && (
                    <RewardCard reward={orphaned} selected selectable={false} onClick={() => {
                    }}
                                onUpdated={() => {
                                }} onDeleted={() => onChange?.("")}/>
                )}
                {rewards.map((r) => (
                    <RewardCard
                        key={r.id} reward={r}
                        selected={selectable && r.title === value}
                        selectable={selectable && !disabled}
                        onClick={() => onChange?.(r.title === value ? "" : r.title)}
                        onUpdated={(updated) => setRewards((prev) => (prev ?? []).map((x) => x.id === updated.id ? updated : x))}
                        onDeleted={() => {
                            setRewards((prev) => (prev ?? []).filter((x) => x.id !== r.id));
                            if (selectable && r.title === value) onChange?.("");
                        }}
                    />
                ))}
                {!disabled && <CreateRewardCard onCreated={(r) => {
                    setRewards((prev) => [...(prev ?? []), r]);
                    onChange?.(r.title);
                }}/>}
            </div>
            {rewards.length === 0 && !orphaned && (
                <span className="text-xs" style={{color: "#555"}}>No rewards yet — create one above.</span>
            )}
        </div>
    );
}
