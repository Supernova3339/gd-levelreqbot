import {useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";

interface ScriptSettings {
    shell_enabled: boolean;
}

/** Whether the `shell` proxy is currently injected into script scope
 *  (Settings → Scripting → shell access). Used to filter the editor's
 *  autocomplete/toolbar so it doesn't offer `shell.*` when it's disabled. */
export function useShellEnabled(): boolean {
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        invoke<ScriptSettings>("get_script_settings")
            .then((s) => setEnabled(s.shell_enabled))
            .catch(() => {
            });
    }, []);

    return enabled;
}
