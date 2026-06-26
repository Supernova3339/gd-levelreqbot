import {useRef, useState} from "react";
import {LibrarySidebar} from "./libraries/LibrarySidebar";
import {LibraryEditor} from "./libraries/LibraryEditor";
import {type Library, useLibraries} from "./libraries/useLibraries";

export function LibrariesPage() {
    const {libraries, loading, save, delete: del} = useLibraries();
    const [selected, setSelected] = useState<Library | null>(null);
    const importRef = useRef<HTMLInputElement>(null);

    const handleNew = async () => {
        const lib: Library = {
            id: `user:new_${Date.now()}`,
            name: "mylib",
            description: "My custom library",
            code: "// mylib.rhai\n\nfn hello(name) {\n    chat.say(`Hello, ${name}!`);\n}\n",
            isStandard: false,
        };
        const saved = await save(lib);
        setSelected(saved);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const code = ev.target?.result as string;
            if (!code) return;
            const lib: Library = {
                id: `user:${file.name}_${Date.now()}`,
                name: file.name.replace(/\.rhai$/, ""),
                description: `Imported from ${file.name}`,
                code,
                isStandard: false,
            };
            const saved = await save(lib);
            setSelected(saved);
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const handleFork = async (forked: Library) => {
        const saved = await save(forked);
        setSelected(saved);
    };

    const handleSave = async (lib: Library) => {
        const saved = await save(lib);
        setSelected(saved);
    };

    const handleDelete = async (id: number | string) => {
        await del(id);
        setSelected(null);
    };

    return (
        <div className="flex h-full" style={{minHeight: 0}}>
            {loading ? (
                <div className="flex items-center justify-center flex-1"
                     style={{color: "#2a2a2a", fontSize: 12}}>
                    Loading libraries…
                </div>
            ) : (
                <>
                    <LibrarySidebar
                        libraries={libraries}
                        selected={selected}
                        onSelect={setSelected}
                        onNew={handleNew}
                        onImport={() => importRef.current?.click()}
                    />
                    <div className="flex-1 flex flex-col" style={{minHeight: 0}}>
                        {selected ? (
                            <LibraryEditor
                                key={selected.id}
                                library={selected}
                                onSave={handleSave}
                                onDelete={handleDelete}
                                onFork={handleFork}
                            />
                        ) : (
                            <div className="flex items-center justify-center flex-1"
                                 style={{color: "#2a2a2a", fontSize: 12}}>
                                Select a library to view or edit
                            </div>
                        )}
                    </div>
                </>
            )}
            <input ref={importRef} type="file" accept=".rhai" style={{display: "none"}} onChange={handleImport}/>
        </div>
    );
}
