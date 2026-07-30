import {useCallback, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {computePosition, flip, offset, shift} from "@floating-ui/dom";
import {getLicenseToken} from "../../lib/commands";
import {
    mpAddTeamMember,
    mpCreateTeam,
    mpMyTeams,
    mpRemoveTeamMember,
    mpSearchUsers,
    mpTeamMembers,
    type Team,
    type TeamMember,
    type UserSearchResult,
} from "../modules/marketplace-api";
import {btnStyle, ModalShell} from "./AccountSettings";
import {Turnstile} from "../../components/Turnstile";

const VANITY_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

function validateVanity(v: string): string | null {
    if (v.length < 3) return "Must be at least 3 characters.";
    if (v.length > 32) return "Must be at most 32 characters.";
    if (!VANITY_RE.test(v)) return "Lowercase letters, numbers, and hyphens only — can't start or end with a hyphen.";
    return null;
}

const fieldInputStyle: React.CSSProperties = {
    width: "100%", backgroundColor: "#111", color: "#f1f1f1", border: "1px solid #2a2a2a",
    padding: "8px 10px", fontSize: 12, borderRadius: 6, outline: "none",
    fontFamily: "inherit", boxSizing: "border-box" as const,
};

function fieldLabel(text: string) {
    return (
        <label style={{
            fontSize: 10,
            fontWeight: 600,
            color: "#555",
            letterSpacing: "0.04em",
            display: "block",
            marginBottom: 4
        }}>
            {text}
        </label>
    );
}

/**
 * Standalone teams — own entity with an immutable vanity and a member
 * roster, separate from a single package's flat co-owner list (that's
 * TeamPanel in ModuleDetail.tsx). A team can own many packages over time
 * via SubmitPackageData.team_id.
 */
export function TeamsSettings() {
    const [teams, setTeams] = useState<Team[] | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [manageTeam, setManageTeam] = useState<Team | null>(null);

    const load = useCallback(async () => {
        const token = await getLicenseToken();
        if (!token) {
            setTeams([]);
            return;
        }
        try {
            setTeams(await mpMyTeams(token));
        } catch (e) {
            setErr(String(e));
            setTeams([]);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div>
            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4}}>
                <p style={{fontSize: 11, fontWeight: 700, color: "#666", letterSpacing: "0.04em"}}>
                    My teams
                </p>
                <button onClick={() => setCreateOpen(true)} style={btnStyle("ghost")}>Create a team</button>
            </div>
            <p style={{fontSize: 11, color: "#444", lineHeight: 1.6, marginBottom: 10, maxWidth: 420}}>
                A team can submit and own packages under its own vanity, shared across its members.
            </p>

            {teams === null && <p style={{fontSize: 11, color: "#444"}}>Loading…</p>}
            {teams !== null && teams.length === 0 && (
                <p style={{fontSize: 11, color: "#2a2a2a"}}>You're not a member of any team yet.</p>
            )}
            {teams !== null && teams.length > 0 && (
                <div style={{display: "flex", flexDirection: "column", gap: 6}}>
                    {teams.map(t => (
                        <div key={t.id} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 10px", borderRadius: 7,
                            backgroundColor: "#0e0e0e", border: "1px solid #1e1e1e",
                        }}>
                            <div style={{flex: 1, minWidth: 0}}>
                                <p style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: "#ccc",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap"
                                }}>
                                    {t.name}
                                </p>
                                <p style={{fontSize: 10, color: "#3a3a3a"}}>{t.vanity}</p>
                            </div>
                            <button onClick={() => setManageTeam(t)} style={btnStyle("ghost")}>Manage</button>
                        </div>
                    ))}
                </div>
            )}

            {err && <p style={{fontSize: 11, color: "#ef4444", marginTop: 8}}>{err}</p>}

            {createOpen && (
                <CreateTeamModal
                    onClose={() => setCreateOpen(false)}
                    onCreated={() => {
                        setCreateOpen(false);
                        load();
                    }}
                />
            )}
            {manageTeam && (
                <ManageTeamModal team={manageTeam} onClose={() => setManageTeam(null)}/>
            )}
        </div>
    );
}

// ── Create team modal ────────────────────────────────────────────────────────

