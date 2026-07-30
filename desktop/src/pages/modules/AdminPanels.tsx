/**
 * Staff/admin moderation panels — rendered in the main detail pane when the
 * "Reports" or "Users" filter chip is active in ModuleCatalogList/ModulesPage.
 * Staff+ can see & resolve reports; only admins can change user roles.
 */
import {useCallback, useEffect, useState} from "react";
import {getLicenseToken} from "../../lib/commands";
import {
    type MarketplaceRole,
    type MarketplaceUserRecord,
    mpFetchReports,
    mpFetchUsers,
    mpResolveReport,
    mpSetUserRole,
    type ReportRecord,
} from "./marketplace-api";
import {Select} from "../../components/ui/Select";

const ROLE_OPTIONS: { value: MarketplaceRole; label: string }[] =
    (["user", "author", "staff", "admin"] as MarketplaceRole[]).map(r => ({value: r, label: r}));

// ── Shared bits ───────────────────────────────────────────────────────────────

const panelTitleStyle: React.CSSProperties = {
    fontSize: 15, fontWeight: 700, color: "#d8d8d8", margin: "0 0 16px",
};

const sectionLabelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: "#2a2a2a",
    letterSpacing: "0.1em", textTransform: "uppercase" as const,
    margin: "20px 0 10px",
};

function smallBtn(variant: "primary" | "ghost" | "danger"): React.CSSProperties {
    const styles: Record<typeof variant, React.CSSProperties> = {
        primary: {backgroundColor: "var(--color-accent)", color: "#fff", border: "none"},
        ghost: {backgroundColor: "transparent", color: "#555", border: "1px solid #252525"},
        danger: {backgroundColor: "transparent", color: "#ef4444", border: "1px solid #3a1a1a"},
    };
    return {
        padding: "4px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6,
        cursor: "pointer", flexShrink: 0, ...styles[variant],
    };
}

function PanelState({text, isError, onRetry}: { text: string; isError?: boolean; onRetry?: () => void }) {
    return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", gap: 10, color: isError ? "#ef4444" : "#666",
        }}>
            <span style={{fontSize: 12}}>{text}</span>
            {onRetry && <button onClick={onRetry} style={smallBtn("ghost")}>Retry</button>}
        </div>
    );
}

// ── Reports panel ─────────────────────────────────────────────────────────────

function ReportRow({report, busy, onResolve, onDismiss, readOnly}: {
    report: ReportRecord; busy: boolean;
    onResolve?: () => void; onDismiss?: () => void; readOnly?: boolean;
}) {
    return (
        <div style={{
            padding: "10px 14px", borderRadius: 8,
            backgroundColor: "#0d0d0d", border: "1px solid #1a1a1a",
        }}>
            <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap"}}>
                <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" as const,
                    padding: "2px 6px", borderRadius: 4, backgroundColor: "#1a1a1a", color: "#666",
                }}>
                    {report.kind}
                </span>
                <span style={{fontSize: 12, fontWeight: 600, color: "#999"}}>
                    {report.target_label ?? report.target_id}
                </span>
                <span style={{fontSize: 10, color: "#f59e0b", marginLeft: "auto"}}>{report.reason}</span>
            </div>
            {report.details && (
                <p style={{fontSize: 11, color: "#555", lineHeight: 1.5, margin: "0 0 6px"}}>{report.details}</p>
            )}
            <p style={{fontSize: 9, color: "#666", margin: 0}}>
                Reported by #{report.reporter_github_id} · {new Date(report.created_at).toLocaleDateString()}
                {report.status !== "open" && ` · ${report.status}`}
            </p>
            {!readOnly && (
                <div style={{display: "flex", gap: 8, marginTop: 8}}>
                    <button onClick={onResolve} disabled={busy}
                            style={smallBtn("primary")}>{busy ? "…" : "Resolve"}</button>
                    <button onClick={onDismiss} disabled={busy} style={smallBtn("ghost")}>Dismiss</button>
                </div>
            )}
        </div>
    );
}

