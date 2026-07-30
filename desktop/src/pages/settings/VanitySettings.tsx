import {useEffect, useState} from "react";
import {getLicenseToken} from "../../lib/commands";
import {mpFetchMe, mpSetVanity} from "../modules/marketplace-api";
import {btnStyle} from "./AccountSettings";

const VANITY_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

/** Client-side mirror of the server's format check — UX only, the server is
 *  still the source of truth (and enforces the one-time-set rule with a 409). */
function validateVanity(v: string): string | null {
    if (v.length < 3) return "Must be at least 3 characters.";
    if (v.length > 32) return "Must be at most 32 characters.";
    if (!VANITY_RE.test(v)) return "Lowercase letters, numbers, and hyphens only — can't start or end with a hyphen.";
    return null;
}

const fieldInputStyle: React.CSSProperties = {
    backgroundColor: "#111", color: "#f1f1f1", border: "1px solid #2a2a2a",
    padding: "8px 10px", fontSize: 12, borderRadius: 6, outline: "none",
    fontFamily: "inherit", width: 220, boxSizing: "border-box" as const,
};

/**
 * One-time, immutable namespace slug for the signed-in account — prefixes
 * future package submission IDs (e.g. "supernova.my-module"). useAccount()
 * doesn't carry vanity, so this fetches /me itself the same way the GDPR
 * export modal fetches its export — via getLicenseToken() + a direct call.
 */
export function VanitySettings() {
    // undefined = still loading, null = signed in but no vanity yet, string = set.
    const [vanity, setVanityState] = useState<string | null | undefined>(undefined);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const token = await getLicenseToken();
            if (!token) {
                if (!cancelled) setVanityState(null);
                return;
            }
            try {
                const me = await mpFetchMe(token);
                if (!cancelled) setVanityState(me.vanity);
            } catch {
                if (!cancelled) setVanityState(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const submit = async () => {
        const v = input.trim().toLowerCase();
        const vErr = validateVanity(v);
        if (vErr) {
            setErr(vErr);
            return;
        }
        const token = await getLicenseToken();
        if (!token) {
            setErr("Not signed in.");
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            const res = await mpSetVanity(v, token);
            setVanityState(res.vanity);
        } catch (e) {
            setErr(String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <p style={{fontSize: 11, fontWeight: 700, color: "#666", letterSpacing: "0.04em", marginBottom: 4}}>
                Vanity handle
            </p>

            {vanity === undefined && (
                <p style={{fontSize: 11, color: "#444"}}>Loading…</p>
            )}

            {vanity !== undefined && vanity !== null && (
                <div style={{display: "flex", alignItems: "center", gap: 8}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{flexShrink: 0}}>
                        <rect x="5" y="11" width="14" height="9" rx="2" stroke="#555" strokeWidth="1.8"/>
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#555" strokeWidth="1.8"/>
                    </svg>
                    <p style={{fontSize: 12, color: "#999"}}>
                        Your vanity: <strong style={{color: "#f1f1f1"}}>{vanity}</strong>
                    </p>
                </div>
            )}
            {vanity !== undefined && vanity !== null && (
                <p style={{fontSize: 10, color: "#3a3a3a", marginTop: 4}}>
                    Vanity handles cannot be changed once set.
                </p>
            )}

            {vanity === null && (
                <>
                    <p style={{fontSize: 11, color: "#444", lineHeight: 1.6, marginBottom: 10, maxWidth: 420}}>
                        Reserve the namespace your future package submissions will use
                        (e.g. "{input.trim() || "yourname"}.my-module").{" "}
                        <strong style={{color: "#a0a0a0"}}>This cannot be changed once set.</strong>
                    </p>
                    <div style={{display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap"}}>
                        <input
                            value={input}
                            onChange={e => {
                                setInput(e.target.value);
                                setErr(null);
                            }}
                            placeholder="supernova"
                            style={fieldInputStyle}
                            onFocus={e => {
                                e.currentTarget.style.borderColor = "var(--color-accent)";
                            }}
                            onBlur={e => {
                                e.currentTarget.style.borderColor = "#2a2a2a";
                            }}
                        />
                        <button
                            onClick={submit}
                            disabled={busy || !input.trim()}
                            style={{
                                ...btnStyle("primary"),
                                opacity: busy || !input.trim() ? 0.5 : 1,
                                cursor: busy || !input.trim() ? "not-allowed" : "pointer",
                            }}
                        >
                            {busy ? "Setting…" : "Set vanity handle"}
                        </button>
                    </div>
                    {err && <p style={{fontSize: 11, color: "#ef4444", marginTop: 8}}>{err}</p>}
                </>
            )}
        </div>
    );
}