function CreateTeamModal({onClose, onCreated}: { onClose: () => void; onCreated: () => void }) {
    const [vanity, setVanity] = useState("");
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);

    const submit = async () => {
        const v = vanity.trim().toLowerCase();
        const vErr = validateVanity(v);
        if (vErr) {
            setErr(vErr);
            return;
        }
        if (!name.trim()) {
            setErr("Team name is required.");
            return;
        }
        if (!captchaToken) {
            setErr("Please complete the verification check.");
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
            await mpCreateTeam(v, name.trim(), captchaToken, token);
            onCreated();
        } catch (e) {
            setErr(String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <ModalShell title="Create a team" onClose={onClose}>
            <div style={{marginBottom: 12}}>
                {fieldLabel("Team vanity")}
                <input value={vanity} onChange={e => {
                    setVanity(e.target.value);
                    setErr(null);
                }}
                       placeholder="my-team" style={fieldInputStyle}/>
                <p style={{fontSize: 10, color: "#3a3a3a", marginTop: 4}}>
                    Chosen once at creation. <strong style={{color: "#a0a0a0"}}>Cannot be changed afterward.</strong>
                </p>
            </div>
            <div style={{marginBottom: 16}}>
                {fieldLabel("Display name")}
                <input value={name} onChange={e => {
                    setName(e.target.value);
                    setErr(null);
                }}
                       placeholder="My Team" style={fieldInputStyle}/>
            </div>

            <div style={{marginBottom: 16}}>
                <Turnstile onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)}/>
            </div>

            {err && <p style={{fontSize: 11, color: "#ef4444", marginBottom: 10}}>{err}</p>}

            <div style={{display: "flex", gap: 8, justifyContent: "flex-end"}}>
                <button onClick={onClose} style={btnStyle("ghost")}>Cancel</button>
                <button onClick={submit} disabled={busy} style={{...btnStyle("primary"), opacity: busy ? 0.6 : 1}}>
                    {busy ? "Creating…" : "Create team"}
                </button>
            </div>
        </ModalShell>
    );
}

// ── Manage team modal (roster) ───────────────────────────────────────────────

function ManageTeamModal({team, onClose}: { team: Team; onClose: () => void }) {
    const [members, setMembers] = useState<TeamMember[] | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [adding, setAdding] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        const token = await getLicenseToken();
        if (!token) {
            setErr("Not signed in.");
            return;
        }
        try {
            setMembers(await mpTeamMembers(team.id, token));
        } catch (e) {
            setErr(String(e));
        }
    }, [team.id]);

    useEffect(() => {
        load();
    }, [load]);

    const add = async (user: UserSearchResult) => {
        const token = await getLicenseToken();
        if (!token) {
            setErr("Not signed in.");
            return;
        }
        setAdding(true);
        setErr(null);
        try {
            await mpAddTeamMember(team.id, user.github_id, token);
            await load();
        } catch (e) {
            setErr(String(e));
        } finally {
            setAdding(false);
        }
    };

    const remove = async (githubId: number) => {
        const token = await getLicenseToken();
        if (!token) {
            setErr("Not signed in.");
            return;
        }
        setBusyId(githubId);
        setErr(null);
        try {
            await mpRemoveTeamMember(team.id, githubId, token);
            await load();
        } catch (e) {
            setErr(String(e));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <ModalShell title={`Manage "${team.name}"`} onClose={onClose}>
            <p style={{fontSize: 10, color: "#3a3a3a", marginBottom: 14}}>{team.vanity}</p>

            <label style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#555",
                letterSpacing: "0.05em",
                textTransform: "uppercase" as const,
                display: "block",
                marginBottom: 5
            }}>
                Members
            </label>
            {members === null ? (
                <p style={{fontSize: 11, color: "#2a2a2a", marginBottom: 16}}>Loading…</p>
            ) : (
                <div style={{display: "flex", flexDirection: "column", gap: 6, marginBottom: 16}}>
                    {members.length === 0 && <p style={{fontSize: 11, color: "#2a2a2a"}}>No members yet</p>}
                    {members.map(m => (
                        <div key={m.github_id} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "7px 10px", borderRadius: 7,
                            backgroundColor: "#0e0e0e", border: "1px solid #1e1e1e",
                        }}>
                            <img
                                src={`https://avatars.githubusercontent.com/u/${m.github_id}?v=4&s=48`}
                                alt="" width={24} height={24}
                                style={{
                                    borderRadius: "50%",
                                    flexShrink: 0,
                                    backgroundColor: "#161616",
                                    border: "1px solid #222"
                                }}
                                onError={e => {
                                    e.currentTarget.style.visibility = "hidden";
                                }}
                            />
                            <span style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: "#999",
                                flex: 1,
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                            }}>
                                {m.github_username ? m.github_username : `#${m.github_id}`}
                            </span>
                            <span style={{fontSize: 10, color: "#3a3a3a", flexShrink: 0}}>
                                since {new Date(m.added_at).toLocaleDateString()}
                            </span>
                            <button
                                onClick={() => remove(m.github_id)}
                                disabled={members.length <= 1 || busyId === m.github_id}
                                style={{
                                    ...btnStyle("danger"),
                                    opacity: members.length <= 1 || busyId === m.github_id ? 0.4 : 1,
                                    cursor: members.length <= 1 || busyId === m.github_id ? "not-allowed" : "pointer",
                                }}
                            >
                                {busyId === m.github_id ? "…" : "Remove"}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div style={{marginBottom: 4}}>
                {fieldLabel("Add member")}
                <div style={{display: "flex", gap: 6, alignItems: "center"}}>
                    <TeamMemberSearchField onPick={add} disabled={adding}/>
                    {adding && <span style={{fontSize: 10, color: "#444", flexShrink: 0}}>Adding…</span>}
                </div>
                <p style={{fontSize: 10, color: "#2a2a2a", marginTop: 6}}>
                    Search by GitHub username. They must have signed into the marketplace at least once.
                </p>
            </div>

            {err && <p style={{fontSize: 11, color: "#ef4444", marginTop: 10}}>{err}</p>}
        </ModalShell>
    );
}

