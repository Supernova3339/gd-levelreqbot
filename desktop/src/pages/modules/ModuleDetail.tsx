import {useCallback, useEffect, useRef, useState} from "react";
import type {CatalogEntry} from "./useMarketplace";
import {type AccountState, roleAtLeast} from "./useAccount";
import type {InstallProgress} from "../ModulesPage";
import type {MarketplaceCategory} from "./marketplace-api";
import {
    mpAddRelease,
    mpApprove,
    mpDeleteModule,
    mpDeleteResource,
    mpDeny,
    mpFetchReleases,
    mpMyTeams,
    mpPublish,
    mpReportModule,
    mpSetOwnerTeam,
    mpUpdateMeta,
    mpUploadResource,
    type Release,
    type ReportReason,
    type ResourceRecord,
    type Team,
} from "./marketplace-api";
import {type BotCommand, getCommands, getLicenseToken, type PreflightIssue, preflightModule} from "../../lib/commands";
import {iconColor, IconRenderer} from "./icons";
import {ModuleFeedback} from "./ModuleFeedback";
import {MCategoryField, MSep, ReportModal} from "./shared";
import {MIconPicker} from "./MIconPicker";
import {Select} from "../../components/ui/Select";

/** Tracks an element's own content-box width via ResizeObserver — the window
 *  can be maximized or restored freely (it can't be capped), so a single
 *  fixed breakpoint can't tell "small window" from "maximized" the way a
 *  media query would; this measures the actual pane, which is what changes
 *  width when the sidebar is there but the OS window itself isn't resized.
 *
 *  A callback ref, not a plain ref + mount-only effect — the observed div
 *  below carries `key={entry.id}` (to replay the fade-in on entry switch),
 *  so React swaps in a brand new DOM node every time the selected package
 *  changes. A `useRef` + `useLayoutEffect(..., [])` would only ever observe
 *  the *first* node: switching entries detaches it, and Chromium reports a
 *  final zero-size entry for a detached target, which froze every
 *  subsequent entry into the single-column layout regardless of actual
 *  window width. The callback ref fires on every attach/detach, so it
 *  re-observes the new node each time instead of going stale. */
function useElementWidth<T extends HTMLElement>() {
    const [width, setWidth] = useState(0);
    const roRef = useRef<ResizeObserver | null>(null);
    const ref = useCallback((el: T | null) => {
        roRef.current?.disconnect();
        roRef.current = null;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const w = entries[0]?.contentRect.width;
            if (w != null) setWidth(w);
        });
        ro.observe(el);
        roRef.current = ro;
    }, []);
    return [ref, width] as const;
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Chip({label, color, accent}: { label: string; color?: string; accent?: boolean }) {
    return (
        <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
            textTransform: "uppercase" as const,
            padding: "2px 7px", borderRadius: 4,
            backgroundColor: accent
                ? "color-mix(in srgb, var(--color-accent) 14%, transparent)"
                : color ? `${color}18` : "#1a1a1a",
            color: accent ? "var(--color-accent)" : color ?? "#3a3a3a",
            border: `1px solid ${accent
                ? "color-mix(in srgb, var(--color-accent) 25%, transparent)"
                : color ? `${color}44` : "#222"}`,
        }}>
            {label}
        </span>
    );
}

/** Section heading — sentence case, medium weight, no letter-spaced caps.
 *  All-caps tracked micro-labels are the one typographic tic every rejected
 *  pass kept reintroducing (it's the Pivot-header signature); this reads as
 *  a quiet heading instead of a tile's title bar.
 *  A real <h3>, not a styled div — "Health"/"Release History"/"Reviews"/
 *  etc. are the section structure of this page, and a screen-reader user
 *  navigating by heading (a normal way to skim any long page) got nothing
 *  when these were just divs. */
function SectionLabel({children}: { children: React.ReactNode }) {
    return (
        <h3 style={{fontSize: 12.5, fontWeight: 600, color: "#888", marginBottom: 8, marginTop: 0}}>
            {children}
        </h3>
    );
}

/** Flat 1px section divider — never a row separator, only between sections.
 *  Takes a faint tint of the package's own color so the whole reading
 *  column feels like it belongs to this one package, not a gray template
 *  every package renders identically into. */
function Divider({tint}: { tint?: string }) {
    return (
        <div style={{
            height: 1, margin: "16px 0",
            backgroundColor: tint ? `color-mix(in srgb, ${tint} 16%, #1a1a1a)` : "#1a1a1a",
        }}/>
    );
}

/** Five-star rating glyphs — a real graphic signal storefronts lean on
 *  (VS Code Marketplace, Chrome Web Store, npm) instead of just a number. */
function StarRow({value}: { value: number }) {
    return (
        <span style={{display: "inline-flex", gap: 1, color: "#ffb23e", fontSize: 12, lineHeight: 1}}>
            {[1, 2, 3, 4, 5].map(i => (
                <span key={i} style={{opacity: value >= i - 0.25 ? 1 : 0.22}}>★</span>
            ))}
        </span>
    );
}

/** Plain inline text-action — used for secondary, non-mutating affordances
 *  (Report, Manage toggle) so they read as part of the sentence they sit
 *  next to instead of another bordered rectangle competing with the real
 *  buttons. */
function TextLink({onClick, children}: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button onClick={onClick} style={{
            fontSize: 12, color: "#666", background: "none", border: "none",
            padding: 0, cursor: "pointer", textDecoration: "underline",
        }}>
            {children}
        </button>
    );
}

/** List row: separation comes from a left accent border + padding, never a
 *  border-bottom divider between rows (CommandsPage's own convention). */
function Row({accent, children}: { accent?: string; children: React.ReactNode }) {
    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "7px 10px", marginBottom: 2,
            borderLeft: `2px solid ${accent ?? "transparent"}`,
            backgroundColor: accent ? `color-mix(in srgb, ${accent} 8%, transparent)` : "transparent",
        }}>
            {children}
        </div>
    );
}

/** Shared tab strip — used both for the detail pane's top-level tabs and the
 *  Manage tab's edit/release/resources/team sub-tabs (smaller variant). */
function TabStrip<T extends string>({tabs, active, onChange, small}: {
    tabs: { key: T; label: string }[]; active: T; onChange: (t: T) => void; small?: boolean;
}) {
    return (
        <div style={{
            display: "flex",
            gap: small ? 6 : 2,
            borderBottom: small ? "none" : "1px solid #161616",
            marginBottom: small ? 16 : 18
        }}>
            {tabs.map(t => {
                const isActive = t.key === active;
                return small ? (
                    <button key={t.key} className="mp-metro-tile" onClick={() => onChange(t.key)} style={{
                        "--mp-bg": isActive ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
                        "--mp-bg-hover": isActive ? "color-mix(in srgb, var(--color-accent) 18%, transparent)" : "var(--color-bg-hover)",
                        "--mp-bg-press": isActive ? "color-mix(in srgb, var(--color-accent) 24%, transparent)" : "var(--color-bg-surface)",
                        padding: "6px 14px", fontSize: 11.5, fontWeight: isActive ? 700 : 500,
                        color: isActive ? "var(--color-accent)" : "#666",
                        border: `1px solid ${isActive ? "color-mix(in srgb, var(--color-accent) 28%, transparent)" : "#222"}`,
                        borderRadius: 6, cursor: "pointer", transition: "border-color 0.1s, color 0.1s",
                    } as React.CSSProperties}>
                        {t.label}
                    </button>
                ) : (
                    <button key={t.key} onClick={() => onChange(t.key)} style={{
                        padding: "8px 14px", fontSize: 12, fontWeight: isActive ? 700 : 500,
                        color: isActive ? "#ccc" : "#444",
                        background: "none", border: "none", cursor: "pointer",
                        borderBottom: `2px solid ${isActive ? "var(--color-accent)" : "transparent"}`,
                        marginBottom: -1, transition: "color 0.1s",
                    }}>
                        {t.label}
                    </button>
                );
            })}
        </div>
    );
}

// ── Action button ─────────────────────────────────────────────────────────────

type BtnVariant = "primary" | "ghost" | "danger" | "warn";

function ActionBtn({
                       label, variant = "ghost", loading, disabled, small, onClick, title,
                   }: {
    label: string; variant?: BtnVariant;
    loading?: boolean; disabled?: boolean; small?: boolean; onClick: () => void; title?: string;
}) {
    const styles: Record<BtnVariant, React.CSSProperties> = {
        primary: {backgroundColor: "var(--color-accent)", color: "#fff", border: "none"},
        ghost: {backgroundColor: "transparent", color: "#555", border: "1px solid #252525"},
        danger: {backgroundColor: "transparent", color: "#ef4444", border: "1px solid #3a1a1a"},
        warn: {backgroundColor: "transparent", color: "#f59e0b", border: "1px solid #78350f44"},
    };
    // Hover/press feedback per variant, driven by the same --mp-bg-hover/press
    // custom properties the .mp-metro-tile rule reads (see MetroStyles) — a
    // ghost/danger/warn button has a transparent resting fill, so hovering it
    // should reveal a faint tint, not just an opacity fade.
    const hoverBg: Record<BtnVariant, string> = {
        primary: "var(--color-accent-hover)", ghost: "var(--color-bg-hover)",
        danger: "#2a1414", warn: "#2a1f08",
    };
    const pressBg: Record<BtnVariant, string> = {
        primary: "var(--color-accent-hover)", ghost: "var(--color-bg-surface)",
        danger: "#3a1a1a", warn: "#3a2a0c",
    };
    return (
        <button
            className="mp-metro-tile"
            onClick={onClick}
            disabled={disabled || loading}
            title={title}
            style={{
                "--mp-bg": styles[variant].backgroundColor,
                "--mp-bg-hover": hoverBg[variant],
                "--mp-bg-press": pressBg[variant],
                padding: small ? "4px 12px" : "6px 18px",
                fontSize: small ? 11 : 12,
                fontWeight: 600,
                borderRadius: 6,
                cursor: disabled || loading ? "not-allowed" : "pointer",
                opacity: disabled || loading ? 0.4 : 1,
                transition: "opacity 0.1s",
                flexShrink: 0,
                ...styles[variant],
                backgroundColor: undefined,
            } as React.CSSProperties}
        >
            {loading ? "…" : label}
        </button>
    );
}

