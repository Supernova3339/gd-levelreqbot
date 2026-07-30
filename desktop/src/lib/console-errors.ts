// Shared error indicator state — derived from consoleStore so it always agrees
// with what the console page actually shows.
//
// clearErrors() sets a "hidden" watermark at the current total; new errors after
// that point will still show up. On app reload the watermark resets to 0, so
// pre-existing buffer errors reappear — which is intentional.

import {consoleStore} from "./consoleStore";

let totalErrors = 0;   // total error entries in the store right now
let hiddenErrors = 0;  // errors that were present when the user last cleared
let count = 0;         // visible error count (totalErrors - hiddenErrors)
const listeners = new Set<(n: number) => void>();

consoleStore.subscribe(entries => {
    totalErrors = entries.filter(e => e.level === "error").length;
    // hiddenErrors can't exceed total (e.g. after a store.clear())
    hiddenErrors = Math.min(hiddenErrors, totalErrors);
    count = totalErrors - hiddenErrors;
    listeners.forEach(fn => fn(count));
});

export function getErrorCount(): number {
    return count;
}

export function clearErrors(): void {
    hiddenErrors = totalErrors;
    count = 0;
    listeners.forEach(fn => fn(0));
}

export function subscribeErrors(fn: (n: number) => void): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** Creates an independent error tracker with its own hidden-watermark, so multiple
 *  indicators (e.g. nav badge vs DevReloadBar button) can clear independently. */
export function createErrorTracker() {
    let total = 0;
    let hidden = 0;
    const subs = new Set<(n: number) => void>();

    consoleStore.subscribe(entries => {
        total = entries.filter(e => e.level === "error").length;
        hidden = Math.min(hidden, total);
        const c = total - hidden;
        subs.forEach(fn => fn(c));
    });

    return {
        getCount: () => Math.max(0, total - hidden),
        clear: () => {
            hidden = total;
            subs.forEach(fn => fn(0));
        },
        subscribe: (fn: (n: number) => void) => {
            subs.add(fn);
            return () => subs.delete(fn);
        },
    };
}
