import {useState} from "react";
import type {Library} from "./useLibraries";
import {LibraryFunctions} from "./LibraryFunctions";
import {TextEditor} from "../../components/scripting/editor/TextEditor";
import {useEditorErrors} from "../../components/scripting/editor/useEditorErrors";
import {useScriptingPrefs} from "../../hooks/useScriptingPrefs";

interface Props {
    library: Library;
    onSave: (lib: Library) => void;
    onDelete: (id: number | string) => void;
    onFork: (lib: Library) => void;
}

export function LibraryEditor({library, onSave, onDelete, onFork}: Props) {
    const [code, setCode] = useState(library.code);
    const [prefs] = useScriptingPrefs();
    const errors = useEditorErrors(code);
    const [confirm, setConfirm] = useState(false);

    const isStd = library.isStandard;

    const handleSave = () => onSave({...library, code});

    const handleExport = async () => {
        const {invoke} = await import("@tauri-apps/api/core");
        await invoke("save_library_file", {
            content: isStd ? library.code : code,
            filename: `${library.name}.rhai`,
        });
    };

    const handleFork = () => {
        const forked: Library = {
            id: `user:${library.name}_${Date.now()}`,
            name: library.name,
            description: library.description + " (forked)",
            code: library.code,
            isStandard: false,
        };
        onFork(forked);
    };

    return (
        <div className="flex flex-col flex-1" style={{minHeight: 0}}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 flex-shrink-0"
                 style={{height: 44, borderBottom: "1px solid #1a1a1a", backgroundColor: "#0a0a0a"}}>
                <code className="text-sm font-semibold" style={{color: "#d0d0d0"}}>{library.name}.rhai</code>
                {isStd && (
                    <span className="text-xs px-1.5 py-0.5 rounded"
                          style={{backgroundColor: "#111", color: "#555", border: "1px solid #1e1e1e"}}>
            standard
          </span>
                )}
                <p className="text-xs flex-1 truncate" style={{color: "#333"}}>{library.description}</p>

                {/* Export always available */}
                <button onClick={handleExport}
                        className="text-xs px-2 py-1 rounded"
                        style={{color: "#444", border: "1px solid #1e1e1e", cursor: "pointer"}}
                        title={`Download ${library.name}.rhai`}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#c0c0c0";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#444";
                        }}>
                    ↓ .rhai
                </button>

                {isStd ? (
                    <button onClick={handleFork}
                            className="text-xs px-3 py-1 rounded"
                            style={{
                                backgroundColor: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
                                color: "var(--color-accent)",
                                border: "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)",
                                cursor: "pointer"
                            }}>
                        Fork to edit
                    </button>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <button onClick={handleSave}
                                className="text-xs px-3 py-1 rounded font-semibold"
                                style={{backgroundColor: "var(--color-accent)", color: "#fff", cursor: "pointer"}}>
                            Save
                        </button>
                        <button
                            onClick={() => {
                                if (confirm) onDelete(library.id); else setConfirm(true);
                            }}
                            onBlur={() => setConfirm(false)}
                            className="text-xs px-2 py-1 rounded"
                            style={{
                                color: confirm ? "#fff" : "#ef4444",
                                backgroundColor: confirm ? "#ef4444" : "transparent",
                                border: `1px solid ${confirm ? "#ef4444" : "#2a1010"}`,
                                cursor: "pointer",
                            }}>
                            {confirm ? "Confirm" : "Delete"}
                        </button>
                    </div>
                )}
            </div>

            {/* Function signatures */}
            <LibraryFunctions code={code}/>

            {/* Editor */}
            <div className="flex-1 flex flex-col" style={{minHeight: 0}}>
                <TextEditor
                    text={isStd ? library.code : code}
                    onChange={isStd ? () => {
                    } : setCode}
                    errors={errors}
                    prefs={prefs}
                    commandName={library.name}
                />
            </div>
        </div>
    );
}
