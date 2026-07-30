import {useEffect, useRef, useState} from "react";

export interface ParseError {
    line: number;
    message: string;
}

const MAX_CHECK_LINES = 500;

// Rhai string/array methods that mutate their receiver IN PLACE and return ()
// — NOT value-returning like their JS-namesake equivalents. `let x = s.trim();`
// silently binds x = () while s itself ends up trimmed; the bug is invisible
// until whatever consumes x hits a "()" it didn't expect, often several lines
// (or scripts) away from the actual mistake. Confirmed the hard way: an entire
// session was spent chasing a "" isn't a valid level ID" error back to exactly
// this pattern in a UI action script. Call these as their own statement, then
// read the (now-mutated) variable — never assign their return value.
//
// Deliberately excludes push/remove/clear/insert/shuffle — the backend
// registers custom Rust functions with those exact names on several proxies
// (ms.collection().push/.remove/.clear, queue.remove/.clear/.shuffle,
// data.insert/.clear, rand.shuffle) that DO return meaningful values, and are
// routinely used in `let x = proxy.method(...)` form. Flagging those would be
// false positives — see desktop/src-tauri/src/scripting/proxy/.
const RHAI_INPLACE_MUTATORS = [
    "trim", "crop", "pad", "truncate", "push_str", "append",
    "drain", "retain", "splice", "fill_with",
    "make_lower", "make_upper", "sort", "reverse", "dedup", "swap",
];
// Case 1: `<lvalue> = <anything>.trim(...);` at the END of a statement — not
// just `let x = s.trim()`, but also `result[k] = parts.join("=").trim();`
// (index/field assignment, receiver itself a call chain, etc). Anchored to
// `=` (excluding ==/!=/<=/>=) and to end-of-line so it finds the outermost
// trailing call regardless of how complex the receiver expression is.
const INPLACE_MUTATOR_ASSIGN_RE = new RegExp(
    `[^=!<>]=(?!=)\\s*.+\\.(${RHAI_INPLACE_MUTATORS.join("|")})\\s*\\([^()]*\\)\\s*;?\\s*$`,
);
// Case 2: `<expr>.trim(...).<anything>` — chains off the () return value,
// anywhere in a line (assigned, returned, or bare like `if s.trim().len() == 0`).
// Worse than case 1: it doesn't just lose data, it throws "Function not
// found" the moment the script runs.
const INPLACE_MUTATOR_CHAIN_RE = new RegExp(
    `\\.(${RHAI_INPLACE_MUTATORS.join("|")})\\s*\\([^()]*\\)\\s*\\.`, "g",
);

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

        const isCommentLine = line.trim().startsWith("//");
        if (!isCommentLine) {
            const mutatorMatch = line.match(INPLACE_MUTATOR_ASSIGN_RE);
            if (mutatorMatch) {
                errors.push({
                    line: lineNum,
                    message: `.${mutatorMatch[1]}() mutates in place and returns () in Rhai — this assigns () instead of the result. Call it as its own statement, then use the variable.`,
                });
            }
            INPLACE_MUTATOR_CHAIN_RE.lastIndex = 0;
            let chainMatch: RegExpExecArray | null;
            while ((chainMatch = INPLACE_MUTATOR_CHAIN_RE.exec(line)) !== null) {
                errors.push({
                    line: lineNum,
                    message: `.${chainMatch[1]}() mutates in place and returns () in Rhai — chaining another call onto it (.${chainMatch[1]}()....) calls that method on (), which throws at runtime. Call .${chainMatch[1]}() as its own statement first.`,
                });
            }
        }

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
