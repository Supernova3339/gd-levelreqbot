import {type ChangeEvent, type CSSProperties, type FocusEvent, useCallback, useEffect, useRef, useState} from "react";
import type {FormFieldDef, LayoutNode} from "../../../../../lib/types";
import {evalModulePanelData} from "../../../../../lib/commands";
import {useModulePageContext} from "../../context";
import {useAction} from "../../hooks/useAction";

// ── Styles ────────────────────────────────────────────────────────────────────

const INPUT_BASE: CSSProperties = {
    backgroundColor: "#111",
    border: "1px solid #222",
    borderRadius: 5,
    color: "#e0e0e0",
    fontSize: 13,
    padding: "5px 8px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
};

// ── Field renderers ────────────────────────────────────────────────────────────

function TextField({field, value, onChange}: {
    field: FormFieldDef;
    value: unknown;
    onChange: (v: unknown) => void;
}) {
    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChange(field.type === "number" ? Number(e.target.value) : e.target.value);
    const onFocus = (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        (e.currentTarget.style.borderColor = "var(--color-accent)");
    const onBlur = (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        (e.currentTarget.style.borderColor = "#222");

    if (field.type === "textarea") {
        return (
            <textarea
                value={String(value ?? "")}
                placeholder={field.placeholder}
                rows={4}
                onChange={handleChange}
                onFocus={onFocus}
                onBlur={onBlur}
                style={{...INPUT_BASE, resize: "vertical"}}
            />
        );
    }
    return (
        <input
            type={field.type === "number" ? "number" : "text"}
            value={String(value ?? "")}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            onChange={handleChange}
            onFocus={onFocus}
            onBlur={onBlur}
            style={INPUT_BASE}
        />
    );
}

function ToggleField({field, value, onChange}: {
    field: FormFieldDef;
    value: unknown;
    onChange: (v: boolean) => void;
}) {
    const on = !!value;
    return (
        <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0"}}>
            <span style={{fontSize: 13, color: "#bbb"}}>{field.label}</span>
            <button
                onClick={() => onChange(!on)}
                style={{
                    width: 36, height: 20, borderRadius: 10, border: "none",
                    backgroundColor: on ? "var(--color-accent)" : "#222",
                    cursor: "pointer", position: "relative", flexShrink: 0,
                    transition: "background-color 0.15s",
                }}
            >
                <span style={{
                    position: "absolute", top: 2, left: on ? 18 : 2,
                    width: 16, height: 16, borderRadius: "50%",
                    backgroundColor: "#fff", transition: "left 0.15s",
                }}/>
            </button>
        </div>
    );
}

// A pill-shaped toggle that reads as one option in a set, rather than a
// standalone on/off row — used when a group has enough same-shaped toggles
// (difficulty tiers, lengths, …) that a stacked list of switches is just
// visual noise. Click toggles; a small check mark distinguishes the active
// state at a glance without needing to read the color.
function ChipToggle({label, active, onClick}: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 12px 5px 10px",
                borderRadius: 999,
                fontSize: 12, fontWeight: 500,
                border: `1px solid ${active ? "var(--color-accent)" : "#2a2a2a"}`,
                backgroundColor: active ? "color-mix(in srgb, var(--color-accent) 16%, transparent)" : "#161616",
                color: active ? "var(--color-accent)" : "#777",
                cursor: "pointer",
                transition: "background-color 0.12s, border-color 0.12s, color 0.12s",
            }}
            onMouseEnter={e => {
                if (!active) e.currentTarget.style.borderColor = "#3a3a3a";
            }}
            onMouseLeave={e => {
                if (!active) e.currentTarget.style.borderColor = "#2a2a2a";
            }}
        >
            <span style={{
                width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1.5px solid ${active ? "var(--color-accent)" : "#444"}`,
                backgroundColor: active ? "var(--color-accent)" : "transparent",
                transition: "background-color 0.12s, border-color 0.12s",
            }}>
                {active && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5.2 4.2 7.5 8 3" stroke="#0a0a0a" strokeWidth="1.6" strokeLinecap="round"
                              strokeLinejoin="round"/>
                    </svg>
                )}
            </span>
            {label}
        </button>
    );
}

function SelectField({field, value, onChange}: {
    field: FormFieldDef;
    value: unknown;
    onChange: (v: string) => void;
}) {
    return (
        <select
            value={String(value ?? "")}
            onChange={e => onChange(e.target.value)}
            style={{...INPUT_BASE, cursor: "pointer"}}
        >
            {(field.options ?? []).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    );
}

// ── Grouping ──────────────────────────────────────────────────────────────────
// Consecutive fields sharing a `group` cluster into one section (header + a
// block of fields), so one <Form> can be organized without splitting into
// several <Form>s — each Form's own root wants `flex: 1` to fill its
// container, and several of them side by side would compete for that space
// instead of stacking at their natural height.

interface FieldGroup {
    header?: string;
    fields: FormFieldDef[];
}

function groupFields(fields: FormFieldDef[]): FieldGroup[] {
    const groups: FieldGroup[] = [];
    let current: FieldGroup | null = null;
    for (const f of fields) {
        if (!current || f.group !== current.header) {
            current = {header: f.group, fields: []};
            groups.push(current);
        }
        current.fields.push(f);
    }
    return groups;
}

const LINK_BTN: CSSProperties = {
    background: "none", border: "none", padding: 0,
    fontSize: 10, fontWeight: 600, color: "#555", cursor: "pointer",
    textTransform: "uppercase", letterSpacing: "0.04em",
};

function GroupHeader({label, first, onAll, onNone}: {
    label: string; first: boolean;
    onAll?: () => void; onNone?: () => void;
}) {
    return (
        <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: first ? 0 : 16, marginBottom: 7,
        }}>
            <span style={{
                fontSize: 10, fontWeight: 600, color: "#555",
                textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
                {label}
            </span>
            {onAll && onNone && (
                <span style={{display: "flex", gap: 10}}>
                    <button style={LINK_BTN} onClick={onAll}
                            onMouseEnter={e => {
                                e.currentTarget.style.color = "#999";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.color = "#555";
                            }}>
                        All
                    </button>
                    <button style={LINK_BTN} onClick={onNone}
                            onMouseEnter={e => {
                                e.currentTarget.style.color = "#999";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.color = "#555";
                            }}>
                        None
                    </button>
                </span>
            )}
        </div>
    );
}

// A group of 4+ toggles reads as "pick which of these are on" — render as a
// wrapping chip grid with All/None shortcuts instead of a stack of identical
// switch rows. Smaller groups (or standalone toggles) stay as switch rows,
// where a chip would read oddly for a single yes/no feature flag.
const CHIP_GROUP_THRESHOLD = 4;

function ToggleGroupBlock({group, values, onChange, first}: {
    group: FieldGroup;
    values: Record<string, unknown>;
    onChange: (key: string, v: unknown) => void;
    first: boolean;
}) {
    const useChips = group.fields.length >= CHIP_GROUP_THRESHOLD;

    return (
        <div style={{marginBottom: useChips ? 4 : 0}}>
            {group.header && (
                <GroupHeader
                    label={group.header} first={first}
                    onAll={useChips ? () => group.fields.forEach(f => onChange(f.key, true)) : undefined}
                    onNone={useChips ? () => group.fields.forEach(f => onChange(f.key, false)) : undefined}
                />
            )}
            {useChips ? (
                <div style={{display: "flex", flexWrap: "wrap", gap: 6, paddingBottom: 12}}>
                    {group.fields.map(f => (
                        <ChipToggle
                            key={f.key}
                            label={f.label}
                            active={!!values[f.key]}
                            onClick={() => onChange(f.key, !values[f.key])}
                        />
                    ))}
                </div>
            ) : (
                group.fields.map(f => (
                    <div key={f.key} style={{borderBottom: "1px solid #1a1a1a", paddingBottom: 8, marginBottom: 8}}>
                        <ToggleField field={f} value={values[f.key]} onChange={v => onChange(f.key, v)}/>
                    </div>
                ))
            )}
        </div>
    );
}

// ── FormField wrapper ─────────────────────────────────────────────────────────

function FormField({field, value, onChange}: {
    field: FormFieldDef;
    value: unknown;
    onChange: (v: unknown) => void;
}) {
    if (field.type === "toggle") {
        return (
            <div style={{borderBottom: "1px solid #1a1a1a", paddingBottom: 8, marginBottom: 8}}>
                <ToggleField field={field} value={value} onChange={onChange}/>
            </div>
        );
    }

    return (
        <div style={{marginBottom: 14}}>
            <label style={{
                display: "block", fontSize: 11, color: "#555",
                fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.06em", marginBottom: 5,
            }}>
                {field.label}
            </label>
            {field.type === "select"
                ? <SelectField field={field} value={value} onChange={onChange}/>
                : <TextField field={field} value={value} onChange={onChange}/>
            }
        </div>
    );
}

// ── Defaults loading ──────────────────────────────────────────────────────────

function fallbackFor(f: FormFieldDef): unknown {
    return f.type === "toggle" ? false : f.type === "number" ? 0 : "";
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Every field here is `ms.get_or(key, default)` (or similar), which by
// construction never itself evaluates to null/unit — it always resolves to
// either the persisted value or the literal fallback baked into the
// expression. So a `null` result from the combined eval can only mean the
// backend eval itself failed (see eval_module_panel_data's comment: it
// collapses ANY error in the map literal — even in one unrelated field — down
// to a bare "null" response, rather than surfacing which field broke).
// That failure is usually transient (e.g. the module's script/library state
// still settling right after the app or module page finishes mounting), so a
// few retries beat permanently showing hardcoded fallbacks instead of the
// user's actual saved settings until they happen to revisit the page.
const RETRY_DELAYS_MS = [150, 400, 900];

/**
 * All fields' defaultExpr are evaluated in ONE Rhai call (a map literal), not
 * one round trip per field — a form with a dozen toggles used to fire a dozen
 * concurrent backend calls, which is both slow to settle and a source of
 * partial-load races. Fields without a defaultExpr just get their type's
 * fallback value locally, no eval needed.
 */
async function loadDefaults(moduleId: string, fields: FormFieldDef[]): Promise<{
    values: Record<string, unknown>;
    failed: boolean
}> {
    const defaults: Record<string, unknown> = {};
    for (const f of fields) defaults[f.key] = fallbackFor(f);

    const withExpr = fields.filter(f => f.default_expr);
    if (withExpr.length === 0) return {values: defaults, failed: false};

    const mapExpr = `#{ ${withExpr.map(f => `${JSON.stringify(f.key)}: (${f.default_expr})`).join(", ")} }`;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
            const result = await evalModulePanelData(moduleId, mapExpr);
            if (result && typeof result === "object") {
                Object.assign(defaults, result as Record<string, unknown>);
                return {values: defaults, failed: false};
            }
        } catch (e) {
            console.error(`Form defaults eval failed (${moduleId}, attempt ${attempt + 1})`, e);
        }
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
    console.error(`Form defaults never loaded for ${moduleId} after ${RETRY_DELAYS_MS.length + 1} attempts — showing fallback values, not saved settings.`);
    return {values: defaults, failed: true};
}

// ── Form ──────────────────────────────────────────────────────────────────────
//
// Auto-saves on change by default (autosave="false" reverts to an explicit
// Save button). Edits are debounced (500ms of inactivity) before the
// submit_key action fires. Status ("Saving…" / "Saved" / errors) goes to the
// page's shared topbar (see PageRenderer's PageStatusBar) rather than a
// per-Form footer, so it reads as one consistent place instead of a bar per
// widget.
//
// Whether a save is actually needed is decided by diffing `values` against
// `baselineRef` (the last successfully loaded/saved snapshot) — NOT by a
// "skip the next effect run" flag. A flag-based skip is one-shot and doesn't
// survive React re-running effects for unrelated reasons (e.g. React 18
// StrictMode's intentional double-invoke in dev), which is exactly what made
// the status permanently say "unsaved" even with nothing actually changed.

const SAVE_DEBOUNCE_MS = 500;

export function Form({node}: { node: LayoutNode }) {
    const {moduleId, setPageStatus} = useModulePageContext();
    const {dispatch} = useAction();
    const fields = node.form_fields ?? [];
    const autosave = node.autosave !== false;

    const [values, setValues] = useState<Record<string, unknown>>({});
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const initialized = useRef(false);
    const baselineRef = useRef<Record<string, unknown> | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        loadDefaults(moduleId, fields).then(({values: defaults, failed}) => {
            baselineRef.current = defaults;
            setValues(defaults);
            setLoaded(true);
            if (failed) {
                setPageStatus({
                    message: "Couldn't load saved settings — showing defaults. Reopen this page to retry.",
                    kind: "error"
                });
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [moduleId]);

    const handleChange = useCallback((key: string, value: unknown) => {
        setValues(prev => ({...prev, [key]: value}));
    }, []);

    const save = useCallback(async (v: Record<string, unknown>) => {
        if (!node.submit_key) return;
        setSaving(true);
        setPageStatus({message: "Saving…", kind: "pending"});
        const ok = await dispatch(node.submit_key, [JSON.stringify(v)]);
        setSaving(false);
        if (ok) {
            baselineRef.current = v;
            setPageStatus({message: "Saved ✓", kind: "success"});
        }
        // On failure, useAction already posted the error to the topbar.
    }, [dispatch, node.submit_key, setPageStatus]);

    // Autosave: fires only when `values` actually differs from the last
    // loaded/saved snapshot — comparing content, not relying on *when* this
    // effect happens to run, so re-renders that don't change anything (from
    // StrictMode, a parent re-render, whatever) never falsely flag "unsaved".
    useEffect(() => {
        if (!autosave || !node.submit_key || !loaded) return;
        if (baselineRef.current && JSON.stringify(values) === JSON.stringify(baselineRef.current)) return;

        setPageStatus({message: "Unsaved changes…", kind: "pending"});
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => save(values), SAVE_DEBOUNCE_MS);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values, autosave, loaded]);

    const textFields = fields.filter(f => f.type !== "toggle");
    const toggleFields = fields.filter(f => f.type === "toggle");

    return (
        <div style={{display: "flex", flexDirection: "column", flex: 1, minHeight: 0}}>
            <div style={{
                padding: 20, paddingBottom: 12, overflowY: "auto", flex: 1, minHeight: 0,
                scrollbarWidth: "thin", scrollbarColor: "#2a2a2a transparent",
            }}>
                {node.title && (
                    <div style={{
                        fontSize: 11, fontWeight: 600, color: "#444",
                        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 18,
                    }}>
                        {node.title}
                    </div>
                )}

                {!loaded && (
                    <div style={{fontSize: 12, color: "#333", padding: "4px 0 14px"}}>Loading…</div>
                )}

                {groupFields(textFields).map((group, gi) => (
                    <div key={gi}>
                        {group.header && <GroupHeader label={group.header} first={gi === 0}/>}
                        {group.fields.map(field => (
                            <FormField
                                key={field.key}
                                field={field}
                                value={values[field.key] ?? ""}
                                onChange={v => handleChange(field.key, v)}
                            />
                        ))}
                    </div>
                ))}

                {toggleFields.length > 0 && (
                    <div style={{borderTop: "1px solid #1a1a1a", paddingTop: 14, marginTop: 4}}>
                        {groupFields(toggleFields).map((group, gi) => (
                            <ToggleGroupBlock
                                key={gi}
                                group={group}
                                values={values}
                                onChange={handleChange}
                                first={gi === 0}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* autosave="false" still needs an inline trigger — everything else
                (status text) goes to the shared topbar, so this is just a button. */}
            {node.submit_key && !autosave && (
                <div style={{flexShrink: 0, padding: "10px 20px", borderTop: "1px solid #1a1a1a"}}>
                    <button
                        onClick={() => save(values)}
                        disabled={saving || !loaded}
                        style={{
                            padding: "5px 14px", borderRadius: 5,
                            fontSize: 12, fontWeight: 600,
                            backgroundColor: "var(--color-accent)", color: "#fff",
                            border: "none",
                            cursor: (saving || !loaded) ? "not-allowed" : "pointer",
                            opacity: (saving || !loaded) ? 0.5 : 1,
                        }}
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            )}
        </div>
    );
}
