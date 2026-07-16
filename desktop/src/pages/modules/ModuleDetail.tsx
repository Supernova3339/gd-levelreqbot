import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogEntry } from "./useMarketplace";
import type { AccountState } from "./useAccount";
import { mpApprove, mpDeny, mpUpdateMeta, mpAddRelease, mpFetchReleases, mpPublish, mpDeleteModule, mpUploadResource, mpDeleteResource, type Release, type ResourceRecord } from "./marketplace-api";
import { getLicenseToken } from "../../lib/commands";
import { iconColor, IconRenderer } from "./icons";

// ── Module icon (large) ───────────────────────────────────────────────────────

function BigModIcon({ icon }: { icon: string }) {
    const color = iconColor(icon);
    return (
        <div style={{
            width: 52, height: 52, borderRadius: 13,
            backgroundColor: `${color}15`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color, flexShrink: 0,
        }}>
            <IconRenderer name={icon} size={26}/>
        </div>
    );
}

// ── Small UI primitives ───────────────────────────────────────────────────────

function TagChip({ label, accent, color }: { label: string; accent?: boolean; color?: string }) {
    return (
        <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" as const,
            padding: "2px 7px", borderRadius: 4,
            backgroundColor: accent ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : color ? `${color}18` : "#1a1a1a",
            color: accent ? "var(--color-accent)" : color ?? "#444",
            border: `1px solid ${accent ? "color-mix(in srgb, var(--color-accent) 25%, transparent)" : color ? `${color}44` : "#222"}`,
        }}>
            {label}
        </span>
    );
}

function Btn({ label, variant, loading, disabled, small, onClick }: {
    label: string; variant: "primary" | "ghost" | "danger" | "warn";
    loading?: boolean; disabled?: boolean; small?: boolean; onClick: () => void;
}) {
    const bg: Record<string, string> = {
        primary: "var(--color-accent)", ghost: "transparent", danger: "transparent", warn: "transparent",
    };
    const fg: Record<string, string> = {
        primary: "#fff", ghost: "#555", danger: "#ef4444", warn: "#f59e0b",
    };
    const bd: Record<string, string> = {
        primary: "none", ghost: "1px solid #2a2a2a", danger: "1px solid #3a1a1a", warn: "1px solid #78350f44",
    };
    return (
        <button
            onClick={onClick}
            disabled={disabled || loading}
            style={{
                padding: small ? "4px 12px" : "7px 20px",
                fontSize: small ? 11 : 12,
                fontWeight: 600, borderRadius: 6,
                backgroundColor: bg[variant], color: fg[variant], border: bd[variant],
                cursor: disabled || loading ? "not-allowed" : "pointer",
                opacity: disabled || loading ? 0.45 : 1,
                transition: "opacity 0.1s",
            }}
        >
            {loading ? "…" : label}
        </button>
    );
}

function SectionHead({ label }: { label: string }) {
    return (
        <p style={{
            fontSize: 10, fontWeight: 700, color: "#333",
            letterSpacing: "0.08em", textTransform: "uppercase" as const,
            marginBottom: 8,
        }}>{label}</p>
    );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    if (status === "published") return null;
    const map: Record<string, [string, string]> = {
        pending: ["#f59e0b", "Pending Review"],
        denied:  ["#ef4444", "Denied"],
        draft:   ["#555",    "Draft"],
    };
    const [color, label] = map[status] ?? ["#555", status];
    return (
        <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" as const,
            padding: "2px 8px", borderRadius: 4,
            backgroundColor: `${color}18`, color, border: `1px solid ${color}44`,
        }}>
            {label}
        </span>
    );
}

// ── Edit metadata form ────────────────────────────────────────────────────────

interface MetaForm { name: string; description: string; icon: string; tags: string; }

