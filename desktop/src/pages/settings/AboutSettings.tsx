import {useCallback, useEffect, useRef, useState} from "react";
import {getVersion} from "@tauri-apps/api/app";
import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import type {UpdateInfo} from "../../hooks/useUpdater";
import {useUpdater} from "../../hooks/useUpdater";
import {DISABLE_UPDATES_KEY} from "./DevelopmentSettings";

// ─── Types ────────────────────────────────────────────────────────────────────

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
    | { status: "awaiting" };

const APP_FLAIR = (import.meta.env.VITE_APP_FLAIR as string | undefined) ?? "nightly";
const FLAIR_COLOR: Record<string, string> = {
    stable: "#22c55e", beta: "#f59e0b", nightly: "#818cf8", dev: "#ec4899",
};

interface AboutSettingsProps {
    onShowChangelog: () => void;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function AboutSettings({onShowChangelog}: AboutSettingsProps) {
    const [version, setVersion] = useState("…");
    const [license, setLicense] = useState<LicenseState>({status: "idle"});
    const pendingState = useRef<string | null>(null);
    const {state: updateState, check, download, simulate, pause, resume, dismiss} = useUpdater();
    const updatesDisabled = localStorage.getItem(DISABLE_UPDATES_KEY) === "1";

    useEffect(() => {
        getVersion().then(setVersion).catch(() => {
        });
    }, []);

    useEffect(() => {
        if (updatesDisabled) return;
        const t = setTimeout(check, 1500);
        return () => clearTimeout(t);
    }, [check, updatesDisabled]);

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
                    expiresAt: res.expires_at ?? "",
                });
            } else {
                setLicense({status: "unverified", error: res.error ?? "License is no longer valid."});
            }
        } catch {
            setLicense({status: "unverified", error: "Could not connect to licensing server."});
        }
    }, []);

    useEffect(() => {
        checkLicense();
    }, [checkLicense]);

    useEffect(() => {
        const unlisten = listen<{ token: string; state: string }>(
            "license-token-received",
            async (event) => {
                const {token, state} = event.payload;
                if (pendingState.current && state !== pendingState.current) return;
                pendingState.current = null;
                await invoke("set_license_token", {token});
                checkLicense();
            },
        );
        return () => {
            unlisten.then((fn) => fn());
        };
    }, [checkLicense]);

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

    const effectiveUpdateState = updatesDisabled ? {phase: "idle" as const} : updateState;

    return (
        <div className="flex flex-col" style={{gap: 18}}>

            {/* ── Branding ── */}
            <div className="flex items-center gap-4">
                <img
                    src="/assets/logos/company-logo.png"
                    alt=""
                    className="flex-shrink-0 rounded-xl"
                    style={{
                        width: 56,
                        height: 56,
                        objectFit: "contain",
                        backgroundColor: "#0f0f0f",
                        border: "1px solid #1e1e1e"
                    }}
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                    }}
                />
                <div>
                    <p style={{fontSize: 13, fontWeight: 600, color: "#f1f1f1"}}>GD Level Request Bot</p>
                    <p style={{fontSize: 11, color: "#555", marginTop: 2}}>Supernova Software, LLC</p>
                    <div style={{display: "flex", alignItems: "center", gap: 6, marginTop: 6}}>
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

            {/* ── Update row ── */}
            <UpdateRow
                state={effectiveUpdateState}
                disabled={updatesDisabled}
                canSimulate={import.meta.env.DEV === true}
                onCheck={check}
                onDownload={download}
                onPause={pause}
                onResume={resume}
                onDismiss={dismiss}
                onSimulate={simulate}
            />

            {/* ── Cards ── */}
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10}}>
                <ChangelogCard version={version} onClick={onShowChangelog}/>
                <LicenseCard
                    license={license}
                    onLogin={startLogin}
                    onLogout={logout}
                    onRetry={checkLicense}
                />
            </div>

            <p style={{fontSize: 10, color: "#1a1a1a"}}>
                © {new Date().getFullYear()} Supernova Software, LLC
            </p>
        </div>
    );
}

// ─── Changelog card ───────────────────────────────────────────────────────────

