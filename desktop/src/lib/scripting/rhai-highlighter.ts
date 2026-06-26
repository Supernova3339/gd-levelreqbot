// Syntax highlighter for Rhai scripts.
// All RegExp objects are compiled once at module load — never inside a loop.

const C_KW = "#c792ea";
const C_OP = "#89ddff";
const C_NUM = "#f78c6c";
const C_STR = "#f78c6c";
const C_TMPL_EX = "#ffcb6b";
const C_COMMENT = "#444";
const C_DIR_K = "#c792ea";
const C_DIR_V = "#888";
const C_NS = "#82aaff";
const C_METHOD = "#4fc1ff";
const C_NULL = "#89ddff";

const KEYWORDS = new Set([
    "if", "else", "fn", "let", "return", "for", "while", "loop",
    "break", "continue", "true", "false", "import", "as", "switch",
]);

// Pre-compiled — NOT created inside any loop.
// RE_TMPL_EXPR has no /g flag here; split() handles repetition internally.
const RE_DIRECTIVE = /^(\s*)(\/\/\s*)(@\w+)(\s.*)?$/;
const RE_OPERATORS = /^(&&|\|\||!=|==|<=|>=|[!<>+\-*\/%^&|:?~])/;
const RE_NUMBER = /^(\d+(?:\.\d+)?)/;
const RE_WORD_CHAR = /[\w.$]/;
const RE_SPACE_PUNC = /[\s,;[\]{}()]/;
const RE_TMPL_EXPR = /(\$\{[^}]*\})/;  // no /g — split handles repetition
const RE_PREV_OP = /[\s,;(=+\-*\/%<>!&|]/;

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sp(c: string, t: string): string {
    return `<span style="color:${c}">${t}</span>`;
}

function highlightTemplateLiteral(raw: string): string {
    // RE_TMPL_EXPR has no /g flag — split() uses it as a separator regex and
    // captures groups are included in the result, which is what we want.
    return raw.split(RE_TMPL_EXPR).map((p) =>
        p.startsWith("${") && p.endsWith("}") ? sp(C_TMPL_EX, esc(p)) : sp(C_STR, esc(p))
    ).join("");
}

function highlightLine(line: string): string {
    if (!line.trim()) return esc(line);

    // Directive: // @key value
    const dir = RE_DIRECTIVE.exec(line);
    if (dir) {
        return esc(dir[1])
            + sp(C_COMMENT, esc(dir[2]))
            + sp(C_DIR_K, esc(dir[3]))
            + sp(C_DIR_V, esc(dir[4] ?? ""));
    }

    const out: string[] = [];
    const len = line.length;
    let i = 0;

    while (i < len) {
        const ch = line[i];

        // Line comment
        if (ch === "/" && line[i + 1] === "/") {
            out.push(sp(C_COMMENT, esc(line.slice(i))));
            break;
        }

        // Template string
        if (ch === "`") {
            let j = i + 1;
            while (j < len && line[j] !== "`") {
                if (line[j] === "\\" && j + 1 < len) j++;
                j++;
            }
            out.push(
                sp(C_STR, esc("`"))
                + highlightTemplateLiteral(line.slice(i + 1, j))
                + sp(C_STR, esc("`"))
            );
            i = j + 1;
            continue;
        }

        // String literals
        if (ch === '"' || ch === "'") {
            let j = i + 1;
            while (j < len && line[j] !== ch) {
                if (line[j] === "\\" && j + 1 < len) j++;
                j++;
            }
            out.push(sp(C_STR, esc(line.slice(i, j + 1))));
            i = j + 1;
            continue;
        }

        // () null — must come before the general ( handler below
        if (ch === "(" && line[i + 1] === ")") {
            out.push(sp(C_NULL, "()"));
            i += 2;
            continue;
        }

        // Number
        const numM = RE_NUMBER.exec(line.slice(i));
        if (numM && (i === 0 || RE_PREV_OP.test(line[i - 1]))) {
            out.push(sp(C_NUM, esc(numM[1])));
            i += numM[1].length;
            continue;
        }

        // Operators (now includes ^&|:?~ so those chars don't fall through)
        const opM = RE_OPERATORS.exec(line.slice(i));
        if (opM) {
            out.push(sp(C_OP, esc(opM[0])));
            i += opM[0].length;
            continue;
        }

        // Whitespace / punctuation (now includes parens so bare ( ) advance i)
        if (RE_SPACE_PUNC.test(ch)) {
            out.push(esc(ch));
            i++;
            continue;
        }

        // Word scan
        let j = i;
        while (j < len && RE_WORD_CHAR.test(line[j])) j++;

        if (j === i) {
            // No branch matched and it's not a word char — emit raw and always advance.
            out.push(esc(ch));
            i++;
            continue;
        }

        const word = line.slice(i, j);
        i = j;

        const nextCh = line[i] === "(" || (line[i] === " " && line[i + 1] === "(");
        const segs = word.split(".");

        if (nextCh && segs.length > 1) {
            out.push(sp(C_NS, esc(segs[0])));
            for (let k = 1; k < segs.length; k++) out.push(sp(C_OP, ".") + sp(C_METHOD, esc(segs[k])));
        } else if (nextCh) {
            out.push(sp(C_NS, esc(word)));
        } else if (KEYWORDS.has(word)) {
            out.push(sp(C_KW, esc(word)));
        } else if (segs.length > 1) {
            out.push(sp(C_NS, esc(segs[0])));
            for (let k = 1; k < segs.length; k++) out.push(sp(C_OP, ".") + sp(C_METHOD, esc(segs[k])));
        } else {
            out.push(esc(word));
        }
    }

    return out.join("");
}

const MAX_LINES = 500;

export function highlightRhai(text: string): string {
    const lines = text.split("\n");
    if (lines.length > MAX_LINES) {
        const highlighted = lines.slice(0, MAX_LINES).map(highlightLine).join("\n");
        const rest = esc(lines.slice(MAX_LINES).join("\n"));
        return highlighted + "\n" + rest;
    }
    return lines.map(highlightLine).join("\n");
}
