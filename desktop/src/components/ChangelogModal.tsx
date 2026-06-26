import {useCallback, useEffect, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import type {ReactComponentExtension, ReactComponentTokenProps} from "@changerawr/markdown/react";
import {MarkdownRenderer} from "@changerawr/markdown/react";
import {CloseIcon} from "./icons";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChangelogTag {
    id: string;
    name: string;
    color: string;
}

interface ChangelogListEntry {
    id: string;
    version: string | null;
    title: string;
    excerpt: string | null;
    published_at: string | null;
    tags: ChangelogTag[];
}

interface ChangelogFullEntry extends ChangelogListEntry {
    content: string;
}

// ─── Alert block extension ───────────────────────────────────────────────────

const ALERT_META: Record<string, { color: string; bg: string; border: string; label: string; icon: string }> = {
    note: {color: "#3b82f6", bg: "#0d1b30", border: "#1e3a5f", label: "Note", icon: "ℹ"},
    info: {color: "#06b6d4", bg: "#061a20", border: "#0e3340", label: "Info", icon: "ℹ"},
    tip: {color: "#22c55e", bg: "#0a1f10", border: "#1a3d20", label: "Tip", icon: "✦"},
    important: {color: "#a855f7", bg: "#150a20", border: "#2a1040", label: "Important", icon: "★"},
    warning: {color: "#f59e0b", bg: "#1a1000", border: "#3a2500", label: "Warning", icon: "⚠"},
    caution: {color: "#f97316", bg: "#1a0d00", border: "#3a1a00", label: "Caution", icon: "⚠"},
    danger: {color: "#ef4444", bg: "#1a0808", border: "#3a1010", label: "Danger", icon: "✕"},
};

function AlertBlockComponent({token, children}: ReactComponentTokenProps) {
    const kind = ((token.attributes?.kind as string) ?? "note").toLowerCase();
    const meta = ALERT_META[kind] ?? ALERT_META.note;
    return (
        <div style={{
            backgroundColor: meta.bg,
            border: `1px solid ${meta.border}`,
            borderLeft: `3px solid ${meta.color}`,
            borderRadius: 6,
            padding: "10px 14px",
            margin: "0.75em 0",
        }}>
            <p style={{
                color: meta.color, fontSize: 11, fontWeight: 700, marginBottom: 4,
                textTransform: "uppercase", letterSpacing: "0.06em"
            }}>
                {meta.icon} {meta.label}
            </p>
            <div style={{color: "#c0c0c0", fontSize: 13, lineHeight: 1.6}}>
                {children ?? token.content}
            </div>
        </div>
    );
}

// Supports both :::type\ncontent\n::: and > [!TYPE]\n> content
const AlertExtension: ReactComponentExtension = {
    name: "alert-blocks",
    parseRules: [
        {
            name: "fenced-alert",
            scope: "block",
            priority: 10,
            recursiveContent: true,
            pattern: /^:::(\w+)\n([\s\S]*?)\n:::/m,
            render: (m) => ({
                type: "alert",
                content: (m[2] ?? "").trim(),
                raw: m[0] ?? "",
                attributes: {kind: (m[1] ?? "note").toLowerCase()},
            }),
        },
        {
            name: "gfm-alert",
            scope: "block",
            priority: 9,
            recursiveContent: true,
            // > [!TYPE]\n> line1\n> line2 ...
            pattern: /^>\s*\[!(NOTE|TIP|INFO|IMPORTANT|WARNING|CAUTION|DANGER)\]\n((?:>.*(?:\n|$))*)/im,
            render: (m) => {
                const lines = (m[2] ?? "")
                    .split("\n")
                    .map((l: string) => l.replace(/^>\s?/, ""))
                    .join("\n")
                    .trim();
                return {
                    type: "alert",
                    content: lines,
                    raw: m[0] ?? "",
                    attributes: {kind: (m[1] ?? "note").toLowerCase()},
                };
            },
        },
    ],
    renderRules: [
        {
            type: "alert",
            component: AlertBlockComponent,
            render: (token) => {
                const kind = ((token.attributes?.kind as string) ?? "note").toLowerCase();
                const meta = ALERT_META[kind] ?? ALERT_META.note;
                return `<div style="border-left:3px solid ${meta.color};background:${meta.bg};padding:10px 14px;border-radius:6px;margin:0.75em 0">
          <p style="color:${meta.color};font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:4px">${meta.icon} ${meta.label}</p>
          <div style="color:#c0c0c0">${token.content}</div>
        </div>`;
            },
        },
    ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: "numeric", month: "long", day: "numeric",
        });
    } catch {
        return iso;
    }
}

