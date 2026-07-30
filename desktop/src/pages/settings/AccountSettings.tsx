import {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import {useAccount, roleAtLeast, type MarketplaceRole} from "../modules/useAccount";
import {getLicenseToken, gdprExport, gdprErase} from "../../lib/commands";
import {useSnackbar} from "../../components/Snackbar";
import {VanitySettings} from "./VanitySettings";
import {TeamsSettings} from "./TeamsSettings";

/**
 * GDPR self-service surface — Art. 15 export and Art. 17 erasure against the
 * licensing/marketplace account tied to this GitHub sign-in. Lives alongside
 * the other settings panels; see AboutSettings.tsx for the sign-in flow this
 * reuses (useAccount handles both).
 */
export function AccountSettings() {
    const {account, logout} = useAccount();
    const [exportOpen, setExportOpen] = useState(false);
    const [eraseOpen, setEraseOpen] = useState(false);

    if (!account.username) {
        return (
            <div style={{display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8}}>
                <p style={{fontSize: 13, fontWeight: 600, color: "#c0c0c0"}}>Account</p>
                <p style={{fontSize: 11, color: "#444", maxWidth: 380, lineHeight: 1.6}}>
                    Sign in via the About page to manage your marketplace account and its data.
                </p>
            </div>
        );
    }

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 18}}>
            {/* ── Profile ── */}
            <div className="flex items-center gap-4">
                <div style={{
                    width: 52, height: 52, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                    backgroundColor: "#161616", border: "1px solid #222",
                }}>
                    {account.avatarUrl ? (
                        <img src={account.avatarUrl} alt="" width={52} height={52}
                             style={{display: "block", width: "100%", height: "100%"}}/>
                    ) : (
                        <svg width="52" height="52" viewBox="0 0 24 24" fill="#333">
                            <path
                                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"/>
                        </svg>
                    )}
                </div>
                <div>
                    <p style={{fontSize: 13, fontWeight: 600, color: "#f1f1f1"}}>{account.username}</p>
                    <div style={{display: "flex", alignItems: "center", gap: 5, marginTop: 5, flexWrap: "wrap"}}>
                        <RoleBadge role={account.role} isOwner={account.isOwner}/>
                        {account.isSponsor && <Badge label="Sponsor" color="#ec4899"/>}
                    </div>
                </div>
            </div>

            <div style={{height: 1, backgroundColor: "#1e1e1e"}}/>

            {/* ── Marketplace vanity handle ── */}
            <VanitySettings/>

            <div style={{height: 1, backgroundColor: "#1e1e1e"}}/>

            {/* ── Standalone teams ── */}
            <TeamsSettings/>

            <div style={{height: 1, backgroundColor: "#1e1e1e"}}/>

            {/* ── GDPR self-service ── */}
            <div>
                <p style={{fontSize: 11, fontWeight: 700, color: "#666", letterSpacing: "0.04em", marginBottom: 4}}>
                    Your data
                </p>
                <p style={{fontSize: 11, color: "#444", lineHeight: 1.6, marginBottom: 12, maxWidth: 420}}>
                    Under GDPR you can request a copy of the data we hold on your account, or request its
                    erasure. See the Privacy Policy for full details.
                </p>
                <div style={{display: "flex", gap: 8}}>
                    <button onClick={() => setExportOpen(true)} style={btnStyle("ghost")}>Export My Data</button>
                    <button onClick={() => setEraseOpen(true)} style={btnStyle("danger")}>Erase My Data</button>
                </div>
            </div>

            {exportOpen && <ExportModal onClose={() => setExportOpen(false)}/>}
            {eraseOpen && (
                <EraseModal
                    onClose={() => setEraseOpen(false)}
                    onErased={() => {
                        setEraseOpen(false);
                        logout();
                    }}
                />
            )}
        </div>
    );
}

// ── Badges ────────────────────────────────────────────────────────────────────

function Badge({label, color}: { label: string; color: string }) {
    return (
        <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" as const,
            padding: "2px 7px", borderRadius: 4,
            backgroundColor: `${color}18`, color, border: `1px solid ${color}33`,
        }}>
            {label}
        </span>
    );
}

function RoleBadge({role, isOwner}: { role: MarketplaceRole; isOwner: boolean }) {
    if (isOwner) return <Badge label="Owner" color="var(--color-accent)"/>;
    if (roleAtLeast(role, "admin")) return <Badge label="Admin" color="#f59e0b"/>;
    if (roleAtLeast(role, "staff")) return <Badge label="Staff" color="#60a5fa"/>;
    if (roleAtLeast(role, "author")) return <Badge label="Author" color="#a78bfa"/>;
    return <Badge label="Member" color="#555"/>;
}

// ── Buttons ───────────────────────────────────────────────────────────────────

export function btnStyle(variant: "ghost" | "danger" | "primary"): React.CSSProperties {
    const styles: Record<typeof variant, React.CSSProperties> = {
        primary: {backgroundColor: "var(--color-accent)", color: "#fff", border: "none"},
        ghost: {backgroundColor: "#161616", color: "#888", border: "1px solid #222"},
        danger: {backgroundColor: "transparent", color: "#ef4444", border: "1px solid #3a1a1a"},
    };
    return {
        padding: "6px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
        ...styles[variant],
    };
}

