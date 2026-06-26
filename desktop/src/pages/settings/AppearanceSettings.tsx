import {useEffect, useState} from "react";

const STORAGE_KEY = "accent_color";

const PRESETS = [
    {label: "Indigo", value: "#818cf8"},
    {label: "Purple", value: "#a855f7"},
    {label: "Blue", value: "#3b82f6"},
    {label: "Cyan", value: "#06b6d4"},
    {label: "Green", value: "#22c55e"},
    {label: "Orange", value: "#f97316"},
    {label: "Red", value: "#ef4444"},
    {label: "Pink", value: "#ec4899"},
];

function apply(color: string) {
    document.documentElement.style.setProperty("--color-accent", color);
}

export function AppearanceSettings() {
    const [accent, setAccent] = useState<string>(
        () => localStorage.getItem(STORAGE_KEY) ?? "#818cf8"
    );

    useEffect(() => {
        apply(accent);
    }, []);

    const set = (color: string) => {
        setAccent(color);
        apply(color);
        localStorage.setItem(STORAGE_KEY, color);
    };

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h2 className="text-sm font-semibold mb-1" style={{color: "#f1f1f1"}}>Appearance</h2>
                <p className="text-xs" style={{color: "#555"}}>Customise how the app looks.</p>
            </div>

            {/* Accent colour */}
            <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{color: "#555"}}>Accent colour</p>

                {/* Swatches */}
                <div className="flex flex-wrap gap-2">
                    {PRESETS.map(({label, value}) => {
                        const active = accent.toLowerCase() === value.toLowerCase();
                        return (
                            <button
                                key={value}
                                onClick={() => set(value)}
                                title={label}
                                className="w-8 h-8 rounded-full flex items-center justify-center transition-transform"
                                style={{
                                    backgroundColor: value,
                                    outline: active ? `3px solid ${value}` : "none",
                                    outlineOffset: active ? 2 : 0,
                                    transform: active ? "scale(1.15)" : "scale(1)",
                                    boxShadow: active ? `0 0 12px ${value}66` : "none",
                                }}
                            >
                                {active && (
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                        <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"
                                              strokeLinejoin="round"/>
                                    </svg>
                                )}
                            </button>
                        );
                    })}

                    {/* Custom picker */}
                    <label
                        className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer relative overflow-hidden"
                        title="Custom"
                        style={{
                            background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                            outline: !PRESETS.some((p) => p.value.toLowerCase() === accent.toLowerCase())
                                ? `3px solid ${accent}` : "none",
                            outlineOffset: 2,
                        }}
                    >
                        <input type="color" value={accent} onChange={(e) => set(e.target.value)}
                               className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"/>
                    </label>
                </div>

                {/* Current value */}
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{backgroundColor: accent}}/>
                    <span className="text-xs font-mono" style={{color: "#888"}}>{accent}</span>
                    {PRESETS.find((p) => p.value.toLowerCase() === accent.toLowerCase()) ? null : (
                        <span className="text-xs" style={{color: "#555"}}>custom</span>
                    )}
                    <button
                        onClick={() => set("#818cf8")}
                        className="text-xs ml-auto"
                        style={{color: "#555"}}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#a0a0a0";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#555";
                        }}
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* Live preview */}
            <div className="flex flex-col gap-3" style={{paddingTop: 16, borderTop: "1px solid #222"}}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{color: "#555"}}>Preview</p>
                <div className="rounded-lg p-4 flex flex-col gap-4"
                     style={{backgroundColor: "#1a1a1a", border: "1px solid #222"}}>

                    {/* Buttons */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <button className="px-3 py-1.5 text-xs font-semibold rounded"
                                style={{backgroundColor: "var(--color-accent)", color: "#fff"}}>
                            Primary
                        </button>
                        <button className="px-3 py-1.5 text-xs rounded"
                                style={{
                                    backgroundColor: "transparent", color: "var(--color-accent)",
                                    border: "1px solid var(--color-accent)"
                                }}>
                            Outlined
                        </button>
                        <span className="text-xs px-2 py-0.5 rounded"
                              style={{
                                  backgroundColor: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
                                  color: "var(--color-accent)",
                                  border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)"
                              }}>
              Badge
            </span>
                    </div>

                    {/* Toggles */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-9 h-5 rounded-full relative"
                                 style={{backgroundColor: "var(--color-accent)"}}>
                                <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full shadow"/>
                            </div>
                            <span className="text-xs" style={{color: "#888"}}>On</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-9 h-5 rounded-full relative" style={{backgroundColor: "#333"}}>
                                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow"/>
                            </div>
                            <span className="text-xs" style={{color: "#555"}}>Off</span>
                        </div>
                    </div>

                    {/* Nav border example */}
                    <div className="flex items-center gap-3">
                        <div className="h-6 w-0.5 rounded" style={{backgroundColor: "var(--color-accent)"}}/>
                        <span className="text-xs font-medium" style={{color: "#f1f1f1"}}>Active nav item</span>
                    </div>

                    {/* Status dot */}
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{backgroundColor: "var(--color-accent)"}}/>
                        <span className="text-xs" style={{color: "#888"}}>Status indicator</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