function matchesVersion(entry: ChangelogListEntry, appVersion: string): boolean {
    if (!entry.version) return false;
    const norm = (v: string) => v.replace(/^v/, "").trim();
    return norm(entry.version) === norm(appVersion);
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ChangelogModalProps {
    open: boolean;
    onClose: () => void;
    appVersion: string;
    autoVersion?: boolean;
}

const WHATS_NEW_COUNTDOWN = 5; // seconds before "Got it" is clickable

// ─── Main component ───────────────────────────────────────────────────────────

export function ChangelogModal({open, onClose, appVersion, autoVersion = false}: ChangelogModalProps) {
    const [entries, setEntries] = useState<ChangelogListEntry[]>([]);
    const [selected, setSelected] = useState<ChangelogListEntry | null>(null);
    const [content, setContent] = useState<string | null>(null);
    const [listErr, setListErr] = useState<string | null>(null);
    const [loadingList, setLoadingList] = useState(false);
    const [loadingContent, setLoadingContent] = useState(false);
    const [countdown, setCountdown] = useState(WHATS_NEW_COUNTDOWN);
    const backdropRef = useRef<HTMLDivElement>(null);

    const loadEntry = useCallback(async (id: string) => {
        setLoadingContent(true);
        setContent(null);
        try {
            const full = await invoke<ChangelogFullEntry>("fetch_changelog_entry", {id});
            setContent(full.content);
        } catch { /* content stays null, excerpt shown as fallback */
        } finally {
            setLoadingContent(false);
        }
    }, []);

    const loadList = useCallback(async () => {
        setLoadingList(true);
        setListErr(null);
        try {
            const data = await invoke<ChangelogListEntry[]>("fetch_changelog");
            setEntries(data);
            if (autoVersion) {
                const match = data.find((e) => matchesVersion(e, appVersion));
                if (match) {
                    setSelected(match);
                    loadEntry(match.id);
                } else {
                    setListErr(`No changelog entry found for v${appVersion}.`);
                }
            } else {
                const first = data[0] ?? null;
                setSelected(first);
                if (first) loadEntry(first.id);
            }
        } catch (err) {
            setListErr(String(err));
        } finally {
            setLoadingList(false);
        }
    }, [appVersion, autoVersion, loadEntry]);

    const selectEntry = (entry: ChangelogListEntry) => {
        setSelected(entry);
        loadEntry(entry.id);
    };

    useEffect(() => {
        if (open) {
            setEntries([]);
            setSelected(null);
            setContent(null);
            setListErr(null);
            setCountdown(autoVersion ? WHATS_NEW_COUNTDOWN : 0);
            loadList();
        }
    }, [open, loadList, autoVersion]);

    // Countdown timer for What's New "Got it" button
    useEffect(() => {
        if (!open || !autoVersion || countdown <= 0) return;
        const id = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
        return () => clearTimeout(id);
    }, [open, autoVersion, countdown]);

    // Escape only works in changelog mode; What's New requires reading (or countdown)
    useEffect(() => {
        if (!open || autoVersion) return;
        const h = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [open, onClose, autoVersion]);

    if (!open) return null;

    return (
        <div ref={backdropRef}
             className="fixed inset-0 flex items-center justify-center"
             style={{backgroundColor: "rgba(0,0,0,0.72)", zIndex: 60, backdropFilter: "blur(2px)"}}
             onClick={(e) => {
                 if (e.target === backdropRef.current) onClose();
             }}>

            <div className="flex flex-col rounded-xl overflow-hidden"
                 style={{
                     width: autoVersion ? "min(600px, 92vw)" : "min(780px, 92vw)",
                     height: "min(600px, 90vh)",
                     backgroundColor: "#141414",
                     border: "1px solid #2a2a2a",
                     borderTop: autoVersion ? "1px solid color-mix(in srgb, var(--color-accent) 35%, #2a2a2a)" : "1px solid #2a2a2a",
                     boxShadow: autoVersion
                         ? "0 24px 80px rgba(0,0,0,0.7), 0 -1px 0 color-mix(in srgb, var(--color-accent) 20%, transparent)"
                         : "0 24px 80px rgba(0,0,0,0.7)",
                 }}>

                {/* ── Header (changelog mode only) ── */}
                {!autoVersion && (
                    <div className="flex items-center justify-between px-5 flex-shrink-0"
                         style={{height: 48, borderBottom: "1px solid #222"}}>
                        <span className="text-sm font-semibold" style={{color: "#f1f1f1"}}>Changelog</span>
                        <button onClick={onClose}
                                className="flex items-center justify-center w-6 h-6 rounded"
                                style={{color: "#666", backgroundColor: "transparent"}}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "#333";
                                    e.currentTarget.style.color = "#f1f1f1";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                    e.currentTarget.style.color = "#666";
                                }}>
                            <CloseIcon/>
                        </button>
                    </div>
                )}

                {/* ── Body ── */}
                {loadingList ? <Spinner/> : listErr ? (
                    <div className="flex flex-1 items-center justify-center flex-col gap-3 p-6">
                        <p className="text-sm" style={{color: "#ef4444"}}>Could not load changelog</p>
                        <p className="text-xs text-center" style={{color: "#555", maxWidth: 340}}>{listErr}</p>
                        <button onClick={loadList} className="text-xs px-3 py-1.5 rounded mt-1"
                                style={{
                                    backgroundColor: "#1a1a1a",
                                    color: "#888",
                                    border: "1px solid #2a2a2a",
                                    cursor: "pointer"
                                }}>
                            Retry
                        </button>
                    </div>
                ) : autoVersion ? (
                    /* ── What's New ─────────────────────────────────────────── */
                    <>
                        {/* Scrollable content */}
                        <div className="flex-1 overflow-y-auto min-h-0" style={{padding: "28px 28px 0"}}>
                            {/* Label row + version chip */}
                            <div className="flex items-center justify-between" style={{marginBottom: 20}}>
                <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
                    color: "#3a3a3a", textTransform: "uppercase", fontFamily: "monospace",
                }}>
                  what's new
                </span>
                                {selected?.version && (
                                    <span style={{
                                        fontSize: 11, fontFamily: "monospace", fontWeight: 600,
                                        color: "var(--color-accent)",
                                        backgroundColor: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
                                        border: "1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)",
                                        padding: "2px 9px", borderRadius: 4,
                                    }}>
                    v{selected.version.replace(/^v/, "")}
                  </span>
                                )}
                            </div>

                            {/* Title + date + tags */}
                            {selected && (
                                <>
                                    <h2 style={{
                                        fontSize: 22, fontWeight: 700, color: "#f0f0f0",
                                        letterSpacing: "-0.025em", lineHeight: 1.2, margin: 0,
                                    }}>
                                        {selected.title}
                                    </h2>
                                    {selected.published_at && (
                                        <p style={{fontSize: 11, color: "#3a3a3a", marginTop: 6, marginBottom: 0}}>
                                            {formatDate(selected.published_at)}
                                        </p>
                                    )}
                                    {selected.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5"
                                             style={{marginTop: 12, marginBottom: 16}}>
                                            {selected.tags.map((tag) => (
                                                <span key={tag.id} style={{
                                                    fontSize: 10, padding: "2px 7px", borderRadius: 3, fontWeight: 600,
                                                    backgroundColor: `${tag.color}15`, color: tag.color,
                                                    border: `1px solid ${tag.color}30`,
                                                    textTransform: "uppercase", letterSpacing: "0.05em",
                                                }}>
                          {tag.name}
                        </span>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Divider */}
                            <div style={{borderTop: "1px solid #1e1e1e", marginBottom: 20}}/>

                            {/* Markdown content */}
                            <div style={{color: "#c0c0c0", fontSize: 13, lineHeight: 1.75, paddingBottom: 28}}>
                                {loadingContent ? <Spinner/> : content ? (
                                    <ChangelogMarkdown content={content}/>
                                ) : selected?.excerpt ? (
                                    <p style={{color: "#777"}}>{selected.excerpt}</p>
                                ) : null}
                            </div>
                        </div>

                        {/* Footer: draining progress bar + "Got it" */}
                        <div className="flex-shrink-0" style={{borderTop: "1px solid #1a1a1a"}}>
                            {/* Progress bar drains left→right as countdown depletes */}
                            <div style={{
                                height: 2,
                                backgroundColor: "#0d0d0d",
                                position: "relative",
                                overflow: "hidden"
                            }}>
                                <div style={{
                                    position: "absolute", top: 0, left: 0, bottom: 0,
                                    backgroundColor: "var(--color-accent)",
                                    width: `${(countdown / WHATS_NEW_COUNTDOWN) * 100}%`,
                                    transition: countdown > 0 ? "width 1s linear" : "none",
                                    opacity: 0.5,
                                }}/>
                            </div>
                            <div className="flex items-center justify-between" style={{padding: "12px 24px"}}>
                <span style={{fontSize: 11, color: "#2d2d2d", fontFamily: "monospace"}}>
                  {countdown > 0 ? `${countdown}s` : ""}
                </span>
                                <button
                                    onClick={countdown === 0 ? onClose : undefined}
                                    style={{
                                        fontSize: 12, fontWeight: 600, padding: "6px 18px", borderRadius: 6,
                                        backgroundColor: countdown === 0 ? "var(--color-accent)" : "#111",
                                        color: countdown === 0 ? "#fff" : "#2d2d2d",
                                        border: `1px solid ${countdown === 0 ? "transparent" : "#1e1e1e"}`,
                                        cursor: countdown === 0 ? "pointer" : "default",
                                        transition: "background-color 0.5s ease, color 0.5s ease, border-color 0.5s ease",
                                        userSelect: "none",
                                    }}>
                                    Got it
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    /* Full changelog — sidebar + content panel */
                    <div className="flex flex-1 min-h-0">
                        {/* Sidebar */}
                        <div className="flex-shrink-0 overflow-y-auto py-2"
                             style={{width: 220, borderRight: "1px solid #1e1e1e", backgroundColor: "#0f0f0f"}}>
                            {entries.map((entry) => {
                                const isActive = selected?.id === entry.id;
                                const isCurrent = matchesVersion(entry, appVersion);
                                return (
                                    <button key={entry.id} onClick={() => selectEntry(entry)}
                                            className="w-full text-left px-4 py-3"
                                            style={{
                                                backgroundColor: isActive ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
                                                borderLeft: `2px solid ${isActive ? "var(--color-accent)" : "transparent"}`,
                                            }}>
                                        {entry.version && (
                                            <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold"
                              style={{color: isActive ? "var(--color-accent)" : "#888"}}>
                          {entry.version}
                        </span>
                                                {isCurrent && (
                                                    <span style={{
                                                        fontSize: 9,
                                                        fontWeight: 700,
                                                        padding: "1px 4px",
                                                        borderRadius: 3,
                                                        backgroundColor: "#14260e",
                                                        color: "#4ade80",
                                                        border: "1px solid #1d3d14"
                                                    }}>
                            current
                          </span>
                                                )}
                                            </div>
                                        )}
                                        <p className="text-xs truncate" style={{color: isActive ? "#d0d0d0" : "#666"}}>
                                            {entry.title}
                                        </p>
                                        {entry.published_at && (
                                            <p style={{fontSize: 10, color: "#333", marginTop: 2}}>
                                                {formatDate(entry.published_at)}
                                            </p>
                                        )}
                                    </button>
                                );
                            })}
                            {entries.length === 0 && (
                                <p className="text-xs px-4 py-3" style={{color: "#444"}}>No entries.</p>
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <EntryHeader entry={selected}/>
                            <div className="mt-4" style={{color: "#c0c0c0", fontSize: 13, lineHeight: 1.7}}>
                                {loadingContent ? <Spinner/> : content ? (
                                    <ChangelogMarkdown content={content}/>
                                ) : selected?.excerpt ? (
                                    <p style={{color: "#777"}}>{selected.excerpt}</p>
                                ) : (
                                    <p style={{color: "#444"}}>Select an entry.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Entry header (shared between both views) ─────────────────────────────────

function EntryHeader({entry}: { entry: ChangelogListEntry | null }) {
    if (!entry) return null;
    return (
        <div className="flex items-start justify-between gap-4">
            <div>
                {entry.version && (
                    <p className="text-xs mb-1" style={{color: "var(--color-accent)"}}>{entry.version}</p>
                )}
                <h2 className="text-base font-semibold" style={{color: "#f1f1f1"}}>{entry.title}</h2>
                {entry.published_at && (
                    <p className="text-xs mt-1" style={{color: "#555"}}>{formatDate(entry.published_at)}</p>
                )}
            </div>
            {entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-end flex-shrink-0">
                    {entry.tags.map((tag) => (
                        <span key={tag.id} className="text-xs px-2 py-0.5 rounded"
                              style={{
                                  backgroundColor: `${tag.color}18`,
                                  color: tag.color,
                                  border: `1px solid ${tag.color}33`
                              }}>
              {tag.name}
            </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
    return (
        <div className="flex flex-1 items-center justify-center py-12">
            <div style={{
                width: 20, height: 20,
                border: "2px solid #1e1e1e", borderTopColor: "var(--color-accent)",
                borderRadius: "50%", animation: "spin 0.65s linear infinite",
            }}/>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ─── Markdown renderer with alert extensions + dark theme ────────────────────

function ChangelogMarkdown({content}: { content: string }) {
    return (
        <>
            <style>{`
        .chr-md h1,.chr-md h2,.chr-md h3,.chr-md h4 { color:#e8e8e8; margin:1em 0 0.4em; font-weight:600; }
        .chr-md h1 { font-size:1.2em; } .chr-md h2 { font-size:1.05em; } .chr-md h3 { font-size:1em; }
        .chr-md p  { margin:0.5em 0; }
        .chr-md ul,.chr-md ol { padding-left:1.4em; margin:0.5em 0; }
        .chr-md li { margin:0.2em 0; }
        .chr-md code { background:#1a1a1a; border:1px solid #2a2a2a; border-radius:3px; padding:1px 5px; font-family:monospace; font-size:0.9em; color:#818cf8; }
        .chr-md pre  { background:#111; border:1px solid #222; border-radius:6px; padding:12px; overflow-x:auto; margin:0.8em 0; }
        .chr-md pre code { background:none; border:none; padding:0; color:#c0c0c0; }
        .chr-md a { color:var(--color-accent); text-decoration:underline; }
        .chr-md blockquote { border-left:3px solid #2a2a2a; margin:0.6em 0; padding:0 0.8em; color:#666; }
        .chr-md hr { border:none; border-top:1px solid #1e1e1e; margin:1em 0; }
        .chr-md strong { color:#e0e0e0; }
        .chr-md table { border-collapse:collapse; width:100%; margin:0.8em 0; }
        .chr-md th,.chr-md td { border:1px solid #2a2a2a; padding:6px 10px; font-size:0.9em; }
        .chr-md th { background:#1a1a1a; color:#c0c0c0; }
      `}</style>
            <MarkdownRenderer
                content={content}
                className="chr-md"
                format="html"
                componentExtensions={[AlertExtension]}
            />
        </>
    );
}
