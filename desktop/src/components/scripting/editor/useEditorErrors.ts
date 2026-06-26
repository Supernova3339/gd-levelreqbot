import {useEffect, useRef, useState} from "react";

export interface ParseError {
    line: number;
    message: string;
}

const MAX_CHECK_LINES = 500;

function check(text: string): ParseError[] {
    const errors: ParseError[] = [];
    const lines = text.split("\n");
    if (lines.length > MAX_CHECK_LINES) return []; // skip check on very large files
    let braceDepth = 0;
    let parenDepth = 0;
    let inString: '"' | "'" | "`" | null = null;

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const lineNum = li + 1;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];

            // Line comment ends the line
            if (!inString && ch === "/" && line[i + 1] === "/") break;

            if (inString) {
                if (ch === "\\" && i + 1 < line.length) {
                    i++;
                    continue;
                }
                if (ch === inString) {
                    inString = null;
                }
                continue;
            }

            if (ch === '"' || ch === "'" || ch === "`") {
                inString = ch as '"' | "'" | "`";
                continue;
            }
            if (ch === "{") braceDepth++;
            else if (ch === "}") {
                braceDepth--;
                if (braceDepth < 0) {
                    errors.push({line: lineNum, message: "Unexpected `}`"});
                    braceDepth = 0;
                }
            } else if (ch === "(") parenDepth++;
            else if (ch === ")") {
                parenDepth--;
                if (parenDepth < 0) {
                    errors.push({line: lineNum, message: "Unexpected `)`"});
                    parenDepth = 0;
                }
            }
        }

        // Unclosed single-line string
        if (inString === '"' || inString === "'") {
            errors.push({line: lineNum, message: `Unclosed string (${inString})`});
            inString = null;
        }
    }

    if (braceDepth > 0) errors.push({line: lines.length, message: `${braceDepth} unclosed brace(s) \`{\``});
    if (parenDepth > 0) errors.push({line: lines.length, message: `${parenDepth} unclosed paren(s) \`(\``});

    return errors;
}

export function useEditorErrors(text: string, debounceMs = 800): ParseError[] {
    const [errors, setErrors] = useState<ParseError[]>([]);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setErrors(check(text)), debounceMs);
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [text, debounceMs]);

    return errors;
}
