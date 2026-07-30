import React, {useEffect, useId, useState} from "react";
import {createPortal} from "react-dom";
import {MARKETPLACE_CATEGORIES, type MarketplaceCategory, REPORT_REASONS, type ReportReason} from "./marketplace-api";
import {Select} from "../../components/ui/Select";
import {Turnstile} from "../../components/Turnstile";

// ── Category picker ───────────────────────────────────────────────────────────

const NONE_CATEGORY = "__none__" as const;
type CategoryOptionValue = MarketplaceCategory | typeof NONE_CATEGORY;

const CATEGORY_OPTIONS: { value: CategoryOptionValue; label: string }[] = [
    {value: NONE_CATEGORY, label: "None"},
    ...MARKETPLACE_CATEGORIES.map(c => ({value: c as CategoryOptionValue, label: c})),
];

/** Category picker with a "None" option mapping to `undefined`. Shared by the
 *  create/submit forms and the admin metadata-edit panel. */
export function MCategoryField({value, onChange, cols}: {
    value: MarketplaceCategory | undefined;
    onChange: (v: MarketplaceCategory | undefined) => void;
    cols?: React.CSSProperties["gridColumn"];
}) {
    return (
        <div style={{marginBottom: 12, gridColumn: cols}}>
            <label style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#555",
                letterSpacing: "0.04em",
                display: "block",
                marginBottom: 4
            }}>
                Category
            </label>
            <Select<CategoryOptionValue>
                value={value ?? NONE_CATEGORY}
                options={CATEGORY_OPTIONS}
                onChange={v => onChange(v === NONE_CATEGORY ? undefined : v)}
            />
        </div>
    );
}

export const inp: React.CSSProperties = {
    width: "100%", padding: "6px 10px", fontSize: 12, backgroundColor: "#111", color: "#aaa",
    border: "1px solid #242424", borderRadius: 6, outline: "none", fontFamily: "inherit",
    resize: "vertical" as const, boxSizing: "border-box",
};

export function MField({label, value, onChange, multi, placeholder, hint, cols}: {
    label: string; value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    multi?: boolean; placeholder?: string; hint?: string;
    cols?: React.CSSProperties["gridColumn"];
}) {
    return (
        <div style={{marginBottom: 12, gridColumn: cols}}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4}}>
                <label style={{fontSize: 10, fontWeight: 600, color: "#555", letterSpacing: "0.04em"}}>{label}</label>
                {hint && <span style={{fontSize: 9, color: "#666"}}>{hint}</span>}
            </div>
            {multi
                ? <textarea rows={3} value={value} onChange={onChange} style={inp} placeholder={placeholder}
                            onFocus={e => {
                                e.currentTarget.style.borderColor = "var(--color-accent)";
                            }}
                            onBlur={e => {
                                e.currentTarget.style.borderColor = "#242424";
                            }}/>
                : <input value={value} onChange={onChange} style={inp} placeholder={placeholder}
                         onFocus={e => {
                             e.currentTarget.style.borderColor = "var(--color-accent)";
                         }}
                         onBlur={e => {
                             e.currentTarget.style.borderColor = "#242424";
                         }}/>
            }
        </div>
    );
}

export function MSep({label}: { label: string }) {
    return (
        <div style={{display: "flex", alignItems: "center", gap: 10, margin: "4px 0 14px"}}>
            <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase" as const, color: "#2e2e2e", flexShrink: 0,
            }}>
                {label}
            </span>
            <div style={{flex: 1, height: 1, backgroundColor: "#1a1a1a"}}/>
        </div>
    );
}

