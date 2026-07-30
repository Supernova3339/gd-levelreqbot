import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {LibrarySidebar} from "./libraries/LibrarySidebar";
import {LibraryEditor} from "./libraries/LibraryEditor";
import {type Library, useLibraries} from "./libraries/useLibraries";
import {fetchMarketplaceAdminList, getLicenseToken, installMarketplaceModule, uninstallPackage} from "../lib/commands";
import {usePackageMarketplace} from "./modules/usePackageMarketplace";
import type {CatalogEntry, MarketplaceSort} from "./modules/useMarketplace";
import {roleAtLeast, useAccount} from "./modules/useAccount";
import {type Filter, ModuleCatalogList} from "./modules/ModuleCatalogList";
import {ModuleDetail, ModuleDetailEmpty} from "./modules/ModuleDetail";
import {SubmitModal} from "./modules/SubmitModal";
import {CreateModal} from "./modules/CreateModal";
import {SeedModal} from "./modules/SeedModal";
import {ReportsPanel, UsersPanel} from "./modules/AdminPanels";
import {mpFetchQueue} from "./modules/marketplace-api";
import {useSnackbar} from "../components/Snackbar";
import type {InstallProgress} from "./ModulesPage";

// ── Tab strip ─────────────────────────────────────────────────────────────────

type Tab = "local" | "packages";

function TabButton({label, active, onClick}: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: "6px 14px", fontSize: 11, fontWeight: 600,
                borderTop: "none", borderLeft: "none", borderRight: "none",
                borderBottom: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
                color: active ? "var(--color-accent)" : "#444",
                background: "none", cursor: "pointer",
                transition: "color 0.1s",
                letterSpacing: "0.03em",
            }}
        >
            {label}
        </button>
    );
}

// ── Packages tab ──────────────────────────────────────────────────────────────

