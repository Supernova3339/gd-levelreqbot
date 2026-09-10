import React, {useState} from "react";
import {getLicenseToken} from "../../lib/commands";
import {type CreateModuleData, mpAddRelease, mpCreateModule} from "./marketplace-api";
import {MCategoryField, MField, MModal, type MPackageType, MSep, MTypeToggle} from "./shared";
import {MIconPicker} from "./MIconPicker";

export function CreateModal({username, initialType, onClose, onSuccess}: {
    username: string;
    initialType?: MPackageType;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [form, setForm] = useState<CreateModuleData>({
        id: "", name: "", author: username, description: "",
        package_type: initialType ?? "module", icon: "custom",
        min_app_version: "0.1.0", tags: [],
        verified: true, premium: false, status: "published",
    });
    const [tagsRaw, setTagsRaw] = useState("");
    const [withRelease, setWithRelease] = useState(true);
    const [release, setRelease] = useState({version: "1.0.0", download_url: "", checksum: "", changelog: ""});
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const setF = (key: keyof CreateModuleData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm(f => ({...f, [key]: e.target.value}));
        setFieldErrors(errs => errs[key] ? {...errs, [key]: ""} : errs);
    };
    const setR = (key: keyof typeof release) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setRelease(r => ({...r, [key]: e.target.value}));
        setFieldErrors(errs => errs[key] ? {...errs, [key]: ""} : errs);
    };

    // All at once, not a sequential if-chain that only ever reveals the next
    // problem after the previous one is fixed and resubmitted.
    const validate = (): Record<string, string> => {
        const errors: Record<string, string> = {};
        const required: (keyof CreateModuleData)[] = ["id", "name", "description"];
        for (const k of required) {
            if (!String(form[k] ?? "").trim()) errors[k] = "Required";
        }
        if (withRelease && !release.download_url.trim()) errors.download_url = "Required for the release";
        return errors;
    };

    const submit = async () => {
        const errors = validate();
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) {
            setErr(null);
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
            const data: CreateModuleData = {...form, tags: tagsRaw.split(",").map(t => t.trim()).filter(Boolean)};
            const {id} = await mpCreateModule(data, token);
            if (withRelease && release.download_url.trim()) {
                await mpAddRelease(id, {
                    version: release.version,
                    download_url: release.download_url,
                    checksum: release.checksum || undefined,
                    changelog: release.changelog || undefined,
                }, token);
            }
            onSuccess();
        } catch (e) {
            setErr(String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <MModal
            title="Create package"
            subtitle={<>Direct creation as <strong style={{color: "#666"}}>{username}</strong> · bypasses review
                queue</>}
            onClose={onClose} onSubmit={submit}
            submitLabel="Create" busy={busy} err={err}
        >
            <MSep label="Identity"/>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px"}}>
                <MField label="Package ID" value={form.id} onChange={setF("id")} placeholder="my-mod"
                        error={fieldErrors.id}/>
                <MField label="Display name" value={form.name} onChange={setF("name")} placeholder="My Module"
                        error={fieldErrors.name}/>
            </div>
            <MTypeToggle value={form.package_type} onChange={v => setForm(f => ({...f, package_type: v}))}/>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px"}}>
                <MIconPicker value={form.icon ?? ""} onChange={v => setForm(f => ({...f, icon: v}))}/>
                <MField label="Min version" value={form.min_app_version ?? ""} onChange={setF("min_app_version")}
                        placeholder="0.1.0"/>
            </div>

            <MSep label="Details"/>
            <MField label="Description" value={form.description} onChange={setF("description")} multi
                    placeholder="What does this package do?" error={fieldErrors.description}/>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px"}}>
                <MField label="Tags" value={tagsRaw} onChange={e => setTagsRaw(e.target.value)}
                        placeholder="queue, fun, twitch" hint="comma-separated"/>
                <MCategoryField value={form.category} onChange={v => setForm(f => ({...f, category: v}))}/>
            </div>

            <MSep label="Visibility"/>
            <div style={{display: "flex", gap: 8, marginBottom: 12}}>
                {(["published", "draft"] as const).map(s => (
                    <button key={s} onClick={() => setForm(f => ({...f, status: s}))} style={{
                        padding: "5px 14px", fontSize: 11, fontWeight: form.status === s ? 600 : 400, borderRadius: 6,
                        background: form.status === s ? "#1e1e1e" : "transparent",
                        color: form.status === s ? "#aaa" : "#3a3a3a",
                        border: `1px solid ${form.status === s ? "#2e2e2e" : "#1e1e1e"}`, cursor: "pointer",
                    }}>{s}</button>
                ))}
                <div style={{flex: 1}}/>
                <button onClick={() => setForm(f => ({...f, verified: !f.verified}))} style={{
                    padding: "5px 14px", fontSize: 11, fontWeight: form.verified ? 600 : 400, borderRadius: 6,
                    background: form.verified ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
                    color: form.verified ? "var(--color-accent)" : "#3a3a3a",
                    border: `1px solid ${form.verified ? "color-mix(in srgb, var(--color-accent) 25%, transparent)" : "#1e1e1e"}`,
                    cursor: "pointer",
                }}>Official
                </button>
            </div>

            <MSep label={withRelease ? "Initial release" : "Release"}/>
            <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: withRelease ? 12 : 0}}>
                <button onClick={() => setWithRelease(w => !w)} style={{
                    padding: "4px 12px", fontSize: 10, fontWeight: 600, borderRadius: 5,
                    background: withRelease ? "#1e1e1e" : "transparent",
                    color: withRelease ? "#777" : "#333",
                    border: "1px solid #1e1e1e", cursor: "pointer",
                }}>{withRelease ? "Included" : "Skip release"}</button>
                <span style={{fontSize: 10, color: "#2e2e2e"}}>
                    {withRelease ? "First release will be attached" : "Add a release later from the detail panel"}
                </span>
            </div>
            {withRelease && (
                <>
                    <div style={{display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 12px"}}>
                        <MField label="Version" value={release.version} onChange={setR("version")} placeholder="1.0.0"/>
                        <MField label="Download URL" value={release.download_url} onChange={setR("download_url")}
                                placeholder="https://…/package.gdmod" error={fieldErrors.download_url}/>
                    </div>
                    <MField label="SHA-256 checksum" value={release.checksum} onChange={setR("checksum")}
                            placeholder="optional" hint="optional"/>
                    <MField label="Changelog" value={release.changelog} onChange={setR("changelog")} multi
                            placeholder="What's new in this version…"/>
                </>
            )}
        </MModal>
    );
}