function EditMetaPanel({ entry, onSaved, onCancel }: {
    entry: CatalogEntry; onSaved: () => void; onCancel: () => void;
}) {
    const [form, setForm] = useState<MetaForm>({
        name:        entry.name,
        description: entry.description,
        icon:        entry.icon,
        tags:        (entry.tags ?? []).join(", "),
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr]       = useState<string | null>(null);

    const save = async () => {
        const token = await getLicenseToken();
        if (!token) { setErr("Not authenticated"); return; }
        setSaving(true); setErr(null);
        try {
            await mpUpdateMeta(entry.id, {
                name:        form.name.trim(),
                description: form.description.trim(),
                icon:        form.icon.trim(),
                tags:        form.tags.split(",").map(t => t.trim()).filter(Boolean),
            }, token);
            onSaved();
        } catch (e) {
            setErr(String(e));
        } finally {
            setSaving(false);
        }
    };

    const field = (label: string, key: keyof MetaForm, multi?: boolean) => (
        <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: "#444", display: "block", marginBottom: 3 }}>{label}</label>
            {multi ? (
                <textarea
                    rows={4}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={inputStyle}
                />
            ) : (
                <input
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={inputStyle}
                />
            )}
        </div>
    );

    return (
        <div style={{ padding: "16px 0" }}>
            <SectionHead label="Edit metadata"/>
            {field("Name", "name")}
            {field("Description", "description", true)}
            {field("Icon", "icon")}
            {field("Tags (comma-separated)", "tags")}
            {err && <p style={{ fontSize: 11, color: "#ef4444", marginBottom: 8 }}>{err}</p>}
            <div style={{ display: "flex", gap: 8 }}>
                <Btn label="Save" variant="primary" loading={saving} onClick={save}/>
                <Btn label="Cancel" variant="ghost" onClick={onCancel}/>
            </div>
        </div>
    );
}

// ── Add release form ──────────────────────────────────────────────────────────

interface ReleaseForm { version: string; download_url: string; checksum: string; changelog: string; }

function AddReleasePanel({ entry, onSaved, onCancel }: {
    entry: CatalogEntry; onSaved: () => void; onCancel: () => void;
}) {
    const [form, setForm] = useState<ReleaseForm>({ version: "", download_url: "", checksum: "", changelog: "" });
    const [saving, setSaving] = useState(false);
    const [err, setErr]       = useState<string | null>(null);

    const save = async () => {
        if (!form.version.trim() || !form.download_url.trim()) {
            setErr("Version and download URL are required.");
            return;
        }
        const token = await getLicenseToken();
        if (!token) { setErr("Not authenticated"); return; }
        setSaving(true); setErr(null);
        try {
            await mpAddRelease(entry.id, {
                version:      form.version.trim(),
                download_url: form.download_url.trim(),
                checksum:     form.checksum.trim(),
                changelog:    form.changelog.trim(),
            }, token);
            onSaved();
        } catch (e) {
            setErr(String(e));
        } finally {
            setSaving(false);
        }
    };

    const f = (label: string, key: keyof ReleaseForm, placeholder = "", multi?: boolean) => (
        <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: "#444", display: "block", marginBottom: 3 }}>{label}</label>
            {multi ? (
                <textarea rows={4} value={form[key]} placeholder={placeholder}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={inputStyle}/>
            ) : (
                <input value={form[key]} placeholder={placeholder}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={inputStyle}/>
            )}
        </div>
    );

    return (
        <div style={{ padding: "16px 0" }}>
            <SectionHead label="New release"/>
            {f("Version", "version", "1.2.3")}
            {f("Download URL", "download_url", "https://…/package.gdmod")}
            {f("SHA-256 checksum (optional)", "checksum")}
            {f("Changelog", "changelog", "What's new in this version…", true)}
            {err && <p style={{ fontSize: 11, color: "#ef4444", marginBottom: 8 }}>{err}</p>}
            <div style={{ display: "flex", gap: 8 }}>
                <Btn label="Publish Release" variant="primary" loading={saving} onClick={save}/>
                <Btn label="Cancel" variant="ghost" onClick={onCancel}/>
            </div>
        </div>
    );
}

// ── Resource panel ────────────────────────────────────────────────────────────

