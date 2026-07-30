import {useCallback, useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {
    type DevWatch,
    fetchMarketplace,
    getInstalledPackages,
    getLibraries,
    type InstalledPackage,
    type LibraryInfo,
    listDevWatches,
    listModules
} from "../../lib/commands";
import type {MarketplaceEntry, ModuleManifest} from "../../lib/types";

export type MarketplaceSort = "popular" | "top_rated" | "newest" | "updated";

export interface CatalogEntry extends MarketplaceEntry {
    /** The real marketplace/module id — always unprefixed. Every marketplace
     *  API call (release/review/report/manage endpoints, install/uninstall,
     *  preflight) must use this, never `id` directly, since `id` is only a
     *  display/selection key and gets a "local."/"online." prefix when a
     *  devWatched module and its online listing are split into two entries
     *  (see mergeWithInstalled below). */
    marketplaceId: string;
    installed: boolean;
    installedVersion: string | null;
    updateAvailable: boolean;
    /** True when the locally-installed version is ahead of the latest catalog version (dev build). */
    isLocalBuild: boolean;
    /** Set when the module is being hot-reload watched — includes source_dir for refresh. */
    devWatch?: DevWatch;
    /** @deprecated use devWatch */
    isDevWatch?: boolean;
    /** True for the synthetic "local build" half of a devWatch split — this
     *  row represents your local install, not the marketplace listing, so it
     *  never gets Manage/Releases/Reviews/Report (same gating as author==="local"). */
    isLocalShadow?: boolean;
}

export interface UseMarketplaceReturn {
    entries: CatalogEntry[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    /** null = no explicit sort chosen — nothing is sent to the server, which
     *  happens to default to popularity ordering, but that's a server
     *  implementation detail, not the same thing as the user picking
     *  "Popular" as a sort. Only a non-null value counts as an active filter. */
    sort: MarketplaceSort | null;
    setSort: (s: MarketplaceSort | null) => void;
    category: string | null;
    setCategory: (c: string | null) => void;
    /** Distinct categories seen across every catalog fetch so far — accumulates
     *  and never shrinks, so the chip list stays stable even once `category`
     *  narrows the loaded catalog down to a single value. */
    categories: string[];
    /** Debounced search term forwarded to the server's `?q=` full-text search
     *  (in addition to the existing local substring filter in ModuleCatalogList,
     *  which still applies to pending/admin/local-only entries the catalog
     *  fetch doesn't cover). Set via the committed (already-debounced) value
     *  from ModuleCatalogList, not on every keystroke. */
    search: string;
    setSearch: (s: string) => void;
    /** Raw list — see the docblock on the state declaration in useMarketplace(). */
    devWatches: DevWatch[];
}

export function semverGt(a: string, b: string): boolean {
    const parse = (s: string) => s.split(".").map(n => parseInt(n, 10) || 0);
    const [am, an, ap] = parse(a);
    const [bm, bn, bp] = parse(b);
    if (am !== bm) return am > bm;
    if (an !== bn) return an > bn;
    return ap > bp;
}

/** Splits one devWatched module into its online (published-listing) and
 *  local (your dev build) halves — see the CatalogEntry.isLocalShadow
 *  docblock for why they're never merged into one row. Exported so callers
 *  outside this hook (ModulesPage's admin/pending merge) can apply the exact
 *  same split to a draft/pending/denied entry — the public catalog fetch
 *  this hook runs on only ever sees published packages, so devWatch on
 *  anything else has to be split here instead, by whoever has that data. */
export function splitDevWatchPair(entry: MarketplaceEntry, instV: string | null, devWatch: DevWatch): [CatalogEntry, CatalogEntry] {
    const onlineEntry: CatalogEntry = {
        ...entry,
        id: `online.${entry.id}`,
        marketplaceId: entry.id,
        installed: false,
        installedVersion: null,
        updateAvailable: false,
        isLocalBuild: false,
    };
    const localEntry: CatalogEntry = {
        ...entry,
        id: `local.${entry.id}`,
        marketplaceId: entry.id,
        version: instV ?? entry.version,
        installed: true,
        installedVersion: instV,
        updateAvailable: false,
        isLocalBuild: false,
        devWatch,
        isDevWatch: true,
        isLocalShadow: true,
        // Screenshots/banner/rating/downloads belong to the published
        // listing, not your local source tree — a dev-watched build
        // shouldn't carry the marketplace page's assets and stats.
        resources: undefined,
        rating_avg: undefined,
        rating_count: undefined,
        downloads: 0,
        // draft/pending/denied is a fact about the *online listing*, not
        // about your local working copy — your local files are just there,
        // regardless of whether the listing has been approved yet. Without
        // this override the local row inherited the real status and showed
        // "Draft" right next to "Local dev build", implying (wrongly) that
        // your local copy itself was somehow unpublished.
        status: "published",
    };
    return [onlineEntry, localEntry];
}

function mergeWithInstalled(
    catalog: MarketplaceEntry[],
    installed: ModuleManifest[],
    installedLibs: LibraryInfo[],
    installedPkgLibs: Set<string>,
    devWatchMap: Map<string, DevWatch>,
): CatalogEntry[] {
    const installedMap = new Map(installed.map(m => [m.id, m]));
    const libNames     = new Set(installedLibs.map(l => l.name));
    const catalogIds   = new Set(catalog.map(e => e.id));

    const merged: CatalogEntry[] = catalog.flatMap(entry => {
        // Packages (library bundles) belong in Libraries > Packages tab, not here
        if (entry.package_type === "package") return [];
        // Library package
        if ((entry.package_type ?? "module") === "library") {
            const comps = entry.components ?? [];
            const isInst = comps.length > 0 ? comps.some(c => libNames.has(c)) : libNames.has(entry.id);
            return {
                ...entry,
                marketplaceId: entry.id,
                installed: isInst,
                installedVersion: isInst ? entry.version : null,
                updateAvailable: false,
                isLocalBuild: false
            };
        }
        // Module
        const inst = installedMap.get(entry.id);
        const instV = inst?.version ?? null;
        const devWatch = devWatchMap.get(entry.id);

        // A devWatched module and its online listing are different things
        // sharing one marketplace id — never merge them into a single
        // row/selection. Split into two separately-selectable entries so
        // they get distinct keys, distinct highlighting, and distinct panels
        // (the local row never shows Manage/Releases/Reviews — see
        // isLocalShadow in ModuleDetail.tsx).
        if (devWatch) return splitDevWatchPair(entry, instV, devWatch);

        return {
            ...entry,
            marketplaceId: entry.id,
            installed:        !!inst,
            installedVersion: instV,
            updateAvailable: !!inst && !!instV && semverGt(entry.version, instV),
            isLocalBuild: !!inst && !!instV && semverGt(instV, entry.version),
        };
    });

    // Surface locally-installed modules not in catalog
    for (const m of installed) {
        if (catalogIds.has(m.id)) continue;
        merged.push({
            id:               m.id,
            marketplaceId: m.id,
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
            isLocalBuild: false,
            devWatch: devWatchMap.get(m.id),
            isDevWatch: devWatchMap.has(m.id),
        });
    }

    // Track which library names are already covered by a catalog entry or installed package
    const coveredLibNames = new Set<string>(installedPkgLibs);
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
    // Skip module-bundled libraries — they're not independently installable
    for (const lib of installedLibs) {
        if (lib.is_stdlib) continue;
        if (lib.source_module) continue;
        if (coveredLibNames.has(lib.name)) continue;
        merged.push({
            id:               lib.name,
            marketplaceId: lib.name,
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
            isLocalBuild: false,
        });
    }

    return merged;
}

export function useMarketplace(): UseMarketplaceReturn {
    const [entries, setEntries] = useState<CatalogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sort, setSort] = useState<MarketplaceSort | null>(null);
    const [category, setCategory] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const categoriesSeen = useRef<Set<string>>(new Set());
    const [categories, setCategories] = useState<string[]>([]);
    // Raw devWatch list, exposed as-is — entries only carries devWatch info
    // for modules that survived either the published-catalog split or the
    // "installed but not in catalog" fallback. A module that's dev-watched
    // without also being formally installed falls through both of those, so
    // callers that need devWatch for an *arbitrary* id (ModulesPage merging
    // in admin/pending data) need the unfiltered source list, not a signal
    // smuggled through entries.
    const [devWatches, setDevWatches] = useState<DevWatch[]>([]);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [installed, libs, pkgs, watches] = await Promise.all([
                listModules(), getLibraries(), getInstalledPackages(), listDevWatches(),
            ]);
            setDevWatches(watches);
            const pkgLibSet = new Set<string>();
            for (const p of (pkgs as InstalledPackage[])) for (const l of p.libs) pkgLibSet.add(l);
            const devWatchMap = new Map(watches.map(w => [w.module_id, w]));
            let catalog: MarketplaceEntry[] = [];
            try {
                catalog = await fetchMarketplace({
                    sort: sort ?? undefined,
                    category: category ?? undefined,
                    q: search || undefined
                });
            } catch (e) {
                setError(String(e));
            }
            let sawNewCategory = false;
            for (const e of catalog) {
                if (e.category && !categoriesSeen.current.has(e.category)) {
                    categoriesSeen.current.add(e.category);
                    sawNewCategory = true;
                }
            }
            if (sawNewCategory) setCategories([...categoriesSeen.current].sort());
            setEntries(mergeWithInstalled(catalog, installed, libs, pkgLibSet, devWatchMap));
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, [sort, category, search]);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        const unsub = listen("module-updated", () => {
            refresh();
        });
        return () => { unsub.then(f => f()); };
    }, [refresh]);

    useEffect(() => {
        const unsub = listen("library-updated", () => {
            refresh();
        });
        return () => { unsub.then(f => f()); };
    }, [refresh]);

    useEffect(() => {
        const unsub = listen("module-dev-reloaded", () => {
            refresh();
        });
        return () => {
            unsub.then(f => f());
        };
    }, [refresh]);

    return {
        entries,
        loading,
        error,
        refresh,
        sort,
        setSort,
        category,
        setCategory,
        categories,
        search,
        setSearch,
        devWatches
    };
}
