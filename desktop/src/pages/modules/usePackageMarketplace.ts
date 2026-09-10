import {useCallback, useEffect, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {
    type DevWatch,
    fetchMarketplace,
    fetchMarketplaceAdminList,
    getInstalledPackages,
    getLicenseToken,
    type InstalledPackage,
    listDevWatches
} from "../../lib/commands";
import {type CatalogEntry, splitDevWatchPair} from "./useMarketplace";

function semverGt(a: string, b: string): boolean {
    const parse = (s: string) => s.split(".").map(n => parseInt(n, 10) || 0);
    const [am, an, ap] = parse(a);
    const [bm, bn, bp] = parse(b);
    if (am !== bm) return am > bm;
    if (an !== bn) return an > bn;
    return ap > bp;
}

export function usePackageMarketplace() {
    const [entries, setEntries] = useState<CatalogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = await getLicenseToken().catch(() => null);
            const [catalog, pkgs, adminRows, watches] = await Promise.all([
                fetchMarketplace(),
                getInstalledPackages(),
                token ? fetchMarketplaceAdminList(token).catch(() => []) : Promise.resolve([]),
                listDevWatches(),
            ]);
            const pkgMap = new Map<string, InstalledPackage>(
                (pkgs as InstalledPackage[]).map(p => [p.id, p])
            );
            const devWatchMap = new Map<string, DevWatch>(watches.map(w => [w.module_id, w]));
            // Merge public catalog packages with admin-only packages (deduplicated by id).
            const allPkgs = new Map<string, typeof catalog[number]>();
            for (const e of catalog) if (e.package_type === "package") allPkgs.set(e.id, e);
            for (const e of adminRows) if (e.package_type === "package") allPkgs.set(e.id, e);

            const merged: CatalogEntry[] = [...allPkgs.values()].flatMap(entry => {
                const inst = pkgMap.get(entry.id);
                const instV = inst?.version ?? null;
                const devWatch = devWatchMap.get(entry.id);

                // Same split as modules — a dev-watched package and its
                // online listing are different things sharing one id, and
                // the local half needs its own selectable row (no Manage/
                // Releases/Reviews/Report) rather than merging into one.
                if (devWatch) return splitDevWatchPair(entry, instV, devWatch);

                return [{
                    ...entry,
                    marketplaceId: entry.id,
                    installed: !!inst,
                    installedVersion: instV,
                    updateAvailable: !!inst && !!instV && semverGt(entry.version, instV),
                    isLocalBuild: !!inst && !!instV && semverGt(instV, entry.version),
                }];
            });

            // Surface locally dev-watched/installed packages not in the catalog
            // (e.g. a purely local package that was never submitted) — mirrors
            // useMarketplace's "installed but not in catalog" fallback for modules.
            for (const [id, inst] of pkgMap) {
                if (allPkgs.has(id)) continue;
                merged.push({
                    id,
                    marketplaceId: id,
                    name: id,
                    author: "local",
                    package_type: "package",
                    status: "published",
                    version: inst.version,
                    min_app_version: "0.1.0",
                    description: "",
                    icon: "package",
                    verified: false,
                    premium: false,
                    downloads: 0,
                    tags: ["local"],
                    download_url: "",
                    checksum: "",
                    libraries: inst.libs,
                    installed: true,
                    installedVersion: inst.version,
                    updateAvailable: false,
                    isLocalBuild: false,
                    devWatch: devWatchMap.get(id),
                    isDevWatch: devWatchMap.has(id),
                });
            }

            setEntries(merged);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        const unsub = listen("library-updated", () => refresh());
        return () => {
            unsub.then(f => f());
        };
    }, [refresh]);

    useEffect(() => {
        const unsub = listen("module-dev-reloaded", () => refresh());
        return () => {
            unsub.then(f => f());
        };
    }, [refresh]);

    return {entries, loading, error, refresh};
}
