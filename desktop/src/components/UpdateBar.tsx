import {useEffect} from "react";
import type {UpdateInfo} from "../hooks/useUpdater";
import {useUpdater} from "../hooks/useUpdater";

// Simplified GD logo paths — the two "comet" arcs from the brand icon.
// Animated with a pulse while active.
function GDIcon({size = 16, pulse = false}: { size?: number; pulse?: boolean }) {
    // viewBox tightly bounds all visible paths: x 210–840, y 200–620
    return (
        <>
            <svg
                width={size}
                height={Math.round(size * 420 / 630)}
                viewBox="210 200 630 420"
                fill="none"
                style={pulse ? {animation: "gd-icon-pulse 1.4s ease-in-out infinite"} : undefined}
            >
                {/* main swirl arm */}
                <path
                    d="m469.74 601.96l-49.73-49.72c17.06-214.11 203.83-359.52 374.07-324.34 35.18 170.24-110.23 357-324.34 374.06z"
                    stroke="currentColor"
                    strokeWidth="28"
                />
                {/* trailing comet arc */}
                <path
                    d="m459.75 410.1c-132.14-62.5-224.22 42.74-196.42 149.43 56.93-65.83 99.07-73.86 176.04-25.37q10.19-62.03 20.38-124.06z"
                    stroke="currentColor"
                    strokeWidth="28"
                    opacity={0.45}
                />
            </svg>
            {pulse && (
                <style>{`
                    @keyframes gd-icon-pulse {
                        0%, 100% { opacity: 0.45; }
                        50%       { opacity: 1; }
                    }
                `}</style>
            )}
        </>
    );
}

function formatBytes(n: number): string {
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateBar() {
    const {state, check, download, dismiss} = useUpdater();

    // Auto-check 4 s after mount so it doesn't compete with startup.
    useEffect(() => {
        const t = setTimeout(check, 4000);
        return () => clearTimeout(t);
    }, [check]);

    if (state.phase === "idle") return null;

    const isDownloading = state.phase === "downloading";
    const progress =
        isDownloading && state.total
            ? Math.min(100, Math.round((state.downloaded / state.total) * 100))
            : null;

    const accentColor = "var(--color-accent)";
    const isError = state.phase === "error";

    return (
        <div
            style={{
                height: 40,
                backgroundColor: "#0f0f0f",
                borderTop: "1px solid #1a1a1a",
                display: "flex",
                alignItems: "center",
                paddingLeft: 14,
                paddingRight: 10,
                gap: 10,
                position: "relative",
                overflow: "hidden",
                flexShrink: 0,
            }}
        >
            {/* Download-progress background fill */}
            {isDownloading && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        right: "auto",
                        width: progress !== null ? `${progress}%` : "0%",
                        backgroundColor: `color-mix(in srgb, ${accentColor} 7%, transparent)`,
                        transition: "width 0.35s ease",
                        pointerEvents: "none",
                    }}
                />
            )}

            {/* Brand icon */}
            <div
                style={{
                    color: isError ? "#ef4444" : accentColor,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                }}
            >
                {isError ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        <path d="M8 7v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="8" cy="11.5" r="0.5" fill="currentColor"/>
                    </svg>
                ) : (
                    <GDIcon
                        size={16}
                        pulse={
                            state.phase === "checking" ||
                            state.phase === "downloading" ||
                            state.phase === "installing"
                        }
                    />
                )}
            </div>

            {/* Status text */}
            <span style={{fontSize: 12, flex: 1, position: "relative", whiteSpace: "nowrap", overflow: "hidden"}}>
                {state.phase === "checking" && (
                    <span style={{color: "#3a3a3a"}}>Checking for updates…</span>
                )}

                {state.phase === "available" && (
                    <>
                        <span style={{color: "#666"}}>v{state.info.version}</span>
                        <span style={{color: "#2e2e2e"}}> is available</span>
                    </>
                )}

                {isDownloading && (
                    <>
                        <span style={{color: "#555"}}>Downloading update</span>
                        {progress !== null && (
                            <span style={{color: accentColor, marginLeft: 6}}>{progress}%</span>
                        )}
                        {state.total != null && (
                            <span style={{color: "#2a2a2a", marginLeft: 5, fontSize: 11}}>
                                {formatBytes(state.downloaded)} / {formatBytes(state.total)}
                            </span>
                        )}
                    </>
                )}

                {state.phase === "installing" && (
                    <span style={{color: "#555"}}>Installing…</span>
                )}

                {isError && (
                    <span style={{color: "#5a2a2a"}} title={state.error}>
                        Update failed
                    </span>
                )}
            </span>

            {/* Action buttons */}
            <div style={{display: "flex", gap: 6, alignItems: "center", position: "relative", flexShrink: 0}}>
                {state.phase === "available" && (
                    <>
                        <DismissBtn onClick={dismiss}/>
                        <ActionBtn
                            label="Download"
                            accent
                            onClick={() => download(state.info as UpdateInfo)}
                        />
                    </>
                )}

                {isError && (
                    <>
                        <DismissBtn onClick={dismiss}/>
                        <ActionBtn label="Retry" onClick={check}/>
                    </>
                )}
            </div>
        </div>
    );
}

function DismissBtn({onClick}: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                fontSize: 13, lineHeight: 1, padding: "2px 5px",
                color: "#222", background: "none", border: "none", cursor: "pointer",
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.color = "#555";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.color = "#222";
            }}
        >
            ✕
        </button>
    );
}

function ActionBtn({
                       label,
                       accent = false,
                       onClick,
                   }: {
    label: string;
    accent?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "5px 11px",
                borderRadius: 5,
                backgroundColor: accent ? "var(--color-accent)" : "#181818",
                color: accent ? "#fff" : "#555",
                border: accent ? "none" : "1px solid #222",
                cursor: "pointer",
            }}
            onMouseEnter={(e) => {
                if (!accent) {
                    e.currentTarget.style.color = "#888";
                    e.currentTarget.style.borderColor = "#333";
                }
            }}
            onMouseLeave={(e) => {
                if (!accent) {
                    e.currentTarget.style.color = "#555";
                    e.currentTarget.style.borderColor = "#222";
                }
            }}
        >
            {label}
        </button>
    );
}
