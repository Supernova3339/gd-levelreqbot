import {useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {type ScriptingPrefs, useScriptingPrefs} from "../../hooks/useScriptingPrefs";

const FONTS: { label: string; value: ScriptingPrefs["fontFamily"] }[] = [
    {label: "JetBrains Mono", value: "JetBrains Mono"},
    {label: "Fira Code", value: "Fira Code"},
    {label: "Cascadia Code", value: "Cascadia Code"},
    {label: "monospace", value: "monospace"},
];

const SELECT: React.CSSProperties = {
    backgroundColor: "#111", color: "#d0d0d0",
    border: "1px solid #1e1e1e", borderRadius: 4,
    padding: "4px 8px", fontSize: 12, cursor: "pointer", outline: "none",
};

interface ScriptSettings {
    shell_enabled: boolean
}

export function ScriptingSettings() {
    const [prefs, , setPref] = useScriptingPrefs();
    const [scriptSettings, setScriptSettings] = useState<ScriptSettings>({shell_enabled: false});

    useEffect(() => {
        invoke<ScriptSettings>("get_script_settings").then(setScriptSettings).catch(() => {
        });
    }, []);

    const setShellEnabled = async (enabled: boolean) => {
        const next = {...scriptSettings, shell_enabled: enabled};
        setScriptSettings(next);
        await invoke("save_script_settings", {settings: next}).catch(() => {
        });
    };

    return (
        <div className="flex flex-col gap-6">

            {/* ── Text Editor ──────────────────────────────────────────────────────── */}
            <Section label="Text editor">
                <Field label="Font family">
                    <select value={prefs.fontFamily}
                            onChange={(e) => setPref("fontFamily", e.target.value as ScriptingPrefs["fontFamily"])}
                            style={{...SELECT, minWidth: 160}}>
                        {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                </Field>

                <Field label="Font size">
                    <select value={prefs.fontSize}
                            onChange={(e) => setPref("fontSize", Number(e.target.value) as ScriptingPrefs["fontSize"])}
                            style={{...SELECT, minWidth: 80}}>
                        {([12, 13, 14, 15] as const).map((s) => (
                            <option key={s} value={s}>{s}px</option>
                        ))}
                    </select>
                </Field>

                <Field label="Indent">
                    <ToggleGroup
                        options={[{value: "2", label: "2 spaces"}, {value: "4", label: "4 spaces"}]}
                        value={String(prefs.tabSize)}
                        onChange={(v) => setPref("tabSize", Number(v) as 2 | 4)}
                    />
                </Field>

                <Field label="Word wrap">
                    <Toggle value={prefs.wordWrap} onChange={(v) => setPref("wordWrap", v)}/>
                </Field>

                <Field label="Ctrl+S">
                    <ToggleGroup
                        options={[
                            {value: "save", label: "Save"},
                            {value: "save-stay", label: "Save + stay"},
                        ]}
                        value={prefs.ctrlSBehavior}
                        onChange={(v) => setPref("ctrlSBehavior", v as ScriptingPrefs["ctrlSBehavior"])}
                    />
                </Field>
            </Section>

            {/* ── Flow Editor ──────────────────────────────────────────────────────── */}
            <Section label="Flow editor">
                <Field label="Open palette with" description="How to open the node picker on the canvas">
                    <ToggleGroup
                        options={[
                            {value: "right", label: "Left-click"},
                            {value: "left", label: "Right-click"},
                        ]}
                        value={prefs.palettePosition}
                        onChange={(v) => setPref("palettePosition", v as "left" | "right")}
                    />
                </Field>
            </Section>

            {/* ── Security (Dangerous) ─────────────────────────────────────────────── */}
            <div className="flex flex-col gap-4 p-4 rounded-lg"
                 style={{backgroundColor: "#180e0e", border: "1px solid #3a1c1c"}}>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{color: "#f97316"}}>
                        Dangerous
                    </p>
                    <p className="text-xs mt-1" style={{color: "#7a3030", lineHeight: 1.6}}>
                        These features can execute arbitrary code on your machine. Only enable if you trust all scripts
                        running in this app.
                    </p>
                </div>
                <Field label="Shell access"
                       description="Gives scripts a shell object with shell.run() to execute system commands">
                    <Toggle value={scriptSettings.shell_enabled} onChange={setShellEnabled}/>
                </Field>
            </div>

        </div>
    );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function Section({label, children}: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold"
               style={{color: "#555", letterSpacing: "0.06em", textTransform: "uppercase"}}>
                {label}
            </p>
            <div className="flex flex-col gap-4 pl-1">{children}</div>
        </div>
    );
}

function Field({label, description, children}: {
    label: string; description?: string; children: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
                <p className="text-xs" style={{color: "#888"}}>{label}</p>
                {description && <p className="text-xs mt-0.5" style={{color: "#2a2a2a"}}>{description}</p>}
            </div>
            <div className="flex-shrink-0">{children}</div>
        </div>
    );
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function ToggleGroup({options, value, onChange}: {
    options: { value: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className="flex items-center rounded overflow-hidden" style={{border: "1px solid #1e1e1e"}}>
            {options.map((o) => (
                <button key={o.value} onClick={() => onChange(o.value)}
                        className="px-2.5 py-1 text-xs"
                        style={{
                            backgroundColor: value === o.value ? "#1e1e1e" : "transparent",
                            color: value === o.value ? "#d0d0d0" : "#444",
                            cursor: "pointer",
                        }}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function Toggle({value, onChange}: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button role="switch" aria-checked={value} onClick={() => onChange(!value)}
                style={{cursor: "pointer", background: "none", border: "none", padding: 0}}>
            <div className="w-8 h-4 rounded-full relative"
                 style={{backgroundColor: value ? "var(--color-accent)" : "#1a1a1a", border: "1px solid #2a2a2a"}}>
                <div className="absolute top-0.5 w-3 h-3 bg-white rounded-full"
                     style={{
                         transform: value ? "translateX(17px)" : "translateX(1px)",
                         transition: "transform 0.15s"
                     }}/>
            </div>
        </button>
    );
}
