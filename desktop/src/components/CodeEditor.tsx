import {useRef, useState} from "react";

// ─── GDBot scripting language highlighter ────────────────────────────────────
// Simple tokenizer for the text-based script mode

interface Token {
    type: "keyword" | "condition" | "string" | "variable" | "comment" | "number" | "plain";
    value: string
}

const KEYWORDS = new Set(["say", "reply", "require", "if", "else", "add_level", "next_level", "remove_level", "clear_queue", "inc_counter", "stop"]);
const CONDITIONS = new Set(["is_mod", "is_sub", "is_broadcaster", "is_staff", "has_args", "is_level_id", "queue_empty"]);

const COLORS = {
    keyword: "#818cf8",
    condition: "#f59e0b",
    string: "#86efac",
    variable: "#f97316",
    comment: "#4b5563",
    number: "#67e8f9",
    plain: "#d0d0d0",
};

function tokenize(line: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < line.length) {
        // Comment
        if (line[i] === "/" && line[i + 1] === "/") {
            tokens.push({type: "comment", value: line.slice(i)});
            break;
        }
        // String
        if (line[i] === '"') {
            let j = i + 1;
            while (j < line.length && line[j] !== '"') j++;
            tokens.push({type: "string", value: line.slice(i, j + 1)});
            i = j + 1;
            continue;
        }
        // Variable {name}
        if (line[i] === "{") {
            let j = i + 1;
            while (j < line.length && line[j] !== "}") j++;
            tokens.push({type: "variable", value: line.slice(i, j + 1)});
            i = j + 1;
            continue;
        }
        // Word
        if (/[a-z_]/i.test(line[i])) {
            let j = i;
            while (j < line.length && /[a-z0-9_]/i.test(line[j])) j++;
            const word = line.slice(i, j);
            const type = KEYWORDS.has(word) ? "keyword" : CONDITIONS.has(word) ? "condition" : "plain";
            tokens.push({type, value: word});
            i = j;
            continue;
        }
        // Number
        if (/\d/.test(line[i])) {
            let j = i;
            while (j < line.length && /\d/.test(line[j])) j++;
            tokens.push({type: "number", value: line.slice(i, j)});
            i = j;
            continue;
        }
        // Other (punctuation, whitespace)
        tokens.push({type: "plain", value: line[i]});
        i++;
    }
    return tokens;
}

function HighlightedLine({line}: { line: string }) {
    const tokens = tokenize(line);
    return (
        <span>
      {tokens.map((t, i) => (
          <span key={i} style={{color: COLORS[t.type]}}>{t.value}</span>
      ))}
    </span>
    );
}

// ─── The editor itself ────────────────────────────────────────────────────────

interface CodeEditorProps {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}

