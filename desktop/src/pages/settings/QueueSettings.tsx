import {useEffect, useState} from "react";
import type {AppConfig} from "../../lib/types";
import {useConfig} from "../../hooks/useConfig";

interface ToggleProps {
    label: string;
    description: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}

function Toggle({label, description, checked, onChange}: ToggleProps) {
    return (
        <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative mt-0.5 flex-shrink-0">
                <input type="checkbox" className="sr-only" checked={checked}
                       onChange={(e) => onChange(e.target.checked)}/>
                <div className="w-9 h-5 rounded-full transition-colors"
                     style={{backgroundColor: checked ? "var(--color-accent)" : "#333"}}>
                    <div
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{transform: checked ? "translateX(18px)" : "translateX(2px)"}}
                    />
                </div>
            </div>
            <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium" style={{color: "#f1f1f1"}}>{label}</span>
                <span className="text-xs" style={{color: "#555"}}>{description}</span>
            </div>
        </label>
    );
}

export function QueueSettings() {
    const {config, loading, error, save} = useConfig();
    const [form, setForm] = useState<AppConfig | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (config && !form) {
            setForm(JSON.parse(JSON.stringify(config)) as AppConfig);
        }
    }, [config, form]);

    if (loading || !form) {
        return <div className="flex items-center justify-center h-32" style={{color: "#555"}}>Loading...</div>;
    }

    if (error) {
        return (
            <div className="px-4 py-3 rounded text-sm"
                 style={{backgroundColor: "#2a1a1a", color: "#ef4444", border: "1px solid #3a2020"}}>
                Failed to load config: {error}
            </div>
        );
    }

    const setMode = (key: keyof typeof form.modes, value: boolean) =>
        setForm((p) => p ? {...p, modes: {...p.modes, [key]: value}} : p);
    const setLimit = (key: keyof typeof form.limits, value: number) =>
        setForm((p) => p ? {...p, limits: {...p.limits, [key]: value}} : p);
    const setTop = (key: keyof AppConfig, value: boolean | string) =>
        setForm((p) => p ? {...p, [key]: value} : p);

    const handleSave = async () => {
        if (!form) return;
        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        try {
            await save(form);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            setSaveError(String(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-sm font-semibold mb-1" style={{color: "#f1f1f1"}}>Queue</h2>
                <p className="text-xs" style={{color: "#555"}}>Mode toggles and request limits.</p>
            </div>

            {/* Next level behaviour */}
            <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{color: "#555"}}>Next level</div>
                <Toggle
                    label="Auto-copy level ID to clipboard"
                    description="When Next Level is triggered, the level ID is copied automatically and a notification appears on screen."
                    checked={form.auto_copy_level_id}
                    onChange={(v) => setTop("auto_copy_level_id", v)}
                />
                <div className="flex flex-col gap-2">
                    <div>
                        <p className="text-sm font-medium" style={{color: "#d0d0d0"}}>Overlay position</p>
                        <p className="text-xs mt-0.5" style={{color: "#555"}}>
                            Where the Now Playing notification appears on screen.
                        </p>
                    </div>
                    <OverlayPositionPicker/>
                </div>
            </div>

            {/* Thumbnails */}
            <div className="flex flex-col gap-3" style={{paddingTop: "12px", borderTop: "1px solid #2a2a2a"}}>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{color: "#555"}}>Level
                    thumbnails
                </div>
                <Toggle
                    label="Show level thumbnails"
                    description="Fetch level preview images from levelthumbs.prevter.me when a level is selected."
                    checked={form.level_thumbnails}
                    onChange={(v) => setTop("level_thumbnails", v)}
                />
                {form.level_thumbnails && (
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>Quality</label>
                        <div className="flex gap-2">
                            {(["", "small", "medium", "high"] as const).map((q) => (
                                <button
                                    key={q}
                                    onClick={() => setTop("thumbnail_quality", q)}
                                    className="px-3 py-1.5 text-xs rounded"
                                    style={{
                                        backgroundColor: form.thumbnail_quality === q ? "var(--color-accent)" : "#1a1a1a",
                                        color: form.thumbnail_quality === q ? "#fff" : "#888",
                                        border: `1px solid ${form.thumbnail_quality === q ? "var(--color-accent)" : "#2a2a2a"}`,
                                    }}
                                >
                                    {q === "" ? "Default" : q.charAt(0).toUpperCase() + q.slice(1)}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs" style={{color: "#444"}}>
                            Thumbnails are loaded from levelthumbs.prevter.me — an external service.
                        </p>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-4" style={{paddingTop: "12px", borderTop: "1px solid #2a2a2a"}}>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{color: "#555"}}>Modes</div>
                <Toggle
                    label="GD mode"
                    description="Validate that requested IDs are real Geometry Dash levels"
                    checked={form.modes.gd}
                    onChange={(v) => setMode("gd", v)}
                />
                <Toggle
                    label="Subscriber queue"
                    description="Subscribers go into a separate queue; !next picks from it with 60% priority"
                    checked={form.modes.sub}
                    onChange={(v) => setMode("sub", v)}
                />
                <Toggle
                    label="Smart mode"
                    description="Any bare number typed in chat (without !r) is treated as a level request"
                    checked={form.modes.smart}
                    onChange={(v) => setMode("smart", v)}
                />
                <Toggle
                    label="YouTube mode"
                    description="Read level requests from YouTube live chat in addition to Twitch"
                    checked={form.modes.youtube}
                    onChange={(v) => setMode("youtube", v)}
                />
            </div>

            <div className="flex flex-col gap-3" style={{paddingTop: "12px", borderTop: "1px solid #2a2a2a"}}>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{color: "#555"}}>Request limits
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{color: "#a0a0a0"}} htmlFor="viewer_limit">
                        Viewer limit
                    </label>
                    <input
                        id="viewer_limit"
                        type="number"
                        min={0}
                        max={100}
                        value={form.limits.viewer_request_limit}
                        onChange={(e) => setLimit("viewer_request_limit", parseInt(e.target.value, 10) || 0)}
                        className="w-full px-3 py-2 text-sm rounded"
                        style={{backgroundColor: "#111", color: "#f1f1f1", border: "1px solid #333", maxWidth: 200}}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = "var(--color-accent)";
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = "#333";
                        }}
                    />
                    <span className="text-xs" style={{color: "#555"}}>Max requests per viewer (0 = unlimited)</span>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" style={{color: "#a0a0a0"}} htmlFor="sub_limit">
                        Subscriber limit
                    </label>
                    <input
                        id="sub_limit"
                        type="number"
                        min={0}
                        max={100}
                        value={form.limits.subscriber_request_limit}
                        onChange={(e) => setLimit("subscriber_request_limit", parseInt(e.target.value, 10) || 0)}
                        className="w-full px-3 py-2 text-sm rounded"
                        style={{backgroundColor: "#111", color: "#f1f1f1", border: "1px solid #333", maxWidth: 200}}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = "var(--color-accent)";
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = "#333";
                        }}
                    />
                    <span className="text-xs" style={{color: "#555"}}>Max requests per subscriber (0 = unlimited)</span>
                </div>
            </div>

            <div className="flex items-center gap-3 pt-1" style={{borderTop: "1px solid #2a2a2a"}}>
                {saveSuccess && <span className="text-xs" style={{color: "#22c55e"}}>Saved</span>}
                {saveError && <span className="text-xs" style={{color: "#ef4444"}}>{saveError}</span>}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-1.5 text-xs font-semibold rounded"
                    style={{backgroundColor: "var(--color-accent)", color: "#fff", opacity: saving ? 0.5 : 1}}
                >
                    {saving ? "Saving..." : "Save"}
                </button>
            </div>
        </div>
    );
}

