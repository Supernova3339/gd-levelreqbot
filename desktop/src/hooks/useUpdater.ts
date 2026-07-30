import {useCallback, useEffect, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";

export interface UpdateInfo {
    version: string;
    current_version: string;
    notes: string | null;
    /** Internal marker — not from the update server */
    _sim?: boolean;
}

export type UpdateState =
    | { phase: "idle" }
    | { phase: "checking" }
    | { phase: "available"; info: UpdateInfo }
    | {
    phase: "downloading";
    info: UpdateInfo;
    downloaded: number;
    total: number | null;
    speed: number;
    startedAt: number
}
    | { phase: "installing"; info: UpdateInfo }
    | { phase: "error"; error: string; info?: UpdateInfo };

export function useUpdater() {
    const [state, setState] = useState<UpdateState>({phase: "idle"});
    const lastProgressRef = useRef<{ bytes: number; time: number } | null>(null);
    const emaSpeedRef = useRef<number>(0);

    // Prevents simulate() from being entered twice; also cancels in-flight tick loops.
    const simActiveRef = useRef(false);
    const simCancelRef = useRef(false);
    const simPausedRef = useRef(false);
    // Stores the pending tick fn so resume() can restart the loop exactly where it stopped.
    const simResumeRef = useRef<(() => void) | null>(null);
    // True when a real (non-sim) Tauri download is running — so dismiss() knows to cancel_update.
    const realDownloadRef = useRef(false);

    useEffect(() => {
        const unlistens: Array<() => void> = [];

        listen<{ downloaded: number; total: number | null }>("update-progress", (e) => {
            const now = performance.now();
            let speed = 0;
            if (lastProgressRef.current) {
                const dt = (now - lastProgressRef.current.time) / 1000;
                const db = e.payload.downloaded - lastProgressRef.current.bytes;
                if (dt > 0) {
                    const raw = db / dt;
                    emaSpeedRef.current = emaSpeedRef.current === 0
                        ? raw
                        : 0.25 * raw + 0.75 * emaSpeedRef.current;
                    speed = emaSpeedRef.current;
                }
            }
            lastProgressRef.current = {bytes: e.payload.downloaded, time: now};
            setState((prev) => ({
                phase: "downloading",
                info: (prev as { info?: UpdateInfo }).info ?? {version: "", current_version: "", notes: null},
                downloaded: e.payload.downloaded,
                total: e.payload.total,
                speed,
                startedAt: (prev as { startedAt?: number }).startedAt ?? Date.now(),
            }));
        }).then((fn) => unlistens.push(fn));

        // Real download finished — Tauri will restart the app shortly after "installing".
        listen("update-installed", () => {
            realDownloadRef.current = false;
            setState((prev) =>
                prev.phase === "downloading"
                    ? {phase: "installing", info: (prev as { info: UpdateInfo }).info}
                    : prev,
            );
        }).then((fn) => unlistens.push(fn));

        listen<string>("update-error", (e) => {
            realDownloadRef.current = false;
            setState((prev) =>
                prev.phase === "downloading"
                    ? {phase: "error", error: e.payload, info: (prev as { info: UpdateInfo }).info}
                    : prev,
            );
        }).then((fn) => unlistens.push(fn));

        return () => {
            unlistens.forEach((fn) => fn());
        };
    }, []);

    const check = useCallback(async () => {
        setState({phase: "checking"});
        try {
            const info = await invoke<UpdateInfo | null>("check_for_update");
            setState(info ? {phase: "available", info} : {phase: "idle"});
        } catch (e) {
            const msg = String(e);
            console.error("[updater] check failed:", msg);
            setState({phase: "error", error: msg});
        }
    }, []);

    /** Runs the fake download loop. Shared by download() when info._sim is set. */
    const runSimDownload = useCallback((info: UpdateInfo) => {
        // 50–90 MB — big enough to see progress, short enough to finish in ~15–30s
        const total = Math.floor(Math.random() * 40 * 1024 * 1024) + 50 * 1024 * 1024;
        const startedAt = Date.now();
        let downloaded = 0;
        let lastTime = performance.now();

        let baseSpeedMBps = 2.5 + Math.random() * 3.0;  // 2.5–5.5 MB/s base
        let stallRemaining = 0;
        let nextStallIn = 10 + Math.random() * 15;

        lastProgressRef.current = null;
        emaSpeedRef.current = 0;

        setState({phase: "downloading", info, downloaded: 0, total, speed: 0, startedAt});

        const tick = () => {
            if (simCancelRef.current) return;
            if (simPausedRef.current) {
                simResumeRef.current = tick;
                return;
            }

            const now = performance.now();
            const dt = Math.max((now - lastTime) / 1000, 0.001);
            lastTime = now;

            let rawSpeed: number;
            if (stallRemaining > 0) {
                stallRemaining -= dt;
                rawSpeed = 0.3 * 1024 * 1024;  // brief dip, not a crawl
            } else {
                nextStallIn -= dt;
                if (nextStallIn <= 0) {
                    stallRemaining = 0.4 + Math.random() * 1.2;
                    nextStallIn = 12 + Math.random() * 18;
                }
                baseSpeedMBps += (Math.random() - 0.5) * 0.6;
                baseSpeedMBps = Math.max(1.0, Math.min(8.0, baseSpeedMBps));
                rawSpeed = baseSpeedMBps * 1024 * 1024 * (0.8 + Math.random() * 0.4);
            }

            const chunk = Math.floor(rawSpeed * dt);
            downloaded = Math.min(downloaded + chunk, total);

            emaSpeedRef.current = emaSpeedRef.current === 0
                ? rawSpeed
                : 0.2 * rawSpeed + 0.8 * emaSpeedRef.current;

            setState((prev) => {
                if (prev.phase !== "downloading" || simCancelRef.current) return prev;
                return {...prev, downloaded, speed: emaSpeedRef.current};
            });

            if (downloaded < total) {
                setTimeout(tick, stallRemaining > 0 ? 60 : 130 + Math.random() * 80);
            } else {
                setTimeout(() => {
                    if (simCancelRef.current) return;
                    setState((prev) =>
                        prev.phase === "downloading" ? {phase: "installing", info} : prev,
                    );
                    setTimeout(() => {
                        simActiveRef.current = false;
                        setState((prev) =>
                            prev.phase === "installing" ? {phase: "idle"} : prev,
                        );
                    }, 3000);
                }, 400);
            }
        };

        setTimeout(tick, 150);
    }, []);

    const download = useCallback(async (info: UpdateInfo) => {
        if (info._sim) {
            if (simActiveRef.current) return;
            simActiveRef.current = true;
            simCancelRef.current = false;
            runSimDownload(info);
            return;
        }

        // Real update: fire-and-forget. Completion/error arrive via events.
        lastProgressRef.current = null;
        emaSpeedRef.current = 0;
        realDownloadRef.current = true;
        setState({phase: "downloading", info, downloaded: 0, total: null, speed: 0, startedAt: Date.now()});
        try {
            await invoke("download_and_install_update");
        } catch (e) {
            realDownloadRef.current = false;
            setState({phase: "error", error: String(e), info});
        }
    }, [runSimDownload]);

    /**
     * Simulates only the check → available phase. The user then decides
     * whether to click Download, which triggers the full fake download loop.
     * Gated by simActiveRef so clicking Simulate twice does nothing.
     */
    const simulate = useCallback(() => {
        if (simActiveRef.current) return;
        simActiveRef.current = true;
        simCancelRef.current = false;

        setState({phase: "checking"});

        setTimeout(() => {
            if (simCancelRef.current) {
                simActiveRef.current = false;
                return;
            }
            setState({
                phase: "available",
                info: {
                    version: "1.0.0",
                    current_version: "0.0.7",
                    notes: "• Scripting: new stdlib functions (event.emit, http.get, json.parse)\n• Fixed: queue drag-and-drop on Windows 11\n• Performance: Rhai engine reuse cuts memory 40% on large queues\n• UI: redesigned About page, sponsor badge, dark mode polish",
                    _sim: true,
                },
            });
            // Release the check lock — download() has its own guard
            simActiveRef.current = false;
        }, 1400);
    }, []);

    const pause = useCallback(() => {
        simPausedRef.current = true;
    }, []);

    const resume = useCallback(() => {
        simPausedRef.current = false;
        const fn = simResumeRef.current;
        simResumeRef.current = null;
        if (fn) setTimeout(fn, 0);
    }, []);

    const dismiss = useCallback(() => {
        if (realDownloadRef.current) {
            realDownloadRef.current = false;
            invoke("cancel_update").catch(() => {
            });
        }
        simActiveRef.current = false;
        simCancelRef.current = true;
        simPausedRef.current = false;
        simResumeRef.current = null;
        lastProgressRef.current = null;
        emaSpeedRef.current = 0;
        setState({phase: "idle"});
    }, []);

    return {state, check, download, simulate, pause, resume, dismiss};
}