function ChangelogCard({version, onClick}: { version: string; onClick: () => void }) {
    const [hovered, setHovered] = useState(false);
    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                position: "relative", overflow: "hidden",
                backgroundColor: hovered ? "#111" : "#0d0d0d",
                border: `1px solid ${hovered ? "#222" : "#181818"}`,
                borderRadius: 10, padding: "14px 14px 12px",
                textAlign: "left", cursor: "pointer",
                minHeight: 108, display: "flex", flexDirection: "column",
                transition: "background-color 0.15s, border-color 0.15s",
            }}
        >
            <span style={{
                position: "absolute", right: -8, bottom: -18,
                fontSize: 72, fontWeight: 900, lineHeight: 1,
                color: hovered ? "#ffffff0d" : "#ffffff07",
                letterSpacing: "-3px", userSelect: "none",
                fontVariantNumeric: "tabular-nums",
                transition: "color 0.15s",
                pointerEvents: "none",
            }}>
                {version}
            </span>
            <div style={{flex: 1, position: "relative"}}>
                <p style={{fontSize: 12, fontWeight: 600, color: "#c0c0c0", lineHeight: 1}}>What's New</p>
                <p style={{fontSize: 10, color: "#333", marginTop: 4}}>Release notes</p>
            </div>
            <span style={{
                alignSelf: "flex-end", fontSize: 18, lineHeight: 1, position: "relative",
                color: hovered ? "#444" : "#252525",
                transition: "color 0.15s, transform 0.15s",
                transform: hovered ? "translateX(2px)" : "none",
            }}>›</span>
        </button>
    );
}

// ─── License card ─────────────────────────────────────────────────────────────

