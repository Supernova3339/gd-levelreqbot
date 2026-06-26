import {useCallback, useState} from "react";

export interface ScriptingPrefs {
    defaultMode: "visual" | "text";
    fontSize: 12 | 13 | 14 | 15;
    fontFamily: "JetBrains Mono" | "Fira Code" | "Cascadia Code" | "monospace";
    tabSize: 2 | 4;
    wordWrap: boolean;
    palettePosition: "left" | "right";
    ctrlSBehavior: "save" | "save-stay";
}

const STORAGE_KEY = "scripting.prefs";

const DEFAULTS: ScriptingPrefs = {
    defaultMode: "text",
    palettePosition: "left",
    fontSize: 13,
    fontFamily: "JetBrains Mono",
    tabSize: 4,
    wordWrap: false,
    ctrlSBehavior: "save",
};

function load(): ScriptingPrefs {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return {...DEFAULTS, ...JSON.parse(raw)};
    } catch { /* ignore */
    }
    return DEFAULTS;
}

function save(prefs: ScriptingPrefs) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch { /* ignore */
    }
}

export function useScriptingPrefs(): [
    ScriptingPrefs,
    (prefs: ScriptingPrefs) => void,
    <K extends keyof ScriptingPrefs>(key: K, value: ScriptingPrefs[K]) => void,
] {
    const [prefs, setPrefsState] = useState<ScriptingPrefs>(load);

    const setPrefs = useCallback((next: ScriptingPrefs) => {
        save(next);
        setPrefsState(next);
    }, []);

    const setPref = useCallback(<K extends keyof ScriptingPrefs>(key: K, value: ScriptingPrefs[K]) => {
        setPrefsState((prev) => {
            const next = {...prev, [key]: value};
            save(next);
            return next;
        });
    }, []);

    return [prefs, setPrefs, setPref];
}
