import {useCallback, useState} from "react";
import {executeModuleAction} from "../../../../lib/commands";
import {useModulePageContext} from "../context";
import {consoleStore} from "../../../../lib/consoleStore";

/**
 * Execute a named module action script and trigger a page-wide data refresh.
 *
 * Returns:
 *  - dispatch(key, args?) — run the action; resolves to true on success, false
 *    on failure (never rejects — most callers fire-and-forget this)
 *  - busy — the action_key currently executing, or null when idle
 *
 * Concurrent dispatches while busy are silently dropped; the caller should
 * disable buttons when busy !== null. Failures post to the shared page
 * topbar (setPageStatus) automatically — callers only need to handle success.
 */
export function useAction(): {
    dispatch: (key: string, args?: string[]) => Promise<boolean>;
    busy: string | null;
} {
    const {moduleId, incrementRefresh, setPageStatus} = useModulePageContext();
    const [busy, setBusy] = useState<string | null>(null);

    const dispatch = useCallback(async (key: string, args?: string[]) => {
        if (!key || busy) return false;
        setBusy(key);
        try {
            await executeModuleAction(moduleId, key, args);
            return true;
        } catch (e) {
            const msg = String(e);
            setPageStatus({message: msg, kind: "error"});
            consoleStore.push("error", msg, moduleId);
            return false;
        } finally {
            setBusy(null);
            incrementRefresh();
        }
    }, [moduleId, busy, incrementRefresh, setPageStatus]);

    return {dispatch, busy};
}
