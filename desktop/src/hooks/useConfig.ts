import {useCallback, useEffect, useState} from "react";
import type {AppConfig} from "../lib/types";
import {getConfig, saveConfig as saveConfigCmd} from "../lib/commands";

interface UseConfigResult {
    config: AppConfig | null;
    loading: boolean;
    error: string | null;
    save: (updated: AppConfig) => Promise<void>;
    reload: () => void;
}

export function useConfig(): UseConfigResult {
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadTrigger, setReloadTrigger] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        getConfig()
            .then((cfg) => {
                if (!cancelled) {
                    setConfig(cfg);
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
    }, [reloadTrigger]);

    const save = useCallback(async (updated: AppConfig) => {
        await saveConfigCmd(updated);
        setConfig(updated);
    }, []);

    const reload = useCallback(() => {
        setReloadTrigger((n) => n + 1);
    }, []);

    return {config, loading, error, save, reload};
}