function ResourcePanel({ entry, onCancel }: { entry: CatalogEntry; onCancel: () => void }) {
    const [uploading, setUploading] = useState(false);
    const [err, setErr]             = useState<string | null>(null);
    const [resources, setResources] = useState<ResourceRecord[]>(
        (entry.resources ?? []) as ResourceRecord[]
    );
    const fileRef = useRef<HTMLInputElement>(null);
    const [pendingType, setPendingType] = useState<ResourceRecord["resource_type"]>("screenshot");

    const upload = async (file: File) => {
        const token = await getLicenseToken();
        if (!token) { setErr("Not authenticated"); return; }
        setUploading(true); setErr(null);
        try {
            const rec = await mpUploadResource(entry.id, file, pendingType, token);
            setResources(r => [...r, rec]);
        } catch (e) { setErr(String(e)); }
        finally { setUploading(false); }
    };

    const deleteRes = async (id: number) => {
        const token = await getLicenseToken();
        if (!token) return;
        try {
            await mpDeleteResource(entry.id, id, token);
            setResources(r => r.filter(x => x.id !== id));
        } catch (e) { setErr(String(e)); }
    };

    const typeOptions: ResourceRecord["resource_type"][] = ["screenshot", "banner", "icon", "asset"];

    return (
        <div style={{ padding: "16px 0" }}>
            <SectionHead label="Resources"/>

            {/* Existing resources */}
            {resources.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {resources.map(r => (
                        <div key={r.id} style={{ position: "relative", display: "inline-block" }}>
                            <img src={r.url} alt={r.filename}
                                style={{ height: 72, width: "auto", borderRadius: 5, border: "1px solid #1e1e1e", display: "block" }}/>
                            <div style={{ position: "absolute", top: 0, right: 0, left: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", padding: 3 }}>
                                <button onClick={() => deleteRes(r.id)} style={{
                                    width: 16, height: 16, borderRadius: 3, fontSize: 9, fontWeight: 700,
                                    backgroundColor: "#ef444488", color: "#fff", border: "none", cursor: "pointer", lineHeight: 1,
                                }}>✕</button>
                            </div>
                            <span style={{ fontSize: 9, color: "#333", display: "block", textAlign: "center", marginTop: 2 }}>{r.resource_type}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Upload */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                {typeOptions.map(t => (
                    <button key={t} onClick={() => setPendingType(t)} style={{
                        fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                        backgroundColor: pendingType === t ? "#1a1a2e" : "transparent",
                        color: pendingType === t ? "#818cf8" : "#333",
                        border: `1px solid ${pendingType === t ? "#818cf844" : "#222"}`,
                    }}>{t}</button>
                ))}
            </div>

            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}/>

            {err && <p style={{ fontSize: 11, color: "#ef4444", marginBottom: 8 }}>{err}</p>}

            <div style={{ display: "flex", gap: 8 }}>
                <Btn label={uploading ? "Uploading…" : `Upload ${pendingType}`} variant="primary"
                    loading={uploading} onClick={() => fileRef.current?.click()}/>
                <Btn label="Done" variant="ghost" onClick={onCancel}/>
            </div>
        </div>
    );
}

// ── Deny modal ────────────────────────────────────────────────────────────────

function DenyModal({ onConfirm, onCancel }: { onConfirm: (reason: string) => void; onCancel: () => void }) {
    const [reason, setReason] = useState("");
    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 999,
            display: "flex", alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.6)",
        }} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
            <div style={{
                backgroundColor: "#111", border: "1px solid #222", borderRadius: 10,
                padding: "20px 24px", width: 360,
            }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#bbb", marginBottom: 12 }}>Deny submission</p>
                <textarea
                    autoFocus
                    rows={4}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Reason for denial (shown to submitter)…"
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 12 }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <Btn label="Cancel" variant="ghost" small onClick={onCancel}/>
                    <Btn label="Deny" variant="danger" small disabled={!reason.trim()} onClick={() => onConfirm(reason)}/>
                </div>
            </div>
        </div>
    );
}

// ── Release history list ──────────────────────────────────────────────────────

function ReleaseHistory({ id }: { id: string }) {
    const [releases, setReleases] = useState<Release[]>([]);
    const [open, setOpen]         = useState(false);
    const [loading, setLoading]   = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setReleases(await mpFetchReleases(id));
        } catch { /* offline */ }
        finally { setLoading(false); }
    }, [id]);

    const toggle = () => {
        if (!open && releases.length === 0) load();
        setOpen(o => !o);
    };

    return (
        <div style={{ marginBottom: 24 }}>
            <button
                onClick={toggle}
                style={{
                    fontSize: 10, fontWeight: 700, color: "#333", letterSpacing: "0.08em",
                    textTransform: "uppercase" as const, background: "none", border: "none",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0,
                }}
            >
                <span style={{ fontSize: 10, color: open ? "#555" : "#333" }}>{open ? "▾" : "▸"}</span>
                Release History
            </button>

            {open && (
                <div style={{ marginTop: 8 }}>
                    {loading ? (
                        <p style={{ fontSize: 11, color: "#2a2a2a" }}>Loading…</p>
                    ) : releases.length === 0 ? (
                        <p style={{ fontSize: 11, color: "#2a2a2a" }}>No releases yet</p>
                    ) : releases.map(r => (
                        <div key={r.version} style={{
                            marginBottom: 10, paddingBottom: 10,
                            borderBottom: "1px solid #1a1a1a",
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>v{r.version}</span>
                                <span style={{ fontSize: 10, color: "#2a2a2a" }}>
                                    {new Date(r.pub_date).toLocaleDateString()}
                                </span>
                            </div>
                            {r.changelog ? (
                                <pre style={{
                                    fontSize: 11, color: "#3a3a3a", lineHeight: 1.5,
                                    whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0,
                                }}>{r.changelog}</pre>
                            ) : (
                                <span style={{ fontSize: 11, color: "#2a2a2a", fontStyle: "italic" }}>No changelog</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function ModuleDetailEmpty() {
    return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 14,
        }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="6" y="6" width="16" height="16" rx="3" stroke="#1e1e1e" strokeWidth="2"/>
                <rect x="26" y="6" width="16" height="16" rx="3" stroke="#1e1e1e" strokeWidth="2"/>
                <rect x="6" y="26" width="16" height="16" rx="3" stroke="#1e1e1e" strokeWidth="2"/>
                <rect x="26" y="26" width="16" height="16" rx="3" stroke="#1e1e1e" strokeWidth="2"/>
            </svg>
            <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#2a2a2a" }}>Browse the marketplace</p>
                <p style={{ fontSize: 11, color: "#222", marginTop: 4 }}>Select a package to see details</p>
            </div>
        </div>
    );
}

// ── Module detail ─────────────────────────────────────────────────────────────

type AdminPanel = "none" | "edit" | "release" | "resources";

interface ModuleDetailProps {
    entry: CatalogEntry;
    account: AccountState;
    busy: boolean;
    onInstall: () => void;
    onUninstall: () => void;
    onUpdate: () => void;
    onApproved?: () => void;
    onDenied?: () => void;
    onMetaSaved?: () => void;
    onReleaseSaved?: () => void;
    onPublished?: () => void;
    onDeleted?: () => void;
}

export function ModuleDetail({
    entry, account, busy,
    onInstall, onUninstall, onUpdate,
    onApproved, onDenied, onMetaSaved, onReleaseSaved, onPublished, onDeleted,
}: ModuleDetailProps) {
    const [uninstallConfirm, setUninstallConfirm] = useState(false);
    const [deleteConfirm, setDeleteConfirm]       = useState(false);
    const [adminPanel, setAdminPanel]             = useState<AdminPanel>("none");
    const [showDenyModal, setShowDenyModal]       = useState(false);
    const [actionBusy, setActionBusy]             = useState(false);

    const commands = (entry.manifest as Record<string, unknown>)?.commands as Array<{ trigger: string }> | undefined;
    const { isOwner } = account;
    const isPending   = entry.status === "pending";
    const isDenied    = entry.status === "denied";
    const isDraft     = entry.status === "draft";
    const isPublished = entry.status === "published";

    const withToken = async (fn: (t: string) => Promise<void>, onDone?: () => void) => {
        const t = await getLicenseToken();
        if (!t) return;
        setActionBusy(true);
        try { await fn(t); onDone?.(); }
        finally { setActionBusy(false); }
    };

    const handleApprove  = () => withToken(t => mpApprove(entry.id, t), onApproved);
    const handlePublish  = () => withToken(t => mpPublish(entry.id, !isPublished, t), onPublished);
    const handleDelete   = () => {
        if (!deleteConfirm) { setDeleteConfirm(true); return; }
        setDeleteConfirm(false);
        withToken(t => mpDeleteModule(entry.id, t), onDeleted);
    };
    const handleDeny    = (reason: string) => {
        setShowDenyModal(false);
        withToken(t => mpDeny(entry.id, reason, t), onDenied);
    };

    // Reset admin panel when entry changes
    useEffect(() => {
        setAdminPanel("none"); setUninstallConfirm(false); setDeleteConfirm(false);
    }, [entry.id]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "24px 28px" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
                <BigModIcon icon={entry.icon}/>
                <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#e0e0e0", margin: 0 }}>{entry.name}</h2>
                        {entry.version && <span style={{ fontSize: 11, color: "#333" }}>v{entry.version}</span>}
                        <StatusBadge status={entry.status ?? "published"}/>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                        {entry.verified && <TagChip label="Official" accent/>}
                        {!entry.verified && <TagChip label="Community"/>}
                        {(entry.package_type ?? "module") === "library" && <TagChip label="Library" color="#60a5fa"/>}
                        {entry.package_type === "package" && <TagChip label="Bundle" color="#a78bfa"/>}
                        {entry.premium && <TagChip label="Premium" color="#f59e0b"/>}
                        {entry.installed && <TagChip label="Installed" accent/>}
                        {entry.updateAvailable && <TagChip label="Update available" color="#f59e0b"/>}
                    </div>
                    <p style={{ fontSize: 11, color: "#444", margin: 0 }}>
                        by {entry.author}
                        {entry.submitter_username && entry.submitter_username !== entry.author
                            ? <> · submitted by <strong style={{ color: "#555" }}>{entry.submitter_username}</strong></>
                            : null}
                    </p>
                </div>
            </div>

            {/* Denial notice */}
            {isDenied && entry.deny_reason && (
                <div style={{
                    marginBottom: 16, padding: "10px 14px", borderRadius: 6,
                    backgroundColor: "#1a0a0a", border: "1px solid #3a1a1a",
                }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                        Denied
                    </p>
                    <p style={{ fontSize: 12, color: "#888" }}>{entry.deny_reason}</p>
                </div>
            )}

            <div style={{ height: 1, backgroundColor: "#1a1a1a", marginBottom: 20 }}/>

            {/* Admin panel */}
            {isOwner && (
                <div style={{
                    marginBottom: 20, padding: "12px 14px",
                    backgroundColor: "#0d0d14", border: "1px solid #1a1a2a", borderRadius: 8,
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: adminPanel !== "none" ? 12 : 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#3a3aaa", letterSpacing: "0.08em", textTransform: "uppercase" as const, flex: 1 }}>
                            Owner
                        </span>
                        {isPending && (
                            <>
                                <Btn label="Approve" variant="primary" small loading={actionBusy} onClick={handleApprove}/>
                                <Btn label="Deny…"   variant="danger"  small loading={actionBusy} onClick={() => setShowDenyModal(true)}/>
                            </>
                        )}
                        {!isPending && (
                            <Btn
                                label={isPublished ? "Unpublish" : "Publish"}
                                variant={isPublished ? "ghost" : "primary"}
                                small loading={actionBusy}
                                onClick={handlePublish}
                            />
                        )}
                        {(isDraft || isDenied) && (
                            <Btn label="Deny…" variant="danger" small loading={actionBusy} onClick={() => setShowDenyModal(true)}/>
                        )}
                        <Btn
                            label={adminPanel === "edit" ? "Close" : "Edit"}
                            variant="ghost" small
                            onClick={() => setAdminPanel(p => p === "edit" ? "none" : "edit")}
                        />
                        <Btn
                            label={adminPanel === "release" ? "Close" : "Release"}
                            variant="ghost" small
                            onClick={() => setAdminPanel(p => p === "release" ? "none" : "release")}
                        />
                        <Btn
                            label={adminPanel === "resources" ? "Close" : "Resources"}
                            variant="ghost" small
                            onClick={() => setAdminPanel(p => p === "resources" ? "none" : "resources")}
                        />
                        <Btn
                            label={deleteConfirm ? "Confirm delete" : "Delete"}
                            variant="danger" small loading={actionBusy}
                            onClick={handleDelete}
                        />
                    </div>

                    {adminPanel === "edit" && (
                        <EditMetaPanel
                            entry={entry}
                            onSaved={() => { setAdminPanel("none"); onMetaSaved?.(); }}
                            onCancel={() => setAdminPanel("none")}
                        />
                    )}
                    {adminPanel === "release" && (
                        <AddReleasePanel
                            entry={entry}
                            onSaved={() => { setAdminPanel("none"); onReleaseSaved?.(); }}
                            onCancel={() => setAdminPanel("none")}
                        />
                    )}
                    {adminPanel === "resources" && (
                        <ResourcePanel entry={entry} onCancel={() => setAdminPanel("none")}/>
                    )}
                </div>
            )}

            {/* Description */}
            <p style={{ fontSize: 13, color: "#666", lineHeight: 1.65, marginBottom: 24 }}>{entry.description}</p>

            {/* Tags */}
            {(entry.tags ?? []).filter(t => t !== "installed").length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
                    {entry.tags.filter(t => t !== "installed").map(t => <TagChip key={t} label={t}/>)}
                </div>
            )}

            {/* Commands */}
            {commands && commands.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <SectionHead label="Commands"/>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {commands.map(c => (
                            <span key={c.trigger} style={{
                                fontSize: 10, fontFamily: "monospace", fontWeight: 600,
                                padding: "2px 7px", borderRadius: 4,
                                backgroundColor: "#111", border: "1px solid #222", color: "#555",
                            }}>
                                {c.trigger}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Screenshots */}
            {(entry.resources?.filter(r => r.resource_type === "screenshot") ?? []).length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <SectionHead label="Screenshots"/>
                    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                        {entry.resources!.filter(r => r.resource_type === "screenshot").map(r => (
                            <img key={r.id} src={r.url} alt={r.filename || "Screenshot"}
                                style={{ height: 140, width: "auto", flexShrink: 0, borderRadius: 6, border: "1px solid #1a1a1a", objectFit: "cover" }}/>
                        ))}
                    </div>
                </div>
            )}

            {/* Changelog */}
            {entry.changelog && (
                <div style={{ marginBottom: 24 }}>
                    <SectionHead label="What's new"/>
                    <pre style={{
                        fontSize: 11, color: "#444", lineHeight: 1.6,
                        whiteSpace: "pre-wrap", fontFamily: "inherit",
                        backgroundColor: "#111", borderRadius: 6,
                        padding: "10px 12px", border: "1px solid #1a1a1a", margin: 0,
                    }}>{entry.changelog}</pre>
                </div>
            )}

            {/* Release history */}
            {entry.status === "published" && <ReleaseHistory id={entry.id}/>}

            {/* Stats */}
            {entry.downloads > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <span style={{ fontSize: 11, color: "#333" }}>{entry.downloads.toLocaleString()} installs</span>
                </div>
            )}

            {/* Install / Update / Uninstall actions */}
            {entry.status === "published" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {!entry.installed && (
                        <Btn label="Install" variant="primary" loading={busy} onClick={onInstall}/>
                    )}
                    {entry.installed && entry.updateAvailable && (
                        <>
                            <Btn label="Update" variant="primary" loading={busy} disabled={!account.username} onClick={onUpdate}/>
                            {!account.username && <span style={{ fontSize: 10, color: "#444" }}>Sign in to update</span>}
                        </>
                    )}
                    {entry.installed && (
                        <Btn
                            label={uninstallConfirm ? "Confirm remove" : "Remove"}
                            variant={uninstallConfirm ? "danger" : "ghost"}
                            loading={busy && !entry.updateAvailable}
                            onClick={() => {
                                if (!uninstallConfirm) { setUninstallConfirm(true); return; }
                                setUninstallConfirm(false); onUninstall();
                            }}
                        />
                    )}
                </div>
            )}

            {/* Sign-in hint */}
            {!account.username && !account.loading && (
                <div style={{
                    marginTop: 32, padding: "14px 16px", borderRadius: 8,
                    backgroundColor: "#111", border: "1px solid #1a1a1a",
                }}>
                    <p style={{ fontSize: 11, color: "#3a3a3a", margin: 0 }}>
                        Sign in via the About page to receive updates and interact with the marketplace.
                    </p>
                </div>
            )}

            {showDenyModal && (
                <DenyModal onConfirm={handleDeny} onCancel={() => setShowDenyModal(false)}/>
            )}
        </div>
    );
}

// ── Internal style ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
    width: "100%", padding: "5px 9px", fontSize: 12,
    backgroundColor: "#0d0d0d", color: "#888",
    border: "1px solid #222", borderRadius: 5, outline: "none",
    fontFamily: "inherit", resize: "vertical" as const,
    boxSizing: "border-box",
};
