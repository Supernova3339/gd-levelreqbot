// Keyboard shortcuts for the script editor — driven by KeybindContext.

import {useContext, useEffect} from "react";
import {KeybindContext, matchesShortcut} from "../../../hooks/useKeybinds";

interface Handlers {
    onSave?: () => void;
    onSwitchMode?: () => void;
    getText?: () => string;
    setText?: (t: string) => void;
}

export function useScriptingKeybinds({onSave, onSwitchMode, getText, setText}: Handlers) {
    const binds = useContext(KeybindContext);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const ctrl = e.ctrlKey || e.metaKey;

            // Save
            if (matchesShortcut(e, binds["editor.save"] ?? "Ctrl+S")) {
                e.preventDefault();
                onSave?.();
                return;
            }

            // Ctrl+Shift+M → toggle mode (not user-remappable, internal)
            if (ctrl && e.shiftKey && e.key === "M") {
                e.preventDefault();
                onSwitchMode?.();
                return;
            }

            // Comment/uncomment selected lines
            if (matchesShortcut(e, binds["editor.comment"] ?? "Ctrl+/")) {
                e.preventDefault();
                if (!getText || !setText) return;
                const text = getText();
                const el = document.querySelector<HTMLTextAreaElement>("[data-rhai-editor]");
                if (!el) return;
                const start = el.selectionStart;
                const end = el.selectionEnd;
                const lines = text.split("\n");

                let charCount = 0;
                const lineRanges: { start: number; end: number; idx: number }[] = [];
                for (let i = 0; i < lines.length; i++) {
                    const lineStart = charCount;
                    const lineEnd = charCount + lines[i].length;
                    if (lineEnd >= start && lineStart <= end) lineRanges.push({start: lineStart, end: lineEnd, idx: i});
                    charCount += lines[i].length + 1;
                }

                const allCommented = lineRanges.every((r) => lines[r.idx].trimStart().startsWith("//"));
                const nextLines = [...lines];
                for (const {idx} of lineRanges) {
                    if (allCommented) {
                        nextLines[idx] = nextLines[idx].replace(/^(\s*)\/\/\s?/, "$1");
                    } else {
                        nextLines[idx] = "// " + nextLines[idx];
                    }
                }
                setText(nextLines.join("\n"));
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [binds, onSave, onSwitchMode, getText, setText]);
}
