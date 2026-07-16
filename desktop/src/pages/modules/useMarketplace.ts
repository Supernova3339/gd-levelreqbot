import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { fetchMarketplace, listModules, getLibraries, type LibraryInfo } from "../../lib/commands";
import type { MarketplaceEntry, ModuleManifest } from "../../lib/types";

export interface CatalogEntry extends MarketplaceEntry {
    installed: boolean;
    installedVersion: string | null;
    updateAvailable: boolean;
}

export interface UseMarketplaceReturn {
    entries: CatalogEntry[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

function semverGt(a: string, b: string): boolean {
    const parse = (s: string) => s.split(".").map(n => parseInt(n, 10) || 0);
    const [am, an, ap] = parse(a);
    const [bm, bn, bp] = parse(b);
    if (am !== bm) return am > bm;
    if (an !== bn) return an > bn;
    return ap > bp;
}

function mergeWithInstalled(
    catalog: MarketplaceEntry[],
    installed: ModuleManifest[],
    installedLibs: LibraryInfo[],
): CatalogEntry[] {
    const installedMap = new Map(installed.map(m => [m.id, m]));
    const libNames     = new Set(installedLibs.map(l => l.name));
    const catalogIds   = new Set(catalog.map(e => e.id));

    const merged: CatalogEntry[] = catalog.map(entry => {
        // Bundle: installed when all contained libraries + modules are present
        if (entry.package_type === "package") {
            const pkgLibs = entry.libraries ?? [];
            const pkgMods = entry.modules   ?? [];
            const hasContent = pkgLibs.length > 0 || pkgMods.length > 0;
            const libsOk = pkgLibs.every(l => libNames.has(l));
            const modsOk = pkgMods.every(m => installedMap.has(m));
            const isInst = hasContent && libsOk && modsOk;
            return { ...entry, installed: isInst, installedVersion: isInst ? entry.version : null, updateAvailable: false };
        }
        // Library package
        if ((entry.package_type ?? "module") === "library") {
            const comps = entry.components ?? [];
            const isInst = comps.length > 0 ? comps.some(c => libNames.has(c)) : libNames.has(entry.id);
            return { ...entry, installed: isInst, installedVersion: isInst ? entry.version : null, updateAvailable: false };
        }
        // Module
        const inst = installedMap.get(entry.id);
        return {
            ...entry,
            installed:        !!inst,
            installedVersion: inst?.version ?? null,
            updateAvailable:  !!inst && semverGt(entry.version, inst.version),
        };
    });

    // Surface locally-installed modules not in catalog
    for (const m of installed) {
        if (catalogIds.has(m.id)) continue;
        merged.push({
            id:               m.id,
            name:             m.name,
            author:           "local",
            package_type:     "module",
            status:           "published",
            version:          m.version,
            min_app_version:  m.min_app_version ?? "0.1.0",
            description:      m.description,
            icon:             m.icon || "custom",
            verified:         false,
            premium:          false,
            downloads:        0,
            tags:             ["local"],
            download_url:     "",
            checksum:         "",
            installed:        true,
            installedVersion: m.version,
            updateAvailable:  false,
        });
    }

    // Track which library names are already covered by a catalog entry
    const coveredLibNames = new Set<string>();
    for (const entry of catalog) {
        if (entry.package_type === "library") {
            const comps = entry.components ?? [];
            if (comps.length > 0) comps.forEach(c => coveredLibNames.add(c));
            else coveredLibNames.add(entry.id);
        } else if (entry.package_type === "package") {
            (entry.libraries ?? []).forEach(l => coveredLibNames.add(l));
        }
    }

    // Surface locally-installed libraries not covered by any catalog entry
    for (const lib of installedLibs) {
        if (lib.is_stdlib) continue;
        if (coveredLibNames.has(lib.name)) continue;
        merged.push({
            id:               lib.name,
            name:             lib.name,
            author:           "local",
            package_type:     "library",
            status:           "published",
            version:          "local",
            min_app_version:  "0.1.0",
            description:      lib.description || "",
            icon:             "book",
            verified:         false,
            premium:          false,
            downloads:        0,
            tags:             ["local"],
            download_url:     "",
            checksum:         "",
            installed:        true,
            installedVersion: "local",
            updateAvailable:  false,
        });
    }

    return merged;
}

export function useMarketplace(): UseMarketplaceReturn {
    const [entries, setEntries] = useState<CatalogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);

    const refresh = useCallback(async () => {
        if (!mounted.current) return;
        setLoading(true);
        setError(null);
        try {
            const [installed, libs] = await Promise.all([listModules(), getLibraries()]);
            let catalog: MarketplaceEntry[] = [];
            try {
                catalog = await fetchMarketplace();
            } catch (e) {
                if (mounted.current) setError(String(e));
            }
            if (!mounted.current) return;
            setEntries(mergeWithInstalled(catalog, installed, libs));
        } catch (e) {
            if (!mounted.current) return;
            setError(String(e));
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        const unsub = listen("module-updated", refresh);
        return () => { unsub.then(f => f()); };
    }, [refresh]);

    useEffect(() => {
        const unsub = listen("library-updated", refresh);
        return () => { unsub.then(f => f()); };
    }, [refresh]);

    return { entries, loading, error, refresh };
}
