import React, {useEffect, useState} from "react";
import {getLicenseToken} from "../../lib/commands";
import {
    captchaFields,
    mpFetchMe,
    mpMyTeams,
    mpSubmitPackage,
    type SubmitPackageData,
    type Team
} from "./marketplace-api";
import {MCategoryField, MField, MModal, type MPackageType, MSep, MTypeToggle} from "./shared";
import {MIconPicker} from "./MIconPicker";
import {Turnstile} from "../../components/Turnstile";

type FormData = Omit<SubmitPackageData, "author" | "id" | "captcha_token">;

export function SubmitModal({username, initialType, onClose, onSuccess}: {
    username: string;
    initialType?: MPackageType;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [form, setForm] = useState<FormData>({
        name: "", description: "",
        package_type: initialType ?? "module", icon: "custom",
        version: "1.0.0", download_url: "", checksum: "", changelog: "",
        min_app_version: "0.1.0",
    });
    const [idSuffix, setIdSuffix] = useState("");
    const [tags, setTags] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);

    // undefined = still loading; null = signed in but no vanity set yet.
    const [vanity, setVanity] = useState<string | null | undefined>(undefined);
    const [teams, setTeams] = useState<Team[]>([]);
    const [submitAs, setSubmitAs] = useState<"self" | number>("self");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const token = await getLicenseToken();
            if (!token) {
                if (!cancelled) {
                    setVanity(null);
                    setTeams([]);
                }
                return;
            }
            try {
                const [me, myTeams] = await Promise.all([mpFetchMe(token), mpMyTeams(token)]);
                if (cancelled) return;
                setVanity(me.vanity);
                setTeams(myTeams);
            } catch {
                if (!cancelled) {
                    setVanity(null);
                    setTeams([]);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const selectedTeam = typeof submitAs === "number" ? teams.find(t => t.id === submitAs) ?? null : null;
    const prefix = submitAs === "self" ? (vanity ?? null) : selectedTeam?.vanity ?? null;
    const loadingIdentity = vanity === undefined;
    const blocked = !loadingIdentity && submitAs === "self" && !vanity;

    const set = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({...f, [key]: e.target.value}));

    const submit = async () => {
        if (blocked || loadingIdentity || !prefix) {
            setErr("A vanity handle is required to submit");
            return;
        }
        const suffix = idSuffix.trim();
        if (!suffix) {
            setErr('"id" is required');
            return;
        }
        const required: (keyof FormData)[] = ["name", "description", "version", "download_url"];
        for (const f of required) {
            if (!form[f]?.toString().trim()) {
                setErr(`"${f}" is required`);
                return;
            }
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
        setBusy(true);
        setErr(null);
        try {
            await mpSubmitPackage({
                ...form,
                id: `${prefix}.${suffix}`,
                author: username,
                tags: tags.split(",").map(t => t.trim()).filter(Boolean),
                team_id: typeof submitAs === "number" ? submitAs : undefined,
                ...captchaFields(captchaToken),
            }, token);
            onSuccess();
        } catch (e) {
            setErr(String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <MModal
            title="Submit a package"
            subtitle={<>Publishing as <strong style={{color: "#666"}}>{username}</strong> · goes to review queue</>}
            onClose={onClose} onSubmit={submit}
            submitLabel="Submit for review" busy={busy} submitDisabled={!captchaToken} err={err}
        >
            <MSep label="Identity"/>

            {teams.length > 0 && (
                <div style={{marginBottom: 12}}>
                    <label style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#555",
                        letterSpacing: "0.04em",
                        display: "block",
                        marginBottom: 4
                    }}>
                        Submit as
                    </label>
                    <div style={{display: "flex", flexWrap: "wrap", gap: 6}}>
                        <SubmitAsChip label={username} active={submitAs === "self"}
                                      onClick={() => setSubmitAs("self")}/>
                        {teams.map(t => (
                            <SubmitAsChip key={t.id} label={t.name} active={submitAs === t.id}
                                          onClick={() => setSubmitAs(t.id)}/>
                        ))}
                    </div>
                </div>
            )}

            {loadingIdentity && (
                <p style={{fontSize: 11, color: "#444", marginBottom: 12}}>Loading your account…</p>
            )}
            {blocked && (
                <p style={{fontSize: 11, color: "#f59e0b", lineHeight: 1.6, marginBottom: 12}}>
                    You need a vanity handle before you can submit packages. Set one in Account Settings, then come back
                    here.
                </p>
            )}

            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px"}}>
                <PackageIdField prefix={prefix} suffix={idSuffix} onChange={setIdSuffix}
                                disabled={blocked || loadingIdentity}/>
                <MField label="Display name" value={form.name} onChange={set("name")} placeholder="My Module"/>
            </div>

            <fieldset disabled={blocked || loadingIdentity} style={{border: "none", padding: 0, margin: 0}}>
                <MTypeToggle value={form.package_type} onChange={v => setForm(f => ({...f, package_type: v}))}/>
                <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px"}}>
                    <MIconPicker value={String(form.icon ?? "")} onChange={v => setForm(f => ({...f, icon: v}))}/>
                    <MField label="Min version" value={String(form.min_app_version ?? "")}
                            onChange={set("min_app_version")} placeholder="0.1.0"/>
                </div>

                <MSep label="Details"/>
                <MField label="Description" value={form.description} onChange={set("description")} multi
                        placeholder="What does this package do?"/>
                <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px"}}>
                    <MField label="Tags" value={tags} onChange={e => setTags(e.target.value)}
                            placeholder="queue, fun, twitch" hint="comma-separated"/>
                    <MCategoryField value={form.category} onChange={v => setForm(f => ({...f, category: v}))}/>
                </div>

                <MSep label="Release"/>
                <div style={{display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 12px"}}>
                    <MField label="Version" value={form.version} onChange={set("version")} placeholder="1.0.0"/>
                    <MField label="Download URL" value={form.download_url} onChange={set("download_url")}
                            placeholder="https://…/package.gdmod"/>
                </div>
                <MField label="SHA-256 checksum" value={String(form.checksum ?? "")} onChange={set("checksum")}
                        placeholder="optional" hint="optional"/>
                <MField label="Changelog" value={String(form.changelog ?? "")} onChange={set("changelog")} multi
                        placeholder="What's new in this version…"/>

                <div style={{marginTop: 12}}>
                    <Turnstile onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)}/>
                </div>
            </fieldset>
        </MModal>
    );
}

// ── "Submit as" chip ─────────────────────────────────────────────────────────

function SubmitAsChip({label, active, onClick}: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} style={{
            padding: "5px 12px", fontSize: 11, fontWeight: active ? 700 : 500,
            color: active ? "var(--color-accent)" : "#666",
            background: active ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
            border: `1px solid ${active ? "color-mix(in srgb, var(--color-accent) 28%, transparent)" : "#242424"}`,
            borderRadius: 7, cursor: "pointer", transition: "border-color 0.1s, color 0.1s",
        }}>
            {label}
        </button>
    );
}