// ── Username search (team member picker) ────────────────────────────────────
// Same interaction pattern as UserSearchField in ModuleDetail.tsx (debounced
// search, floating-ui positioned, portaled dropdown) — kept local here rather
// than shared since the two pickers live in unrelated flows (package
// co-owners vs. team roster) and each is small enough to not be worth the
// coupling of a shared abstraction.

function TeamMemberSearchField({onPick, disabled}: { onPick: (u: UserSearchResult) => void; disabled?: boolean }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<UserSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({top: -9999, left: -9999, width: 0});
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const reqId = useRef(0);

    const reposition = useCallback(() => {
        if (!inputRef.current || !menuRef.current) return;
        computePosition(inputRef.current, menuRef.current, {
            placement: "bottom-start",
            middleware: [offset(4), flip(), shift({padding: 8})],
        }).then(({x, y}) => setPos({top: y, left: x, width: inputRef.current!.offsetWidth}));
    }, []);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            setOpen(false);
            return;
        }
        const id = ++reqId.current;
        setSearching(true);
        const t = setTimeout(async () => {
            const token = await getLicenseToken();
            if (!token) {
                setSearching(false);
                return;
            }
            try {
                const r = await mpSearchUsers(q, token);
                if (id === reqId.current) {
                    setResults(r);
                    setOpen(true);
                }
            } catch { /* transient search failure — just show no results */
            } finally {
                if (id === reqId.current) setSearching(false);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [query]);

    useEffect(() => {
        if (!open) return;
        reposition();
        const close = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open, reposition, results]);

    const pick = (u: UserSearchResult) => {
        onPick(u);
        setQuery("");
        setResults([]);
        setOpen(false);
    };

    return (
        <div style={{position: "relative", flex: 1}}>
            <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => {
                    if (results.length > 0) setOpen(true);
                }}
                placeholder="Search by GitHub username…"
                disabled={disabled}
                style={fieldInputStyle}
            />
            {open && createPortal(
                <div ref={menuRef} style={{
                    position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999,
                    backgroundColor: "#111", border: "1px solid #242424", borderRadius: 8,
                    padding: "4px 0", maxHeight: 220, overflowY: "auto",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.8)",
                }}>
                    {searching && <div style={{padding: "6px 10px", fontSize: 11, color: "#444"}}>Searching…</div>}
                    {!searching && results.length === 0 && (
                        <div style={{padding: "6px 10px", fontSize: 11, color: "#444"}}>No matching users</div>
                    )}
                    {results.map(u => (
                        <button
                            key={u.github_id}
                            type="button"
                            onClick={() => pick(u)}
                            style={{
                                display: "block", width: "100%", textAlign: "left",
                                padding: "6px 10px", fontSize: 11, color: "#aaa",
                                background: "none", border: "none", cursor: "pointer",
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = "#1a1a1a";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = "transparent";
                            }}
                        >
                            {u.github_username}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
}
