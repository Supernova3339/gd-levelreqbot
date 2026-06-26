import {PlusIcon} from "../../components/icons";
import type {Library} from "./useLibraries";

interface Props {
    libraries: Library[];
    selected: Library | null;
    onSelect: (lib: Library) => void;
    onNew: () => void;
    onImport: () => void;
}

export function LibrarySidebar({libraries, selected, onSelect, onNew, onImport}: Props) {
    const standard = libraries.filter((l) => l.isStandard);
    const user = libraries.filter((l) => !l.isStandard);

    return (
        <div className="flex flex-col flex-shrink-0 overflow-hidden"
             style={{width: 200, borderRight: "1px solid #1e1e1e", backgroundColor: "#0a0a0a"}}>

            <div className="flex-1 overflow-y-auto py-2">
                <Section label="Standard">
                    {standard.map((lib) => (
                        <LibRow key={lib.id} lib={lib} active={selected?.id === lib.id}
                                onClick={() => onSelect(lib)}/>
                    ))}
                </Section>

                {user.length > 0 && (
                    <Section label="Yours">
                        {user.map((lib) => (
                            <LibRow key={lib.id} lib={lib} active={selected?.id === lib.id}
                                    onClick={() => onSelect(lib)}/>
                        ))}
                    </Section>
                )}
            </div>

            <div className="flex-shrink-0 p-2 flex flex-col gap-1.5"
                 style={{borderTop: "1px solid #1a1a1a"}}>
                <button onClick={onNew}
                        className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded w-full"
                        style={{backgroundColor: "var(--color-accent)", color: "#fff", cursor: "pointer"}}>
                    <PlusIcon size={10}/> New library
                </button>
                <button onClick={onImport}
                        className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded w-full"
                        style={{border: "1px dashed #1e1e1e", color: "#333", cursor: "pointer"}}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#888";
                            e.currentTarget.style.borderColor = "#444";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#333";
                            e.currentTarget.style.borderColor = "#1e1e1e";
                        }}>
                    Import .rhai
                </button>
            </div>
        </div>
    );
}

function Section({label, children}: { label: string; children: React.ReactNode }) {
    return (
        <div className="mb-2">
            <p className="text-xs px-3 py-1" style={{color: "#333", letterSpacing: "0.05em"}}>{label}</p>
            {children}
        </div>
    );
}

function LibRow({lib, active, onClick}: { lib: Library; active: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} className="w-full text-left px-3 py-1.5 text-xs"
                style={{
                    backgroundColor: active ? "color-mix(in srgb, var(--color-accent) 10%, transparent)" : "transparent",
                    color: active ? "#e0e0e0" : "#666",
                    borderLeft: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
                    cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                    if (!active) {
                        e.currentTarget.style.color = "#aaa";
                        e.currentTarget.style.backgroundColor = "#111";
                    }
                }}
                onMouseLeave={(e) => {
                    if (!active) {
                        e.currentTarget.style.color = "#666";
                        e.currentTarget.style.backgroundColor = "transparent";
                    }
                }}>
            <code style={{fontFamily: "monospace"}}>{lib.name}.rhai</code>
        </button>
    );
}
