import {useCallback, useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import type {BotStatusResponse} from "../lib/types";
import {getBotStatus, startBot as startBotCmd, stopBot as stopBotCmd} from "../lib/commands";

interface UseBotStatusResult {
    status: BotStatusResponse | null;
    startError: string | null;
    starting: boolean;
    stopping: boolean;
    startBot: () => Promise<void>;
    stopBot: () => Promise<void>;
}

export function useBotStatus(): UseBotStatusResult {
    const [status, setStatus] = useState<BotStatusResponse | null>(null);
    const [startError, setStartError] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);
    const [stopping, setStopping] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            setStatus(await getBotStatus());
        } catch { /* backend not ready */
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const unlisten = listen("bot-status-changed", () => fetchStatus());
        intervalRef.current = setInterval(fetchStatus, 10000);
        return () => {
            unlisten.then((f) => f());
            if (intervalRef.current !== null) clearInterval(intervalRef.current);
        };
    }, [fetchStatus]);

    const startBot = useCallback(async () => {
        setStarting(true);
        setStartError(null);
        try {
            await startBotCmd();
            await fetchStatus();
        } catch (err) {
            // Surface the Rust error message directly — it's already user-facing
            setStartError(String(err));
        } finally {
            setStarting(false);
        }
    }, [fetchStatus]);

    const stopBot = useCallback(async () => {
        setStopping(true);
        setStartError(null);
        try {
            await stopBotCmd();
            await fetchStatus();
        } finally {
            setStopping(false);
        }
    }, [fetchStatus]);

    return {status, startError, starting, stopping, startBot, stopBot};
}
