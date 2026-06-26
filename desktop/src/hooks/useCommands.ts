import {useCallback, useEffect, useState} from "react";
import {
    type BotCommand,
    createCommand as createCommandApi,
    deleteCommand as deleteCommandApi,
    duplicateCommand as duplicateCommandApi,
    getCommands,
    resetCounter as resetCounterApi,
    toggleCommandEnabled as toggleCommandEnabledApi,
    updateCommand,
} from "../lib/commands";
import type {Command} from "../pages/CommandsPage";

function deserialize(raw: BotCommand): Command {
    return {
        id: raw.id,
        trigger: raw.trigger,
        aliases: (() => {
            try {
                return JSON.parse(raw.aliases);
            } catch {
                return [];
            }
        })(),
        enabled: raw.enabled,
        description: raw.description,
        builtin_key: raw.builtin_key,
        response: raw.response,
        required_badges: (() => {
            try {
                return JSON.parse(raw.required_badges);
            } catch {
                return [];
            }
        })(),
        cooldown_seconds: raw.cooldown_seconds,
        user_cooldown_seconds: raw.user_cooldown_seconds,
        platform: raw.platform,
        counter: raw.counter,
        script: raw.script ?? null,
        script_mode: raw.script_mode ?? "text",
    };
}

export function useCommands(active = true) {
    const [commands, setCommands] = useState<Command[]>([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setCommands((await getCommands()).map(deserialize));
        } catch { /* backend not ready yet */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (active) load();
    }, [active, load]);

    const toggleCommand = useCallback(async (id: number, enabled: boolean) => {
        // Optimistic update immediately, then sync with backend
        setCommands((prev) => prev.map((c) => c.id === id ? {...c, enabled} : c));
        await toggleCommandEnabledApi(id, enabled);
    }, []);

    const editCommand = useCallback(async (updated: Command) => {
        await updateCommand(
            updated.id, updated.trigger, JSON.stringify(updated.aliases), updated.enabled,
            updated.description, updated.response, JSON.stringify(updated.required_badges),
            updated.cooldown_seconds, updated.user_cooldown_seconds, updated.platform,
        );
        setCommands((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    }, []);

    const createCommand = useCallback(async (trigger: string, response: string, description = "") => {
        const raw = await createCommandApi(trigger, response, description);
        setCommands((prev) => [...prev, deserialize(raw)]);
    }, []);

    const deleteCommand = useCallback(async (id: number) => {
        await deleteCommandApi(id);
        setCommands((prev) => prev.filter((c) => c.id !== id));
    }, []);

    const resetCounter = useCallback(async (id: number) => {
        await resetCounterApi(id);
        setCommands((prev) => prev.map((c) => c.id === id ? {...c, counter: 0} : c));
    }, []);

    const duplicateCommand = useCallback(async (id: number): Promise<Command> => {
        const raw = await duplicateCommandApi(id);
        const dup = deserialize(raw);
        setCommands((prev) => [...prev, dup]);
        return dup;
    }, []);

    return {
        commands,
        loading,
        toggleCommand,
        editCommand,
        createCommand,
        deleteCommand,
        resetCounter,
        duplicateCommand,
        reload: load
    };
}
