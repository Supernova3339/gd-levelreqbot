import React, {useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import type {CatalogEntry, MarketplaceSort} from "./useMarketplace";
import {type AccountState, roleAtLeast} from "./useAccount";
import type {InstallProgress} from "../ModulesPage";
import {iconColor, IconRenderer} from "./icons";
import {Select} from "../../components/ui/Select";

// ── Topbar ────────────────────────────────────────────────────────────────────

export type Filter = "all" | "installed" | "updates" | "local" | "pending" | "manage" | "reports" | "users";

const BASE_FILTERS: { f: Filter; label: string }[] = [
    {f: "all", label: "All"},
    {f: "installed", label: "Installed"},
    {f: "updates", label: "Updates"},
];

/** True for anything that represents a local install rather than the online
 *  listing — the standalone synthetic entry for a module with no catalog
 *  counterpart (author === "local"), or the local half of a devWatch split
 *  (isLocalShadow, see mergeWithInstalled in useMarketplace.ts). */
function isLocalEntry(e: CatalogEntry): boolean {
    return e.author === "local" || !!e.isLocalShadow;
}

const NONE_SORT = "__default__" as const;
const NONE_CATEGORY = "__none__" as const;
type SortValue = MarketplaceSort | typeof NONE_SORT;
type CategoryValue = string;

const SORT_SELECT_OPTIONS: { value: SortValue; label: string }[] = [
    {value: NONE_SORT, label: "Default"},
    {value: "popular", label: "Popular"},
    {value: "top_rated", label: "Top Rated"},
    {value: "newest", label: "Newest"},
    {value: "updated", label: "Updated"},
];

function Topbar({
                    search, onSearch, filter, onFilter, pendingCount, hasLocal, account, onLogout,
                    onSubmitClick, onCreateClick, onSeedClick,
                    sort, onSortChange, category, onCategoryChange, categories
                }: {
    search: string; onSearch: (v: string) => void;
    filter: Filter; onFilter: (f: Filter) => void;
    pendingCount: number;
    /** Only show the "Local" filter chip when you actually have something
     *  local installed — otherwise it'd just be an always-empty tab. */
    hasLocal: boolean;
    account: AccountState; onLogout: () => void;
    onSubmitClick: () => void; onCreateClick: () => void; onSeedClick: () => void;
    sort: MarketplaceSort | null; onSortChange: (s: MarketplaceSort | null) => void;
    category: string | null; onCategoryChange: (c: string | null) => void;
    categories: string[];
}) {
    const isStaff = account.isOwner || roleAtLeast(account.role, "staff");
    const isAdmin = account.isOwner || roleAtLeast(account.role, "admin");
    const filters = [
        ...BASE_FILTERS,
        ...(hasLocal ? [{f: "local" as Filter, label: "Local"}] : []),
    ];
    // Staff/admin filters render as their own row, separate from the
    // browsing tabs every user sees — mixing "Pending"/"Manage"/"Reports"/
    // "Users" into the same strip as All/Installed/Updates/Local made the
    // one piece of chrome every visitor sees first read as majority
    // admin-facing by item count, even for someone who'll never manage
    // anything.
    const staffFilters = [
        ...(isStaff ? [
            {f: "pending" as Filter, label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}`},
            {f: "manage" as Filter, label: "Manage"},
            {f: "reports" as Filter, label: "Reports"},
        ] : []),
        ...(isAdmin ? [
            {f: "users" as Filter, label: "Users"},
        ] : []),
    ];

    return (
        <div style={{
            flexShrink: 0, borderBottom: "1px solid #181818",
            backgroundColor: "#0a0a0a",
        }}>
            {/* Thin header: page label on the left balances the account widget on the right */}
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px 0"
            }}>
                <span style={{
                    fontSize: 12, fontWeight: 700, color: "#555", letterSpacing: "0.02em",
                }}>
                    Marketplace
                </span>
                <AccountWidget
                    account={account} onLogout={onLogout}
                    onSubmitClick={onSubmitClick}
                    onCreateClick={onCreateClick}
                    onSeedClick={onSeedClick}
                />
            </div>

            {/* Row 1: search + filters popover trigger */}
            <div style={{display: "flex", alignItems: "center", gap: 8, padding: "8px 14px 8px"}}>
                <div style={{position: "relative", flex: 1}}>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{
                        position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none",
                    }}>
                        <circle cx="6.5" cy="6.5" r="4.5" stroke="#444" strokeWidth="1.5"/>
                        <path d="M10 10l3 3" stroke="#444" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <input
                        value={search}
                        onChange={e => onSearch(e.target.value)}
                        placeholder="Search packages…"
                        style={{
                            width: "100%", height: 32, padding: "0 28px", fontSize: 12,
                            backgroundColor: "var(--color-bg-card)", color: "var(--color-text-secondary)",
                            border: "1px solid #1e1e1e", borderRadius: 0, outline: "none",
                            boxSizing: "border-box", transition: "border-color 0.1s",
                        }}
                        onFocus={e => {
                            e.currentTarget.style.borderColor = "var(--color-accent)";
                        }}
                        onBlur={e => {
                            e.currentTarget.style.borderColor = "#1e1e1e";
                        }}
                    />
                    {search && (
                        <button onClick={() => onSearch("")} aria-label="Clear search" style={{
                            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                            background: "none", border: "none", cursor: "pointer",
                            color: "#444", fontSize: 14, padding: 0, lineHeight: 1,
                        }}>×</button>
                    )}
                </div>
            </div>

            {/* Row 2: sort + category — real shared Select controls that show
                the active choice directly (previously a funnel icon hid
                everything behind a popover; you couldn't tell what sort was
                active without opening it). */}
            <div style={{display: "flex", gap: 6, padding: "0 14px 8px"}}>
                <Select<SortValue>
                    size="sm"
                    value={sort ?? NONE_SORT}
                    options={SORT_SELECT_OPTIONS}
                    onChange={v => onSortChange(v === NONE_SORT ? null : v)}
                    style={{flex: 1, borderRadius: 0}}
                />
                {categories.length > 0 && (
                    <Select<CategoryValue>
                        size="sm"
                        value={category ?? NONE_CATEGORY}
                        options={[{value: NONE_CATEGORY, label: "All categories"}, ...categories.map(c => ({
                            value: c,
                            label: c
                        }))]}
                        onChange={v => onCategoryChange(v === NONE_CATEGORY ? null : v)}
                        style={{flex: 1, borderRadius: 0}}
                    />
                )}
            </div>

            {/* Row 3: browsing tabs — this row is what every visitor sees,
                so it stays 100% user-facing (All/Installed/Updates/Local).
                This sidebar is a fixed 300px and could still push past that
                width with enough tabs. Wrap instead of scrolling: nothing is
                ever hidden off-screen, it just flows onto a second line. */}
            <div style={{display: "flex", flexWrap: "wrap", gap: 2, padding: "0 14px 8px"}}>
                {filters.map(({f, label}) => {
                    const isActive = f === filter;
                    return (
                        <button key={f} className="mp-filter-tab" onClick={() => onFilter(f)} style={{
                            padding: "5px 11px 7px", fontSize: 11,
                            fontWeight: isActive ? 700 : 400,
                            color: isActive ? "#ccc" : "#555",
                            background: "none", border: "none", cursor: "pointer",
                            borderBottom: `2px solid ${isActive ? "var(--color-accent)" : "transparent"}`,
                            marginBottom: -1, whiteSpace: "nowrap",
                        }}>
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* Row 4: staff/admin tabs — a visually distinct second row,
                only rendered for staff+, so a regular user never sees it at
                all instead of it competing with their own browsing tabs. */}
            {staffFilters.length > 0 && (
                <div style={{
                    display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2,
                    padding: "6px 14px 8px", borderTop: "1px solid #141414",
                }}>
                    <span style={{
                        fontSize: 9, fontWeight: 700, color: "#3a3a3a",
                        letterSpacing: "0.05em", textTransform: "uppercase" as const,
                        marginRight: 4,
                    }}>Staff</span>
                    {staffFilters.map(({f, label}) => {
                        const isActive = f === filter;
                        return (
                            <button key={f} className="mp-filter-tab" onClick={() => onFilter(f)} style={{
                                padding: "4px 10px 5px", fontSize: 10.5,
                                fontWeight: isActive ? 700 : 400,
                                color: isActive ? "#999" : "#4a4a4a",
                                background: "none", border: "none", cursor: "pointer",
                                borderBottom: `2px solid ${isActive ? "#666" : "transparent"}`,
                                marginBottom: -1, whiteSpace: "nowrap",
                            }}>
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/** Hover feedback for the plain-text filter tabs and other bare interactive
 *  text in the sidebar — otherwise nothing here reacts until you click it. */
function SidebarStyles() {
    return (
        <style>{`
            .mp-filter-tab { transition: filter 0.08s ease; }
            .mp-filter-tab:hover { filter: brightness(1.6); }
        `}</style>
    );
}


// ── Account widget (inline in topbar) ─────────────────────────────────────────

function AccountWidget({account, onLogout, onSubmitClick, onCreateClick, onSeedClick}: {
    account: AccountState; onLogout: () => void;
    onSubmitClick: () => void; onCreateClick: () => void; onSeedClick: () => void;
}) {
    const [imgErr, setImgErr] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({top: 0, right: 0});
    const btnRef = useRef<HTMLButtonElement>(null);

    if (!account.username) {
        return (
            <span style={{fontSize: 10, color: "#444", flexShrink: 0, whiteSpace: "nowrap"}}>
                Sign in via About
            </span>
        );
    }

    const openMenu = () => {
        if (btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setMenuPos({top: r.bottom + 6, right: window.innerWidth - r.right});
        }
        setMenuOpen(o => !o);
    };

    return (
        <div style={{position: "relative", flexShrink: 0}}>
            <button
                ref={btnRef}
                onClick={openMenu}
                style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                }}
            >
                <div style={{
                    width: 26, height: 26, borderRadius: "50%", overflow: "hidden",
                    backgroundColor: "#161616", border: "1px solid #222", flexShrink: 0,
                }}>
                    {account.avatarUrl && !imgErr ? (
                        <img src={account.avatarUrl} alt="" width={26} height={26}
                             style={{display: "block", width: "100%", height: "100%"}}
                             onError={() => setImgErr(true)}/>
                    ) : (
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="#333">
                            <path
                                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"/>
                        </svg>
                    )}
                </div>
                <span style={{
                    fontSize: 11,
                    color: "#888",
                    maxWidth: 90,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                }}>
                    {account.username}
                </span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 3L4 5.5 6.5 3" stroke="#555" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
            </button>

            {menuOpen && createPortal(
                <>
                    <div onClick={() => setMenuOpen(false)} style={{position: "fixed", inset: 0, zIndex: 9998}}/>
                    <div style={{
                        position: "fixed", top: menuPos.top, right: menuPos.right, zIndex: 9999,
                        backgroundColor: "var(--color-bg-card)", border: "none", borderRadius: 0,
                        padding: "4px 0", minWidth: 170,
                    }}>
                        <div style={{padding: "6px 12px 8px", borderBottom: "1px solid #1a1a1a"}}>
                            <div style={{fontSize: 11, fontWeight: 600, color: "#888"}}>{account.username}</div>
                            {(account.isOwner || account.isSponsor) && (
                                <div style={{fontSize: 9, color: "#555", marginTop: 1}}>
                                    {account.isOwner ? "Owner" : "Sponsor"}
                                </div>
                            )}
                        </div>
                        {!account.isOwner && roleAtLeast(account.role, "author") && (
                            <MenuItem label="Submit a Package" onClick={() => {
                                setMenuOpen(false);
                                onSubmitClick();
                            }}/>
                        )}
                        {account.isOwner && (
                            <>
                                <MenuItem label="Create Package" onClick={() => {
                                    setMenuOpen(false);
                                    onCreateClick();
                                }}/>
                                <MenuItem label="Seed Official Packages" onClick={() => {
                                    setMenuOpen(false);
                                    onSeedClick();
                                }}/>
                            </>
                        )}
                        <div style={{borderTop: "1px solid #1a1a1a", marginTop: 2}}/>
                        <MenuItem label="Sign out" onClick={() => {
                            setMenuOpen(false);
                            onLogout();
                        }} muted/>
                    </div>
                </>,
                document.body
            )}
        </div>
    );
}

function MenuItem({label, onClick, muted}: { label: string; onClick: () => void; muted?: boolean }) {
    const [hov, setHov] = useState(false);
    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "6px 12px", fontSize: 11,
                color: hov ? (muted ? "#666" : "#aaa") : muted ? "#333" : "#555",
                background: hov ? "#1a1a1a" : "none",
                border: "none", cursor: "pointer",
            }}
        >
            {label}
        </button>
    );
}

// ── Module card ───────────────────────────────────────────────────────────────

const INSTALL_LABEL: Record<string, string> = {
    resolving: "Resolving…",
    downloading: "Downloading…",
    installing: "Installing…",
};

const ModuleCard = React.memo(function ModuleCard({
                                                      entry, selected, onClick, progress,
                                                  }: {
    entry: CatalogEntry; selected: boolean; onClick: () => void; progress?: InstallProgress;
}) {
    const [hov, setHov] = useState(false);
    // Manifest-defined color takes priority — same source of truth as the
    // detail panel's header, so a package's identity color is consistent
    // whether you're browsing the list or looking at its full page.
    const color = entry.color || iconColor(entry.icon);
    const status = entry.status ?? "published";

    const leftColor = selected ? color
        : status === "pending" ? "#f59e0b55"
            : status === "denied" ? "#ef444455"
                : status === "draft" ? "#33333355"
                    : `${color}40`;

    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            role="button"
            tabIndex={0}
            aria-current={selected ? "true" : undefined}
            // This row was a div with only onClick — invisible to a
            // keyboard-only user, who had no way to select a package at
            // all. role="button" + tabIndex puts it in the tab order and
            // announces it correctly; Enter/Space activating it (native
            // <button> behavior) has to be wired up by hand on a div.
            onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                }
            }}
            style={{
                display: "flex", gap: 11, padding: "10px 14px", margin: "0",
                borderRadius: 0,
                cursor: "pointer",
                // Selected/hover tint uses this package's own color, not a
                // uniform accent wash — the same per-package identity the
                // detail panel's masthead now carries, so a row in this
                // list already hints at what its own page looks like.
                backgroundColor: selected
                    ? `color-mix(in srgb, ${color} 14%, #111)`
                    : hov ? "var(--color-bg-card)" : "transparent",
                borderLeft: `3px solid ${leftColor}`,
                transition: "background 0.1s, border-color 0.1s",
            }}
        >
            <div style={{
                width: 36, height: 36, borderRadius: "30%", flexShrink: 0, overflow: "hidden",
                backgroundColor: `${color}18`, border: `1px solid ${color}30`,
                display: "flex", alignItems: "center", justifyContent: "center", color,
            }}>
                {(() => {
                    const iconResource = entry.resources?.find(r => r.resource_type === "icon");
                    return iconResource
                        ? <img src={iconResource.url} alt=""
                               style={{width: "100%", height: "100%", objectFit: "cover" as const}}/>
                        : <IconRenderer name={entry.icon} size={17}/>;
                })()}
            </div>

            <div style={{flex: 1, minWidth: 0}}>
                <div style={{display: "flex", alignItems: "flex-start", gap: 5, marginBottom: 2}}>
                    <span style={{
                        fontSize: 12, fontWeight: 600, lineHeight: 1.2, flex: 1, minWidth: 0,
                        color: selected ? "#ddd" : hov ? "#aaa" : "#777",
                    }}>
                        {entry.name}
                    </span>
                    <div style={{display: "flex", gap: 3, flexShrink: 0, marginTop: 1}}>
                        {(entry.package_type ?? "module") === "library" && <Chip label="lib" color="#3b82f6"/>}
                        {entry.isDevWatch && <Chip label="dev" color="#22d3ee" title="Hot-reload watch active"/>}
                        {entry.updateAvailable && <Chip label="update" color="#f59e0b"/>}
                        {entry.installed && !entry.updateAvailable && status === "published" &&
                            <Chip label="installed" accent/>}
                        {status === "pending" && <Chip label="pending" color="#f59e0b"/>}
                        {status === "draft" && <Chip label="draft" color="#555"/>}
                        {status === "denied" && <Chip label="denied" color="#ef4444"/>}
                    </div>
                </div>

                <div style={{
                    fontSize: 10, color: "#555", lineHeight: 1.45,
                    display: "-webkit-box", overflow: "hidden",
                    WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                    marginBottom: 4,
                }}>
                    {entry.description}
                </div>

                <div style={{display: "flex", alignItems: "center", gap: 5}}>
                    {progress ? (
                        <>
                            <span style={{
                                width: 5,
                                height: 5,
                                borderRadius: "50%",
                                backgroundColor: "var(--color-accent)",
                                display: "inline-block",
                                flexShrink: 0
                            }}/>
                            <span style={{fontSize: 9, color: "var(--color-accent)", fontWeight: 600}}>
                                {INSTALL_LABEL[progress.state] ?? progress.message ?? progress.state}
                            </span>
                        </>
                    ) : (
                        <>
                            {entry.isDevWatch && (
                                <span style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: "50%",
                                    backgroundColor: "#22d3ee",
                                    display: "inline-block",
                                    flexShrink: 0
                                }}/>
                            )}
                            {entry.category && status === "published" && (
                                <span style={{fontSize: 9, color: "#3a3a3a"}}>{entry.category} ·</span>
                            )}
                            <span style={{
                                fontSize: 9,
                                color: "#444"
                            }}>{entry.owner_team_id ? (entry.owner_team_name ?? "Team") : entry.author}</span>
                            {(entry.installedVersion ?? entry.version) && status === "published" && (
                                <span style={{fontSize: 9, color: entry.isLocalBuild ? "#22d3ee44" : "#383838"}}>
                                    · v{entry.installedVersion ?? entry.version}
                                </span>
                            )}
                            {!!entry.rating_count && entry.rating_count > 0 && status === "published" && (
                                <span style={{fontSize: 9, color: "#f59e0b99", marginLeft: "auto"}}>
                                    ★ {(entry.rating_avg ?? 0).toFixed(1)} ({entry.rating_count})
                                </span>
                            )}
                            {entry.downloads > 0 && status === "published" && (
                                <span style={{
                                    fontSize: 9,
                                    color: "#3a3a3a",
                                    marginLeft: entry.rating_count ? 0 : "auto"
                                }}>
                                    {entry.downloads >= 1000 ? `${(entry.downloads / 1000).toFixed(1)}k` : entry.downloads}
                                </span>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
});

function Chip({label, accent, color, title}: { label: string; accent?: boolean; color?: string; title?: string }) {
    return (
        <span title={title} style={{
            fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 0, letterSpacing: "0.03em",
            backgroundColor: accent ? "color-mix(in srgb, var(--color-accent) 16%, transparent)" : color ? `${color}16` : "#1a1a1a",
            color: accent ? "var(--color-accent)" : color ?? "#444",
        }}>
            {label}
        </span>
    );
}

// ── Empty / loading ───────────────────────────────────────────────────────────

function LoadingState() {
    return (
        <div style={{display: "flex", flexDirection: "column", gap: 1, padding: "4px 0"}}>
            {Array.from({length: 7}).map((_, i) => (
                <div key={i} style={{
                    margin: "0", height: 58, borderRadius: 0,
                    backgroundColor: "#0f0f0f", opacity: 1 - i * 0.1,
                }}/>
            ))}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ModuleCatalogListProps {
    entries: CatalogEntry[];
    pendingEntries: CatalogEntry[];
    adminEntries: CatalogEntry[];
    loading: boolean;
    error: string | null;
    selected: string | null;
    onSelect: (id: string) => void;
    onRetry: () => void;
    account: AccountState;
    onLogout: () => void;
    onSubmitClick: () => void;
    onSeedClick: () => void;
    onCreateClick: () => void;
    installProgress: Record<string, InstallProgress>;
    filter: Filter;
    onFilter: (f: Filter) => void;
    sort: MarketplaceSort | null;
    onSortChange: (s: MarketplaceSort | null) => void;
    category: string | null;
    onCategoryChange: (c: string | null) => void;
    categories: string[];
    /** Receives the debounced search term so the caller can forward it to the
     *  server's full-text `?q=` search — see useMarketplace's `search`/`setSearch`. */
    onSearchCommit: (s: string) => void;
}

export function ModuleCatalogList({
                                      entries, pendingEntries, adminEntries, loading, error,
                                      selected, onSelect, onRetry,
                                      account, onLogout, onSubmitClick, onSeedClick, onCreateClick,
                                      installProgress,
                                      filter, onFilter,
                                      sort, onSortChange, category, onCategoryChange, categories,
                                      onSearchCommit,
                                  }: ModuleCatalogListProps) {
    // Immediate value for the input (so typing feels instant); the debounced
    // value below is what actually re-runs the local filter and is forwarded
    // to the server as `q` for real full-text search over the whole catalog.
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    useEffect(() => {
        if (searchInput === "") {
            setSearch("");
            return;
        }
        const t = setTimeout(() => setSearch(searchInput), 200);
        return () => clearTimeout(t);
    }, [searchInput]);
    useEffect(() => {
        onSearchCommit(search);
    }, [search, onSearchCommit]);

    const hasLocal = useMemo(() => entries.some(isLocalEntry), [entries]);

    const visible = useMemo(() => {
        let list = filter === "pending" ? pendingEntries
            : filter === "manage" ? adminEntries
                : filter === "reports" || filter === "users" ? []
                    : entries;
        if (filter === "installed") list = list.filter(e => e.installed);
        if (filter === "updates") list = list.filter(e => e.updateAvailable);
        if (filter === "local") list = list.filter(isLocalEntry);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(e =>
                e.name.toLowerCase().includes(q) ||
                e.description.toLowerCase().includes(q) ||
                e.author.toLowerCase().includes(q)
            );
        }
        return list;
    }, [entries, pendingEntries, adminEntries, filter, search]);

    return (
        <div style={{
            display: "flex", flexDirection: "column",
            width: 300, flexShrink: 0,
            borderRight: "1px solid #181818",
            backgroundColor: "#0c0c0c",
            overflow: "hidden",
        }}>
            <SidebarStyles/>
            <Topbar
                search={searchInput} onSearch={setSearchInput}
                filter={filter} onFilter={onFilter}
                pendingCount={pendingEntries.length}
                hasLocal={hasLocal}
                account={account} onLogout={onLogout}
                onSubmitClick={onSubmitClick}
                onCreateClick={onCreateClick}
                onSeedClick={onSeedClick}
                sort={sort} onSortChange={onSortChange}
                category={category} onCategoryChange={onCategoryChange}
                categories={categories}
            />

            {/* Offline banner */}
            {error && !loading && visible.length > 0 && (
                <div style={{
                    padding: "4px 14px", fontSize: 9, color: "#444",
                    borderBottom: "1px solid #181818",
                    display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                }}>
                    <span style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        backgroundColor: "#ef444455",
                        display: "inline-block"
                    }}/>
                    <span>Marketplace offline · local cache</span>
                    <button onClick={onRetry} style={{
                        marginLeft: "auto",
                        fontSize: 9,
                        color: "#555",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0
                    }}>Retry
                    </button>
                </div>
            )}

            {/* List */}
            <div style={{flex: 1, overflowY: "auto"}}>
                {loading ? (
                    <LoadingState/>
                ) : error && visible.length === 0 ? (
                    <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        gap: 12,
                        padding: 24
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5"
                             strokeLinecap="round" strokeLinejoin="round">
                            <path
                                d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0"/>
                            <circle cx="12" cy="20" r="1" fill="#555" stroke="none"/>
                        </svg>
                        <div style={{textAlign: "center"}}>
                            <p style={{fontSize: 12, fontWeight: 600, color: "#777", marginBottom: 4}}>Marketplace
                                offline</p>
                            <p style={{fontSize: 10, color: "#444", marginBottom: 10, maxWidth: 200}}>{error}</p>
                            <button onClick={onRetry} style={{
                                padding: "4px 14px", fontSize: 10, fontWeight: 600,
                                backgroundColor: "var(--color-bg-surface)", color: "#666",
                                border: "none", borderRadius: 0, cursor: "pointer",
                            }}>Retry
                            </button>
                        </div>
                    </div>
                ) : visible.length === 0 ? (
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        padding: 24
                    }}>
                        <span style={{fontSize: 11, color: "#555"}}>
                            {search ? `No results for "${search}"` :
                                filter === "installed" ? "Nothing installed yet" :
                                    filter === "updates" ? "Everything is up to date" :
                                        filter === "local" ? "No local packages installed" :
                                            filter === "pending" ? "Queue is empty" :
                                                filter === "reports" ? "See the Reports panel →" :
                                                    filter === "users" ? "See the Users panel →" : "No packages found"}
                        </span>
                    </div>
                ) : (
                    visible.map(entry => (
                        <ModuleCard
                            key={entry.id}
                            entry={entry}
                            selected={entry.id === selected}
                            onClick={() => onSelect(entry.id)}
                            progress={installProgress[entry.marketplaceId]}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