// ── Overlay position picker ────────────────────────────────────────────────────

const OVERLAY_POS_KEY = "gdlqbot.overlay_position";

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const CORNERS: { id: Corner; label: string; row: number; col: number }[] = [
    {id: "top-left", label: "↖", row: 0, col: 0},
    {id: "top-right", label: "↗", row: 0, col: 1},
    {id: "bottom-left", label: "↙", row: 1, col: 0},
    {id: "bottom-right", label: "↘", row: 1, col: 1},
];

function OverlayPositionPicker() {
    const [pos, setPos] = useState<Corner>(() =>
        (localStorage.getItem(OVERLAY_POS_KEY) as Corner | null) ?? "bottom-right"
    );

    const pick = (c: Corner) => {
        setPos(c);
        localStorage.setItem(OVERLAY_POS_KEY, c);
    };

    return (
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: 120}}>
            {CORNERS.map(({id, label}) => (
                <button key={id} onClick={() => pick(id)} style={{
                    height: 36, borderRadius: 5, fontSize: 16,
                    border: `1px solid ${pos === id ? "var(--color-accent)" : "#2a2a2a"}`,
                    backgroundColor: pos === id ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "#111",
                    color: pos === id ? "var(--color-accent)" : "#444",
                    cursor: "pointer", transition: "all 0.1s",
                }}>
                    {label}
                </button>
            ))}
        </div>
    );
}
