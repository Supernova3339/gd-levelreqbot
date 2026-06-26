import {useCallback, useEffect, useRef, useState} from "react";
import {getVersion} from "@tauri-apps/api/app";
import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {CloseIcon} from "./icons";

interface VerifyResponse {
    valid: boolean;
    is_sponsor?: boolean;
    github_username?: string;
    expires_at?: string;
    error?: string;
}

type LicenseState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "verified"; username: string; isSponsor: boolean; expiresAt: string }
    | { status: "unverified"; error?: string }
    | { status: "awaiting" };  // waiting for browser callback

const APP_FLAIR = (import.meta.env.VITE_APP_FLAIR as string | undefined) ?? "nightly";
const FLAIR_COLOR: Record<string, string> = {
    stable: "#22c55e", beta: "#f59e0b", nightly: "#818cf8", dev: "#ec4899",
};

interface AboutModalProps {
    open: boolean;
    onClose: () => void;
    onShowChangelog: () => void;
}

export function AboutModal({open, onClose, onShowChangelog}: AboutModalProps) {
    const [version, setVersion] = useState("…");
    const [license, setLicense] = useState<LicenseState>({status: "idle"});
    const pendingState = useRef<string | null>(null);
    const backdropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getVersion().then(setVersion).catch(() => {
        });
    }, []);

    const checkLicense = useCallback(async () => {
        setLicense({status: "loading"});
        try {
            const token = await invoke<string | null>("get_license_token");
            if (!token) {
                setLicense({status: "idle"});
                return;
            }
            const res = await invoke<VerifyResponse>("verify_license_token", {token});
            if (res.valid) {
                setLicense({
                    status: "verified",
                    username: res.github_username ?? "?",
                    isSponsor: res.is_sponsor ?? false,
                    expiresAt: res.expires_at ?? ""
                });
            } else {
                setLicense({status: "unverified", error: res.error ?? "License is no longer valid."});
            }
        } catch {
            setLicense({status: "unverified", error: "Could not connect to licensing server."});
        }
    }, []);

    useEffect(() => {
        if (open) checkLicense();
    }, [open, checkLicense]);

    // Listen for the token callback from the browser OAuth flow
    useEffect(() => {
        if (!open) return;
        const unlisten = listen<{ token: string; state: string }>("license-token-received", async (event) => {
            const {token, state} = event.payload;
            // Validate that the state matches what we sent (CSRF protection)
            if (pendingState.current && state !== pendingState.current) return;
            pendingState.current = null;
            await invoke("set_license_token", {token});
            checkLicense();
        });
        return () => {
            unlisten.then((fn) => fn());
        };
    }, [open, checkLicense]);

    const startLogin = async () => {
        const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map((b) => b.toString(16).padStart(2, "0")).join("");
        pendingState.current = state;
        setLicense({status: "awaiting"});
        try {
            await invoke("open_github_login", {state});
        } catch {
            setLicense({status: "unverified", error: "Could not open browser."});
        }
    };

    const logout = async () => {
        await invoke("clear_license_token").catch(() => {
        });
        setLicense({status: "idle"});
    };

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose]);

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
                     width: 440, backgroundColor: "#141414",
                     border: "1px solid #2a2a2a",
                     boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
                 }}>

                {/* Header */}
                <div className="flex items-center justify-between px-5"
                     style={{height: 44, borderBottom: "1px solid #1e1e1e"}}>
                    <span className="text-sm font-semibold" style={{color: "#f1f1f1"}}>About</span>
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

                {/* Content */}
                <div className="flex flex-col gap-6 p-6">

                    {/* Branding */}
                    <div className="flex items-center gap-4">
                        <img src="/assets/logos/company-logo.png" alt="Supernova Software"
                             className="flex-shrink-0 rounded-xl"
                             style={{
                                 width: 64, height: 64, objectFit: "contain",
                                 backgroundColor: "#0f0f0f", border: "1px solid #1e1e1e"
                             }}
                             onError={(e) => {
                                 (e.target as HTMLImageElement).style.display = "none";
                             }}/>
                        <div>
                            <p className="text-sm font-semibold" style={{color: "#f1f1f1"}}>GD Level Request Bot</p>
                            <p className="text-xs mt-0.5" style={{color: "#555"}}>Supernova Software, LLC</p>
                            <div className="flex items-center gap-1.5 mt-2">
                                <span style={{fontSize: 11, color: "#444"}}>v{version}</span>
                                <span style={{
                                    fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                                    textTransform: "uppercase", padding: "1px 5px", borderRadius: 4,
                                    backgroundColor: `${FLAIR_COLOR[APP_FLAIR] ?? "#818cf8"}18`,
                                    color: FLAIR_COLOR[APP_FLAIR] ?? "#818cf8",
                                    border: `1px solid ${FLAIR_COLOR[APP_FLAIR] ?? "#818cf8"}33`,
                                }}>
                  {APP_FLAIR}
                </span>
                            </div>
                        </div>
                    </div>

                    {/* What's New */}
                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{color: "#444"}}>
                            Changelog
                        </p>
                        <button onClick={() => {
                            onClose();
                            onShowChangelog();
                        }}
                                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-left w-full"
                                style={{backgroundColor: "#111", border: "1px solid #1e1e1e"}}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = "var(--color-accent)44";
                                    e.currentTarget.style.backgroundColor = "#141414";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = "#1e1e1e";
                                    e.currentTarget.style.backgroundColor = "#111";
                                }}>
                            <div>
                                <p className="text-xs font-semibold" style={{color: "#d0d0d0"}}>What's New</p>
                                <p className="text-xs mt-0.5" style={{color: "#555"}}>See what changed in this
                                    version</p>
                            </div>
                            <span style={{color: "#333", fontSize: 16, lineHeight: 1}}>›</span>
                        </button>
                    </div>

                    {/* License */}
                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{color: "#444"}}>
                            License
                        </p>
                        <LicensePanel license={license} onLogin={startLogin} onLogout={logout} onRetry={checkLicense}/>
                    </div>

                </div>

                {/* Footer */}
                <div className="px-6 py-3 flex items-center justify-between flex-shrink-0"
                     style={{borderTop: "1px solid #1e1e1e"}}>
                    <p className="text-xs" style={{color: "#2a2a2a"}}>
                        © {new Date().getFullYear()} Supernova Software, LLC
                    </p>
                    <button onClick={onClose} className="text-xs px-3 py-1.5 rounded"
                            style={{
                                backgroundColor: "#1a1a1a",
                                color: "#888",
                                border: "1px solid #2a2a2a",
                                cursor: "pointer"
                            }}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── License panel ────────────────────────────────────────────────────────────

function GitHubIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink: 0}}>
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577
        0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729
        1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93
        0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405
        1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22
        0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286
        0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/>
        </svg>
    );
}

interface LicensePanelProps {
    license: LicenseState;
    onLogin: () => void;
    onLogout: () => void;
    onRetry: () => void;
}

function Spinner14() {
    return (
        <>
            <div style={{
                width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                border: "2px solid #1e1e1e", borderTopColor: "var(--color-accent)",
                animation: "spin14 0.65s linear infinite",
            }}/>
            <style>{`@keyframes spin14{to{transform:rotate(360deg)}}`}</style>
        </>
    );
}

function LicensePanel({license, onLogin, onLogout, onRetry}: LicensePanelProps) {
    const panelBase: React.CSSProperties = {
        backgroundColor: "#0f0f0f", border: "1px solid #1e1e1e",
        borderRadius: 8, padding: "10px 12px",
    };

    if (license.status === "loading") {
        return (
            <div className="flex items-center gap-2" style={panelBase}>
                <Spinner14/>
                <span className="text-xs" style={{color: "#444"}}>Checking license…</span>
            </div>
        );
    }

    if (license.status === "awaiting") {
        return (
            <div className="flex items-center gap-2" style={panelBase}>
                <Spinner14/>
                <span className="text-xs" style={{color: "#555"}}>Complete sign-in in your browser…</span>
            </div>
        );
    }

    if (license.status === "verified") {
        const expiry = license.expiresAt
            ? new Date(license.expiresAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric"
            })
            : null;
        return (
            <div className="flex items-center justify-between gap-3"
                 style={{...panelBase, backgroundColor: "#0a1a0a", border: "1px solid #1a3a1a"}}>
                <div className="flex items-center gap-2.5 min-w-0">
                    <div style={{width: 7, height: 7, borderRadius: "50%", backgroundColor: "#22c55e", flexShrink: 0}}/>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5" style={{minWidth: 0}}>
                            <p className="text-xs font-semibold truncate" style={{color: "#d0d0d0", minWidth: 0}}>
                                @{license.username}
                            </p>
                            {license.isSponsor && (
                                <span style={{
                                    flexShrink: 0, fontSize: 9, fontWeight: 700, whiteSpace: "nowrap",
                                    backgroundColor: "#14260e", color: "#4ade80", border: "1px solid #1d3d14",
                                    padding: "1px 5px", borderRadius: 3,
                                }}>
                  sponsor
                </span>
                            )}
                        </div>
                        {expiry && <p style={{fontSize: 10, color: "#2a4a2a", marginTop: 1}}>Renews {expiry}</p>}
                    </div>
                </div>
                <button onClick={onLogout} style={{
                    color: "#2a3a2a",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    padding: 0,
                    flexShrink: 0
                }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#555";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#2a3a2a";
                        }}>
                    Sign out
                </button>
            </div>
        );
    }

    if (license.status === "unverified") {
        return (
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2"
                     style={{...panelBase, backgroundColor: "#1a0a0a", border: "1px solid #3a1010"}}>
                    <div style={{width: 7, height: 7, borderRadius: "50%", backgroundColor: "#ef4444", flexShrink: 0}}/>
                    <p className="text-xs" style={{color: "#888"}}>{license.error ?? "License invalid."}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onLogin}
                            className="flex items-center gap-1.5 flex-1 justify-center text-xs py-2 rounded-lg"
                            style={{
                                backgroundColor: "#111",
                                color: "#777",
                                border: "1px solid #1e1e1e",
                                cursor: "pointer",
                                fontWeight: 600
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = "#2a2a2a";
                                e.currentTarget.style.color = "#c0c0c0";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = "#1e1e1e";
                                e.currentTarget.style.color = "#777";
                            }}>
                        <GitHubIcon/> Sign in again
                    </button>
                    <button onClick={onRetry}
                            className="text-xs px-3 py-2 rounded-lg"
                            style={{
                                backgroundColor: "#111",
                                color: "#444",
                                border: "1px solid #1e1e1e",
                                cursor: "pointer"
                            }}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // idle — no stored token
    return (
        <button onClick={onLogin} className="flex items-center gap-2.5 w-full text-left"
                style={{...panelBase, cursor: "pointer"}}
                onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#2a2a2a";
                    e.currentTarget.style.backgroundColor = "#111";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#1e1e1e";
                    e.currentTarget.style.backgroundColor = "#0f0f0f";
                }}>
            <span style={{color: "#444"}}><GitHubIcon/></span>
            <div>
                <p className="text-xs font-semibold" style={{color: "#c0c0c0"}}>Sign in with GitHub</p>
                <p style={{fontSize: 10, color: "#444", marginTop: 1}}>Sponsors get access to premium features</p>
            </div>
        </button>
    );
}