function LicenseCard({license, onLogin, onLogout, onRetry}: {
    license: LicenseState;
    onLogin: () => void;
    onLogout: () => void;
    onRetry: () => void;
}) {
    const [hovered, setHovered] = useState(false);

    if (license.status === "verified") {
        const expiry = license.expiresAt
            ? new Date(license.expiresAt).toLocaleDateString(undefined, {month: "short", year: "numeric"})
            : null;

        const bg = license.isSponsor ? "#130a12" : "#0a130a";
        const border = license.isSponsor ? "#2a1428" : "#162416";
        const glow = license.isSponsor ? "#ec489908" : "#22c55e0a";
        const nameCol = license.isSponsor ? "#f0abda" : "#4ade80";
        const metaCol = license.isSponsor ? "#2a1228" : "#1a3a1a";

        return (
            <div style={{
                position: "relative", overflow: "hidden",
                backgroundColor: bg, border: `1px solid ${border}`,
                borderRadius: 10, padding: "14px 14px 12px",
                minHeight: 108, display: "flex", flexDirection: "column",
            }}>
                <div style={{
                    position: "absolute", top: -20, right: -20,
                    width: 80, height: 80, borderRadius: "50%",
                    backgroundColor: glow, pointerEvents: "none",
                }}/>
                <div style={{flex: 1, position: "relative"}}>
                    <div style={{display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap"}}>
                        <p style={{fontSize: 12, fontWeight: 600, color: nameCol, lineHeight: 1}}>
                            @{license.username}
                        </p>
                        {license.isSponsor && (
                            <span style={{
                                fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                                backgroundColor: "#ec489920", color: "#f472b6",
                                border: "1px solid #ec489930", letterSpacing: "0.04em",
                            }}>✦ sponsor</span>
                        )}
                    </div>
                    {expiry && <p style={{fontSize: 10, color: metaCol, marginTop: 4}}>until {expiry}</p>}
                </div>
                <button onClick={onLogout}
                        style={{
                            alignSelf: "flex-end",
                            fontSize: 10,
                            color: metaCol,
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = nameCol;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = metaCol;
                        }}>
                    Sign out
                </button>
            </div>
        );
    }

    if (license.status === "unverified") {
        return (
            <div style={{
                position: "relative", overflow: "hidden",
                backgroundColor: "#130a0a", border: "1px solid #2a1414",
                borderRadius: 10, padding: "14px 14px 12px",
                minHeight: 108, display: "flex", flexDirection: "column",
            }}>
                <div style={{flex: 1}}>
                    <p style={{fontSize: 12, fontWeight: 600, color: "#6a2a2a", lineHeight: 1}}>Invalid</p>
                    <p style={{fontSize: 10, color: "#3a1a1a", marginTop: 4, lineHeight: 1.4}}>
                        {license.error ?? "Token could not be verified."}
                    </p>
                </div>
                <div style={{display: "flex", gap: 6, marginTop: 10}}>
                    <button onClick={onLogin}
                            style={{
                                flex: 1,
                                fontSize: 10,
                                fontWeight: 600,
                                padding: "5px 0",
                                borderRadius: 5,
                                cursor: "pointer",
                                backgroundColor: "#1a1a1a",
                                color: "#555",
                                border: "1px solid #222"
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = "#999";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = "#555";
                            }}>
                        Sign in
                    </button>
                    <button onClick={onRetry}
                            style={{
                                fontSize: 10,
                                padding: "5px 10px",
                                borderRadius: 5,
                                cursor: "pointer",
                                backgroundColor: "#1a1a1a",
                                color: "#3a3a3a",
                                border: "1px solid #222"
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = "#666";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = "#3a3a3a";
                            }}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (license.status === "loading" || license.status === "awaiting") {
        return (
            <div style={{
                backgroundColor: "#0d0d0d", border: "1px solid #181818",
                borderRadius: 10, padding: "14px", minHeight: 108,
                display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 8,
            }}>
                <MiniSpinner/>
                <p style={{fontSize: 10, color: "#2a2a2a"}}>
                    {license.status === "awaiting" ? "waiting for browser…" : "checking…"}
                </p>
            </div>
        );
    }

    return (
        <button
            onClick={onLogin}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                position: "relative", overflow: "hidden",
                backgroundColor: hovered ? "#111" : "#0d0d0d",
                border: `1px solid ${hovered ? "#222" : "#181818"}`,
                borderRadius: 10, padding: "14px 14px 12px",
                textAlign: "left", cursor: "pointer",
                minHeight: 108, display: "flex", flexDirection: "column",
                transition: "background-color 0.15s, border-color 0.15s",
            }}
        >
            <div style={{flex: 1}}>
                <p style={{fontSize: 12, fontWeight: 600, color: "#444", lineHeight: 1}}>GitHub</p>
                <p style={{fontSize: 10, color: "#252525", marginTop: 4, lineHeight: 1.4}}>
                    Sign in to activate sponsor features
                </p>
            </div>
            <span style={{
                alignSelf: "flex-end", fontSize: 18, lineHeight: 1,
                color: hovered ? "#444" : "#222",
                transition: "color 0.15s",
            }}>›</span>
        </button>
    );
}

// ─── Update row ───────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtSpeed(bps: number): string {
    if (bps <= 0) return "";
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function fmtEta(sec: number): string {
    if (sec <= 0 || !isFinite(sec)) return "";
    if (sec < 60) return `${Math.ceil(sec)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.ceil(sec % 60);
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function fmtNotes(notes: string | null, maxLen = 120): string {
    if (!notes) return "";
    const first = notes.split("\n")[0].replace(/^[•\-*]\s*/, "");
    return first.length > maxLen ? first.slice(0, maxLen - 1) + "…" : first;
}

function GDMark({size = 15, pulse = false}: { size?: number; pulse?: boolean }) {
    return (
        <>
            <svg width={size} height={Math.round(size * 590 / 640)} viewBox="215 215 640 590" fill="none"
                 style={pulse ? {animation: "gd-about-pulse 1.4s ease-in-out infinite"} : undefined}>
                <path
                    d="m469.74 601.96l-49.73-49.72c17.06-214.11 203.83-359.52 374.07-324.34 35.18 170.24-110.23 357-324.34 374.06z"
                    stroke="currentColor" strokeWidth="28"/>
                <path
                    d="m459.75 410.1c-132.14-62.5-224.22 42.74-196.42 149.43 56.93-65.83 99.07-73.86 176.04-25.37q10.19-62.03 20.38-124.06z"
                    stroke="currentColor" strokeWidth="28" opacity={0.5}/>
                <path
                    d="m611.07 561.42c62.5 132.14-42.74 224.22-149.42 196.42 65.82-56.93 73.85-99.07 25.36-176.04q62.03-10.19 124.06-20.38z"
                    stroke="currentColor" strokeWidth="28" opacity={0.5}/>
            </svg>
            {pulse && <style>{`@keyframes gd-about-pulse{0%,100%{opacity:.35}50%{opacity:1}}`}</style>}
        </>
    );
}

function CheckIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="#22c55e" strokeWidth="1.4"/>
            <path d="M5.5 8l2 2L11 6" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    );
}

function WarningIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M8 7v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="11.5" r="0.6" fill="currentColor"/>
        </svg>
    );
}

function RefreshIcon() {
    return (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M2 8a6 6 0 0 1 6-6 6.5 6.5 0 0 1 4.5 1.8L14 5.3" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 2v3.5h-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                  strokeLinejoin="round"/>
            <path d="M14 8a6 6 0 0 1-6 6 6.5 6.5 0 0 1-4.5-1.8L2 10.7" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 14v-3.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                  strokeLinejoin="round"/>
        </svg>
    );
}


interface UpdateRowProps {
    state: ReturnType<typeof useUpdater>["state"];
    disabled: boolean;
    canSimulate: boolean;
    onCheck: () => void;
    onDownload: (info: UpdateInfo) => void;
    onPause: () => void;
    onResume: () => void;
    onDismiss: () => void;
    onSimulate: () => void;
}

function UpdateRow({
                       state,
                       disabled,
                       canSimulate,
                       onCheck,
                       onDownload,
                       onPause,
                       onResume,
                       onDismiss,
                       onSimulate
                   }: UpdateRowProps) {
    const accent = "var(--color-accent)";
    const [confirmingCancel, setConfirmingCancel] = useState(false);
    const {phase} = state;

    const isDownloading = phase === "downloading";
    const isAvailable = phase === "available";
    const isInstalling = phase === "installing";
    const isChecking = phase === "checking";
    const isError = phase === "error";
    const isIdle = phase === "idle";
    const isActive = isDownloading || isInstalling || isChecking;
    const hasBar = isDownloading || isInstalling;

    // ETA via time-weighted average (stable)
    let eta: number | null = null;
    if (isDownloading && state.total && state.startedAt) {
        const elapsed = (Date.now() - state.startedAt) / 1000;
        if (elapsed > 1 && state.downloaded > 0) {
            eta = ((state.total - state.downloaded) / state.downloaded) * elapsed;
        }
    }

    const progress = isDownloading && state.total
        ? Math.min(100, (state.downloaded / state.total) * 100)
        : null;

    const borderColor = isError ? "#2a1414" : "#191919";

    useEffect(() => {
        if (!isDownloading) setConfirmingCancel(false);
    }, [isDownloading]);

    return (
        <div style={{
            position: "relative", overflow: "hidden",
            backgroundColor: "#0f0f0f",
            border: `1px solid ${borderColor}`,
            // Remove bottom border when bar is present — the bar becomes the visual bottom edge
            borderBottom: hasBar ? "none" : `1px solid ${borderColor}`,
            borderRadius: 8,
        }}>

            {/* Background progress wash */}
            {isDownloading && progress !== null && (
                <div style={{
                    position: "absolute", top: 0, left: 0, bottom: 0,
                    width: `${progress}%`,
                    backgroundColor: `color-mix(in srgb, ${accent} 5%, transparent)`,
                    transition: "width 0.35s ease",
                    pointerEvents: "none",
                }}/>
            )}

            <div style={{
                display: "flex",
                alignItems: isDownloading || (isAvailable && !!(state as {
                    info?: UpdateInfo
                }).info?.notes) ? "flex-start" : "center",
                gap: 10,
                padding: "10px 12px",
            }}>
                {/* Icon */}
                <div style={{
                    flexShrink: 0, display: "flex", alignItems: "center",
                    paddingTop: isDownloading ? 2 : 0,
                    color: isError ? "#5a2020" : (isIdle && !disabled) ? "#22c55e" : accent,
                }}>
                    {(isIdle || disabled) ? <CheckIcon/>
                        : isError ? <WarningIcon/>
                            : <GDMark size={15} pulse={isActive}/>}
                </div>

                {/* Text */}
                <div style={{flex: 1, minWidth: 0}}>

                    {/* idle / disabled */}
                    {(isIdle || disabled) && (
                        <span style={{fontSize: 12, color: disabled ? "#2a2a2a" : "#2a4a2a"}}>
                            {disabled ? "Update checks disabled" : "Up to date"}
                        </span>
                    )}

                    {/* checking */}
                    {isChecking && (
                        <span style={{fontSize: 12, color: "#3a3a3a"}}>Checking for updates…</span>
                    )}

                    {/* available */}
                    {isAvailable && (() => {
                        const info = (state as { info: UpdateInfo }).info;
                        const snippet = fmtNotes(info.notes);
                        return (
                            <div>
                                <div style={{display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap"}}>
                                    <span style={{fontSize: 12, fontWeight: 600, color: "#b89030"}}>
                                        v{info.version}
                                    </span>
                                    <span style={{fontSize: 12, color: "#3a3a3a"}}>is available</span>
                                    {info._sim && (
                                        <span
                                            style={{fontSize: 9, color: "#2a2a2a", letterSpacing: "0.04em"}}>sim</span>
                                    )}
                                </div>
                                {snippet && (
                                    <p style={{fontSize: 10, color: "#2c2816", marginTop: 4, lineHeight: 1.5}}>
                                        {snippet}
                                    </p>
                                )}
                            </div>
                        );
                    })()}

                    {/* downloading — two-column: label+size left, speed+eta right */}
                    {isDownloading && (() => {
                        const dl = state as Extract<typeof state, { phase: "downloading" }>;
                        const speed = fmtSpeed(dl.speed);
                        const etaStr = eta !== null ? fmtEta(eta) : null;
                        const pct = progress !== null ? Math.round(progress) : null;
                        return (
                            <div style={{
                                display: "flex",
                                alignItems: "flex-start",
                                justifyContent: "space-between",
                                gap: 12
                            }}>
                                {/* Left */}
                                <div>
                                    <div style={{display: "flex", alignItems: "center", gap: 6}}>
                                        <span style={{fontSize: 12, color: "#4a4a4a"}}>Downloading</span>
                                        {dl.info.version && dl.info.version !== "sim" && (
                                            <span style={{fontSize: 12, color: "#3a3a3a"}}>v{dl.info.version}</span>
                                        )}
                                    </div>
                                    {dl.total != null && (
                                        <p style={{fontSize: 10, color: "#252525", marginTop: 3}}>
                                            {fmtBytes(dl.downloaded)} of {fmtBytes(dl.total)}
                                            {pct !== null && (
                                                <span style={{color: accent, marginLeft: 6}}>{pct}%</span>
                                            )}
                                        </p>
                                    )}
                                </div>
                                {/* Right — speed + ETA */}
                                {(speed || etaStr) && (
                                    <div style={{textAlign: "right", flexShrink: 0}}>
                                        {speed && <p style={{fontSize: 11, color: "#333"}}>{speed}</p>}
                                        {etaStr &&
                                            <p style={{fontSize: 10, color: "#222", marginTop: 2}}>~{etaStr} left</p>}
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* installing */}
                    {isInstalling && (
                        <div>
                            <span style={{fontSize: 12, color: "#444"}}>Applying update…</span>
                            <p style={{fontSize: 10, color: "#222", marginTop: 3}}>
                                The app will restart automatically.
                            </p>
                        </div>
                    )}

                    {/* error */}
                    {isError && (
                        <div>
                            <span style={{fontSize: 12, color: "#5a2020"}}>Could not check for updates</span>
                            {state.error && (
                                <p style={{
                                    fontSize: 10,
                                    color: "#2e1414",
                                    marginTop: 2,
                                    fontFamily: "monospace",
                                    wordBreak: "break-all"
                                }}>
                                    {state.error}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Buttons */}
                <div style={{flexShrink: 0, display: "flex", gap: 6, alignItems: "center"}}>
                    {isIdle && !disabled && (
                        <>
                            {canSimulate && <GhostBtn onClick={onSimulate} label="Simulate" dim/>}
                            <GhostBtn onClick={onCheck} label="Check"/>
                        </>
                    )}
                    {isAvailable && (
                        <>
                            {/* Refresh re-checks rather than dismissing */}
                            <button
                                onClick={onCheck}
                                title="Re-check"
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "5px 7px",
                                    borderRadius: 5,
                                    cursor: "pointer",
                                    backgroundColor: "#161616",
                                    color: "#2a2a2a",
                                    border: "1px solid #191919"
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "#555";
                                    e.currentTarget.style.borderColor = "#2a2a2a";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "#2a2a2a";
                                    e.currentTarget.style.borderColor = "#191919";
                                }}
                            >
                                <RefreshIcon/>
                            </button>
                            <AccentBtn onClick={() => onDownload((state as { info: UpdateInfo }).info)}
                                       label="Download"/>
                        </>
                    )}
                    {isDownloading && (
                        confirmingCancel ? (
                            <>
                                <button
                                    onClick={() => {
                                        setConfirmingCancel(false);
                                        onResume();
                                    }}
                                    style={{
                                        fontSize: 11,
                                        padding: "4px 9px",
                                        borderRadius: 5,
                                        cursor: "pointer",
                                        backgroundColor: "#161616",
                                        color: "#444",
                                        border: "1px solid #1e1e1e"
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.color = "#888";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.color = "#444";
                                    }}
                                >Keep going
                                </button>
                                <button
                                    onClick={() => {
                                        setConfirmingCancel(false);
                                        onDismiss();
                                    }}
                                    style={{
                                        fontSize: 11,
                                        padding: "4px 9px",
                                        borderRadius: 5,
                                        cursor: "pointer",
                                        backgroundColor: "#1e0a0a",
                                        color: "#c04040",
                                        border: "1px solid #2e1212"
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.color = "#e05050";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.color = "#c04040";
                                    }}
                                >Cancel
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => {
                                    setConfirmingCancel(true);
                                    onPause();
                                }}
                                style={{
                                    fontSize: 13,
                                    lineHeight: 1,
                                    padding: "3px 6px",
                                    color: "#1e1e1e",
                                    background: "none",
                                    border: "1px solid transparent",
                                    borderRadius: 5,
                                    cursor: "pointer"
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "#3a3a3a";
                                    e.currentTarget.style.borderColor = "#252525";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "#1e1e1e";
                                    e.currentTarget.style.borderColor = "transparent";
                                }}
                            >✕</button>
                        )
                    )}
                    {isError && <GhostBtn onClick={onCheck} label="Retry"/>}
                </div>
            </div>

            {/* Progress bar — replaces the bottom border */}
            {isDownloading && (
                <div style={{height: 3, backgroundColor: "#0a0a0a"}}>
                    <div style={{
                        height: "100%",
                        width: progress !== null ? `${progress}%` : "0%",
                        background: `linear-gradient(to right, ${accent}66, ${accent})`,
                        transition: "width 0.35s ease",
                    }}/>
                </div>
            )}
            {isInstalling && (
                <>
                    <div style={{
                        height: 3,
                        background: `linear-gradient(90deg, transparent, ${accent}88, ${accent}cc, ${accent}88, transparent)`,
                        backgroundSize: "200% 100%",
                        animation: "install-sweep 1.6s ease-in-out infinite"
                    }}/>
                    <style>{`@keyframes install-sweep{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>
                </>
            )}
        </div>
    );
}

