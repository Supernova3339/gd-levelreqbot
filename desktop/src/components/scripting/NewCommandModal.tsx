import {useEffect, useRef, useState} from "react";
import {CloseIcon, PlusIcon, SearchIcon, WarningIcon} from "../icons";
import {invoke} from "@tauri-apps/api/core";
import {
    BUILTIN_TEMPLATES,
    type ScriptTemplate,
    TEMPLATE_CATEGORIES,
    type TemplateCategory,
} from "../../lib/scripting/index";

// ─── Dangerous script detection ───────────────────────────────────────────────

const DANGEROUS_PATTERNS = [/\bshell\s*\.\s*run\s*\(/, /\bshell\s*\.\s*run_timeout\s*\(/, /\bshell\s*\.\s*env\s*\(/];

function isDangerous(script: string): boolean {
    return DANGEROUS_PATTERNS.some((p) => p.test(script));
}


// ─── User template persistence ────────────────────────────────────────────────

interface UserTemplate extends ScriptTemplate {
    author?: string;
    pack?: string;
}

interface TemplatePack {
    name: string;
    author?: string;
    templates: Omit<ScriptTemplate, "id" | "category">[];
}

async function loadUserTemplates(): Promise<UserTemplate[]> {
    try {
        return await invoke<UserTemplate[]>("load_user_templates");
    } catch {
        return [];
    }
}

async function saveUserTemplates(templates: UserTemplate[]): Promise<void> {
    try {
        await invoke("save_user_templates", {templates});
    } catch { /* non-fatal */
    }
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({t, onPick, onRemove}: {
    t: ScriptTemplate;
    onPick: () => void;
    onRemove?: () => void;
}) {
    const preview = t.script
        .split("\n")
        .filter((l) => !l.startsWith("# @") && l.trim())
        .slice(0, 2)
        .join("\n") || "# empty";
    const dangerous = isDangerous(t.script);

    return (
        <button onClick={onPick}
                className="relative flex flex-col gap-2 p-3 rounded-lg text-left w-full"
                style={{
                    backgroundColor: dangerous ? "#120900" : "#111",
                    border: `1px solid ${dangerous ? "#2a1400" : "#1a1a1a"}`,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = dangerous ? "#f9741633" : "var(--color-accent)44";
                    e.currentTarget.style.backgroundColor = dangerous ? "#160c00" : "#141414";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = dangerous ? "#2a1400" : "#1a1a1a";
                    e.currentTarget.style.backgroundColor = dangerous ? "#120900" : "#111";
                }}>

            {onRemove && (
                <div className="absolute top-2 right-2"
                     onClick={(e) => {
                         e.stopPropagation();
                         onRemove();
                     }}>
                    <CloseIcon size={10} style={{color: "#2a2a2a"}}/>
                </div>
            )}

            <div>
                <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold" style={{color: "#d0d0d0"}}>{t.name}</p>
                    {dangerous && (
                        <span className="flex items-center gap-0.5 text-xs px-1 py-0.5 rounded"
                              style={{
                                  backgroundColor: "#2a1000",
                                  color: "#f97316",
                                  border: "1px solid #3a1800",
                                  fontSize: 9,
                                  fontWeight: 700
                              }}>
              <WarningIcon size={8}/> shell
            </span>
                    )}
                </div>
                {"author" in t && (t as UserTemplate).author && (
                    <p className="text-xs" style={{color: "#3a3a3a"}}>
                        {"pack" in t && (t as UserTemplate).pack ? (t as UserTemplate).pack + " · " : ""}
                        {(t as UserTemplate).author}
                    </p>
                )}
                <p className="text-xs mt-0.5" style={{color: "#444"}}>{t.description}</p>
            </div>

            <pre className="text-xs rounded px-2 py-1.5 w-full overflow-hidden"
                 style={{
                     fontFamily: '"JetBrains Mono","Fira Code",monospace',
                     backgroundColor: "#0a0a0a",
                     color: "#555",
                     lineHeight: 1.5,
                     maxHeight: 48,
                     margin: 0
                 }}>
        {preview}
      </pre>
        </button>
    );
}

// ─── Category tab ─────────────────────────────────────────────────────────────

function CategoryTab({label, active, onClick}: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} className="px-3 py-1.5 text-xs rounded-md"
                style={{
                    backgroundColor: active ? "color-mix(in srgb, var(--color-accent) 12%, #111)" : "transparent",
                    color: active ? "var(--color-accent)" : "#444",
                    border: active ? "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)" : "1px solid transparent",
                }}>
            {label}
        </button>
    );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

const BLANK_SCRIPT =
    "// @trigger !newcommand\n// @alias \n// @description \n// @roles everyone\n// @platform all\n// @cooldown 0\n// @user_cooldown 0\n";

const BLANK_VISUAL_SCRIPT =
    "// @trigger !newcommand\n// @alias \n// @description \n// @roles everyone\n// @platform all\n// @cooldown 0\n// @user_cooldown 0\n// @editor visual\n";

interface Props {
    onPick: (script: string) => void;
    onClose: () => void;
}

export function NewCommandModal({onPick, onClose}: Props) {
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState<TemplateCategory | "All" | "Imported">("All");
    const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
    const [importWarning, setImportWarning] = useState<string | null>(null);
    const importRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadUserTemplates().then(setUserTemplates);
    }, []);

    // ── Import ────────────────────────────────────────────────────────────────

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const text = ev.target?.result as string;
            if (!text) return;

            let added: UserTemplate[] = [];

            if (file.name.endsWith(".gdlqs")) {
                added = [{
                    id: `u_${Date.now()}`, name: file.name.replace(/\.gdlqs$/, ""),
                    description: "Imported script", category: "Utility",
                    script: text, author: "Imported",
                }];
            } else {
                try {
                    const pack: TemplatePack = JSON.parse(text);
                    added = (pack.templates ?? []).map((t, i) => ({
                        id: `u_${Date.now()}_${i}`,
                        name: t.name,
                        description: t.description,
                        category: "Utility" as TemplateCategory,
                        script: t.script,
                        author: pack.author,
                        pack: pack.name,
                    }));
                } catch {
                    added = [{
                        id: `u_${Date.now()}`, name: file.name,
                        description: "Imported script", category: "Utility",
                        script: text, author: "Imported",
                    }];
                }
            }

            if (added.some((t) => isDangerous(t.script))) {
                setImportWarning(`"${file.name}" contains shell commands and can execute system code.`);
                setCategory("Imported");
            }

            const next = [...userTemplates, ...added];
            setUserTemplates(next);
            await saveUserTemplates(next);
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const removeUserTemplate = async (id: string) => {
        const next = userTemplates.filter((t) => t.id !== id);
        setUserTemplates(next);
        await saveUserTemplates(next);
    };

    // ── Filter ────────────────────────────────────────────────────────────────

    const q = search.toLowerCase();

    const visibleBuiltin = BUILTIN_TEMPLATES.filter((t) => {
        if (category === "Imported") return false;
        if (category !== "All" && t.category !== category) return false;
        if (q) return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
        return true;
    });

    const visibleUser = userTemplates.filter((t) => {
        if (category !== "All" && category !== "Imported") return false;
        if (q) return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
        return true;
    });

    const tabs: (TemplateCategory | "All" | "Imported")[] = ["All", ...TEMPLATE_CATEGORIES, "Imported"];

    return (
        <>
            <div className="fixed inset-0 z-40" style={{backgroundColor: "rgba(0,0,0,0.75)"}} onClick={onClose}/>

            <div className="fixed z-50 flex flex-col"
                 style={{
                     top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                     width: 760, height: 540,
                     backgroundColor: "#0d0d0d", border: "1px solid #1e1e1e",
                     borderRadius: 10, boxShadow: "0 24px 80px rgba(0,0,0,0.9)", overflow: "hidden",
                 }}>

                {/* Header */}
                <div className="flex items-center gap-4 px-5 py-3 flex-shrink-0"
                     style={{borderBottom: "1px solid #141414"}}>
                    <p className="text-sm font-semibold" style={{color: "#e0e0e0"}}>New command</p>

                    {/* Search */}
                    <div className="relative flex-1">
                        <SearchIcon size={12} className="absolute" style={{
                            left: 8,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "#333",
                            pointerEvents: "none"
                        }}/>
                        <input value={search} onChange={(e) => setSearch(e.target.value)}
                               placeholder="Search templates…"
                               className="w-full text-xs py-1.5 rounded"
                               style={{
                                   backgroundColor: "#111",
                                   color: "#c0c0c0",
                                   border: "1px solid #1a1a1a",
                                   paddingLeft: 26
                               }}
                        />
                    </div>

                    <button onClick={onClose} style={{color: "#444"}}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = "#f1f1f1";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = "#444";
                            }}>
                        <CloseIcon size={13}/>
                    </button>
                </div>

                <div className="flex flex-1 min-h-0">

                    {/* ── Left sidebar ── */}
                    <div className="flex flex-col gap-1 p-3 flex-shrink-0"
                         style={{width: 160, borderRight: "1px solid #0f0f0f", backgroundColor: "#0a0a0a"}}>

                        <p className="text-xs px-2 mb-1" style={{color: "#2a2a2a"}}>Category</p>
                        {tabs.map((t) => (
                            <CategoryTab key={t} label={t} active={category === t} onClick={() => setCategory(t)}/>
                        ))}

                        <div style={{flex: 1}}/>

                        <button onClick={() => importRef.current?.click()}
                                className="flex items-center gap-1.5 px-2 py-2 rounded text-xs mt-2"
                                style={{color: "#333", border: "1px dashed #1e1e1e"}}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "var(--color-accent)";
                                    e.currentTarget.style.borderColor = "var(--color-accent)44";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "#333";
                                    e.currentTarget.style.borderColor = "#1e1e1e";
                                }}>
                            <PlusIcon size={10}/> Import
                        </button>
                        <p className="text-xs px-1" style={{color: "#1e1e1e", lineHeight: 1.5}}>.gdlqs · .gdlqpack</p>
                        <input ref={importRef} type="file" accept=".gdlqs,.gdlqpack,.json" style={{display: "none"}}
                               onChange={handleImport}/>
                    </div>

                    {/* ── Template grid ── */}
                    <div className="flex flex-col flex-1 min-w-0">

                        {/* Blank + Imported divider */}
                        <div className="flex gap-2 px-4 pt-3 pb-2 flex-shrink-0"
                             style={{borderBottom: "1px solid #0f0f0f"}}>
                            <button onClick={() => onPick(BLANK_SCRIPT)}
                                    className="flex flex-col gap-0.5 px-3 py-2 rounded-lg text-left"
                                    style={{backgroundColor: "#111", border: "1px solid #1a1a1a"}}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = "var(--color-accent)44";
                                        e.currentTarget.style.backgroundColor = "#141414";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = "#1a1a1a";
                                        e.currentTarget.style.backgroundColor = "#111";
                                    }}>
                                <p className="text-xs font-semibold" style={{color: "#d0d0d0"}}>≺/ Blank — Text</p>
                                <p className="text-xs" style={{color: "#444"}}>Write Rhai script by hand</p>
                            </button>
                            <button onClick={() => onPick(BLANK_VISUAL_SCRIPT)}
                                    className="flex flex-col gap-0.5 px-3 py-2 rounded-lg text-left"
                                    style={{backgroundColor: "#111", border: "1px solid #1a1a1a"}}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = "#818cf844";
                                        e.currentTarget.style.backgroundColor = "#141414";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = "#1a1a1a";
                                        e.currentTarget.style.backgroundColor = "#111";
                                    }}>
                                <p className="text-xs font-semibold" style={{color: "#818cf8"}}>⬡ Blank — Flow</p>
                                <p className="text-xs" style={{color: "#444"}}>Build visually with nodes ( beta )</p>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                            {visibleBuiltin.length === 0 && visibleUser.length === 0 ? (
                                <p className="text-xs text-center py-8" style={{color: "#2a2a2a"}}>
                                    No templates{q ? ` matching "${search}"` : ""}
                                </p>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {visibleBuiltin.map((t) => (
                                        <TemplateCard key={t.id} t={t} onPick={() => onPick(t.script)}/>
                                    ))}
                                    {visibleUser.map((t) => (
                                        <TemplateCard key={t.id} t={t}
                                                      onPick={() => onPick(t.script)}
                                                      onRemove={() => removeUserTemplate(t.id)}/>
                                    ))}
                                </div>
                            )}
                        </div>

                        {(userTemplates.length > 0 || importWarning) && (
                            <div className="px-4 py-2 flex-shrink-0 flex flex-col gap-2"
                                 style={{borderTop: "1px solid #0f0f0f"}}>
                                {importWarning && (
                                    <div className="flex items-start gap-2 py-1">
                                        <WarningIcon size={12} style={{color: "#f97316", flexShrink: 0, marginTop: 1}}/>
                                        <p className="text-xs" style={{color: "#a05020", lineHeight: 1.5}}>
                                            <strong style={{color: "#f97316"}}>Shell script
                                                imported:</strong> {importWarning}{" "}
                                            <button onClick={() => setImportWarning(null)}
                                                    style={{
                                                        color: "#555",
                                                        textDecoration: "underline",
                                                        cursor: "pointer",
                                                        background: "none",
                                                        border: "none",
                                                        fontSize: "inherit"
                                                    }}>
                                                Dismiss
                                            </button>
                                        </p>
                                    </div>
                                )}
                                {userTemplates.length > 0 && (
                                    <p className="text-xs" style={{color: "#222"}}>
                                        {userTemplates.length} imported template{userTemplates.length !== 1 ? "s" : ""}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
