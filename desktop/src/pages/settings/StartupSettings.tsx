import {useEffect, useState} from "react";
import {disable, enable, isEnabled} from "@tauri-apps/plugin-autostart";
import {invoke} from "@tauri-apps/api/core";

function Toggle({label, description, checked, onChange, disabled}: {
    label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
    return (
        <label className="flex items-start gap-3"
               style={{cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1}}>
            <div className="relative mt-0.5 flex-shrink-0" onClick={() => !disabled && onChange(!checked)}>
                <div className="w-9 h-5 rounded-full"
                     style={{backgroundColor: checked ? "var(--color-accent)" : "#333"}}>
                    <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                         style={{transform: checked ? "translateX(18px)" : "translateX(2px)"}}/>
                </div>
            </div>
            <div>
                <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>{label}</p>
                {description && <p className="text-xs mt-0.5" style={{color: "#555"}}>{description}</p>}
            </div>
        </label>
    );
}

export function StartupSettings() {
    const [autostart, setAutostart] = useState(false);
    const [suppressMsg, setSuppressMsg] = useState(false);
    const [isSponsor, setIsSponsor] = useState(false);

    useEffect(() => {
        isEnabled().then(setAutostart).catch(() => {
        });

        // Decode stored license token locally (no network call) to check sponsor status
        invoke<string | null>("get_license_token").then((token) => {
            if (!token) return;
            try {
                const [b64] = token.split(".");
                const payload = JSON.parse(atob(b64));
                setIsSponsor(payload?.sp === true);
            } catch { /* malformed token */
            }
        }).catch(() => {
        });

        invoke<boolean>("get_suppress_startup_msg").then(setSuppressMsg).catch(() => {
        });
    }, []);

    const handleAutostart = async (v: boolean) => {
        setAutostart(v);
        try {
            v ? await enable() : await disable();
        } catch {
            setAutostart(!v);
        }
    };

    const handleSuppressMsg = async (v: boolean) => {
        setSuppressMsg(v);
        try {
            await invoke("set_suppress_startup_msg", {suppress: v});
        } catch {
            setSuppressMsg(!v);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-sm font-semibold mb-1" style={{color: "#f1f1f1"}}>Startup</h2>
            </div>

            <Toggle
                label="Start on login"
                description="Launch the bot automatically when you log in to your computer."
                checked={autostart}
                onChange={handleAutostart}
            />

            <div className="flex flex-col gap-2">
                <Toggle
                    label="Hide startup message in chat"
                    description={isSponsor
                        ? "Don't send the watermark message to chat when the bot connects."
                        : "Available to GitHub sponsors — sign in via About to unlock."}
                    checked={suppressMsg}
                    onChange={handleSuppressMsg}
                    disabled={!isSponsor}
                />
            </div>
        </div>
    );
}