/** Hover/press feedback for .mp-metro-tile (ActionBtn/TabStrip) plus the
 *  same-container fade on module switch. Injected once per render. */
function DetailStyles() {
    return (
        <style>{`
            .mp-metro-tile { background-color: var(--mp-bg); transition: background-color 0.08s ease; }
            .mp-metro-tile:hover:not(:disabled) { background-color: var(--mp-bg-hover); }
            .mp-metro-tile:active:not(:disabled) { background-color: var(--mp-bg-press); }
            .mp-fade-in { animation: mp-fade-in 0.18s ease; }
            @keyframes mp-fade-in { from { opacity: 0; } to { opacity: 1; } }
            .mp-filmstrip::-webkit-scrollbar { height: 6px; }
            .mp-filmstrip::-webkit-scrollbar-track { background: transparent; }
            .mp-filmstrip::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
            .mp-filmstrip::-webkit-scrollbar-thumb:hover { background: #444; }
        `}</style>
    );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

const PROGRESS_LABELS: Record<string, string> = {
    resolving: "Resolving…",
    downloading: "Downloading…",
    installing: "Installing…",
    removing: "Removing…",
};

function ProgressBar({progress}: { progress: InstallProgress }) {
    const label = PROGRESS_LABELS[progress.state] ?? progress.state;
    const msg = progress.message;

    const isIndeterminate = progress.state !== "downloading" || !msg;

    return (
        <div style={{
            margin: "14px 0",
            padding: "10px 14px",
            backgroundColor: "#0d0d0d",
            border: "1px solid #1a1a1a",
            borderRadius: 6,
        }}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6}}>
                <span style={{fontSize: 11, color: "#555"}}>{label}</span>
                {msg && <span style={{
                    fontSize: 10,
                    color: "#333",
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                }}>{msg}</span>}
            </div>
            <div style={{height: 3, backgroundColor: "#1a1a1a", borderRadius: 2, overflow: "hidden"}}>
                {isIndeterminate ? (
                    <>
                        <div style={{
                            height: "100%",
                            background: "linear-gradient(90deg, transparent, var(--color-accent)88, var(--color-accent), var(--color-accent)88, transparent)",
                            backgroundSize: "200% 100%",
                            animation: "detail-sweep 1.4s ease-in-out infinite",
                        }}/>
                        <style>{`@keyframes detail-sweep{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>
                    </>
                ) : (
                    <div style={{
                        height: "100%",
                        width: "60%",
                        background: `linear-gradient(to right, var(--color-accent)66, var(--color-accent))`,
                        borderRadius: 2,
                        animation: "detail-sweep 1.4s ease-in-out infinite",
                        backgroundSize: "200% 100%",
                    }}/>
                )}
            </div>
        </div>
    );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function ModuleDetailEmpty() {
    return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 12,
            color: "#1e1e1e",
        }}>
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <rect x="5" y="5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="24" y="5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="5" y="24" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="24" y="24" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <div style={{textAlign: "center"}}>
                <p style={{fontSize: 13, fontWeight: 600, color: "#252525"}}>Pick a package</p>
                <p style={{fontSize: 11, color: "#1e1e1e", marginTop: 3}}>Select one from the list to see details</p>
            </div>
        </div>
    );
}

// ── Deny modal ────────────────────────────────────────────────────────────────

function DenyModal({onConfirm, onCancel}: { onConfirm: (reason: string) => void; onCancel: () => void }) {
    const [reason, setReason] = useState("");
    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 999,
            display: "flex", alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.6)",
        }} onClick={e => {
            if (e.target === e.currentTarget) onCancel();
        }}>
            <div style={{
                backgroundColor: "#111", border: "1px solid #222",
                borderRadius: 12, padding: "20px 24px", width: 360,
            }}>
                <p style={{fontSize: 13, fontWeight: 600, color: "#bbb", marginBottom: 12}}>Deny submission</p>
                <textarea
                    autoFocus rows={4} value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Reason for denial…"
                    style={{
                        ...inputStyle,
                        width: "100%",
                        boxSizing: "border-box" as const,
                        marginBottom: 12,
                        resize: "vertical" as const
                    }}
                />
                <div style={{display: "flex", gap: 8, justifyContent: "flex-end"}}>
                    <ActionBtn label="Cancel" variant="ghost" small onClick={onCancel}/>
                    <ActionBtn label="Deny" variant="danger" small disabled={!reason.trim()}
                               onClick={() => onConfirm(reason)}/>
                </div>
            </div>
        </div>
    );
}

// ── Release history ───────────────────────────────────────────────────────────

/** Lives in its own dedicated Releases tab now — no reason to also make the
 *  user click to expand it within that tab, so it just loads on mount. */
function ReleaseHistory({id}: { id: string }) {
    const [releases, setReleases] = useState<Release[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        mpFetchReleases(id)
            .then(r => {
                if (!cancelled) setReleases(r);
            })
            .catch(() => { /* offline */
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [id]);

    return (
        <div>
            {loading ? (
                <p style={{fontSize: 11, color: "#2a2a2a"}}>Loading…</p>
            ) : releases.length === 0 ? (
                <p style={{fontSize: 11, color: "#2a2a2a"}}>No releases yet</p>
            ) : (
                <div>
                    {releases.map((r, i) => (
                        <div key={r.version} style={{
                            paddingBottom: 12, marginBottom: i < releases.length - 1 ? 12 : 0,
                            borderBottom: i < releases.length - 1 ? "1px solid #0f0f0f" : "none",
                        }}>
                            <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 4}}>
                                <span style={{fontSize: 11, fontWeight: 700, color: "#555"}}>v{r.version}</span>
                                {i === 0 && <Chip label="Latest" accent/>}
                                <span style={{fontSize: 10, color: "#252525"}}>
                                        {new Date(r.pub_date).toLocaleDateString()}
                                    </span>
                            </div>
                            {r.changelog ? (
                                <pre style={{
                                    fontSize: 11, color: "#666", lineHeight: 1.5,
                                    whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0,
                                }}>{r.changelog}</pre>
                            ) : (
                                <span style={{fontSize: 11, color: "#252525", fontStyle: "italic"}}>No changelog</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Edit metadata form ────────────────────────────────────────────────────────

interface MetaForm {
    name: string;
    description: string;
    icon: string;
    color: string;
    tags: string;
    category: MarketplaceCategory | undefined;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function EditMetaPanel({ entry, onSaved, onCancel }: {
    entry: CatalogEntry; onSaved: () => void; onCancel: () => void;
}) {
    const [form, setForm] = useState<MetaForm>({
        name:        entry.name,
        description: entry.description,
        icon:        entry.icon,
        color: entry.color ?? "",
        tags:        (entry.tags ?? []).join(", "),
        category: (entry.category ?? undefined) as MarketplaceCategory | undefined,
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr]       = useState<string | null>(null);

    const colorValid = form.color.trim() === "" || HEX_COLOR_RE.test(form.color.trim());

    const save = async () => {
        const token = await getLicenseToken();
        if (!token) { setErr("Not authenticated"); return; }
        if (!colorValid) {
            setErr("Color must be a 6-digit hex code like #7c3aed");
            return;
        }
        setSaving(true); setErr(null);
        try {
            await mpUpdateMeta(entry.marketplaceId, {
                name:        form.name.trim(),
                description: form.description.trim(),
                icon:        form.icon.trim(),
                color: form.color.trim() || null,
                tags:        form.tags.split(",").map(t => t.trim()).filter(Boolean),
                category: form.category ?? null,
            }, token);
            onSaved();
        } catch (e) {
            setErr(String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{marginTop: 14, maxWidth: 480}}>
            {/* Capped at 480px, not stretched to the full ~770px reading
                column — a name field and an icon picker don't get more
                useful the wider they are, they just end up with a lot of
                dead interior space. Real sizing means matching each field's
                own natural width, not filling whatever's available. */}
            <MSep label="Identity"/>
            <div style={{marginBottom: 14}}>
                <FieldLabel>Name</FieldLabel>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                       style={inputStyle}/>
            </div>
            <div style={{display: "flex", gap: 12}}>
                {/* Real icon picker (preview swatch + searchable grid), not a
                    bare text field — this is the same MIconPicker used in
                    Submit/Create, just never adopted here. Fixed width — its
                    own dropdown is 296px, the closed trigger doesn't need to
                    be any wider than that. */}
                <div style={{width: 240, flexShrink: 0}}>
                    <MIconPicker value={form.icon} onChange={v => setForm(f => ({...f, icon: v}))}/>
                </div>
                <div style={{marginBottom: 12, flex: 1, minWidth: 0}}>
                    <FieldLabel>Accent color</FieldLabel>
                    <div style={{display: "flex", gap: 6, alignItems: "center"}}>
                        <span style={{
                            width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                            border: "1px solid #222",
                            backgroundColor: colorValid && form.color.trim() ? form.color.trim() : "#161616",
                        }}/>
                        <input value={form.color} placeholder="#7c3aed"
                               onChange={e => setForm(f => ({...f, color: e.target.value}))}
                               style={{...inputStyle, borderColor: colorValid ? undefined : "#ef4444"}}/>
                    </div>
                </div>
            </div>

            <MSep label="Details"/>
            <div style={{marginBottom: 14}}>
                <FieldLabel>Description</FieldLabel>
                <textarea rows={4} value={form.description}
                          onChange={e => setForm(f => ({...f, description: e.target.value}))}
                          style={{...inputStyle, resize: "vertical" as const}}/>
            </div>
            <div style={{marginBottom: 14}}>
                <FieldLabel>Tags (comma-separated)</FieldLabel>
                <input value={form.tags} onChange={e => setForm(f => ({...f, tags: e.target.value}))}
                       style={inputStyle}/>
            </div>
            <MCategoryField value={form.category} onChange={v => setForm(f => ({...f, category: v}))}/>

            {err && <p style={{fontSize: 11, color: "#ef4444", marginBottom: 10}}>{err}</p>}
            <div style={{ display: "flex", gap: 8 }}>
                <ActionBtn label="Save changes" variant="primary" small loading={saving} onClick={save}/>
                <ActionBtn label="Cancel" variant="ghost" small onClick={onCancel}/>
            </div>
        </div>
    );
}

// ── Add release form ──────────────────────────────────────────────────────────

type ReleaseSourceType = "direct" | "github";

function AddReleasePanel({ entry, onSaved, onCancel }: {
    entry: CatalogEntry; onSaved: () => void; onCancel: () => void;
}) {
    const [source, setSource] = useState<ReleaseSourceType>("github");
    const [version, setVersion] = useState("");
    const [downloadUrl, setDownloadUrl] = useState("");
    const [checksum, setChecksum] = useState("");
    const [changelog, setChangelog] = useState("");
    const [ghRepo, setGhRepo] = useState("");
    const [ghDir, setGhDir] = useState("");
    const [ghTag, setGhTag] = useState("");
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const save = async () => {
        const token = await getLicenseToken();
        if (!token) { setErr("Not authenticated"); return; }
        setSaving(true); setErr(null);
        try {
            if (source === "github") {
                if (!ghRepo.trim()) {
                    setErr("GitHub repo is required (owner/repo)");
                    setSaving(false);
                    return;
                }
                await mpAddRelease(entry.marketplaceId, {
                    source_type: "github", github_repo: ghRepo.trim(),
                    github_dir: ghDir.trim() || undefined,
                    github_tag: ghTag.trim() || undefined,
                    version: version.trim() || undefined,
                    changelog: changelog.trim() || undefined,
                }, token);
            } else {
                if (!version.trim() || !downloadUrl.trim()) {
                    setErr("Version and download URL are required.");
                    setSaving(false);
                    return;
                }
                await mpAddRelease(entry.marketplaceId, {
                    version: version.trim(), download_url: downloadUrl.trim(),
                    checksum: checksum.trim(), changelog: changelog.trim(),
                }, token);
            }
            onSaved();
        } catch (e) {
            setErr(String(e));
        } finally {
            setSaving(false);
        }
    };

    const field = (label: string, value: string, onChange: (v: string) => void, placeholder?: string, multi?: boolean) => (
        <div style={{marginBottom: 14}}>
            <FieldLabel>{label}</FieldLabel>
            {multi
                ? <textarea rows={3} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
                            style={{...inputStyle, resize: "vertical" as const}}/>
                : <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
                         style={inputStyle}/>
            }
        </div>
    );

    return (
        <div style={{marginTop: 14, maxWidth: 560}}>
            <div style={{display: "flex", gap: 6, marginBottom: 16}}>
                {(["github", "direct"] as ReleaseSourceType[]).map(t => (
                    <button key={t} onClick={() => setSource(t)} style={{
                        padding: "6px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                        background: source === t ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
                        color: source === t ? "var(--color-accent)" : "#555",
                        border: `1px solid ${source === t ? "color-mix(in srgb, var(--color-accent) 28%, transparent)" : "#222"}`,
                    }}>
                        {t === "github" ? "GitHub" : "Direct URL"}
                    </button>
                ))}
            </div>
            {source === "github" ? (
                <>
                    {field("Repo (owner/repo)", ghRepo, setGhRepo, "GD-LevelReqBot/marketplace")}
                    <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px"}}>
                        {field("Dist path (within repo)", ghDir, setGhDir, "dist/my-module/1.0.0")}
                        {field("Tag (optional)", ghTag, setGhTag, "v1.2.3")}
                    </div>
                    {field("Override version (optional)", version, setVersion, "auto from tag")}
                    {field("Override changelog (optional)", changelog, setChangelog, "Leave blank to pull from release notes", true)}
                </>
            ) : (
                <>
                    {field("Version", version, setVersion, "1.2.3")}
                    {field("Download URL", downloadUrl, setDownloadUrl, "https://…/package.gdmod")}
                    {field("SHA-256 checksum (optional)", checksum, setChecksum)}
                    {field("Changelog", changelog, setChangelog, "What's new…", true)}
                </>
            )}
            {err && <p style={{fontSize: 11, color: "#ef4444", marginBottom: 10}}>{err}</p>}
            <div style={{ display: "flex", gap: 8 }}>
                <ActionBtn label="Publish release" variant="primary" small loading={saving} onClick={save}/>
                <ActionBtn label="Cancel" variant="ghost" small onClick={onCancel}/>
            </div>
        </div>
    );
}

// ── Resource panel ────────────────────────────────────────────────────────────

/** Recommended dimensions per resource type — shown as guidance and used to
 *  soft-warn (not block) on upload if the picked image is way off. */
const RESOURCE_GUIDANCE: Record<ResourceRecord["resource_type"], {
    recommended: string;
    ratio?: number;
    ratioLabel?: string
}> = {
    icon: {recommended: "512×512px, square", ratio: 1, ratioLabel: "1:1"},
    screenshot: {recommended: "1280×720px or larger", ratio: 16 / 9, ratioLabel: "16:9"},
    banner: {recommended: "1920×480px, wide", ratio: 4, ratioLabel: "4:1"},
    asset: {recommended: "Any size — bundled file, not shown in the catalog"},
};

const RESOURCE_TYPE_ORDER: ResourceRecord["resource_type"][] = ["icon", "banner", "screenshot", "asset"];

function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise(resolve => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            resolve({width: img.naturalWidth, height: img.naturalHeight});
            URL.revokeObjectURL(url);
        };
        img.onerror = () => {
            resolve(null);
            URL.revokeObjectURL(url);
        };
        img.src = url;
    });
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface PendingUpload {
    file: File;
    width: number;
    height: number;
    warning: string;
}

function ResourcePanel({ entry, onCancel }: { entry: CatalogEntry; onCancel: () => void }) {
    const [uploading, setUploading] = useState(false);
    const [err, setErr]             = useState<string | null>(null);
    const [resources, setResources] = useState<ResourceRecord[]>((entry.resources ?? []) as ResourceRecord[]);
    const [dims, setDims] = useState<Record<number, { width: number; height: number }>>({});
    const [pending, setPending] = useState<PendingUpload | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [type, setType] = useState<ResourceRecord["resource_type"]>("screenshot");

    const doUpload = async (file: File) => {
        const token = await getLicenseToken();
        if (!token) { setErr("Not authenticated"); return; }
        setUploading(true);
        setErr(null);
        setPending(null);
        try {
            const rec = await mpUploadResource(entry.marketplaceId, file, type, token);
            setResources(r => [...r, rec]);
        } catch (e) {
            setErr(String(e));
        }
        finally { setUploading(false); }
    };

    const onFilePicked = async (file: File) => {
        setErr(null);
        const size = await readImageDimensions(file);
        const guidance = RESOURCE_GUIDANCE[type];
        if (size && guidance.ratio) {
            const actualRatio = size.width / size.height;
            const off = Math.abs(actualRatio - guidance.ratio) / guidance.ratio;
            if (off > 0.2) { // >20% off the target aspect ratio — worth flagging, not blocking
                setPending({
                    file, width: size.width, height: size.height,
                    warning: `This image is ${size.width}×${size.height} (${actualRatio >= 1 ? (actualRatio).toFixed(2) : `1:${(1 / actualRatio).toFixed(2)}`}) — ${type} is recommended around ${guidance.ratioLabel}, ${guidance.recommended}.`,
                });
                return;
            }
        }
        doUpload(file);
    };

    const del = async (id: number) => {
        const token = await getLicenseToken();
        if (!token) return;
        try {
            await mpDeleteResource(entry.marketplaceId, id, token);
            setResources(r => r.filter(x => x.id !== id));
        } catch (e) {
            setErr(String(e));
        }
    };

    const grouped = RESOURCE_TYPE_ORDER
        .map(t => ({type: t, items: resources.filter(r => r.resource_type === t)}))
        .filter(g => g.items.length > 0);

    return (
        <div style={{marginTop: 14, maxWidth: 560}}>
            <FieldLabel>Uploaded assets</FieldLabel>
            {grouped.length > 0 ? (
                <div style={{display: "flex", flexDirection: "column", gap: 14, marginBottom: 18}}>
                    {grouped.map(g => (
                        <div key={g.type}>
                            <div style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: "#3a3a3a",
                                textTransform: "capitalize" as const,
                                marginBottom: 6
                            }}>
                                {g.type} <span style={{color: "#252525"}}>({g.items.length})</span>
                            </div>
                            <div style={{display: "flex", flexWrap: "wrap", gap: 10}}>
                                {g.items.map(r => (
                                    <div key={r.id} style={{width: g.type === "banner" ? 180 : 100}}>
                                        <div style={{position: "relative"}}>
                                            <img src={r.url} alt={r.filename}
                                                 onLoad={e => {
                                                     const t = e.currentTarget;
                                                     setDims(d => d[r.id] ? d : {
                                                         ...d,
                                                         [r.id]: {width: t.naturalWidth, height: t.naturalHeight}
                                                     });
                                                 }}
                                                 style={{
                                                     width: "100%",
                                                     height: g.type === "icon" ? 100 : g.type === "banner" ? 45 : 72,
                                                     objectFit: "cover" as const,
                                                     borderRadius: 6,
                                                     border: "1px solid #222",
                                                     display: "block",
                                                     backgroundColor: "#0a0a0a",
                                                 }}/>
                                            <button onClick={() => del(r.id)} title="Remove" style={{
                                                position: "absolute",
                                                top: 4,
                                                right: 4,
                                                width: 18,
                                                height: 18,
                                                borderRadius: "50%",
                                                fontSize: 10,
                                                fontWeight: 700,
                                                backgroundColor: "rgba(0,0,0,0.7)",
                                                color: "#f87171",
                                                border: "1px solid #ef444455",
                                                cursor: "pointer",
                                                lineHeight: 1,
                                            }}>✕
                                            </button>
                                        </div>
                                        <p style={{
                                            fontSize: 9, color: "#333", margin: "4px 0 0", whiteSpace: "nowrap",
                                            overflow: "hidden", textOverflow: "ellipsis",
                                        }} title={r.filename}>
                                            {r.filename || "—"}
                                        </p>
                                        {dims[r.id] && (
                                            <p style={{fontSize: 9, color: "#252525", margin: "1px 0 0"}}>
                                                {dims[r.id].width}×{dims[r.id].height}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p style={{fontSize: 11, color: "#2a2a2a", marginBottom: 16}}>No screenshots, banners, or assets
                    uploaded yet.</p>
            )}

            <MSep label="Upload new"/>
            <FieldLabel>Upload as</FieldLabel>
            <div style={{display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap"}}>
                {/* "asset" intentionally hidden — assets are bundled inside the module's
                    own package (.gdmod), not uploaded as a separate marketplace resource. */}
                {(["screenshot", "banner", "icon"] as ResourceRecord["resource_type"][]).map(t => (
                    <button key={t} onClick={() => {
                        setType(t);
                        setPending(null);
                    }} style={{
                        fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                        textTransform: "capitalize" as const,
                        backgroundColor: type === t ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
                        color: type === t ? "var(--color-accent)" : "#555",
                        border: `1px solid ${type === t ? "color-mix(in srgb, var(--color-accent) 28%, transparent)" : "#222"}`,
                    }}>{t}</button>
                ))}
            </div>
            <p style={{fontSize: 10, color: "#333", marginBottom: 14}}>
                Recommended: {RESOURCE_GUIDANCE[type].recommended}
            </p>

            {pending && (
                <div style={{
                    marginBottom: 14, padding: "10px 12px", borderRadius: 6,
                    backgroundColor: "#130e00", border: "1px solid #3a280033",
                }}>
                    <p style={{fontSize: 11, color: "#fbbf2488", lineHeight: 1.5, margin: "0 0 8px"}}>
                        ⚠ {pending.warning} ({formatBytes(pending.file.size)})
                    </p>
                    <div style={{display: "flex", gap: 8}}>
                        <ActionBtn label="Upload anyway" variant="warn" small loading={uploading}
                                   onClick={() => doUpload(pending.file)}/>
                        <ActionBtn label="Pick a different image" variant="ghost" small onClick={() => {
                            setPending(null);
                            fileRef.current?.click();
                        }}/>
                    </div>
                </div>
            )}

            <input ref={fileRef} type="file" accept="image/*" style={{display: "none"}}
                   onChange={e => {
                       const f = e.target.files?.[0];
                       if (f) onFilePicked(f);
                       e.target.value = "";
                   }}/>
            {err && <p style={{fontSize: 11, color: "#ef4444", marginBottom: 10}}>{err}</p>}
            <div style={{display: "flex", gap: 8}}>
                <ActionBtn label={uploading ? "Uploading…" : `Upload ${type}`} variant="primary" small
                           loading={uploading} disabled={!!pending} onClick={() => fileRef.current?.click()}/>
                <ActionBtn label="Done" variant="ghost" small onClick={onCancel}/>
            </div>
        </div>
    );
}

// ── Owning team assign/remove ────────────────────────────────────────────────
// Assigns or clears which standalone Team owns this package outright — a
// single-step swap, distinct from managing a team's own membership roster
// (Account Settings) or the flat per-package co-owner list (TeamPanel below).

const NONE_TEAM = "__none__";

function OwningTeamPanel({entry, onChanged}: { entry: CatalogEntry; onChanged?: () => void }) {
    const [myTeams, setMyTeams] = useState<Team[]>([]);
    const currentTeamId = entry.owner_team_id ?? null;
    // Selection starts on whatever the package's real current owner is —
    // one control that always reflects and edits the same thing, instead of
    // three different states (assign-mode / remove-mode / "no teams to pick
    // from" message) that used to switch out from under you.
    const [picked, setPicked] = useState<string>(currentTeamId ? String(currentTeamId) : NONE_TEAM);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getLicenseToken().then(token => {
            if (!token) return;
            mpMyTeams(token).then(teams => {
                if (!cancelled) setMyTeams(teams);
            }).catch(() => {
            });
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        setPicked(currentTeamId ? String(currentTeamId) : NONE_TEAM);
    }, [currentTeamId]);

    const save = async () => {
        const token = await getLicenseToken();
        if (!token) {
            setErr("Not authenticated");
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            await mpSetOwnerTeam(entry.marketplaceId, picked === NONE_TEAM ? null : Number(picked), token);
            onChanged?.();
        } catch (e) {
            setErr(String(e));
        } finally {
            setBusy(false);
        }
    };

    // The current team might not be one you belong to (staff managing
    // someone else's package) — keep it in the option list either way so
    // picking "no change" is always available and never silently vanishes.
    const options = [
        {value: NONE_TEAM, label: "Individually owned (no team)"},
        ...myTeams.map(t => ({value: String(t.id), label: `${t.name} (${t.vanity})`})),
        ...(currentTeamId && !myTeams.some(t => t.id === currentTeamId)
            ? [{
                value: String(currentTeamId),
                label: `${entry.owner_team_name ?? "Team"} (${entry.owner_team_vanity ?? "?"})`
            }]
            : []),
    ];
    const dirty = picked !== (currentTeamId ? String(currentTeamId) : NONE_TEAM);

    return (
        <div style={{marginBottom: 16}}>
            <FieldLabel>Owning team</FieldLabel>
            <div style={{display: "flex", gap: 6, alignItems: "center"}}>
                <Select<string> value={picked} options={options} onChange={setPicked} style={{flex: 1}}/>
                <ActionBtn
                    label="Save" small loading={busy} disabled={!dirty}
                    variant={picked === NONE_TEAM && currentTeamId ? "danger" : "primary"}
                    onClick={save}
                />
            </div>
            {myTeams.length === 0 && (
                <p style={{fontSize: 10, color: "#2a2a2a", marginTop: 6}}>
                    You don't belong to any teams yet — create one in Account Settings to assign it here.
                </p>
            )}
            {err && <p style={{fontSize: 11, color: "#ef4444", marginTop: 6}}>{err}</p>}
        </div>
    );
}

// ── Team tab ──────────────────────────────────────────────────────────────────
// The flat per-package co-owner list used to live here too, but a standalone
// Team already covers ownership — keeping both was redundant. This tab is
// now just OwningTeamPanel.

function TeamPanel({entry, onOwnerChanged}: { entry: CatalogEntry; onOwnerChanged?: () => void }) {

    return (
        <div style={{marginTop: 14, maxWidth: 480}}>
            <OwningTeamPanel entry={entry} onChanged={onOwnerChanged}/>
        </div>
    );
}

// ── Owner panel ───────────────────────────────────────────────────────────────

type OwnerTab = "none" | "edit" | "release" | "resources" | "team";

function OwnerPanel({entry, isAdmin, onApproved, onDenied, onMetaSaved, onReleaseSaved, onPublished, onDeleted}: {
    entry: CatalogEntry; isAdmin: boolean;
    onApproved?: () => void; onDenied?: () => void; onMetaSaved?: () => void;
    onReleaseSaved?: () => void; onPublished?: () => void; onDeleted?: () => void;
}) {
    const [tab, setTab] = useState<OwnerTab>("none");
    const [showDenyModal, setDenyModal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setTab("none");
        setDeleteConfirm(false);
    }, [entry.id]);

    const isPublished = !entry.status || entry.status === "published";

    const run = async (fn: (t: string) => Promise<void>, cb?: () => void) => {
        const t = await getLicenseToken();
        if (!t) return;
        setBusy(true);
        try {
            await fn(t);
            cb?.();
        } finally {
            setBusy(false);
        }
    };

    const handleDeny = (reason: string) => {
        setDenyModal(false);
        run(t => mpDeny(entry.marketplaceId, reason, t), onDenied);
    };

    const ownerTabs: { key: OwnerTab; label: string }[] = [
        {key: "edit", label: "Edit"},
        {key: "release", label: "Release"},
        {key: "resources", label: "Resources"},
        {key: "team", label: "Team"},
    ];

    const hasModerationRow = entry.status === "pending" || entry.status === "draft" || entry.status === "denied" || isAdmin;

    // No wrapping card — every other section on this page (Release History,
    // Reviews) is a SectionLabel plus flowing content with no box around it;
    // Manage was the one section that broke that pattern, and the box's
    // fixed width against left-aligned buttons was exactly what read as
    // sloppy (buttons hugging one edge, a wall of unexplained space next to
    // them). Flowing free lets each row take only the width it needs.
    return (
        <div>
            {hasModerationRow && (
                <div style={{display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14}}>
                    {entry.status === "pending" && (
                        <>
                            <ActionBtn label="Approve" variant="primary" loading={busy}
                                       onClick={() => run(t => mpApprove(entry.marketplaceId, t), onApproved)}/>
                            <ActionBtn label="Deny…" variant="danger" loading={busy}
                                       onClick={() => setDenyModal(true)}/>
                        </>
                    )}
                    {entry.status !== "pending" && isAdmin && (
                        <ActionBtn
                            label={isPublished ? "Unpublish" : "Publish"}
                            variant={isPublished ? "ghost" : "primary"}
                            loading={busy}
                            onClick={() => run(t => mpPublish(entry.marketplaceId, !isPublished, t), onPublished)}
                        />
                    )}
                    {(entry.status === "draft" || entry.status === "denied") && (
                        <ActionBtn label="Deny…" variant="danger" loading={busy} onClick={() => setDenyModal(true)}/>
                    )}
                    {isAdmin && (
                        <ActionBtn
                            label={deleteConfirm ? "Confirm delete" : "Delete"}
                            variant="danger" loading={busy}
                            onClick={() => {
                                if (!deleteConfirm) {
                                    setDeleteConfirm(true);
                                    return;
                                }
                                setDeleteConfirm(false);
                                run(t => mpDeleteModule(entry.marketplaceId, t), onDeleted);
                            }}
                        />
                    )}
                </div>
            )}

            <TabStrip<OwnerTab>
                tabs={ownerTabs}
                active={tab}
                onChange={t => setTab(p => p === t ? "none" : t)}
                small
            />

            {tab === "none" && (
                <p style={{fontSize: 12, color: "#555", margin: 0, fontStyle: "italic" as const}}>
                    Edit this package's listing, publish a new release, manage its screenshots, or add a co-owner.
                </p>
            )}
            {tab === "edit" && <EditMetaPanel entry={entry} onSaved={() => {
                setTab("none");
                onMetaSaved?.();
            }} onCancel={() => setTab("none")}/>}
            {tab === "release" && <AddReleasePanel entry={entry} onSaved={() => {
                setTab("none");
                onReleaseSaved?.();
            }} onCancel={() => setTab("none")}/>}
            {tab === "resources" && <ResourcePanel entry={entry} onCancel={() => setTab("none")}/>}
            {tab === "team" && <TeamPanel entry={entry} onOwnerChanged={onMetaSaved}/>}

            {showDenyModal && <DenyModal onConfirm={handleDeny} onCancel={() => setDenyModal(false)}/>}
        </div>
    );
}

// ── Module detail ─────────────────────────────────────────────────────────────

export interface ModuleDetailProps {
    entry: CatalogEntry;
    account: AccountState;
    busy: boolean;
    progress: InstallProgress | null;
    onInstall: () => void;
    onUninstall: () => void;
    onUpdate: () => void;
    onRefresh?: () => void;
    onHardRefresh?: () => void;
    onApproved?: () => void;
    onDenied?: () => void;
    onMetaSaved?: () => void;
    onReleaseSaved?: () => void;
    onPublished?: () => void;
    onDeleted?: () => void;
}

export function ModuleDetail({
                                 entry, account, busy, progress,
                                 onInstall, onUninstall, onUpdate, onRefresh, onHardRefresh,
    onApproved, onDenied, onMetaSaved, onReleaseSaved, onPublished, onDeleted,
}: ModuleDetailProps) {
    const [removeConfirm, setRemoveConfirm] = useState(false);
    const [botCommands, setBotCommands] = useState<BotCommand[]>([]);
    const shiftHeldRef = useRef(false);
    const [shiftHeld, setShiftHeld] = useState(false);

    // Reactive shift-key state so the Refresh button can visibly relabel
    // itself to "Hard Refresh" while held — shiftHeldRef (above) is the one
    // actually read at click time, this is purely for the label/style.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Shift") setShiftHeld(true);
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Shift") setShiftHeld(false);
        };
        const onBlur = () => setShiftHeld(false);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, []);
    const [health, setHealth] = useState<PreflightIssue[] | null>(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [showReport, setShowReport] = useState(false);
    const [reportBusy, setReportBusy] = useState(false);
    const [reportErr, setReportErr] = useState<string | null>(null);
    const [managing, setManaging] = useState(false);
    const [mediaIndex, setMediaIndex] = useState(0);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const isPublished = !entry.status || entry.status === "published";
    const isPending   = entry.status === "pending";
    const isDenied    = entry.status === "denied";
    const commands = (entry.manifest as Record<string, unknown>)?.commands as Array<{
        trigger: string;
        builtin_key?: string
    }> | undefined;
    // Opt-in capabilities beyond the default module sandbox (see
    // ModuleManifest::permissions on the Rust side) — currently only "web"
    // (outbound HTTP) is recognized. Surfaced here so installing isn't the
    // first time a user learns a module can make network requests.
    const permissions = (entry.manifest as Record<string, unknown>)?.permissions as string[] | undefined;
    const PERMISSION_LABELS: Record<string, string> = {
        web: "Make network requests to external services",
    };
    const screenshots = entry.resources?.filter(r => r.resource_type === "screenshot") ?? [];
    // Synthetic entry for a locally-installed module/library that isn't in the
    // catalog at all (see mergeWithInstalled in useMarketplace.ts) — it has no
    // real backend record at all, so every marketplace-API-backed action
    // (releases, reviews, reports, approve/deny/publish/edit/team) would
    // just fail against a nonexistent id. Install/update/remove still work
    // fine since those are local Tauri operations, not marketplace calls.
    //
    // isLocalShadow is a *different* thing entirely — it's the local half of
    // a devWatch split of a real catalog entry (see mergeWithInstalled):
    // marketplaceId is the real, unprefixed id, and there's a real backend
    // record behind it (possibly a draft/pending one). A dev-watched draft/
    // pending/denied package absolutely needs Manage — just on its *online*
    // row, same as a published one. The local row is still never the place
    // to manage from (it represents your local files, not the listing), so
    // canManage excludes isLocalShadow specifically, independent of
    // isLocalOnly/publish status.
    const isLocalOnly = entry.author === "local";
    const canManage = (account.isOwner || roleAtLeast(account.role, "staff")) && !isLocalOnly && !entry.isLocalShadow;
    // Verified packages still get community reviews — being curated doesn't
    // mean feedback stops mattering. What's hidden for verified packages is
    // the *report* action, further down.
    const hasReviews = isPublished && !isLocalOnly && !entry.isLocalShadow;
    const hasReleases = isPublished && !isLocalOnly && !entry.isLocalShadow;

    // Reset remove-confirm, manage mode, and the media viewer position when
    // the selected entry changes
    useEffect(() => {
        setRemoveConfirm(false);
        setManaging(false);
        setMediaIndex(0);
    }, [entry.id]);

    // Reset report modal state when the selected entry changes
    useEffect(() => {
        setShowReport(false);
        setReportErr(null);
    }, [entry.id]);

    const submitReport = async (reason: ReportReason, details: string, captchaToken: string) => {
        const token = await getLicenseToken();
        if (!token) {
            setReportErr("Not signed in");
            return;
        }
        setReportBusy(true);
        setReportErr(null);
        try {
            await mpReportModule(entry.marketplaceId, reason, details, captchaToken, token);
            setShowReport(false);
        } catch (e) {
            setReportErr(String(e));
        } finally {
            setReportBusy(false);
        }
    };

    // Load registered bot commands whenever the selected module changes
    useEffect(() => {
        getCommands().then(setBotCommands).catch(() => {
        });
    }, [entry.id]);

    const runHealth = useCallback(() => {
        if (!entry.installed) return;
        setHealthLoading(true);
        preflightModule(entry.marketplaceId)
            .then(setHealth)
            .catch(() => setHealth(null))
            .finally(() => setHealthLoading(false));
    }, [entry.id, entry.installed]);

    // Reset health state when selected module changes
    useEffect(() => {
        setHealth(null);
    }, [entry.id]);

    // Escape-to-close for the screenshot lightbox — backdrop click was the
    // only way to dismiss it before this.
    useEffect(() => {
        if (!lightbox) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setLightbox(null);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [lightbox]);

    const iconClr = entry.color || iconColor(entry.icon);
    // Banner is the masthead cover (shown once, up top); screenshots are the
    // separate filmstrip further down — keeping them apart avoids showing
    // the same banner image twice.
    const banner = entry.resources?.find(r => r.resource_type === "banner");
    const iconResource = entry.resources?.find(r => r.resource_type === "icon");
    const media = screenshots;
    const trustLabel = isPending ? "Pending Review" : isDenied ? "Denied" : entry.status === "draft" ? "Draft"
        : entry.premium ? "Premium" : entry.verified ? "Official" : "Community";
    // Team name when a team owns the package, otherwise the individual
    // author — same rule the "by X" line above already uses, reused here
    // so the review modal attributes the review to the right entity
    // instead of always the flat author field.
    const ownerLabel = entry.owner_team_id ? (entry.owner_team_name ?? "Team") : entry.author;
    // "module" / "library" / "bundle" — a bundle's package_type value is
    // literally "package", but everywhere else in this file that's shown
    // to users as "Bundle", so the review modal matches that instead of
    // repeating the internal field name.
    const packageTypeLabel = entry.package_type === "library" ? "library" : entry.package_type === "package" ? "bundle" : "module";

    // Two separate decisions, easy to conflate: (1) does this page use one
    // column or two, and (2) does the container touch the edges of the pane.
    // A two-column layout (this content + a persistent rail for
    // Install/Manage/facts) was tried and rejected on (1) — the rail's own
    // content is three short lines, so no width tuning made a whole side
    // column next to it look intentional. That's unrelated to (2): going
    // back to a single column doesn't mean that column has to be centered
    // and capped again. It still fills the pane edge-to-edge in the wide
    // tier — the banner bleeds to the true edges, and only the *text*
    // elements (description/changelog, capped inline at 720 for
    // readability) stay narrower than the full container, sitting flush
    // left inside it. That reads as a normal wide layout with a text
    // column, not as two disconnected boxes with a gap between them.
    const [rootRef, rootWidth] = useElementWidth<HTMLDivElement>();
    const isWide = rootWidth >= 1150;
    const isNarrow = rootWidth > 0 && rootWidth < 640;

    return (
        <div key={entry.id} ref={rootRef} className="mp-fade-in" style={{height: "100%", overflowY: "auto"}}>
            <DetailStyles/>
            {/* Regular window: single centered reading column (maxWidth 820).
                Narrow and wide windows both go edge-to-edge — narrow because
                there's no margin to spare, wide because there's no second
                column left to anchor against, so the container itself
                fills the pane instead. */}
            <div style={{
                maxWidth: isNarrow || isWide ? "none" : 820,
                margin: "0 auto",
                padding: isNarrow ? "18px 16px 28px" : isWide ? "22px 40px 32px" : "22px 24px 32px",
            }}>

                {/* Masthead: every package gets a colored mood field, not just
                ones with an uploaded banner — its own iconClr, already
                computed for every entry, washed across the top as an actual
                atmosphere instead of being confined to a thin ring. This is
                the concrete "originality" lever: two packages should not
                look like the same gray page with a different name swapped
                in. The avatar still overlaps the bottom edge (profile-page
                shape — Metro forbids overlap/roundness/elevation, so this
                stays the one deliberate exception); a banner image, if one
                exists, sits inside the same colored field and blends into
                it via a bottom gradient instead of a hard cut. */}
                {/* Every size below scales up in the wide tier — a maximized
                window that just reruns the regular tier's fixed pixel sizes
                (112px banner, 64px avatar, 16px title) still *looks* small
                and sparse no matter how the outer margins are tuned, since
                nothing in the content itself is actually using the extra
                space. */}
                <div style={{margin: isWide ? "-22px -40px 0" : "-22px -24px 0", position: "relative"}}>
                    <div style={{
                        height: isWide ? 200 : 112, position: "relative", overflow: "hidden",
                        background: banner ? "#000" : `radial-gradient(120% 140% at 15% 0%, ${iconClr}55, ${iconClr}14 55%, var(--color-bg-base) 100%)`,
                    }}>
                        {banner && (
                            <img src={banner.url} alt="" style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover" as const,
                                display: "block"
                            }}/>
                        )}
                        <div style={{
                            position: "absolute", inset: 0,
                            background: `linear-gradient(to bottom, transparent 40%, color-mix(in srgb, ${iconClr} 20%, var(--color-bg-base)) 100%)`,
                        }}/>
                    </div>
                    <div style={{
                        display: "flex", alignItems: "flex-end", gap: isWide ? 18 : 12,
                        padding: isWide ? "0 40px" : "0 24px", marginTop: isWide ? -36 : -28, position: "relative",
                    }}>
                        <div style={{
                            width: isWide ? 88 : 64,
                            height: isWide ? 88 : 64,
                            flexShrink: 0,
                            borderRadius: "28%",
                            overflow: "hidden",
                            backgroundColor: `${iconClr}20`,
                            border: "3px solid var(--color-bg-base)",
                            boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: iconClr,
                        }}>
                            {iconResource
                                ? <img src={iconResource.url} alt=""
                                       style={{width: "100%", height: "100%", objectFit: "cover" as const}}/>
                                : <IconRenderer name={entry.icon} size={isWide ? 38 : 28}/>}
                        </div>
                        <div style={{flex: 1, minWidth: 0, paddingBottom: 2}}>
                            <div style={{display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap"}}>
                                <span style={{
                                    fontSize: isWide ? 24 : 16,
                                    fontWeight: 700,
                                    color: "#e8e8e8"
                                }}>{entry.name}</span>
                                {entry.version && (
                                    <span style={{
                                        fontSize: 10, fontFamily: "monospace", color: iconClr,
                                        backgroundColor: `${iconClr}18`, padding: "1px 6px", borderRadius: 20,
                                    }}>v{entry.version}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                {/* No horizontal padding of its own — the avatar/title row above
                and the description below both sit flush against the outer
                wrapper's own padding (24 regular / 40 wide); this line used
                to add an extra 24px on top of that, so it was the one piece
                of text on the page indented further right than everything
                around it instead of sharing the same left edge. */}
                <div style={{padding: "10px 0 0", marginBottom: 16}}>
                    <p style={{fontSize: 11.5, color: "#666", margin: "3px 0 0", lineHeight: 1.7}}>
                        by {entry.owner_team_id ? (entry.owner_team_name ?? "Team") : entry.author}
                        {entry.submitter_username && entry.submitter_username !== entry.author && <> · submitted
                            by {entry.submitter_username}</>}
                        {" · "}<span style={{color: iconClr}}>{trustLabel}</span>
                        {entry.category && <> · {entry.category}</>}
                        {(entry.package_type ?? "module") === "library" && <> · <span
                            style={{color: "#3e9dff"}}>Library</span></>}
                        {entry.package_type === "package" && <> · <span style={{color: "#a78bfa"}}>Bundle</span></>}
                        {isLocalOnly && <> · Local only</>}
                        {entry.devWatch
                            ? <> · <span style={{color: "#22d3ee"}}>Local dev build</span></>
                            : entry.installed && <> · <span style={{color: "var(--color-accent)"}}>Installed</span></>}
                        {entry.updateAvailable && <> · <span style={{color: "#ffb23e"}}>Update available</span></>}
                    </p>
                    {!!entry.rating_count && entry.rating_count > 0 && (
                        <div style={{display: "flex", alignItems: "center", gap: 5, marginTop: 4}}>
                            <StarRow value={entry.rating_avg ?? 0}/>
                            <span style={{
                                fontSize: 11,
                                color: "#555"
                            }}>{(entry.rating_avg ?? 0).toFixed(1)} ({entry.rating_count})</span>
                        </div>
                    )}
                </div>

                {(() => {
                    // Actions — the mutating ones stay real buttons (this is the
                    // one place a filled rectangle is earned, since it's a
                    // commitment, not a status readout); Report/Manage demote to
                    // plain inline text links, same underline convention the
                    // rest of this file already uses for secondary affordances.
                    // Not gated on isPublished as a whole — Manage is exactly
                    // what staff/owners need for a draft/pending/denied package,
                    // so hiding this entire row for anything unpublished hid
                    // Manage right when it mattered most. Install/Update alone
                    // stay publish-gated below; there's no real release to
                    // install otherwise.
                    // Staff/owners can install a pending package too — they're
                    // the ones who have to actually review it, which means
                    // testing what was submitted, not waiting until after
                    // it's already published to see it run. mpInstall (Rust
                    // side) already accepts this once the server's /catalog/{id}
                    // stops 404ing on pending for a staff-token request; the
                    // gate here just needs to stop excluding pending for the
                    // people who are allowed to see it.
                    const canInstall = isPublished || (isPending && canManage);
                    const confirmedInstall = () => {
                        if (permissions && permissions.length > 0) {
                            const lines = permissions.map(p => `- ${PERMISSION_LABELS[p] ?? p}`).join("\n");
                            if (!window.confirm(`${entry.name} requests extra permissions:\n\n${lines}\n\nInstall anyway?`)) {
                                return;
                            }
                        }
                        onInstall();
                    };
                    const actionsContent = (
                        <>
                            {canInstall && !entry.installed && (
                                <ActionBtn label="Install" variant="primary" loading={!!(busy && progress)}
                                           onClick={confirmedInstall}/>
                            )}
                            {canInstall && entry.installed && entry.updateAvailable && (
                                <ActionBtn label="Update" variant="warn" loading={!!(busy && progress)}
                                           disabled={!account.username} onClick={onUpdate}/>
                            )}
                            {entry.installed && entry.devWatch ? (
                                // Dev-watched: offer Refresh (reinstall from source) instead of Remove.
                                // Shift-click does a hard refresh — fully deletes the installed copy
                                // first instead of only overwriting/adding files. ActionBtn's onClick
                                // takes no event, so shiftKey is captured on the wrapping span first
                                // (capture phase runs before the button's own bubble-phase handler).
                                <span
                                    title={shiftHeld ? "Fully deletes and reinstalls from source" : "Shift-click for a hard refresh (fully deletes and reinstalls)"}
                                    onClickCapture={(e) => {
                                        shiftHeldRef.current = e.shiftKey;
                                    }}
                                >
                                <ActionBtn
                                    label={shiftHeld ? "Hard Refresh" : "Refresh"}
                                    variant={shiftHeld ? "danger" : "ghost"}
                                    loading={!!(busy && progress)}
                                    onClick={() => {
                                        (shiftHeldRef.current ? onHardRefresh : onRefresh)?.();
                                    }}/>
                            </span>
                            ) : entry.installed && (
                                removeConfirm ? (
                                    <>
                                        <span style={{fontSize: 11, color: "#666"}}>Remove?</span>
                                        <TextLink onClick={() => setRemoveConfirm(false)}>Cancel</TextLink>
                                        <ActionBtn label="Confirm" variant="danger" loading={!!(busy && progress)}
                                                   onClick={() => {
                                                       setRemoveConfirm(false);
                                                       onUninstall();
                                                   }}/>
                                    </>
                                ) : (
                                    <TextLink onClick={() => setRemoveConfirm(true)}>Remove</TextLink>
                                )
                            )}
                            {account.username && !isLocalOnly && !entry.isLocalShadow && !entry.verified && (
                                <TextLink onClick={() => setShowReport(true)}>Report</TextLink>
                            )}
                            {canManage && (
                                <TextLink
                                    onClick={() => setManaging(m => !m)}>{managing ? "Hide manage tools" : "Manage"}</TextLink>
                            )}
                        </>
                    );

                    const actionsRow = (
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                            flexWrap: "wrap",
                            marginBottom: 18
                        }}>
                            {actionsContent}
                        </div>
                    );

                    const progressBlock = progress && <ProgressBar progress={progress}/>;

                    // Capped at a readable measure even though the wide column
                    // itself now fills the pane — filling the *container* was
                    // the fix for the dead-margin complaint, but an uncapped
                    // paragraph would just trade "empty margins" for "unreadably
                    // long lines," which isn't actually better. One shared cap
                    // (readCap), used by every section below, not a different
                    // magic number (or no cap at all) per section — Release
                    // History and Reviews used to drift to their own widths
                    // (edge-to-edge and 860 respectively) while description/
                    // changelog sat at 720, so the page's own column width
                    // visibly jumped around between sections.
                    const readCap = isWide ? 860 : 720;

                    const devWatchBanner = entry.devWatch && (
                        <div style={{
                            marginBottom: 16,
                            padding: "8px 12px",
                            backgroundColor: "#0e0e0e",
                            borderRadius: 8,
                            maxWidth: readCap
                        }}>
                            <span style={{fontSize: 11, color: "#22d3ee"}}>Watching local source</span>
                            <div style={{
                                fontSize: 10,
                                color: "#555",
                                fontFamily: "monospace",
                                marginTop: 2
                            }}>{entry.devWatch.source_dir}</div>
                        </div>
                    );

                    const denialReason = isDenied && entry.deny_reason && (
                        <div style={{
                            marginBottom: 16,
                            padding: "8px 12px",
                            backgroundColor: "#1a0e0e",
                            borderRadius: 8,
                            maxWidth: readCap
                        }}>
                            <SectionLabel>Denial reason</SectionLabel>
                            <p style={{fontSize: 12, color: "#999", margin: 0}}>{entry.deny_reason}</p>
                        </div>
                    );

                    const descriptionBlock = (
                        <p style={{
                            fontSize: isWide ? 13 : 12,
                            color: "#999",
                            lineHeight: 1.7,
                            margin: 0,
                            maxWidth: readCap
                        }}>
                            {entry.description || <span style={{color: "#444"}}>No description provided.</span>}
                        </p>
                    );

                    // Facts and tags get their own lines instead of one crammed
                    // run-on sentence — a version requirement and a topic tag
                    // are different kinds of information and shouldn't read as
                    // the same breath.
                    const factsBlock = (entry.min_app_version || entry.downloads > 0 || (entry.tags && entry.tags.filter(t => !["installed", "local"].includes(t)).length > 0)) && (
                        <div>
                            {(entry.min_app_version || entry.downloads > 0) && (
                                <p style={{fontSize: 11, color: "#555", marginTop: 10}}>
                                    {entry.min_app_version && <>Requires v{entry.min_app_version}+</>}
                                    {entry.downloads > 0 && <>{entry.min_app_version && "  ·  "}{entry.downloads.toLocaleString()} installs</>}
                                </p>
                            )}
                            {entry.tags && entry.tags.filter(t => !["installed", "local"].includes(t)).length > 0 && (
                                <p style={{fontSize: 11, color: "#444", marginTop: 6}}>
                                    {entry.tags.filter(t => !["installed", "local"].includes(t)).join("  ·  ")}
                                </p>
                            )}
                        </div>
                    );

                    // Wide tier only: one horizontal dashboard-style bar instead
                    // of two separate stacked lines (actions, then — further
                    // down the page — facts/tags on their own). A maximized
                    // window has the width to hold both in one row; stacking
                    // them was two thin lines each wasting the same unused
                    // width, not one line that actually uses it.
                    const visibleTags = entry.tags?.filter(t => !["installed", "local"].includes(t)) ?? [];
                    const factsInline = (entry.min_app_version || entry.downloads > 0 || visibleTags.length > 0) && (
                        <p style={{fontSize: 11, color: "#555", margin: 0, textAlign: "right"}}>
                            {entry.min_app_version && <>Requires v{entry.min_app_version}+</>}
                            {entry.downloads > 0 && <>{entry.min_app_version && "  ·  "}{entry.downloads.toLocaleString()} installs</>}
                            {visibleTags.length > 0 && <>{(entry.min_app_version || entry.downloads > 0) && "  ·  "}<span
                                style={{color: "#444"}}>{visibleTags.join("  ·  ")}</span></>}
                        </p>
                    );
                    const actionsAndFactsRow = (
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: 14,
                            marginBottom: 18
                        }}>
                            <div style={{display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap"}}>
                                {actionsContent}
                            </div>
                            {factsInline}
                        </div>
                    );

                    // Regular/narrow: a plain filmstrip, not a hero viewer. A
                    // default scrollbar this thin on a dark background is
                    // invisible, which is what made the 5th+ image look cut off
                    // rather than scrollable — mp-filmstrip gives it a real,
                    // visible thumb instead of a fade mask (already tried and
                    // rejected elsewhere in this app for the same reason).
                    //
                    // Wide: fixed-height thumbnails that wrap onto more rows
                    // instead of scrolling sideways — a filmstrip's horizontal
                    // scroll is a narrow-window compromise (no width to spare
                    // for more than one row); on a maximized window there's room
                    // to just show more screenshots at once. A 2-column grid
                    // stretching each image to fill half the (very wide) column
                    // was tried first and made every screenshot enormous
                    // (roughly 780×580px) — the fix is more thumbnails at a
                    // capped size, not fewer thumbnails blown up to fill space.
                    const screenshotsBlock = media.length > 0 && (
                        isWide ? (
                            <div style={{display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14}}>
                                {media.map(r => (
                                    <img key={r.id} src={r.url} alt={r.filename || entry.name}
                                         onClick={() => setLightbox(r.url)}
                                         style={{
                                             height: 200,
                                             width: "auto",
                                             maxWidth: 340,
                                             objectFit: "cover" as const,
                                             cursor: "zoom-in",
                                             border: "1px solid #222",
                                             borderRadius: 8,
                                             display: "block",
                                         }}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="mp-filmstrip"
                                 style={{display: "flex", gap: 6, overflowX: "auto", marginTop: 14, paddingBottom: 8}}>
                                {media.map((r, i) => (
                                    <img key={r.id} src={r.url} alt={r.filename || entry.name}
                                         onClick={() => setLightbox(r.url)}
                                         style={{
                                             height: 96, width: "auto", flexShrink: 0, cursor: "zoom-in",
                                             border: i === mediaIndex ? "1px solid var(--color-accent)" : "1px solid #222",
                                             borderRadius: 6, display: "block",
                                         }}
                                         onMouseEnter={() => setMediaIndex(i)}
                                    />
                                ))}
                            </div>
                        )
                    );

                    const permissionsBlock = permissions && permissions.length > 0 && (
                        <div style={{maxWidth: readCap}}>
                            <Divider tint={iconClr}/>
                            <SectionLabel>Permissions</SectionLabel>
                            <div>
                                {permissions.map(p => (
                                    <Row key={p} accent="#e0a13e">
                                        <span style={{fontSize: 12, color: "#ccc", flex: 1, minWidth: 0}}>
                                            {PERMISSION_LABELS[p] ?? p}
                                        </span>
                                    </Row>
                                ))}
                            </div>
                        </div>
                    );

                    const changelogBlock = entry.changelog && (
                        <div style={{maxWidth: readCap}}>
                            <Divider tint={iconClr}/>
                            <SectionLabel>What's New</SectionLabel>
                            <pre style={{
                                fontSize: isWide ? 13 : 12,
                                color: "#888",
                                lineHeight: 1.7,
                                whiteSpace: "pre-wrap",
                                fontFamily: "inherit",
                                margin: 0
                            }}>
                            {entry.changelog}
                        </pre>
                        </div>
                    );

                    const commandsBlock = commands && commands.length > 0 && (
                        <div style={{maxWidth: readCap}}>
                            <Divider tint={iconClr}/>
                            <SectionLabel>Commands</SectionLabel>
                            <div>
                                {commands.map(c => {
                                    const registered = botCommands.find(b =>
                                        b.trigger === c.trigger || (c.builtin_key && b.builtin_key === c.builtin_key)
                                    );
                                    const isActive = registered && registered.enabled;
                                    return (
                                        <Row key={c.trigger} accent={isActive ? "#3ecf5c" : undefined}>
                                            <code style={{
                                                fontSize: 12,
                                                color: isActive ? "#ccc" : "#666",
                                                flex: 1,
                                                minWidth: 0
                                            }}>{c.trigger}</code>
                                            <span style={{fontSize: 10, color: "#555"}}>
                                            {isActive ? "registered" : registered ? "disabled" : "not registered"}
                                        </span>
                                        </Row>
                                    );
                                })}
                            </div>
                        </div>
                    );

                    const healthBlock = entry.installed && (
                        <div style={{maxWidth: readCap}}>
                            <Divider tint={iconClr}/>
                            <div style={{display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8}}>
                                <SectionLabel>Health</SectionLabel>
                                <button onClick={runHealth} disabled={healthLoading} style={{
                                    fontSize: 10,
                                    color: "#666",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 0,
                                }}>{healthLoading ? "Checking…" : "Re-check"}</button>
                            </div>

                            {healthLoading && !health && <p style={{fontSize: 11, color: "#444"}}>Running checks…</p>}

                            {health !== null && (
                                health.length === 0 ? (
                                    <p style={{fontSize: 12, color: "#3ecf5c"}}>✓ All checks passed</p>
                                ) : (
                                    <div>
                                        {health.map((issue, i) => (
                                            <Row key={i} accent={issue.severity === "error" ? "#ff5c5c" : "#ffb23e"}>
                                                <div style={{flex: 1, minWidth: 0}}>
                                                    {issue.file && <div style={{
                                                        fontSize: 10,
                                                        color: "#666",
                                                        fontFamily: "monospace"
                                                    }}>{issue.file}</div>}
                                                    <span style={{fontSize: 12, color: "#999"}}>{issue.message}</span>
                                                </div>
                                            </Row>
                                        ))}
                                    </div>
                                )
                            )}
                        </div>
                    );

                    const releasesBlock = hasReleases && (
                        <div style={{maxWidth: readCap}}>
                            <Divider tint={iconClr}/>
                            <SectionLabel>Release History</SectionLabel>
                            <ReleaseHistory id={entry.marketplaceId}/>
                        </div>
                    );

                    const reviewsBlock = hasReviews && (
                        // Capped at readCap for regular/narrow, same as
                        // description/changelog/Release History there. NOT
                        // capped for wide — the wide tier renders reviews as a
                        // horizontal shelf (see ModuleFeedback), the same shape
                        // as the screenshots filmstrip above, which also isn't
                        // capped at readCap for the same reason: a shelf wants
                        // the full pane width so more cards are visible before
                        // needing to scroll.
                        <div style={{maxWidth: isWide ? "none" : readCap}}>
                            <Divider tint={iconClr}/>
                            <SectionLabel>Reviews{entry.rating_count ? ` (${entry.rating_count})` : ""}</SectionLabel>
                            <ModuleFeedback moduleId={entry.marketplaceId} account={account} ownerLabel={ownerLabel}
                                            typeLabel={packageTypeLabel} isWide={isWide}/>
                            {!account.username && (
                                <p style={{fontSize: 11, color: "#444", marginTop: 4}}>
                                    Sign in via the About page to leave reviews and receive update notifications.
                                </p>
                            )}
                        </div>
                    );

                    // The two-column rail (Manage/Install + two lines of facts,
                    // pinned beside the whole screenshots/changelog/health/
                    // releases/reviews column) was tried and rejected: the rail's
                    // own content is so thin that dedicating a permanent 300px+
                    // side column to it just relocated the "wasted space"
                    // complaint rather than fixing it — a big quiet column next
                    // to a tiny bit of data doesn't look intentional at any
                    // width. One column at every tier — but on the wide tier,
                    // actions and facts merge into one dashboard-style row (see
                    // actionsAndFactsRow above) and screenshots become a 2-column
                    // grid instead of a single-row filmstrip, so the width gets
                    // used at the top of the page instead of only being a wider
                    // version of the same stacked-lines layout.
                    return isWide ? (
                        <>
                            {actionsAndFactsRow}{progressBlock}{devWatchBanner}{denialReason}
                            {descriptionBlock}{screenshotsBlock}{changelogBlock}{commandsBlock}{permissionsBlock}{healthBlock}{releasesBlock}{reviewsBlock}
                        </>
                    ) : (
                        <>
                            {actionsRow}{progressBlock}{devWatchBanner}{denialReason}
                            {descriptionBlock}{factsBlock}{screenshotsBlock}{changelogBlock}{commandsBlock}{permissionsBlock}{healthBlock}{releasesBlock}{reviewsBlock}
                        </>
                    );
                })()}

                {canManage && managing && (
                    <>
                        <Divider tint={iconClr}/>
                        <SectionLabel>Manage</SectionLabel>
                        <OwnerPanel
                            entry={entry}
                            isAdmin={account.isOwner || roleAtLeast(account.role, "admin")}
                            onApproved={onApproved} onDenied={onDenied}
                            onMetaSaved={onMetaSaved} onReleaseSaved={onReleaseSaved}
                            onPublished={onPublished} onDeleted={onDeleted}
                        />
                    </>
                )}

                {showReport && (
                    <ReportModal
                        title={`Report "${entry.name}"`}
                        kind="module"
                        busy={reportBusy}
                        err={reportErr}
                        onClose={() => setShowReport(false)}
                        onSubmit={submitReport}
                    />
            )}

                {lightbox && (
                    <div role="dialog" aria-modal="true" aria-label={`${entry.name} screenshot, enlarged`} style={{
                        position: "fixed", inset: 0, zIndex: 999,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        backgroundColor: "rgba(0,0,0,0.85)", cursor: "zoom-out",
                    }} onClick={() => setLightbox(null)}>
                        {/* Meaningful, not decorative — this is the exact image
                        the user just deliberately opened for a closer look. */}
                        <img src={lightbox} alt={`${entry.name} screenshot`}
                             style={{maxWidth: "90%", maxHeight: "90%", borderRadius: 8}}/>
                    </div>
            )}
            </div>
        </div>
    );
}

// ── Input style ───────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 11px", fontSize: 13,
    backgroundColor: "#0a0a0a", color: "#aaa",
    border: "1px solid #222", borderRadius: 6, outline: "none",
    fontFamily: "inherit", boxSizing: "border-box" as const,
};

/** Consistent field label — matches SectionLabel's letter-spaced-caps
 *  language at a smaller weight, instead of the ad-hoc `fontSize:10,
 *  color:"#3a3a3a"` labels the Manage forms used to repeat everywhere. */
function FieldLabel({children}: { children: React.ReactNode }) {
    return (
        <div style={{
            fontSize: 10, fontWeight: 700, color: "#555",
            letterSpacing: "0.05em", textTransform: "uppercase" as const,
            marginBottom: 5,
        }}>
            {children}
        </div>
    );
}