export function CodeEditor({value, onChange, placeholder}: CodeEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const highlightRef = useRef<HTMLDivElement>(null);
    const [focused, setFocused] = useState(false);

    // Keep scroll positions in sync
    const syncScroll = () => {
        if (textareaRef.current && highlightRef.current) {
            highlightRef.current.scrollTop = textareaRef.current.scrollTop;
            highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
        }
    };

    // Tab key inserts two spaces
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Tab") {
            e.preventDefault();
            const el = e.currentTarget;
            const s = el.selectionStart;
            const next = value.slice(0, s) + "  " + value.slice(s);
            onChange(next);
            requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = s + 2;
            });
        }
    };

    const lines = value.split("\n");

    return (
        <div
            className="relative flex h-full font-mono text-sm overflow-hidden rounded-lg"
            style={{
                backgroundColor: "#0a0a0a",
                border: `1px solid ${focused ? "var(--color-accent)" : "#1e1e1e"}`,
                transition: "border-color 0.15s",
            }}
        >
            {/* Line numbers */}
            <div
                className="flex-shrink-0 select-none text-right overflow-hidden"
                style={{
                    width: 40, padding: "12px 8px",
                    backgroundColor: "#0d0d0d",
                    borderRight: "1px solid #1a1a1a",
                    color: "#333",
                    fontSize: 12,
                    lineHeight: "20px",
                }}
            >
                {lines.map((_, i) => (
                    <div key={i}>{i + 1}</div>
                ))}
            </div>

            {/* Highlighted background */}
            <div
                ref={highlightRef}
                aria-hidden
                style={{
                    position: "absolute", left: 40, top: 0, right: 0, bottom: 0,
                    padding: "12px 12px",
                    fontSize: 13, lineHeight: "20px",
                    overflow: "hidden", pointerEvents: "none",
                    whiteSpace: "pre", color: "#d0d0d0",
                }}
            >
                {lines.map((line, i) => (
                    <div key={i} style={{minHeight: 20}}>
                        {line ? <HighlightedLine line={line}/> : " "}
                    </div>
                ))}
            </div>

            {/* Actual transparent textarea */}
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onScroll={syncScroll}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                spellCheck={false}
                placeholder={placeholder}
                style={{
                    position: "absolute", left: 40, top: 0, right: 0, bottom: 0,
                    padding: "12px 12px",
                    fontSize: 13, lineHeight: "20px",
                    backgroundColor: "transparent",
                    color: "transparent",
                    caretColor: "#f1f1f1",
                    border: "none",
                    outline: "none",
                    resize: "none",
                    fontFamily: "monospace",
                    whiteSpace: "pre",
                    overflowX: "auto",
                }}
            />
        </div>
    );
}

// ─── Language reference panel ─────────────────────────────────────────────────

export function CodeReference() {
    const sections = [
        {
            title: "Actions",
            color: "#818cf8",
            items: [
                ['say "message"', "Send a chat message"],
                ['reply "message"', "Reply with @mention"],
                ['add_level', "Add {args} to queue"],
                ['next_level', "Pop next level"],
                ['remove_level', "Remove {args}"],
                ['clear_queue', "Wipe entire queue"],
                ['inc_counter', "Increment {count}"],
                ['stop', "End execution"],
            ],
        },
        {
            title: "Control",
            color: "#8b5cf6",
            items: [
                ['require <cond>', "Stop unless met"],
                ['if <cond> { ... }', "Conditional"],
                ['if <cond> { ... } else { ... }', "With else"],
            ],
        },
        {
            title: "Conditions",
            color: "#f59e0b",
            items: [
                ['is_mod', 'User is moderator'],
                ['is_sub', 'User is subscriber'],
                ['is_broadcaster', 'User is broadcaster'],
                ['is_staff', 'Mod or broadcaster'],
                ['has_args', 'Message has text after trigger'],
                ['is_level_id', 'Args contain a level ID'],
                ['queue_empty', 'Queue has no entries'],
            ],
        },
        {
            title: "Variables",
            color: "#f97316",
            items: [
                ['{user}', 'Triggering username'],
                ['{args}', 'Text after the command'],
                ['{count}', 'Command use counter'],
                ['{queue_size}', 'Total levels in queue'],
                ['{platform}', 'Twitch or YouTube'],
            ],
        },
    ];

    return (
        <div className="overflow-y-auto p-4 flex flex-col gap-4" style={{backgroundColor: "#0a0a0a"}}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{color: "#555"}}>
                Language reference
            </p>
            {sections.map((s) => (
                <div key={s.title}>
                    <p className="text-xs font-semibold mb-1.5" style={{color: s.color}}>{s.title}</p>
                    <div className="flex flex-col gap-0.5">
                        {s.items.map(([code, desc]) => (
                            <div key={code} className="flex gap-3 text-xs">
                                <code className="flex-shrink-0"
                                      style={{color: s.color, minWidth: 160, fontFamily: "monospace"}}>
                                    {code}
                                </code>
                                <span style={{color: "#555"}}>{desc}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
