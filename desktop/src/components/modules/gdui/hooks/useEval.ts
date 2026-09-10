import {useCallback, useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {evalModulePanelData} from "../../../../lib/commands";
import {useModulePageContext} from "../context";

/**
 * Evaluate a Rhai expression inside the current module's scripting context.
 *
 * Re-evaluates when:
 *  - the expression or extraVars change
 *  - any of the listed Tauri events fires (queue-updated, module-data-updated)
 *  - the page's global refresh counter increments (actions call incrementRefresh)
 *
 * extraVars are injected into the Rhai scope before the expression runs, so
 * expressions like `gd.get_level(selected.level_id)` work when you pass
 * `{ selected: selectionState["selected"] }`.
 *
 * Event-driven re-evaluations are debounced by 60 ms so a burst of Tauri events
 * (e.g. rapid queue updates) collapses into a single backend call per widget.
 */
export function useEval(
    expr: string | undefined,
    extraVars?: Record<string, unknown>,
): { data: unknown; loading: boolean; error: string | null; refetch: () => void } {
    const {moduleId, refresh} = useModulePageContext();
    const [data, setData] = useState<unknown>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Guards against out-of-order responses: if expr/state change again before
    // an in-flight eval resolves, that stale response must not overwrite the
    // newer one that (possibly) already landed.
    const requestIdRef = useRef(0);

    const varsKey = JSON.stringify(extraVars ?? {});

    const run = useCallback(async () => {
        if (!expr) return;
        const requestId = ++requestIdRef.current;
        setLoading(true);
        try {
            const result = await evalModulePanelData(moduleId, expr, extraVars);
            if (requestId !== requestIdRef.current) return; // superseded by a newer run
            setData(result);
            setError(null);
        } catch (e) {
            if (requestId !== requestIdRef.current) return;
            // Keep last-good data on error, but surface it so widgets can show something.
            console.error(`gdui eval failed (${moduleId}): ${expr}`, e);
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [moduleId, expr, varsKey, refresh]);

    // Immediate run when dependencies change (expression, state, refresh counter)
    useEffect(() => {
        run();
    }, [run]);

    // Debounced run on streaming Tauri events — collapses rapid bursts into one call.
    // "module-data-updated" carries the emitting module's id as payload (see
    // EventProxy::emit) — null/undefined means "unscoped, refresh regardless"
    // (a non-module script's event.emit), otherwise only refetch if it's
    // THIS page's module, so one module's frequent updates (a poll ticking
    // every few seconds) don't also refetch every other open module's page.
    useEffect(() => {
        const debouncedRun = () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(run, 60);
        };
        const unsubs = [
            listen("queue-updated", debouncedRun),
            listen<string | null>("module-data-updated", e => {
                if (e.payload == null || e.payload === moduleId) debouncedRun();
            }),
        ];
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            unsubs.forEach(p => p.then(f => f()));
        };
    }, [run, moduleId]);

    return {data, loading, error, refetch: run};
}
