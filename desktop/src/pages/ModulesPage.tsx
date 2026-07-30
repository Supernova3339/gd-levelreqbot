import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {
    fetchMarketplaceAdminList,
    getLicenseToken,
    hardRefreshModule,
    installMarketplaceModule,
    installModuleFromDir,
    uninstallLibrary,
    uninstallModule
} from "../lib/commands";
import {useSnackbar} from "../components/Snackbar";
import {type CatalogEntry, semverGt, splitDevWatchPair, useMarketplace} from "./modules/useMarketplace";
import {roleAtLeast, useAccount} from "./modules/useAccount";
import {type Filter, ModuleCatalogList} from "./modules/ModuleCatalogList";
import {ModuleDetail, ModuleDetailEmpty} from "./modules/ModuleDetail";
import {SubmitModal} from "./modules/SubmitModal";
import {CreateModal} from "./modules/CreateModal";
import {SeedModal} from "./modules/SeedModal";
import {ReportsPanel, UsersPanel} from "./modules/AdminPanels";
import {mpFetchQueue} from "./modules/marketplace-api";

export type InstallProgress = { state: string; message?: string };

export function ModulesPage() {
    const {
        entries, loading, error, refresh,
        sort, setSort, category, setCategory, categories, setSearch,
        devWatches,
    } = useMarketplace();
    const {account, logout} = useAccount();
    const [pending, setPending] = useState<CatalogEntry[]>([]);
    const [adminEntries, setAdminEntries] = useState<CatalogEntry[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>("all");
    const [busy, setBusy] = useState(false);
    const [showSubmit, setShowSubmit] = useState(false);
    const [showSeed, setShowSeed] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [installProgress, setInstallProgress] = useState<Record<string, InstallProgress>>({});
    const snackbar = useSnackbar();
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        const unlisten = listen<{ id: string; state: string; message?: string }>(
            "marketplace-install-progress",
            ({payload}) => {
                setInstallProgress(prev => {
                    if (payload.state === "done" || payload.state === "error") {
                        const next = {...prev};
                        delete next[payload.id];
                        return next;
                    }
                    return {...prev, [payload.id]: {state: payload.state, message: payload.message}};
                });
            }
        );
        return () => {
            unlisten.then(fn => fn());
        };
    }, []);

    const allEntries = useMemo(() => {
        const map = new Map<string, CatalogEntry>();
        for (const e of entries) map.set(e.id, e);
        // The authoritative source for "is this id devWatched" — not
        // whatever a synthetic fallback entry happened to carry. That
        // fallback only exists for modules that are also formally installed
        // (see useMarketplace's "surface locally-installed modules not in
        // catalog" loop); a module that's dev-watched *without* being
        // installed that way never gets one, so checking devWatchMap
        // directly is the only way this doesn't silently miss it.
        const devWatchMap = new Map(devWatches.map(w => [w.module_id, w]));
        // pending/adminEntries always describe the real, unprefixed
        // marketplace id — if useMarketplace already split that id into
        // separate online/local entries (devWatch active on a published
        // module, see mergeWithInstalled), target the online slot; otherwise
        // the plain id.
        const keyFor = (realId: string) => map.has(`online.${realId}`) ? `online.${realId}` : realId;
        // Override a slot if it's empty OR currently holds the synthetic
        // "local" placeholder useMarketplace synthesizes for anything
        // installed locally that the public /catalog fetch didn't return
        // (e.g. your own draft/pending package, which isn't public yet but
        // you also have installed for dev). Otherwise a real, manageable
        // record silently loses to a fake one with no Manage tab.
        // Carry the synthetic entry's accurate local install state forward
        // so "Installed"/dev-watch status doesn't regress in the process.
        const upsertReal = (e: CatalogEntry) => {
            const key = keyFor(e.id);
            const existing = map.get(key);
            if (existing && existing.author !== "local") return;
            // pending/adminEntries hardcode updateAvailable/isLocalBuild to
            // false (they don't know the local install state) — recompute
            // them here now that we have both the real server version (e)
            // and the actual installed version (existing), instead of
            // blindly inheriting the local placeholder's always-false
            // values. Without this, a dev-watched package with a real,
            // newer published release never shows an "Update" button —
            // only "Refresh" (reinstall from local source) — with no way
            // to actually pull the real server release.
            const instV = existing?.installedVersion ?? null;
            // A devWatched draft/pending/denied package never showed up in
            // the *public* catalog fetch, so useMarketplace's own online/
            // local split never ran for it. Whether the two-row split (and
            // everything gated on isLocalShadow — Manage, Releases, Reviews)
            // shows up should depend on devWatch being active, never on
            // publish status. Split it now that admin/pending data has
            // actually arrived.
            const devWatch = devWatchMap.get(e.id);
            if (devWatch) {
                map.delete(key);
                const [onlineEntry, localEntry] = splitDevWatchPair(e, instV, devWatch);
                map.set(onlineEntry.id, onlineEntry);
                map.set(localEntry.id, localEntry);
                return;
            }
            map.set(key, existing?.installed
                ? {
                    ...e,
                    id: key,
                    marketplaceId: e.id,
                    installed: existing.installed,
                    installedVersion: instV,
                    updateAvailable: !!instV && semverGt(e.version, instV),
                    isLocalBuild: !!instV && semverGt(instV, e.version),
                    devWatch: existing.devWatch,
                    isDevWatch: existing.isDevWatch,
                }
                : {...e, id: key, marketplaceId: e.id});
        };
        for (const e of pending) upsertReal(e);
        for (const e of adminEntries) upsertReal(e);
        return [...map.values()];
    }, [entries, pending, adminEntries, devWatches]);
    // `selected` is set from whatever list row was clicked. Rows sourced from
    // pending/adminEntries carry the raw, unprefixed marketplace id, but
    // upsertReal above may have filed that same package under an
    // "online."-prefixed key (devWatch split) — so an exact id match can miss
    // even though the package is right there under its marketplaceId.
    const selectedEntry = allEntries.find(e => e.id === selected)
        ?? allEntries.find(e => e.marketplaceId === selected)
        ?? null;

    // Staff+ can see & act on the approval queue / admin list (delete/publish
    // inside ModuleDetail are further gated to admin-only there).
    const isStaff = account.isOwner || roleAtLeast(account.role, "staff");

    const refreshQueue = useCallback(async () => {
        const token = await getLicenseToken().catch(() => null);
        if (!token || !isStaff) {
            setPending([]);
            return;
        }
        try {
            const rows = await mpFetchQueue(token);
            if (!mounted.current) return;
            setPending(rows.map(r => ({
                ...r,
                marketplaceId: r.id,
                installed: false,
                installedVersion: null,
                updateAvailable: false,
                isLocalBuild: false
            })));
        } catch {
            setPending([]);
        }
    }, [isStaff]);

    const refreshAdminList = useCallback(async () => {
        const token = await getLicenseToken().catch(() => null);
        if (!token || !isStaff) {
            setAdminEntries([]);
            return;
        }
        try {
            const rows = await fetchMarketplaceAdminList(token);
            if (!mounted.current) return;
            // Packages belong in Libraries > Packages tab, not the Modules page.
            setAdminEntries(rows
                .filter(r => r.package_type !== "package")
                .map(r => ({
                    ...r,
                    marketplaceId: r.id,
                    installed: false,
                    installedVersion: null,
                    updateAvailable: false,
                    isLocalBuild: false
                })));
        } catch {
            setAdminEntries([]);
        }
    }, [isStaff]);

    useEffect(() => {
        refreshQueue();
        refreshAdminList();
    }, [refreshQueue, refreshAdminList]);

    const doWithBusy = async (fn: () => Promise<void>, msg: string) => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
            snackbar({message: msg, variant: "success"});
            await refresh();
            await refreshQueue();
        } catch (e) {
            snackbar({message: String(e), variant: "error"});
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    // Always resolve through marketplaceId, never the raw sidebar-selected id
    // — that's a display/selection key now and gets a "local."/"online."
    // prefix when a devWatched module is split from its online listing (see
    // useMarketplace's mergeWithInstalled), which the server knows nothing about.
    const handleInstall = () => doWithBusy(() => installMarketplaceModule(selectedEntry?.marketplaceId ?? selected!), "Module installed.");
    // The Modules page also lists locally-installed libraries (package_type
    // "library") that aren't in the catalog, not just modules — those live in
    // a different table/directory and need uninstall_library, not
    // uninstall_module, or "Remove" silently no-ops for them.
    const handleUninstall = () => doWithBusy(
        () => selectedEntry?.package_type === "library" ? uninstallLibrary(selectedEntry?.marketplaceId ?? selected!) : uninstallModule(selectedEntry?.marketplaceId ?? selected!),
        selectedEntry?.package_type === "library" ? "Library removed." : "Module removed.",
    );
    const handleRefresh = () => {
        const w = selectedEntry?.devWatch;
        if (!w) return;
        doWithBusy(() => installModuleFromDir(w.source_dir).then(() => {
        }), "Module refreshed from source.");
    };
    // Shift-click on Refresh — fully deletes the installed copy first instead
    // of only overwriting/adding files, so renamed/deleted source files don't
    // linger, and (more importantly) so a module installed under a different
    // author/package_type than expected still actually gets wiped and rebuilt
    // at wherever it's really installed, not silently left stale.
    const handleHardRefresh = () => {
        const w = selectedEntry?.devWatch;
        if (!w) return;
        doWithBusy(() => hardRefreshModule(w.source_dir).then(() => {
        }), "Module fully reinstalled from source.");
    };
    const handleUpdate = () => doWithBusy(async () => {
        const id = selectedEntry?.marketplaceId ?? selected!;
        await uninstallModule(id);
        await installMarketplaceModule(id);
    }, "Module updated.");

    const handleApproved = async () => {
        snackbar({message: "Package approved.", variant: "success"});
        setSelected(null);
        await refresh();
        await refreshQueue();
        await refreshAdminList();
    };
    const handleDenied = async () => {
        snackbar({message: "Package denied.", variant: "info"});
        setSelected(null);
        await refreshQueue();
        await refreshAdminList();
    };
    const handleMetaSaved = async () => {
        snackbar({message: "Metadata saved.", variant: "success"});
        await refresh();
        await refreshAdminList();
    };
    const handleReleaseSaved = async () => {
        snackbar({message: "Release published.", variant: "success"});
        await refresh();
        await refreshAdminList();
    };
    const handlePublished = async () => {
        snackbar({message: "Visibility updated.", variant: "success"});
        await refresh();
        await refreshAdminList();
    };
    const handleDeleted = async () => {
        snackbar({message: "Package deleted.", variant: "success"});
        setSelected(null);
        await refresh();
        await refreshAdminList();
    };

    return (
        <div style={{display: "flex", height: "100%", overflow: "hidden", backgroundColor: "#0f0f0f"}}>
            <ModuleCatalogList
                entries={allEntries}
                pendingEntries={pending}
                adminEntries={adminEntries}
                loading={loading}
                error={error}
                selected={selected}
                onSelect={setSelected}
                onRetry={refresh}
                account={account}
                onLogout={logout}
                onSubmitClick={() => setShowSubmit(true)}
                onSeedClick={() => setShowSeed(true)}
                onCreateClick={() => setShowCreate(true)}
                installProgress={installProgress}
                filter={filter}
                onFilter={setFilter}
                sort={sort}
                onSortChange={setSort}
                category={category}
                onCategoryChange={setCategory}
                categories={categories}
                onSearchCommit={setSearch}
            />

            <div style={{flex: 1, minWidth: 0, overflow: "hidden"}}>
                {filter === "reports" ? (
                    <ReportsPanel/>
                ) : filter === "users" ? (
                    <UsersPanel/>
                ) : selectedEntry ? (
                    <ModuleDetail
                        entry={selectedEntry}
                        account={account}
                        busy={busy}
                        progress={installProgress[selectedEntry.marketplaceId] ?? null}
                        onInstall={handleInstall}
                        onUninstall={handleUninstall}
                        onUpdate={handleUpdate}
                        onRefresh={handleRefresh}
                        onHardRefresh={handleHardRefresh}
                        onApproved={handleApproved}
                        onDenied={handleDenied}
                        onMetaSaved={handleMetaSaved}
                        onReleaseSaved={handleReleaseSaved}
                        onPublished={handlePublished}
                        onDeleted={handleDeleted}
                    />
                ) : (
                    <ModuleDetailEmpty/>
                )}
            </div>

            {showSubmit && (
                <SubmitModal
                    username={account.username ?? ""}
                    onClose={() => setShowSubmit(false)}
                    onSuccess={() => {
                        setShowSubmit(false);
                        snackbar({message: "Package submitted for review!", variant: "success"});
                    }}
                />
            )}

            {showCreate && (
                <CreateModal
                    username={account.username ?? ""}
                    onClose={() => setShowCreate(false)}
                    onSuccess={async () => {
                        setShowCreate(false);
                        snackbar({message: "Package created.", variant: "success"});
                        await refresh();
                        await refreshAdminList();
                    }}
                />
            )}

            {showSeed && (
                <SeedModal
                    username={account.username ?? ""}
                    entries={entries}
                    onClose={() => {
                        setShowSeed(false);
                        refresh();
                    }}
                />
            )}
        </div>
    );
}
