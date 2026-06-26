// Editor toolbar: variable chips (left), snippets + actions (right).

import {VarChipDropdown} from "./VarChipDropdown";
import {SnippetDropdown} from "./SnippetDropdown";
import {KeybindingsHelp} from "./KeybindingsHelp";

interface Props {
    onInsert: (text: string) => void;
    commandName?: string;
    onFind?: () => void;
    onRunTest?: () => void;
    acEnabled?: boolean;
    onToggleAc?: () => void;
}

export function EditorToolbar({onInsert, commandName, onFind, onRunTest, acEnabled = true, onToggleAc}: Props) {
    const handleExport = async () => {
        const ta = document.querySelector<HTMLTextAreaElement>("[data-rhai-editor]");
        if (!ta) return;
        const {saveScriptFile} = await import("../fileio");
        saveScriptFile(ta.value, (commandName ?? "command") + ".rhai");
    };

    const handleImport = async () => {
        const {loadScriptFile} = await import("../fileio");
        const content = await loadScriptFile();
        if (content !== null) onInsert(content);
    };

    return (
        <div className="flex items-center flex-shrink-0"
             style={{
                 height: 36,
                 paddingLeft: 10,
                 paddingRight: 10,
                 gap: 6,
                 borderBottom: "1px solid #161616",
                 backgroundColor: "#0a0a0a",
             }}>

            {/* ── Left: library chips ── */}
            <VarChipDropdown onInsert={onInsert}/>

            <div style={{flex: 1, minWidth: 0}}/>

            {/* ── Right: actions ── */}
            <div style={{display: "flex", alignItems: "center", gap: 4, flexShrink: 0}}>
                <SnippetDropdown onInsert={onInsert}/>

                <Divider/>

                {/* Autocomplete toggle */}
                {onToggleAc && (
                    <ToolBtn
                        onClick={onToggleAc}
                        title={`Autocomplete ${acEnabled ? "on — click to disable" : "off — click to enable"}`}
                        label="◎"
                        color={acEnabled ? "var(--color-accent)" : "#333"}
                    />
                )}

                {/* Find */}
                {onFind && (
                    <ToolBtn onClick={onFind} title="Find (Ctrl+F)" label="⌕"/>
                )}

                {/* Run test */}
                {onRunTest && (
                    <ToolBtn onClick={onRunTest} title="Run / test script (Ctrl+Enter)" label="▶" color="#4ade80"/>
                )}

                <Divider/>

                <FileBtn onClick={handleImport} label="Import" icon="↑"/>
                <FileBtn onClick={handleExport} label="Export" icon="↓"/>

                <Divider/>

                <KeybindingsHelp/>
            </div>
        </div>
    );
}

function Divider() {
    return (
        <span style={{
            display: "inline-block",
            width: 1,
            height: 14,
            backgroundColor: "#1e1e1e",
            flexShrink: 0,
            margin: "0 2px",
        }}/>
    );
}

function ToolBtn({onClick, title, label, color}: {
    onClick: () => void;
    title: string;
    label: string;
    color?: string
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: 4,
                border: "1px solid #1a1a1a",
                backgroundColor: "transparent",
                color: color ?? "#444",
                fontSize: 12,
                cursor: "pointer",
                flexShrink: 0,
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.color = color ?? "#c0c0c0";
                e.currentTarget.style.borderColor = "#2a2a2a";
                e.currentTarget.style.backgroundColor = "#141414";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.color = color ?? "#444";
                e.currentTarget.style.borderColor = "#1a1a1a";
                e.currentTarget.style.backgroundColor = "transparent";
            }}>
            {label}
        </button>
    );
}

function FileBtn({onClick, label, icon}: { onClick: () => void; label: string; icon: string }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid #1a1a1a",
                backgroundColor: "transparent",
                color: "#444",
                fontSize: 11,
                cursor: "pointer",
                flexShrink: 0,
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.color = "#c0c0c0";
                e.currentTarget.style.borderColor = "#2a2a2a";
                e.currentTarget.style.backgroundColor = "#141414";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.color = "#444";
                e.currentTarget.style.borderColor = "#1a1a1a";
                e.currentTarget.style.backgroundColor = "transparent";
            }}>
            <span style={{fontSize: 11, lineHeight: 1}}>{icon}</span>
            {label}
        </button>
    );
}
