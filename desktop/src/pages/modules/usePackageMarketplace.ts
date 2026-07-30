import {useCallback, useEffect, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {
    fetchMarketplace,
    fetchMarketplaceAdminList,
    getInstalledPackages,
    getLicenseToken,
    type InstalledPackage
} from "../../lib/commands";
import type {CatalogEntry} from "./useMarketplace";

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
            const [catalog, pkgs, adminRows] = await Promise.all([
                fetchMarketplace(),
                getInstalledPackages(),
                token ? fetchMarketplaceAdminList(token).catch(() => []) : Promise.resolve([]),
            ]);
            const pkgMap = new Map<string, InstalledPackage>(
                (pkgs as InstalledPackage[]).map(p => [p.id, p])
            );
            // Merge public catalog packages with admin-only packages (deduplicated by id).
            const allPkgs = new Map<string, typeof catalog[number]>();
            for (const e of catalog) if (e.package_type === "package") allPkgs.set(e.id, e);
            for (const e of adminRows) if (e.package_type === "package") allPkgs.set(e.id, e);

            setEntries(
                [...allPkgs.values()].map(entry => {
                    const inst = pkgMap.get(entry.id);
                    const instV = inst?.version ?? null;
                    return {
                        ...entry,
                        marketplaceId: entry.id,
                        installed: !!inst,
                        installedVersion: instV,
                        updateAvailable: !!inst && !!instV && semverGt(entry.version, instV),
                        isLocalBuild: !!inst && !!instV && semverGt(instV, entry.version),
                    };
                })
            );
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

    return {entries, loading, error, refresh};
}
