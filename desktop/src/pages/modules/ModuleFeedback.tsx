import {useCallback, useEffect, useId, useState} from "react";
import {createPortal} from "react-dom";
import {getLicenseToken} from "../../lib/commands";
import {Turnstile} from "../../components/Turnstile";
import {
    mpDeleteReview,
    mpFetchReviews,
    mpPostReview,
    mpReportReview,
    mpVoteReviewHelpful,
    type ReportReason,
    type Review,
    type ReviewsResponse,
} from "./marketplace-api";
import {ReportModal} from "./shared";
import type {AccountState} from "./useAccount";

// ── Star rating display ───────────────────────────────────────────────────────

function Stars({value, max = 5, size = 12, interactive, onChange}: {
    value: number; max?: number; size?: number;
    interactive?: boolean; onChange?: (v: number) => void;
}) {
    const [hovered, setHovered] = useState(0);
    const display = interactive ? (hovered || value) : value;

    const star = (i: number) => {
        const filled = i < display;
        return (
            <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{flexShrink: 0}}>
                <path
                    d="M6 1l1.4 2.8 3.1.45-2.25 2.2.53 3.1L6 8.1l-2.78 1.45.53-3.1L1.5 4.25l3.1-.45z"
                    fill={filled ? "#f59e0b" : "none"}
                    stroke={filled ? "#f59e0b" : "#2a2a2a"}
                    strokeWidth="1"
                    strokeLinejoin="round"
                />
            </svg>
        );
    };

    // Interactive: real <button>s in a radiogroup — this is the only way to
    // submit a star rating at all, so keyboard-only Tab/Enter support isn't
    // optional. Non-interactive: a single aria-label on the group instead of
    // five unlabeled decorative SVGs, so a screen reader announces "4 out of
    // 5 stars" once rather than nothing meaningful at all.
    // inline-flex, not flex — a block-level flex box ignores a parent's
    // text-align:center (that only centers inline content), which is
    // exactly what made this row sit flush left in the rating-summary card
    // while the number/count text above and below it centered normally.
    // inline-flex is still a flex container internally, just one that
    // participates in inline layout like a piece of text would.
    if (!interactive) {
        return (
            <div role="img" aria-label={`${value} out of ${max} stars`} style={{display: "inline-flex", gap: 2}}>
                {Array.from({length: max}, (_, i) => <span key={i}>{star(i)}</span>)}
            </div>
        );
    }

    return (
        <div role="radiogroup" aria-label="Star rating" style={{display: "inline-flex", gap: 2}}>
            {Array.from({length: max}, (_, i) => (
                <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={value === i + 1}
                    aria-label={`${i + 1} star${i === 0 ? "" : "s"}`}
                    onMouseEnter={() => setHovered(i + 1)}
                    onMouseLeave={() => setHovered(0)}
                    onFocus={() => setHovered(i + 1)}
                    onBlur={() => setHovered(0)}
                    onClick={() => onChange?.(i + 1)}
                    style={{
                        display: "flex", padding: 2, margin: -2, background: "none", border: "none",
                        cursor: "pointer", borderRadius: 3,
                    }}
                >
                    {star(i)}
                </button>
            ))}
        </div>
    );
}

// ── Rating distribution bar ───────────────────────────────────────────────────

function RatingBar({star, count, total}: { star: number; count: number; total: number }) {
    const pct = total > 0 ? (count / total) * 100 : 0;
    return (
        <div style={{display: "flex", alignItems: "center", gap: 6, marginBottom: 3}}>
            <span style={{fontSize: 9, color: "#444", width: 6, textAlign: "right"}}>{star}</span>
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none" style={{flexShrink: 0}}>
                <path d="M6 1l1.4 2.8 3.1.45-2.25 2.2.53 3.1L6 8.1l-2.78 1.45.53-3.1L1.5 4.25l3.1-.45z"
                      fill="#f59e0b" stroke="#f59e0b" strokeWidth="1" strokeLinejoin="round"/>
            </svg>
            <div style={{flex: 1, height: 4, backgroundColor: "#1a1a1a", borderRadius: 2, overflow: "hidden"}}>
                <div style={{
                    width: `${pct}%`,
                    height: "100%",
                    backgroundColor: "#f59e0b",
                    borderRadius: 2,
                    transition: "width 0.3s"
                }}/>
            </div>
            <span style={{fontSize: 9, color: "#666", width: 14, textAlign: "right"}}>{count}</span>
        </div>
    );
}

