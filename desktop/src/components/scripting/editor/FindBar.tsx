// Find & Replace bar — shown below toolbar, above editor area.
// Ctrl+F: open find. Ctrl+H: open find + replace.
// Escape: close. Enter/Shift+Enter: next/prev match.

import {useEffect, useRef, useState} from "react";

export interface FindState {
    term: string;
    replace: string;
    caseSensitive: boolean;
    useRegex: boolean;
    showReplace: boolean;
}

export const EMPTY_FIND: FindState = {
    term: "", replace: "", caseSensitive: false, useRegex: false, showReplace: false,
};

interface Props {
    find: FindState;
    onChange: (f: FindState) => void;
    onClose: () => void;
    matchCount: number;
    matchIndex: number;  // 0-based current match, -1 if none
    onNext: () => void;
    onPrev: () => void;
    onReplace: () => void;
    onReplaceAll: () => void;
}

const BTN: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 22, height: 22, borderRadius: 3, border: "1px solid #1e1e1e",
    background: "transparent", color: "#555", fontSize: 11, cursor: "pointer",
    flexShrink: 0,
};

export function FindBar({
                            find,
                            onChange,
                            onClose,
                            matchCount,
                            matchIndex,
                            onNext,
                            onPrev,
                            onReplace,
                            onReplaceAll
                        }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const upd = (patch: Partial<FindState>) => onChange({...find, ...patch});

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
        if (e.key === "Enter") {
            e.preventDefault();
            e.shiftKey ? onPrev() : onNext();
        }
    };

    const toggleStyle = (active: boolean): React.CSSProperties => ({
        ...BTN,
        backgroundColor: active ? "#1a1a1a" : "transparent",
        borderColor: active ? "#2a2a2a" : "#1e1e1e",
        color: active ? "#c0c0c0" : "#444",
    });

    const matchLabel = matchCount === 0
        ? (find.term ? "No results" : "")
        : `${matchIndex + 1} / ${matchCount}`;

    return (
        <div
            style={{backgroundColor: "#090909", borderBottom: "1px solid #141414", padding: "5px 10px", flexShrink: 0}}
            onKeyDown={handleKeyDown}>

            <div style={{display: "flex", alignItems: "center", gap: 6}}>
                {/* Search input */}
                <div style={{display: "flex", alignItems: "center", position: "relative"}}>
                    <input
                        ref={inputRef}
                        value={find.term}
                        onChange={(e) => upd({term: e.target.value})}
                        placeholder="Find…"
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        style={{
                            backgroundColor: "#0d0d0d",
                            border: `1px solid ${focused ? "#2a2a2a" : "#1e1e1e"}`,
                            borderRadius: 4, color: "#c0c0c0", fontSize: 11,
                            padding: "3px 60px 3px 7px", outline: "none", width: 200,
                        }}
                    />
                    {matchLabel && (
                        <span style={{
                            position: "absolute", right: 6, fontSize: 10,
                            color: matchCount === 0 && find.term ? "#f87171" : "#444",
                            pointerEvents: "none",
                        }}>
              {matchLabel}
            </span>
                    )}
                </div>

                {/* Case + Regex toggles */}
                <button style={toggleStyle(find.caseSensitive)}
                        onClick={() => upd({caseSensitive: !find.caseSensitive})} title="Case sensitive"
                        onMouseEnter={(e) => {
                            if (!find.caseSensitive) {
                                e.currentTarget.style.color = "#c0c0c0";
                                e.currentTarget.style.borderColor = "#2a2a2a";
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!find.caseSensitive) {
                                e.currentTarget.style.color = "#444";
                                e.currentTarget.style.borderColor = "#1e1e1e";
                            }
                        }}>
                    Aa
                </button>
                <button style={toggleStyle(find.useRegex)} onClick={() => upd({useRegex: !find.useRegex})}
                        title="Use regular expression"
                        onMouseEnter={(e) => {
                            if (!find.useRegex) {
                                e.currentTarget.style.color = "#c0c0c0";
                                e.currentTarget.style.borderColor = "#2a2a2a";
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!find.useRegex) {
                                e.currentTarget.style.color = "#444";
                                e.currentTarget.style.borderColor = "#1e1e1e";
                            }
                        }}>
                    .*
                </button>

                {/* Prev / Next */}
                <button style={BTN} onClick={onPrev} title="Previous (Shift+Enter)"
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#c0c0c0";
                            e.currentTarget.style.borderColor = "#2a2a2a";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#555";
                            e.currentTarget.style.borderColor = "#1e1e1e";
                        }}>
                    ↑
                </button>
                <button style={BTN} onClick={onNext} title="Next (Enter)"
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#c0c0c0";
                            e.currentTarget.style.borderColor = "#2a2a2a";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#555";
                            e.currentTarget.style.borderColor = "#1e1e1e";
                        }}>
                    ↓
                </button>

                {/* Toggle replace */}
                <button style={toggleStyle(find.showReplace)} onClick={() => upd({showReplace: !find.showReplace})}
                        title="Toggle replace"
                        onMouseEnter={(e) => {
                            if (!find.showReplace) {
                                e.currentTarget.style.color = "#c0c0c0";
                                e.currentTarget.style.borderColor = "#2a2a2a";
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!find.showReplace) {
                                e.currentTarget.style.color = "#444";
                                e.currentTarget.style.borderColor = "#1e1e1e";
                            }
                        }}>
                    ⇄
                </button>

                <div style={{flex: 1}}/>

                {/* Close */}
                <button style={{...BTN, border: "none", fontSize: 14}} onClick={onClose}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#f1f1f1";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#555";
                        }}>
                    ×
                </button>
            </div>

            {/* Replace row */}
            {find.showReplace && (
                <div style={{display: "flex", alignItems: "center", gap: 6, marginTop: 5}}>
                    <input
                        value={find.replace}
                        onChange={(e) => upd({replace: e.target.value})}
                        placeholder="Replace…"
                        style={{
                            backgroundColor: "#0d0d0d",
                            border: "1px solid #1e1e1e",
                            borderRadius: 4, color: "#c0c0c0", fontSize: 11,
                            padding: "3px 7px", outline: "none", width: 200,
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = "#2a2a2a";
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = "#1e1e1e";
                        }}
                    />
                    <SmallBtn label="Replace" onClick={onReplace}/>
                    <SmallBtn label="Replace All" onClick={onReplaceAll}/>
                </div>
            )}
        </div>
    );
}