export function MModal({title, subtitle, onClose, onSubmit, submitLabel, busy, submitDisabled, err, children}: {
    title: string; subtitle?: React.ReactNode;
    onClose: () => void; onSubmit: () => void; submitLabel: string;
    busy: boolean; submitDisabled?: boolean; err: string | null; children: React.ReactNode;
}) {
    // Escape-to-close — every modal in the app goes through this component,
    // so this is the one place to add it rather than wiring it into each
    // caller. Backdrop click was the only way to dismiss before this.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);
    const titleId = useId();

    return createPortal(
        <div style={{
            position: "fixed", inset: 0, zIndex: 9000, display: "flex",
            alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.75)",
        }} onClick={e => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={{
                backgroundColor: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 12,
                width: 480, maxHeight: "88vh", display: "flex", flexDirection: "column",
                boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
            }}>
                <div style={{padding: "18px 20px 0", flexShrink: 0}}>
                    <div style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 4
                    }}>
                        <span id={titleId} style={{fontSize: 14, fontWeight: 700, color: "#ccc"}}>{title}</span>
                        <button onClick={onClose} aria-label="Close" style={{
                            width: 22,
                            height: 22,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#555",
                            borderRadius: 6,
                            flexShrink: 0,
                        }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.color = "#888";
                                    e.currentTarget.style.backgroundColor = "#1a1a1a";
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.color = "#555";
                                    e.currentTarget.style.backgroundColor = "transparent";
                                }}
                        >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                                <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5"
                                      strokeLinecap="round"/>
                            </svg>
                        </button>
                    </div>
                    {subtitle && <div style={{fontSize: 11, color: "#3a3a3a", marginBottom: 16}}>{subtitle}</div>}
                    <div style={{height: 1, backgroundColor: "#181818", margin: "0 -20px"}}/>
                </div>
                <div style={{overflowY: "auto", padding: "16px 20px", flex: 1}}>
                    {children}
                </div>
                <div style={{
                    padding: "12px 20px", borderTop: "1px solid #181818",
                    display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
                }}>
                    {err ? <span style={{fontSize: 11, color: "#ef4444"}}>{err}</span> : <span/>}
                    <div style={{display: "flex", gap: 8}}>
                        <button onClick={onClose} style={{
                            padding: "6px 16px", fontSize: 12, background: "transparent", color: "#444",
                            border: "1px solid #222", borderRadius: 6, cursor: "pointer",
                        }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.color = "#777";
                                    e.currentTarget.style.borderColor = "#333";
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.color = "#444";
                                    e.currentTarget.style.borderColor = "#222";
                                }}
                        >Cancel
                        </button>
                        <button onClick={onSubmit} disabled={busy || submitDisabled} style={{
                            padding: "6px 20px",
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: (busy || submitDisabled) ? "#1a1a1a" : "var(--color-accent)",
                            color: (busy || submitDisabled) ? "#444" : "#fff",
                            border: "none",
                            borderRadius: 6,
                            cursor: (busy || submitDisabled) ? "not-allowed" : "pointer",
                        }}>{busy ? "…" : submitLabel}</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ── Report modal (module + review reports) ───────────────────────────────────

/** A review is text, not shipped code or a download — "Malicious code",
 *  "Broken / doesn't work", and "Copyright violation" describe things a
 *  *package* can be, not something a review can be, so they only ever
 *  applied to the "report module" flow. Reusing the full module reason
 *  list for reviews left half the picker offering options that couldn't
 *  possibly match what's being reported. */
const REVIEW_REPORT_REASONS = REPORT_REASONS.filter(r => r.value === "spam" || r.value === "inappropriate" || r.value === "other");

/** Reason picker + free-text details, wrapped in the shared MModal chrome.
 *  Reused for both "report module" and "report review" flows. Gated behind
 *  a Turnstile check — reports are anonymous-ish moderation signals, the
 *  exact kind of low-effort action worth making bots pay a small cost for. */
export function ReportModal({title, kind, onSubmit, onClose, busy, err}: {
    title: string;
    /** Which reason list applies — a review can't be "malicious code" or
     *  "broken," those only make sense for the package itself. */
    kind: "module" | "review";
    onSubmit: (reason: ReportReason, details: string, captchaToken: string) => void;
    onClose: () => void;
    busy: boolean;
    err: string | null;
}) {
    const reasons = kind === "review" ? REVIEW_REPORT_REASONS : REPORT_REASONS;
    const [reason, setReason] = useState<ReportReason>("spam");
    const [details, setDetails] = useState("");
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);

    return (
        <MModal
            title={title}
            onClose={onClose}
            onSubmit={() => {
                if (captchaToken) onSubmit(reason, details.trim(), captchaToken);
            }}
            submitLabel="Submit report"
            busy={busy}
            submitDisabled={!captchaToken}
            err={err}
        >
            <div style={{marginBottom: 12}}>
                <label style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#555",
                    letterSpacing: "0.04em",
                    display: "block",
                    marginBottom: 4
                }}>
                    Reason
                </label>
                <Select<ReportReason>
                    value={reason}
                    options={reasons}
                    onChange={setReason}
                />
            </div>
            <MField
                label="Details (optional)"
                value={details}
                onChange={e => setDetails(e.target.value)}
                multi
                placeholder="Add any extra context that would help a moderator…"
            />
            <div style={{marginTop: 12}}>
                <Turnstile onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)}/>
            </div>
        </MModal>
    );
}

export type MPackageType = "module" | "library" | "package";

export function MTypeToggle({value, onChange}: { value: MPackageType; onChange: (v: MPackageType) => void }) {
    const types: MPackageType[] = ["module", "library", "package"];
    return (
        <div style={{marginBottom: 12}}>
            <label style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#555",
                letterSpacing: "0.04em",
                display: "block",
                marginBottom: 4
            }}>Type</label>
            <div style={{
                display: "flex",
                gap: 0,
                border: "1px solid #242424",
                borderRadius: 6,
                overflow: "hidden",
                width: "fit-content"
            }}>
                {types.map((t, i) => (
                    <button key={t} onClick={() => onChange(t)} style={{
                        padding: "5px 16px", fontSize: 11, fontWeight: value === t ? 600 : 400,
                        background: value === t ? "#1e1e1e" : "transparent",
                        color: value === t ? "#aaa" : "#3a3a3a",
                        border: "none", cursor: "pointer",
                        borderRight: i < types.length - 1 ? "1px solid #242424" : "none",
                    }}>{t}</button>
                ))}
            </div>
        </div>
    );
}