// ── Single review card ────────────────────────────────────────────────────────

function ReviewCard({review, canDelete, onDelete, canVote, voting, myVote, onVote, onReport, isWide}: {
    review: Review; canDelete: boolean; onDelete: (id: number) => void;
    canVote: boolean; voting: boolean; myVote?: boolean;
    onVote: (id: number, helpful: boolean) => void;
    onReport: (id: number) => void;
    /** Rendered as a shelf card (bigger avatar, real card chrome) instead of
     *  a compact hairline-separated list row — see ModuleFeedback's wide
     *  branch, which puts these in a horizontal scroll shelf. */
    isWide?: boolean;
}) {
    const [delConfirm, setDelConfirm] = useState(false);
    const date = new Date(review.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });

    const deleteBtn = canDelete && (
        <button
            onClick={() => {
                if (!delConfirm) {
                    setDelConfirm(true);
                    return;
                }
                onDelete(review.id);
            }}
            style={{
                fontSize: 9, padding: "1px 6px", borderRadius: 6, cursor: "pointer",
                backgroundColor: delConfirm ? "#3a1a1a" : "transparent",
                color: delConfirm ? "#ef4444" : "#2a2a2a",
                border: `1px solid ${delConfirm ? "#3a1a1a" : "#222"}`,
            }}
        >
            {delConfirm ? "Confirm" : "Delete"}
        </button>
    );

    const voteRow = (
        <div style={{display: "flex", alignItems: "center", gap: 10, marginTop: isWide ? 10 : 6}}>
            <button
                onClick={() => onVote(review.id, true)}
                disabled={!canVote || voting}
                title={canVote ? "Mark as helpful" : "Sign in to vote"}
                style={myVote === true ? voteBtnActiveStyle : voteBtnStyle}
            >
                👍 {review.helpful_count}
            </button>
            <button
                onClick={() => onVote(review.id, false)}
                disabled={!canVote || voting}
                title={canVote ? "Mark as unhelpful" : "Sign in to vote"}
                style={myVote === false ? voteBtnActiveStyle : voteBtnStyle}
            >
                👎 {review.unhelpful_count}
            </button>
            {canVote && (
                <button
                    onClick={() => onReport(review.id)}
                    style={{
                        marginLeft: "auto", fontSize: 9, color: "#2a2a2a",
                        background: "none", border: "none", cursor: "pointer", padding: 0,
                    }}
                >
                    Report
                </button>
            )}
        </div>
    );

    if (isWide) {
        return (
            <div style={{
                height: "100%", boxSizing: "border-box", padding: "14px 16px",
                backgroundColor: "#0d0d10", border: "1px solid #1b1b20", borderRadius: 10,
            }}>
                <div style={{display: "flex", alignItems: "center", gap: 10}}>
                    <img
                        src={`https://avatars.githubusercontent.com/u/${review.github_id}?v=4&s=64`}
                        alt={review.username}
                        style={{width: 32, height: 32, borderRadius: "50%", flexShrink: 0}}
                    />
                    <div style={{flex: 1, minWidth: 0}}>
                        <div style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#ccc",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                        }}>
                            {review.username}
                        </div>
                        <div style={{display: "flex", alignItems: "center", gap: 6}}>
                            <Stars value={review.rating} size={10}/>
                            <span style={{fontSize: 9, color: "#444"}}>{date}</span>
                        </div>
                    </div>
                    {deleteBtn}
                </div>
                {review.body && (
                    <p style={{fontSize: 12, color: "#999", lineHeight: 1.6, margin: "10px 0 0"}}>
                        {review.body}
                    </p>
                )}
                {voteRow}
            </div>
        );
    }

    return (
        <div style={{
            padding: "10px 0", borderBottom: "1px solid #1a1a1a",
        }}>
            <div style={{display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4}}>
                <img
                    src={`https://avatars.githubusercontent.com/u/${review.github_id}?v=4&s=28`}
                    alt={review.username}
                    style={{width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1}}
                />
                <div style={{flex: 1, minWidth: 0}}>
                    <div style={{display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap"}}>
                        <span style={{fontSize: 11, fontWeight: 600, color: "#666"}}>{review.username}</span>
                        <Stars value={review.rating} size={10}/>
                        <span style={{fontSize: 9, color: "#2a2a2a", marginLeft: "auto"}}>{date}</span>
                        {deleteBtn}
                    </div>
                    {review.body && (
                        <p style={{fontSize: 11, color: "#555", lineHeight: 1.55, marginTop: 4, margin: "4px 0 0"}}>
                            {review.body}
                        </p>
                    )}
                    {voteRow}
                </div>
            </div>
        </div>
    );
}

const voteBtnStyle: React.CSSProperties = {
    fontSize: 10, color: "#444", background: "none", border: "1px solid #1e1e1e",
    borderRadius: 6, padding: "2px 7px", cursor: "pointer",
};
// Session-local memory of your own vote — the API doesn't echo back which way
// you voted, so this is the best available feedback until it does.
const voteBtnActiveStyle: React.CSSProperties = {
    ...voteBtnStyle,
    color: "var(--color-accent)",
    borderColor: "color-mix(in srgb, var(--color-accent) 40%, transparent)",
    backgroundColor: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
};

// ── Write / edit review — two-step modal ──────────────────────────────────────
// A star pick + a free-text field don't need to compete for space in a 260px
// sidebar column — giving each its own step, in a real modal, means each one
// gets room to breathe instead of being crammed into one cramped inline box.

function WriteReviewModal({moduleId, existing, ownerLabel, typeLabel, onClose, onSubmitted}: {
    moduleId: string; existing: Review | null; ownerLabel: string; typeLabel: string;
    onClose: () => void; onSubmitted: () => void;
}) {
    const [step, setStep] = useState<1 | 2>(1);
    const [rating, setRating] = useState(existing?.rating ?? 0);
    const [body, setBody] = useState(existing?.body ?? "");
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);

    const submit = async () => {
        if (rating < 1) {
            setErr("Pick a star rating first");
            return;
        }
        if (!captchaToken) {
            setErr("Complete the verification check first");
            return;
        }
        const token = await getLicenseToken();
        if (!token) {
            setErr("Not signed in");
            return;
        }
        setSaving(true);
        setErr(null);
        try {
            await mpPostReview(moduleId, rating, body.trim(), captchaToken, token);
            onSubmitted();
            onClose();
        } catch (e) {
            setErr(String(e));
        } finally {
            setSaving(false);
        }
    };

    // Escape-to-close — this modal builds its own chrome instead of going
    // through MModal, so it needs its own copy of the same fix.
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
                width: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
            }}>
                <div style={{padding: "18px 22px 0"}}>
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 4
                    }}>
                        <span id={titleId} style={{fontSize: 14, fontWeight: 700, color: "#ccc"}}>
                            {existing ? "Edit your review" : "Write a review"}
                        </span>
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
                        }}>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                                <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5"
                                      strokeLinecap="round"/>
                            </svg>
                        </button>
                    </div>
                    <div style={{display: "flex", gap: 4, marginBottom: 16}}>
                        {[1, 2].map(s => (
                            <div key={s} style={{
                                flex: 1, height: 3, borderRadius: 2,
                                backgroundColor: s <= step ? "var(--color-accent)" : "#1e1e1e",
                            }}/>
                        ))}
                    </div>
                </div>

                <div style={{padding: "4px 22px 22px", minHeight: 160, display: "flex", flexDirection: "column"}}>
                    {step === 1 ? (
                        <div style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 10,
                            padding: "12px 0"
                        }}>
                            <span style={{fontSize: 12, color: "#888"}}>How would you rate this {typeLabel}?</span>
                            <Stars value={rating} size={30} interactive onChange={setRating}/>
                            <span style={{
                                fontSize: 11,
                                color: "#444"
                            }}>{rating > 0 ? `${rating}/5` : "Tap a star to pick"}</span>
                        </div>
                    ) : (
                        <div style={{flex: 1, display: "flex", flexDirection: "column"}}>
                            <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 10}}>
                                <Stars value={rating} size={14}/>
                                <span style={{fontSize: 11, color: "#555"}}>{rating}/5</span>
                            </div>
                            <span style={{fontSize: 12, color: "#888", marginBottom: 8}}>
                                Tell us more <span style={{color: "#444"}}>(optional)</span>
                            </span>
                            <textarea
                                autoFocus
                                rows={5}
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                placeholder={`Share your experience with ${ownerLabel}'s ${typeLabel}…`}
                                style={{
                                    width: "100%", padding: "8px 10px", fontSize: 12,
                                    backgroundColor: "#111", color: "#aaa",
                                    border: "1px solid #222", borderRadius: 6, outline: "none",
                                    fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
                                    flex: 1, transition: "border-color 0.1s",
                                }}
                                onFocus={e => {
                                    e.currentTarget.style.borderColor = "var(--color-accent)";
                                }}
                                onBlur={e => {
                                    e.currentTarget.style.borderColor = "#222";
                                }}
                            />
                            <div style={{marginTop: 12}}>
                                <Turnstile onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)}/>
                            </div>
                        </div>
                    )}
                    {err && <p style={{fontSize: 11, color: "#ef4444", marginTop: 10}}>{err}</p>}
                </div>

                <div style={{
                    padding: "12px 22px", borderTop: "1px solid #181818",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                    {step === 2 ? (
                        <button onClick={() => setStep(1)} style={{
                            fontSize: 12, padding: "6px 14px", borderRadius: 6,
                            background: "transparent", color: "#666", border: "1px solid #222", cursor: "pointer",
                        }}>Back</button>
                    ) : (
                        <button onClick={onClose} style={{
                            fontSize: 12, padding: "6px 14px", borderRadius: 6,
                            background: "transparent", color: "#666", border: "1px solid #222", cursor: "pointer",
                        }}>Cancel</button>
                    )}
                    {step === 1 ? (
                        <button onClick={() => setStep(2)} disabled={rating < 1} style={{
                            fontSize: 12, fontWeight: 600, padding: "6px 18px", borderRadius: 6,
                            backgroundColor: rating < 1 ? "#1a1a1a" : "var(--color-accent)",
                            color: rating < 1 ? "#444" : "#fff", border: "none",
                            cursor: rating < 1 ? "not-allowed" : "pointer",
                        }}>Next</button>
                    ) : (
                        <button onClick={submit} disabled={saving || !captchaToken} style={{
                            fontSize: 12, fontWeight: 600, padding: "6px 18px", borderRadius: 6,
                            backgroundColor: (saving || !captchaToken) ? "#1a1a1a" : "var(--color-accent)",
                            color: (saving || !captchaToken) ? "#444" : "#fff", border: "none",
                            cursor: (saving || !captchaToken) ? "not-allowed" : "pointer",
                        }}>{saving ? "Saving…" : existing ? "Update" : "Submit"}</button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

function WriteReview({moduleId, existing, ownerLabel, typeLabel, onSubmitted}: {
    moduleId: string; existing: Review | null; ownerLabel: string; typeLabel: string; onSubmitted: () => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                style={{
                    fontSize: 11, fontWeight: 600, padding: "5px 14px", borderRadius: 6,
                    backgroundColor: "transparent", color: "#444",
                    border: "1px solid #2a2a2a", cursor: "pointer",
                }}
            >
                {existing ? "Edit your review" : "Write a review"}
            </button>
            {open && (
                <WriteReviewModal
                    moduleId={moduleId} existing={existing} ownerLabel={ownerLabel} typeLabel={typeLabel}
                    onClose={() => setOpen(false)} onSubmitted={onSubmitted}
                />
            )}
        </>
    );
}

// ── Module feedback section ───────────────────────────────────────────────────

export function ModuleFeedback({moduleId, account, ownerLabel, typeLabel, isWide}: {
    moduleId: string;
    account: AccountState;
    /** Team name if the package is team-owned, otherwise the individual
     *  author — never the reviewer's own username (that's `account`,
     *  a completely different person from whoever wrote the thing being
     *  reviewed). */
    ownerLabel: string;
    /** "module" / "library" / "bundle" — matches the package's actual
     *  package_type instead of a hardcoded "package" that was wrong for
     *  two out of three package types. */
    typeLabel: string;
    /** Mirrors ModuleDetail's own wide-tier breakpoint. */
    isWide?: boolean;
}) {
    const [data, setData] = useState<ReviewsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [votingId, setVotingId] = useState<number | null>(null);
    const [reportReviewId, setReportReviewId] = useState<number | null>(null);
    const [reportBusy, setReportBusy] = useState(false);
    const [reportErr, setReportErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await mpFetchReviews(moduleId));
        } catch {
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [moduleId]);

    useEffect(() => {
        load();
    }, [load]);

    // Reset when module changes
    useEffect(() => {
        setData(null);
    }, [moduleId]);

    const myReview = data?.reviews.find(r => r.username === account.username) ?? null;

    const [actionErr, setActionErr] = useState<string | null>(null);
    const [myVotes, setMyVotes] = useState<Record<number, boolean>>({});

    const handleDelete = async (reviewId: number) => {
        const token = await getLicenseToken();
        if (!token) {
            setActionErr("Not signed in");
            return;
        }
        setActionErr(null);
        try {
            await mpDeleteReview(reviewId, token);
            await load();
        } catch (e) {
            setActionErr(String(e));
        }
    };

    const handleVote = async (reviewId: number, helpful: boolean) => {
        const token = await getLicenseToken();
        if (!token) {
            setActionErr("Not signed in");
            return;
        }
        setActionErr(null);
        setVotingId(reviewId);
        try {
            await mpVoteReviewHelpful(reviewId, helpful, token);
            setMyVotes(v => ({...v, [reviewId]: helpful}));
            await load();
        } catch (e) {
            setActionErr(String(e));
        } finally {
            setVotingId(null);
        }
    };

    const submitReviewReport = async (reason: ReportReason, details: string, captchaToken: string) => {
        if (reportReviewId == null) return;
        const token = await getLicenseToken();
        if (!token) {
            setReportErr("Not signed in");
            return;
        }
        setReportBusy(true);
        setReportErr(null);
        try {
            await mpReportReview(reportReviewId, reason, details, captchaToken, token);
            setReportReviewId(null);
        } catch (e) {
            setReportErr(String(e));
        } finally {
            setReportBusy(false);
        }
    };

    return (
        <div style={{marginBottom: 24}}>
            {loading ? (
                <p style={{fontSize: 11, color: "#2a2a2a"}}>Loading reviews…</p>
            ) : !data ? (
                <p style={{fontSize: 11, color: "#2a2a2a"}}>Could not load reviews.</p>
            ) : isWide ? (
                // Wide: a genuinely different shape, not the same list+
                // sidebar just given more room — a compact horizontal
                // summary line (rating/distribution/write-review) instead
                // of a whole separate vertical block, and review cards in a
                // wrapping row instead of one narrow column. A horizontal
                // *scrolling* shelf (matching the screenshots filmstrip) was
                // tried first and was wrong for a different reason than
                // width: screenshots are glanced at, reviews are read, and
                // forcing a sideways scroll to reach the next one of those
                // is worse than just wrapping to a new row.
                <div>
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        flexWrap: "wrap", gap: 20, marginBottom: 16,
                    }}>
                        {data.count > 0 && (
                            <div style={{display: "flex", alignItems: "center", gap: 16}}>
                                <div style={{textAlign: "center"}}>
                                    <div style={{fontSize: 28, fontWeight: 700, color: "#f59e0b", lineHeight: 1}}>
                                        {data.avg_rating?.toFixed(1)}
                                    </div>
                                    <Stars value={Math.round(data.avg_rating ?? 0)} size={12}/>
                                </div>
                                <span style={{fontSize: 12, color: "#666"}}>
                                    {data.count} review{data.count !== 1 ? "s" : ""}
                                </span>
                                <div style={{display: "flex", flexDirection: "column", gap: 2, width: 160}}>
                                    {[5, 4, 3, 2, 1].map(s => (
                                        <RatingBar key={s} star={s} count={data.distribution[s] ?? 0}
                                                   total={data.count}/>
                                    ))}
                                </div>
                            </div>
                        )}
                        {account.username ? (
                            <WriteReview
                                moduleId={moduleId}
                                existing={myReview}
                                ownerLabel={ownerLabel}
                                typeLabel={typeLabel}
                                onSubmitted={load}
                            />
                        ) : !account.loading && (
                            <p style={{fontSize: 11, color: "#666", margin: 0}}>
                                Sign in to leave a review.
                            </p>
                        )}
                    </div>

                    {actionErr && <p style={{fontSize: 11, color: "#ef4444", marginBottom: 8}}>{actionErr}</p>}
                    {data.reviews.length === 0 ? (
                        <p style={{fontSize: 11, color: "#2a2a2a"}}>No reviews yet. Be the first!</p>
                    ) : (
                        // Wraps, doesn't scroll horizontally — a horizontal
                        // shelf was tried first, copying the screenshots
                        // filmstrip above, and that was a real interaction
                        // mistake: screenshots are glanced at/scanned, but
                        // reviews are text meant to be *read*, and forcing a
                        // sideways scroll to reach the next one is worse
                        // than just wrapping to a new row like a normal feed.
                        // Left-aligned, not centered — matches how every
                        // other section on this page anchors left; with few
                        // reviews there's blank space to the right and
                        // that's fine, the same way a store page with one
                        // review just shows one card.
                        <div style={{display: "flex", flexWrap: "wrap", gap: 14}}>
                            {data.reviews.map(r => (
                                <div key={r.id} style={{width: 340}}>
                                    <ReviewCard
                                        review={r}
                                        canDelete={account.isOwner || r.username === account.username}
                                        onDelete={handleDelete}
                                        canVote={!!account.username}
                                        voting={votingId === r.id}
                                        myVote={myVotes[r.id]}
                                        onVote={handleVote}
                                        onReport={setReportReviewId}
                                        isWide
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                // Regular/narrow: unchanged.
                <div style={{display: "flex", gap: 24, alignItems: "flex-start", justifyContent: "space-between"}}>
                    <div style={{minWidth: 0, maxWidth: 640, flex: "1 1 auto"}}>
                        {actionErr && <p style={{fontSize: 11, color: "#ef4444", marginBottom: 8}}>{actionErr}</p>}
                        {data.reviews.length === 0 ? (
                            <p style={{fontSize: 11, color: "#2a2a2a"}}>No reviews yet. Be the first!</p>
                        ) : (
                            <div>
                                {data.reviews.map(r => (
                                    <ReviewCard
                                        key={r.id}
                                        review={r}
                                        canDelete={account.isOwner || r.username === account.username}
                                        onDelete={handleDelete}
                                        canVote={!!account.username}
                                        voting={votingId === r.id}
                                        myVote={myVotes[r.id]}
                                        onVote={handleVote}
                                        onReport={setReportReviewId}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{width: 260, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14}}>
                        {data.count > 0 && (
                            <div style={{
                                padding: "12px 14px", borderRadius: 8,
                                backgroundColor: "#0d0d10", border: "1px solid #1b1b20",
                            }}>
                                <div style={{textAlign: "center", marginBottom: 10}}>
                                    <div style={{fontSize: 24, fontWeight: 700, color: "#f59e0b", lineHeight: 1}}>
                                        {data.avg_rating?.toFixed(1)}
                                    </div>
                                    <Stars value={Math.round(data.avg_rating ?? 0)} size={10}/>
                                    <div style={{
                                        fontSize: 9,
                                        color: "#666",
                                        marginTop: 3
                                    }}>{data.count} review{data.count !== 1 ? "s" : ""}</div>
                                </div>
                                {[5, 4, 3, 2, 1].map(s => (
                                    <RatingBar key={s} star={s} count={data.distribution[s] ?? 0} total={data.count}/>
                                ))}
                            </div>
                        )}

                        {account.username ? (
                            <WriteReview
                                moduleId={moduleId}
                                existing={myReview}
                                ownerLabel={ownerLabel}
                                typeLabel={typeLabel}
                                onSubmitted={load}
                            />
                        ) : !account.loading && (
                            <p style={{fontSize: 11, color: "#666", margin: 0}}>
                                Sign in to leave a review.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {reportReviewId != null && (
                <ReportModal
                    title="Report review"
                    kind="review"
                    busy={reportBusy}
                    err={reportErr}
                    onClose={() => setReportReviewId(null)}
                    onSubmit={submitReviewReport}
                />
            )}
        </div>
    );
}