function PackagesTab() {
    const {entries, loading, error, refresh} = usePackageMarketplace();
    const {account, logout} = useAccount();
    const show = useSnackbar();
    const [selected, setSelected] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [installProgress, setInstallProgress] = useState<Record<string, InstallProgress>>({});
    const [filter, setFilter] = useState<Filter>("all");
    const [sort, setSort] = useState<MarketplaceSort | null>(null);
    const [category, setCategory] = useState<string | null>(null);
    const [showSubmit, setShowSubmit] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [showSeed, setShowSeed] = useState(false);
    const [pending, setPending] = useState<CatalogEntry[]>([]);
    const [adminEntries, setAdminEntries] = useState<CatalogEntry[]>([]);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // Staff+ can see & act on the approval queue / admin list here too — this
    // tab was shipped without any of that wiring, so Pending/Manage always
    // rendered empty and Reports/Users had no panel behind them at all.
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
            setPending(rows
                .filter(r => r.package_type === "package")
                .map(r => ({
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
            setAdminEntries(rows
                .filter(r => r.package_type === "package")
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

    // Packages aren't fetched with server-side filters (usePackageMarketplace
    // doesn't take any) — sort/category are applied client-side here instead.
    const categories = useMemo(() => {
        const s = new Set<string>();
        for (const e of entries) if (e.category) s.add(e.category);
        return [...s].sort();
    }, [entries]);

    const visibleEntries = useMemo(() => {
        let list = category ? entries.filter(e => e.category === category) : entries;
        list = [...list];
        if (sort === "newest" || sort === "updated") {
            list.sort((a, b) => (b.pub_date ?? "").localeCompare(a.pub_date ?? ""));
        } else if (sort === "top_rated") {
            list.sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0));
        } else {
            list.sort((a, b) => b.downloads - a.downloads);
        }
        return list;
    }, [entries, category, sort]);

    useEffect(() => {
        const unsub = listen<{ id: string; state: string; message?: string }>(
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
            unsub.then(f => f());
        };
    }, []);

    const selectedEntry = entries.find(e => e.id === selected)
        ?? pending.find(e => e.id === selected)
        ?? adminEntries.find(e => e.id === selected)
        ?? null;

    const handleApproved = async () => {
        show({message: "Package approved.", variant: "success"});
        setSelected(null);
        await refresh();
        await refreshQueue();
        await refreshAdminList();
    };
    const handleDenied = async () => {
        show({message: "Package denied.", variant: "info"});
        setSelected(null);
        await refreshQueue();
        await refreshAdminList();
    };
    const handleMetaSaved = async () => {
        show({message: "Metadata saved.", variant: "success"});
        await refresh();
        await refreshAdminList();
    };
    const handleReleaseSaved = async () => {
        show({message: "Release published.", variant: "success"});
        await refresh();
        await refreshAdminList();
    };
    const handlePublished = async () => {
        show({message: "Visibility updated.", variant: "success"});
        await refresh();
        await refreshAdminList();
    };
    const handleDeleted = async () => {
        show({message: "Package deleted.", variant: "success"});
        setSelected(null);
        await refresh();
        await refreshAdminList();
    };

    const handleInstall = useCallback(async () => {
        if (!selectedEntry) return;
        setBusy(true);
        try {
            await installMarketplaceModule(selectedEntry.marketplaceId);
            show({message: `${selectedEntry.name} installed`, variant: "success"});
            refresh();
        } catch (e) {
            show({message: String(e), variant: "error"});
        } finally {
            setBusy(false);
        }
    }, [selectedEntry, refresh, show]);

    const handleUninstall = useCallback(async () => {
        if (!selectedEntry) return;
        setBusy(true);
        try {
            await uninstallPackage(selectedEntry.marketplaceId);
            show({message: `${selectedEntry.name} removed`, variant: "success"});
            refresh();
        } catch (e) {
            show({message: String(e), variant: "error"});
        } finally {
            setBusy(false);
        }
    }, [selectedEntry, refresh, show]);

    return (
        <div style={{display: "flex", flex: 1, minHeight: 0}}>
            <ModuleCatalogList
                entries={visibleEntries}
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
                onSearchCommit={() => {
                }}
            />
            <div style={{flex: 1, display: "flex", flexDirection: "column", minHeight: 0}}>
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
                        onUpdate={handleInstall}
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
                    initialType="package"
                    onClose={() => setShowSubmit(false)}
                    onSuccess={() => {
                        setShowSubmit(false);
                        show({message: "Package submitted for review!", variant: "success"});
                    }}
                />
            )}

            {showCreate && (
                <CreateModal
                    username={account.username ?? ""}
                    initialType="package"
                    onClose={() => setShowCreate(false)}
                    onSuccess={async () => {
                        setShowCreate(false);
                        show({message: "Package created.", variant: "success"});
                        await refresh();
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

// ── Page ──────────────────────────────────────────────────────────────────────

export function LibrariesPage() {
    const [tab, setTab] = useState<Tab>("local");
    const {libraries, loading, save, delete: del} = useLibraries();
    const [selected, setSelected] = useState<Library | null>(null);
    const importRef = useRef<HTMLInputElement>(null);

    const handleNew = async () => {
        const lib: Library = {
            id: `user:new_${Date.now()}`,
            name: "mylib",
            description: "My custom library",
            code: "// mylib.rhai\n\nfn hello(name) {\n    chat.say(`Hello, ${name}!`);\n}\n",
            isStandard: false,
        };
        const saved = await save(lib);
        setSelected(saved);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const code = ev.target?.result as string;
            if (!code) return;
            const lib: Library = {
                id: `user:${file.name}_${Date.now()}`,
                name: file.name.replace(/\.rhai$/, ""),
                description: `Imported from ${file.name}`,
                code,
                isStandard: false,
            };
            const saved = await save(lib);
            setSelected(saved);
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const handleFork = async (forked: Library) => {
        const saved = await save(forked);
        setSelected(saved);
    };
    const handleSave = async (lib: Library) => {
        const saved = await save(lib);
        setSelected(saved);
    };
    const handleDelete = async (id: number | string) => {
        await del(id);
        setSelected(null);
    };

    return (
        <div style={{display: "flex", flexDirection: "column", height: "100%"}}>
            {/* Tab strip */}
            <div style={{
                display: "flex", alignItems: "center", borderBottom: "1px solid #1a1a1a",
                backgroundColor: "#0a0a0a", flexShrink: 0, paddingLeft: 4,
            }}>
                <TabButton label="Local" active={tab === "local"} onClick={() => setTab("local")}/>
                <TabButton label="Packages" active={tab === "packages"} onClick={() => setTab("packages")}/>
            </div>

            {tab === "local" ? (
                <div className="flex flex-1" style={{minHeight: 0}}>
                    {loading ? (
                        <div className="flex items-center justify-center flex-1"
                             style={{color: "#2a2a2a", fontSize: 12}}>
                            Loading libraries…
                        </div>
                    ) : (
                        <>
                            <LibrarySidebar
                                libraries={libraries}
                                selected={selected}
                                onSelect={setSelected}
                                onNew={handleNew}
                                onImport={() => importRef.current?.click()}
                            />
                            <div className="flex-1 flex flex-col" style={{minHeight: 0}}>
                                {selected ? (
                                    <LibraryEditor
                                        key={selected.id}
                                        library={selected}
                                        onSave={handleSave}
                                        onDelete={handleDelete}
                                        onFork={handleFork}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center flex-1"
                                         style={{color: "#2a2a2a", fontSize: 12}}>
                                        Select a library to view or edit
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    <input ref={importRef} type="file" accept=".rhai" style={{display: "none"}}
                           onChange={handleImport}/>
                </div>
            ) : (
                <PackagesTab/>
            )}
        </div>
    );
}
