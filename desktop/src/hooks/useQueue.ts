import {useCallback, useEffect, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import type {NextLevel, QueuePage} from "../lib/types";
import {
    clearQueue as clearQueueCmd,
    getSubscriberQueue,
    getViewerQueue,
    nextLevel as nextLevelCmd,
    removeFromQueue as removeFromQueueCmd,
} from "../lib/commands";

interface UseQueueResult {
    viewerQueue: QueuePage | null;
    subscriberQueue: QueuePage | null;
    viewerPage: number;
    subscriberPage: number;
    loading: boolean;
    error: string | null;
    lastLevel: NextLevel | null;
    setViewerPage: (page: number) => void;
    setSubscriberPage: (page: number) => void;
    reload: () => void;
    nextLevel: () => Promise<NextLevel | null>;
    clearQueue: () => Promise<void>;
    removeFromQueue: (levelId: number) => Promise<void>;
}

const PER_PAGE = 15;

export function useQueue(): UseQueueResult {
    const [viewerQueue, setViewerQueue] = useState<QueuePage | null>(null);
    const [subscriberQueue, setSubscriberQueue] = useState<QueuePage | null>(null);
    const [viewerPage, setViewerPage] = useState(1);
    const [subscriberPage, setSubscriberPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastLevel, setLastLevel] = useState<NextLevel | null>(null);
    const [reloadTrigger, setReloadTrigger] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.all([
            getViewerQueue(viewerPage, PER_PAGE),
            getSubscriberQueue(subscriberPage, PER_PAGE),
        ])
            .then(([vq, sq]) => {
                if (!cancelled) {
                    setViewerQueue(vq);
                    setSubscriberQueue(sq);
                    setLoading(false);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(String(err));
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [viewerPage, subscriberPage, reloadTrigger]);

    // Auto-reload when the Rust backend emits queue-updated (e.g. someone types !r in chat)
    useEffect(() => {
        const unlisten = listen("queue-updated", () => {
            setReloadTrigger((n) => n + 1);
        });
        return () => {
            unlisten.then((f) => f());
        };
    }, []);

    const reload = useCallback(() => {
        setReloadTrigger((n) => n + 1);
    }, []);

    const nextLevel = useCallback(async (): Promise<NextLevel | null> => {
        const level = await nextLevelCmd();
        setLastLevel(level);
        setReloadTrigger((n) => n + 1);
        return level;
    }, []);

    const clearQueue = useCallback(async () => {
        await clearQueueCmd();
        setLastLevel(null);
        setReloadTrigger((n) => n + 1);
    }, []);

    const removeFromQueue = useCallback(async (levelId: number) => {
        await removeFromQueueCmd(levelId);
        setReloadTrigger((n) => n + 1);
    }, []);

    return {
        viewerQueue,
        subscriberQueue,
        viewerPage,
        subscriberPage,
        loading,
        error,
        lastLevel,
        setViewerPage,
        setSubscriberPage,
        reload,
        nextLevel,
        clearQueue,
        removeFromQueue,
    };
}
