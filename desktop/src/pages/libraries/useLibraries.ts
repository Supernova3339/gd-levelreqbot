import {useCallback, useEffect, useState} from "react";
import {getInstalledPackages} from "../../lib/commands";

export interface Library {
    id: number | string;
    name: string;
    description: string;
    code: string;
    isStandard: boolean;
}

interface RawLibrary {
    id: number;
    name: string;
    description: string;
    code: string;
    is_stdlib: boolean;
    enabled: boolean;
    source_module: string | null;
}

function normalize(raw: RawLibrary): Library {
    return {
        id: raw.id,
        name: raw.name,
        description: raw.description,
        code: raw.code,
        isStandard: raw.is_stdlib,
    };
}

async function fetchLibraries(): Promise<Library[]> {
    try {
        const {invoke} = await import("@tauri-apps/api/core");
        const [raw, pkgs] = await Promise.all([
            invoke<RawLibrary[]>("get_libraries"),
            getInstalledPackages(),
        ]);
        const pkgLibNames = new Set<string>();
        for (const p of pkgs) for (const l of p.libs) pkgLibNames.add(l);
        return raw.filter(r => !r.is_stdlib && !pkgLibNames.has(r.name) && !r.source_module).map(normalize);
    } catch {
        return [];
    }
}

export function useLibraries() {
    const [libraries, setLibraries] = useState<Library[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            setLibraries(await fetchLibraries());
        } catch { /* backend not ready */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    const save = useCallback(async (lib: Library): Promise<Library> => {
        try {
            const {invoke} = await import("@tauri-apps/api/core");
            await invoke("save_library", {
                id: typeof lib.id === "number" ? lib.id : null,
                name: lib.name,
                description: lib.description,
                code: lib.code,
                enabled: true,
            });
        } catch { /* non-fatal in dev */
        }
        const fresh = await fetchLibraries();
        setLibraries(fresh);
        return fresh.find(l => l.name === lib.name) ?? lib;
    }, []);

    const del = useCallback(async (id: number | string) => {
        try {
            const {invoke} = await import("@tauri-apps/api/core");
            await invoke("delete_library", {id});
        } catch { /* stub */
        }
        setLibraries(prev => prev.filter(l => l.id !== id));
    }, []);

    return {libraries, loading, save, delete: del, reload};
}