export function ReportsPanel() {
    const [reports, setReports] = useState<ReportRecord[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = await getLicenseToken();
            if (!token) {
                setError("Not signed in");
                return;
            }
            setReports(await mpFetchReports(token));
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const act = async (r: ReportRecord, action: "resolve" | "dismiss") => {
        const token = await getLicenseToken();
        if (!token) return;
        setBusyId(r.id);
        try {
            await mpResolveReport(r.kind, r.id, action, token);
            await load();
        } catch (e) {
            setError(String(e));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PanelState text="Loading reports…"/>;
    if (error) return <PanelState text={error} isError onRetry={load}/>;
    if (!reports || reports.length === 0) return <PanelState text="No reports."/>;

    const open = reports.filter(r => r.status === "open");
    const resolved = reports.filter(r => r.status !== "open");

    return (
        <div style={{padding: "24px 28px", overflowY: "auto", height: "100%"}}>
            {/* Capped, not stretched to the full pane — a flex column's
                default align-items:stretch means these report cards would
                otherwise fill the entire maximized window width, leaving
                text bunched on the left of an absurdly wide, mostly-empty
                card instead of a normal-looking list. */}
            <div style={{maxWidth: 640}}>
                <h2 style={panelTitleStyle}>Reports</h2>
                {open.length === 0 ? (
                    <p style={{fontSize: 12, color: "#666"}}>No open reports.</p>
                ) : (
                    <div style={{display: "flex", flexDirection: "column", gap: 8}}>
                        {open.map(r => (
                            <ReportRow
                                key={`${r.kind}-${r.id}`} report={r} busy={busyId === r.id}
                                onResolve={() => act(r, "resolve")} onDismiss={() => act(r, "dismiss")}
                            />
                        ))}
                    </div>
                )}
                {resolved.length > 0 && (
                    <>
                        <p style={sectionLabelStyle}>Resolved</p>
                        <div style={{display: "flex", flexDirection: "column", gap: 8, opacity: 0.5}}>
                            {resolved.map(r => <ReportRow key={`${r.kind}-${r.id}`} report={r} busy={false} readOnly/>)}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Users & roles panel (admin-only) ──────────────────────────────────────────

export function UsersPanel() {
    const [users, setUsers] = useState<MarketplaceUserRecord[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = await getLicenseToken();
            if (!token) {
                setError("Not signed in");
                return;
            }
            setUsers(await mpFetchUsers(token));
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const changeRole = async (u: MarketplaceUserRecord, role: MarketplaceRole) => {
        const token = await getLicenseToken();
        if (!token) return;
        setBusyId(u.github_id);
        try {
            await mpSetUserRole(u.github_id, role, token);
            setUsers(prev => prev?.map(x => x.github_id === u.github_id ? {...x, role} : x) ?? null);
        } catch (e) {
            setError(String(e));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <PanelState text="Loading users…"/>;
    if (error) return <PanelState text={error} isError onRetry={load}/>;
    if (!users || users.length === 0) return <PanelState text="No users found."/>;

    return (
        <div style={{padding: "24px 28px", overflowY: "auto", height: "100%"}}>
            {/* Capped for the same reason as ReportsPanel above — otherwise
                each row stretches to the full maximized-window width, and
                the avatar/name/role select end up scattered across it
                instead of sitting together like a normal list row. */}
            <div style={{maxWidth: 640}}>
                <h2 style={panelTitleStyle}>Users & Roles</h2>
                <div style={{display: "flex", flexDirection: "column", gap: 6}}>
                    {users.map(u => (
                        <div key={u.github_id} style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                            borderRadius: 6, backgroundColor: "#0d0d0d", border: "1px solid #1a1a1a",
                        }}>
                            <img
                                src={`https://avatars.githubusercontent.com/u/${u.github_id}?v=4&s=28`}
                                alt="" width={22} height={22} style={{borderRadius: 11, flexShrink: 0}}
                            />
                            <span style={{
                                fontSize: 12, color: "#999", flex: 1, minWidth: 0,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                            {u.github_username}
                        </span>
                            {u.is_sponsor && <span style={{fontSize: 9, color: "#f59e0b"}}>Sponsor</span>}
                            <Select<MarketplaceRole>
                                value={u.role}
                                options={ROLE_OPTIONS}
                                disabled={busyId === u.github_id}
                                onChange={role => changeRole(u, role)}
                                size="sm"
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