// ── Package ID field — immutable vanity prefix + editable suffix ────────────

function PackageIdField({prefix, suffix, onChange, disabled}: {
    prefix: string | null; suffix: string; onChange: (v: string) => void; disabled?: boolean;
}) {
    return (
        <div style={{marginBottom: 12}}>
            <label style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#555",
                letterSpacing: "0.04em",
                display: "block",
                marginBottom: 4
            }}>
                Package ID
            </label>
            <div style={{
                display: "flex", alignItems: "center",
                border: "1px solid #242424", borderRadius: 6, overflow: "hidden",
                backgroundColor: disabled ? "#0d0d0d" : "#111",
            }}>
                <span style={{
                    padding: "6px 0 6px 10px", fontSize: 12, fontWeight: 600,
                    color: prefix ? "#777" : "#3a3a3a", whiteSpace: "nowrap", flexShrink: 0,
                }}>
                    {prefix ? `${prefix}.` : "…."}
                </span>
                <input
                    value={suffix}
                    onChange={e => onChange(e.target.value)}
                    disabled={disabled}
                    placeholder="my-queue-mod"
                    style={{
                        flex: 1, minWidth: 0, padding: "6px 10px 6px 1px", fontSize: 12,
                        backgroundColor: "transparent", color: "#aaa", border: "none", outline: "none",
                        fontFamily: "inherit",
                    }}
                />
            </div>
        </div>
    );
}