// ── Shared modal chrome ──────────────────────────────────────────────────────

export function ModalShell({title, onClose, children}: {
    title: string;
    onClose: () => void;
    children: React.ReactNode
}) {
    return createPortal(
        <div style={{
            position: "fixed", inset: 0, zIndex: 9500, display: "flex",
            alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.75)",
        }} onClick={e => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <div style={{
                backgroundColor: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 12,
                width: 460, maxHeight: "80vh", display: "flex", flexDirection: "column",
                boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
            }}>
                <div style={{
                    padding: "14px 18px", borderBottom: "1px solid #181818",
                    display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
                }}>
                    <span style={{fontSize: 13, fontWeight: 700, color: "#ccc"}}>{title}</span>
                    <button onClick={onClose} style={{
                        width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                        background: "none", border: "none", cursor: "pointer", color: "#444", borderRadius: 4,
                    }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                    </button>
                </div>
                <div style={{overflowY: "auto", padding: "16px 18px", flex: 1}}>
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
}

// ── Export modal ──────────────────────────────────────────────────────────────

function ExportModal({onClose}: { onClose: () => void }) {
    const [state, setState] = useState<{ status: "loading" } | { status: "error"; msg: string } | {
        status: "ready";
        json: string
    }>({status: "loading"});
    const [copied, setCopied] = useState(false);
    const show = useSnackbar();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const token = await getLicenseToken();
                if (!token) {
                    if (!cancelled) setState({status: "error", msg: "Not signed in."});
                    return;
                }
                const data = await gdprExport(token);
                if (!cancelled) setState({status: "ready", json: JSON.stringify(data, null, 2)});
            } catch (e) {
                if (!cancelled) setState({status: "error", msg: String(e)});
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const copy = async () => {
        if (state.status !== "ready") return;
        await navigator.clipboard.writeText(state.json);
        setCopied(true);
        show({message: "Copied to clipboard", variant: "success"});
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <ModalShell title="Export My Data" onClose={onClose}>
            {state.status === "loading" && <p style={{fontSize: 12, color: "#444"}}>Requesting export…</p>}
            {state.status === "error" && <p style={{fontSize: 12, color: "#ef4444"}}>{state.msg}</p>}
            {state.status === "ready" && (
                <>
                    <pre style={{
                        fontSize: 10.5, lineHeight: 1.6, color: "#999", fontFamily: "monospace",
                        backgroundColor: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 6,
                        padding: "10px 12px", whiteSpace: "pre-wrap" as const, wordBreak: "break-all" as const,
                        margin: "0 0 12px", maxHeight: 380, overflowY: "auto",
                    }}>{state.json}</pre>
                    <button onClick={copy} style={btnStyle("ghost")}>{copied ? "Copied" : "Copy to clipboard"}</button>
                </>
            )}
        </ModalShell>
    );
}

// ── Erase modal ───────────────────────────────────────────────────────────────

function EraseModal({onClose, onErased}: { onClose: () => void; onErased: () => void }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const show = useSnackbar();

    const erase = async () => {
        setBusy(true);
        setErr(null);
        try {
            const token = await getLicenseToken();
            if (!token) {
                setErr("Not signed in.");
                setBusy(false);
                return;
            }
            const res = await gdprErase(token);
            show({message: res.message, variant: "success", duration: 6000});
            onErased();
        } catch (e) {
            setErr(String(e));
            setBusy(false);
        }
    };

    return (
        <ModalShell title="Erase My Data" onClose={onClose}>
            <p style={{fontSize: 12, color: "#999", lineHeight: 1.7, marginBottom: 10}}>
                This permanently deletes your licensing and marketplace account records — sponsor status,
                marketplace role, reviews, and votes are all removed.
            </p>
            <p style={{fontSize: 12, color: "#999", lineHeight: 1.7, marginBottom: 14}}>
                Packages you've submitted and reports you've filed are <strong
                style={{color: "#ccc"}}>retained</strong> as
                community/moderation records, but are unlinked from your identity. This cannot be undone,
                and you'll be signed out immediately afterward.
            </p>

            <label style={{display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 14, cursor: "pointer"}}>
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                       style={{marginTop: 2}}/>
                <span style={{fontSize: 11, color: "#777"}}>I understand this cannot be undone.</span>
            </label>

            {err && <p style={{fontSize: 11, color: "#ef4444", marginBottom: 10}}>{err}</p>}

            <div style={{display: "flex", gap: 8, justifyContent: "flex-end"}}>
                <button onClick={onClose} style={btnStyle("ghost")}>Cancel</button>
                <button onClick={erase} disabled={!confirmed || busy} style={{
                    ...btnStyle("danger"),
                    backgroundColor: confirmed ? "#ef4444" : "transparent",
                    color: confirmed ? "#fff" : "#ef4444",
                    opacity: busy ? 0.6 : 1,
                    cursor: !confirmed || busy ? "not-allowed" : "pointer",
                }}>
                    {busy ? "Erasing…" : "Erase my data"}
                </button>
            </div>
        </ModalShell>
    );
}