function SmallBtn({label, onClick}: { label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: "2px 8px", borderRadius: 3, border: "1px solid #1e1e1e",
                backgroundColor: "transparent", color: "#555", fontSize: 11, cursor: "pointer",
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.color = "#c0c0c0";
                e.currentTarget.style.borderColor = "#2a2a2a";
                e.currentTarget.style.backgroundColor = "#111";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.color = "#555";
                e.currentTarget.style.borderColor = "#1e1e1e";
                e.currentTarget.style.backgroundColor = "transparent";
            }}>
            {label}
        </button>
    );
}

// ── Match computation ──────────────────────────────────────────────────────────

export interface Match {
    start: number;
    end: number;
}

export function computeMatches(text: string, find: FindState): Match[] {
    if (!find.term) return [];
    try {
        const flags = find.caseSensitive ? "g" : "gi";
        const pattern = find.useRegex ? find.term : find.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(pattern, flags);
        const matches: Match[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            if (m[0].length === 0) {
                re.lastIndex++;
                continue;
            }
            matches.push({start: m.index, end: m.index + m[0].length});
            if (matches.length > 5000) break; // safety cap
        }
        return matches;
    } catch {
        return [];
    }
}

// Build a match-highlight HTML overlay (inserted between syntax layers).
export function buildMatchOverlay(text: string, matches: Match[], currentIdx: number): string {
    if (matches.length === 0) return "";
    const parts: string[] = [];
    let pos = 0;
    for (let i = 0; i < matches.length; i++) {
        const {start, end} = matches[i];
        if (pos < start) {
            parts.push(esc(text.slice(pos, start)));
        }
        const isCurrent = i === currentIdx;
        const bg = isCurrent ? "rgba(255,180,0,0.55)" : "rgba(255,200,0,0.22)";
        parts.push(`<mark style="background:${bg};color:inherit;border-radius:2px">${esc(text.slice(start, end))}</mark>`);
        pos = end;
    }
    if (pos < text.length) parts.push(esc(text.slice(pos)));
    return parts.join("");
}

function esc(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