function GhostBtn({onClick, label, dim = false}: { onClick: () => void; label: string; dim?: boolean }) {
    return (
        <button onClick={onClick} style={{
            fontSize: 11, padding: "5px 10px", borderRadius: 5, cursor: "pointer",
            backgroundColor: "#161616",
            color: dim ? "#252525" : "#333",
            border: `1px solid ${dim ? "#181818" : "#1e1e1e"}`,
        }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#666";
                    e.currentTarget.style.borderColor = "#2a2a2a";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.color = dim ? "#252525" : "#333";
                    e.currentTarget.style.borderColor = dim ? "#181818" : "#1e1e1e";
                }}>
            {label}
        </button>
    );
}

function AccentBtn({onClick, label}: { onClick: () => void; label: string }) {
    return (
        <button onClick={onClick} style={{
            fontSize: 11, fontWeight: 600, padding: "5px 11px", borderRadius: 5,
            backgroundColor: "var(--color-accent)", color: "#fff", border: "none", cursor: "pointer",
        }}>{label}</button>
    );
}

function MiniSpinner() {
    return (
        <>
            <div style={{
                width: 14, height: 14, borderRadius: "50%",
                border: "1.5px solid #1e1e1e", borderTopColor: "var(--color-accent)",
                animation: "mini-spin 0.65s linear infinite",
            }}/>
            <style>{`@keyframes mini-spin{to{transform:rotate(360deg)}}`}</style>
        </>
    );
}
