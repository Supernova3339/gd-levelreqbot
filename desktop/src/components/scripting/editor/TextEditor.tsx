import React, {useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,} from "react";
import {computePosition, flip, offset, shift} from "@floating-ui/dom";
import {useDebouncedCallback} from "use-debounce";
import {EditorToolbar} from "./EditorToolbar";
import {WarningIcon} from "../../icons";
import {highlightRhai} from "../../../lib/scripting/rhai-highlighter";
import type {ParseError} from "./useEditorErrors";
import type {ScriptingPrefs} from "../../../hooks/useScriptingPrefs";
import type {FindState} from "./FindBar";
import {buildMatchOverlay, computeMatches, EMPTY_FIND, FindBar} from "./FindBar";
import {KeybindContext, matchesShortcut} from "../../../hooks/useKeybinds";
import type {CompletionItem} from "../../../lib/scripting/proxy-api";
import {PROXY_API, PROXY_NAMES} from "../../../lib/scripting/proxy-api";
import {detectTrigger} from "./AutocompleteDropdown";

export const AC_STORAGE_KEY = "gdlqbot.autocomplete";

interface Props {
    text: string;
    onChange: (t: string) => void;
    errors: ParseError[];
    prefs: ScriptingPrefs;
    commandName?: string;
    onFind?: () => void;
    onRunTest?: () => void;
}

const LINE_GUTTER_W = 44;
const PADDING_LEFT = 12;

function sharedStyle(prefs: ScriptingPrefs): React.CSSProperties {
    return {
        fontFamily: `"${prefs.fontFamily}", monospace`,
        fontSize: prefs.fontSize,
        lineHeight: 1.6,
        tabSize: prefs.tabSize,
        whiteSpace: "pre",
        overflowWrap: "normal",
        padding: `8px ${PADDING_LEFT}px`,
        paddingLeft: LINE_GUTTER_W + PADDING_LEFT,
        margin: 0,
    };
}

// ── Line numbers gutter ────────────────────────────────────────────────────────

const LineNumbers = React.memo(function LineNumbers({
                                                        text, prefs, divRef,
                                                    }: {
    text: string;
    prefs: ScriptingPrefs;
    divRef: React.RefObject<HTMLDivElement | null>
}) {
    const count = text.split("\n").length;
    const lineHeight = prefs.fontSize * 1.6;
    return (
        <div ref={divRef} aria-hidden style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: LINE_GUTTER_W, overflow: "hidden",
            paddingTop: 8, paddingRight: 8, textAlign: "right",
            backgroundColor: "#080808", borderRight: "1px solid #0f0f0f",
            pointerEvents: "none", userSelect: "none",
            fontFamily: `"${prefs.fontFamily}", monospace`,
            fontSize: prefs.fontSize, lineHeight: 1.6, color: "#242424",
            zIndex: 2, boxSizing: "border-box",
        }}>
            {Array.from({length: count}, (_, i) => (
                <div key={i} style={{height: lineHeight}}>{i + 1}</div>
            ))}
        </div>
    );
});

// ── Highlight overlay ─────────────────────────────────────────────────────────

const HighlightLayer = React.memo(function HighlightLayer({
                                                              html, prefs, divRef,
                                                          }: {
    html: string;
    prefs: ScriptingPrefs;
    divRef: React.RefObject<HTMLDivElement | null>
}) {
    return (
        <div ref={divRef} aria-hidden
             dangerouslySetInnerHTML={{__html: html}}
             style={{
                 ...sharedStyle(prefs),
                 position: "absolute", inset: 0, zIndex: 0,
                 pointerEvents: "none", userSelect: "none",
                 overflow: "auto", scrollbarWidth: "none",
                 msOverflowStyle: "none" as React.CSSProperties["msOverflowStyle"],
                 backgroundColor: "#080808", color: "#d0d0d0",
             }}
        />
    );
});

// ── Match overlay ─────────────────────────────────────────────────────────────

const MatchLayer = React.memo(function MatchLayer({
                                                      html, prefs, divRef,
                                                  }: {
    html: string;
    prefs: ScriptingPrefs;
    divRef: React.RefObject<HTMLDivElement | null>
}) {
    return (
        <div ref={divRef} aria-hidden
             dangerouslySetInnerHTML={{__html: html}}
             style={{
                 ...sharedStyle(prefs),
                 position: "absolute", inset: 0, zIndex: 0,
                 pointerEvents: "none", userSelect: "none",
                 overflow: "hidden", color: "transparent",
                 backgroundColor: "transparent",
             }}
        />
    );
});

// ── Autocomplete dropdown ─────────────────────────────────────────────────────
//
// Positioning is computed ONCE on mount using a caret mirror div.
// This is the only place DOM layout is read for autocomplete — never on keypress.

interface AcState {
    items: CompletionItem[];
    selected: number;
    cursorPos: number;   // position in textarea text at which AC was triggered
}

const MIRROR_ID = "__rhai_caret_mirror__";

function buildCaretAnchor(ta: HTMLTextAreaElement, pos: number, lineHeight: number): Element {
    let mirror = document.getElementById(MIRROR_ID) as HTMLDivElement | null;
    if (!mirror) {
        mirror = document.createElement("div");
        mirror.id = MIRROR_ID;
        Object.assign(mirror.style, {
            position: "fixed", top: "-9999px", left: "-9999px",
            visibility: "hidden", pointerEvents: "none",
            whiteSpace: "pre-wrap", wordWrap: "break-word", overflow: "hidden",
        });
        document.body.appendChild(mirror);
    }

    const cs = window.getComputedStyle(ta);
    const props = ["font-size", "font-family", "font-weight", "line-height",
        "letter-spacing", "padding-top", "padding-left", "border-top-width", "border-left-width", "tab-size"];
    for (const p of props) {
        (mirror.style as unknown as Record<string, string>)[p] = cs.getPropertyValue(p);
    }
    mirror.style.width = ta.offsetWidth + "px";

    const text = ta.value.slice(0, pos);
    mirror.textContent = text;
    const span = document.createElement("span");
    span.textContent = "​";
    mirror.appendChild(span);

    const taRect = ta.getBoundingClientRect();
    const spanOffTop = span.offsetTop;
    const spanOffLeft = span.offsetLeft;

    // Clean up mirror content immediately to not accumulate DOM nodes
    while (mirror.firstChild) mirror.removeChild(mirror.firstChild);

    const top = taRect.top + spanOffTop - ta.scrollTop + lineHeight;
    const left = taRect.left + spanOffLeft - ta.scrollLeft;
    const bottom = top + lineHeight;

    return {
        getBoundingClientRect: () =>
            ({x: left, y: top, width: 0, height: lineHeight, top, right: left, bottom, left, toJSON: () => ({})}),
        contextElement: ta,
    } as unknown as Element;
}

function AcDropdown({ac, taRef, lineHeight, onSelect, onClose}: {
    ac: AcState;
    taRef: React.RefObject<HTMLTextAreaElement | null>;
    lineHeight: number;
    onSelect: (item: CompletionItem) => void;
    onClose: () => void;
}) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({top: -9999, left: -9999});
    const [hovered, setHovered] = useState<number | null>(null);

    // Compute position once when the dropdown mounts (or items change).
    // This is the only place we read layout — NOT on every keypress.
    useEffect(() => {
        const ta = taRef.current;
        const menu = menuRef.current;
        if (!ta || !menu) return;

        const anchor = buildCaretAnchor(ta, ac.cursorPos, lineHeight);
        computePosition(anchor, menu, {
            placement: "bottom-start",
            middleware: [offset(4), flip({padding: 8}), shift({padding: 8})],
        }).then(({x, y}) => setPos({top: y, left: x}));
    }, [ac.cursorPos, lineHeight, taRef]);

    // Scroll selected item into view when keyboard-navigating
    useEffect(() => {
        menuRef.current?.querySelector<HTMLElement>(`[data-idx="${ac.selected}"]`)?.scrollIntoView({block: "nearest"});
    }, [ac.selected]);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node)) onClose();
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    if (pos.top === -9999) return null; // not positioned yet — invisible

    return (
        <div ref={menuRef} style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 99998,
            backgroundColor: "#0e0e0e",
            border: "1px solid #222",
            borderRadius: 6,
            boxShadow: "0 8px 32px rgba(0,0,0,0.9)",
            width: 280,
            maxHeight: 220,
            overflowY: "auto",
            padding: "3px 0",
        }}>
            {ac.items.map((item, i) => {
                const isSel = i === ac.selected;
                const isHov = i === hovered;
                return (
                    <div key={item.label} data-idx={i}
                         onMouseDown={(e) => {
                             e.preventDefault();
                             onSelect(item);
                         }}
                         onMouseEnter={() => setHovered(i)}
                         onMouseLeave={() => setHovered(null)}
                         style={{
                             display: "flex",
                             alignItems: "baseline",
                             gap: 10,
                             padding: "4px 10px",
                             cursor: "pointer",
                             backgroundColor: isSel ? "#1e1e1e" : isHov ? "#161616" : "transparent",
                         }}>
                        <code style={{
                            color: "#ffcb6b", fontSize: 11,
                            fontFamily: '"JetBrains Mono","Fira Code",monospace',
                            flexShrink: 0, minWidth: 80,
                        }}>
                            {item.label}
                        </code>
                        <span style={{
                            color: "#333",
                            fontSize: 10,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                        }}>
              {item.docs}
            </span>
                    </div>
                );
            })}
        </div>
    );
}

// ── Bracket auto-close helpers ────────────────────────────────────────────────

const CLOSE: Record<string, string> = {"(": ")", "[": "]", "{": "}", '"': '"', "`": "`"};
const OPEN_CHARS = new Set(["(", "[", "{", '"', "`"]);
const CLOSE_CHARS = new Set([")", "]", "}", '"', "`"]);

function getLineInfo(text: string, pos: number) {
    const before = text.slice(0, pos);
    const lineStart = before.lastIndexOf("\n") + 1;
    const lineText = before.slice(lineStart);
    const indent = lineText.match(/^(\s*)/)?.[1] ?? "";
    return {lineStart, lineText, indent};
}

// ── Main component ────────────────────────────────────────────────────────────

export function TextEditor({text, onChange, errors, prefs, commandName, onFind, onRunTest}: Props) {
    const binds = useContext(KeybindContext);
    const taRef = useRef<HTMLTextAreaElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const matchRef = useRef<HTMLDivElement>(null);
    const gutterRef = useRef<HTMLDivElement>(null);
    const mountedRef = useRef(true);

    // ── Sync highlight (no delay) ──────────────────────────────────────────────
    const html = useMemo(() => highlightRhai(text), [text]);

    const [matchHtml, setMatchHtml] = useState("");
    const [currentLine, setCurrentLine] = useState(1);
    const [findState, setFindState] = useState<FindState>(EMPTY_FIND);
    const [findOpen, setFindOpen] = useState(false);
    const [matchIdx, setMatchIdx] = useState(0);
    const matchesRef = useRef<{ start: number; end: number }[]>([]);

    // ── Autocomplete state ─────────────────────────────────────────────────────
    const [acEnabled, setAcEnabled] = useState(() => localStorage.getItem(AC_STORAGE_KEY) !== "0");
    const [ac, setAc] = useState<AcState | null>(null);
    // Track last trigger string so we can close AC when user leaves the proxy.method context
    const lastTriggerRef = useRef<string | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Sync overlays + gutter on scroll
    const syncScroll = useCallback(() => {
        const ta = taRef.current;
        if (!ta) return;
        for (const ref of [overlayRef, matchRef]) {
            if (ref.current) {
                ref.current.scrollTop = ta.scrollTop;
                ref.current.scrollLeft = ta.scrollLeft;
            }
        }
        if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    }, []);

    useLayoutEffect(() => {
        syncScroll();
    }, [html, syncScroll]);

    // ── Search matches ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!findOpen || !findState.term) {
            setMatchHtml("");
            matchesRef.current = [];
            setMatchIdx(0);
            return;
        }
        const matches = computeMatches(text, findState);
        matchesRef.current = matches;
        const idx = Math.min(matchIdx, Math.max(0, matches.length - 1));
        setMatchIdx(idx);
        setMatchHtml(buildMatchOverlay(text, matches, idx));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text, findState, findOpen]);

    const goToMatch = useCallback((idx: number) => {
        const matches = matchesRef.current;
        if (!matches.length) return;
        const i = ((idx % matches.length) + matches.length) % matches.length;
        setMatchIdx(i);
        setMatchHtml(buildMatchOverlay(text, matches, i));
        const ta = taRef.current;
        if (ta) {
            ta.focus();
            ta.setSelectionRange(matches[i].start, matches[i].end);
        }
    }, [text]);

    const handleFindChange = useCallback((f: FindState) => {
        setFindState(f);
        setMatchIdx(0);
    }, []);

    const handleReplace = useCallback(() => {
        const m = matchesRef.current[matchIdx];
        if (!m) return;
        const next = text.slice(0, m.start) + findState.replace + text.slice(m.end);
        onChange(next);
        setTimeout(() => goToMatch(matchIdx), 0);
    }, [matchIdx, findState.replace, text, onChange, goToMatch]);

    const handleReplaceAll = useCallback(() => {
        const matches = matchesRef.current;
        if (!matches.length) return;
        let result = "";
        let pos = 0;
        for (const m of matches) {
            result += text.slice(pos, m.start) + findState.replace;
            pos = m.end;
        }
        onChange(result + text.slice(pos));
    }, [findState.replace, text, onChange]);

    // ── Current line highlight ─────────────────────────────────────────────────
    const updateCurrentLine = useCallback(() => {
        const ta = taRef.current;
        if (!ta) return;
        setCurrentLine(text.slice(0, ta.selectionStart).split("\n").length);
    }, [text]);

    const lineHeight = prefs.fontSize * 1.6;
    const lineHighlightTop = (currentLine - 1) * lineHeight + 8;

    // ── Insert helper ─────────────────────────────────────────────────────────
    const insert = (s: string) => {
        const ta = taRef.current;
        if (!ta) return;
        const start = ta.selectionStart, end = ta.selectionEnd;
        onChange(text.slice(0, start) + s + text.slice(end));
        requestAnimationFrame(() => {
            if (!mountedRef.current) return;
            ta.selectionStart = ta.selectionEnd = start + s.length;
            ta.focus();
        });
    };

    // ── Autocomplete — debounced text analysis ONLY (no DOM reads here) ────────
    //
    // The expensive caret position measurement (buildCaretAnchor) happens inside
    // AcDropdown on mount, not here. This function is pure string work.
    const runAcCheck = useDebouncedCallback(() => {
        if (!acEnabled || !mountedRef.current) return;
        const ta = taRef.current;
        if (!ta) return;
        const pos = ta.selectionStart;
        const trigger = detectTrigger(text, pos);

        // No trigger or unknown proxy — close dropdown
        if (!trigger || !PROXY_NAMES.includes(trigger.proxyName)) {
            lastTriggerRef.current = null;
            setAc(null);
            return;
        }

        const allItems = PROXY_API[trigger.proxyName] ?? [];
        const items = trigger.prefix
            ? allItems.filter((c) => c.label.toLowerCase().startsWith(trigger.prefix.toLowerCase()))
            : allItems;

        if (!items.length) {
            lastTriggerRef.current = null;
            setAc(null);
            return;
        }

        const triggerKey = `${trigger.proxyName}.${trigger.prefix}`;

        // If same proxy.prefix, just update items in-place (don't re-measure position)
        if (lastTriggerRef.current === trigger.proxyName + ".") {
            setAc((prev) => prev ? {...prev, items, cursorPos: pos} : {items, selected: 0, cursorPos: pos});
        } else {
            // New trigger — record position so AcDropdown can measure on mount
            lastTriggerRef.current = trigger.proxyName + ".";
            setAc({items, selected: 0, cursorPos: pos});
        }
        void triggerKey;
    }, 200);

    const applyCompletion = useCallback((item: CompletionItem) => {
        const ta = taRef.current;
        if (!ta) return;
        const pos = ta.selectionStart;
        const before = text.slice(0, pos);
        const prefixLen = (before.match(/(\w*)$/) ?? ["", ""])[1].length;
        const newText = text.slice(0, pos - prefixLen) + item.insert + text.slice(pos);
        onChange(newText);
        const cursorOff = item.cursor ?? -1;
        const finalPos = cursorOff >= 0
            ? (pos - prefixLen + cursorOff)
            : (pos - prefixLen + item.insert.length);
        requestAnimationFrame(() => {
            if (!mountedRef.current) return;
            ta.selectionStart = ta.selectionEnd = finalPos;
            ta.focus();
        });
        setAc(null);
        lastTriggerRef.current = null;
    }, [text, onChange]);

    // ── VS Code-style multiline operations ─────────────────────────────────────
    const moveLine = useCallback((dir: "up" | "down") => {
        const ta = taRef.current;
        if (!ta) return;
        const lines = text.split("\n");
        const before = text.slice(0, ta.selectionStart);
        const lineIdx = before.split("\n").length - 1;
        if (dir === "up" && lineIdx === 0) return;
        if (dir === "down" && lineIdx === lines.length - 1) return;
        const swap = dir === "up" ? lineIdx - 1 : lineIdx + 1;
        [lines[lineIdx], lines[swap]] = [lines[swap], lines[lineIdx]];
        onChange(lines.join("\n"));
    }, [text, onChange]);

    const duplicateLine = useCallback(() => {
        const ta = taRef.current;
        if (!ta) return;
        const lines = text.split("\n");
        const before = text.slice(0, ta.selectionStart);
        const lineIdx = before.split("\n").length - 1;
        const col = ta.selectionStart - (before.lastIndexOf("\n") + 1);
        lines.splice(lineIdx + 1, 0, lines[lineIdx]);
        const newText = lines.join("\n");
        onChange(newText);
        requestAnimationFrame(() => {
            if (!mountedRef.current) return;
            const lineStart = lines.slice(0, lineIdx + 1).join("\n").length + 1;
            ta.selectionStart = ta.selectionEnd = Math.min(lineStart + col, newText.length);
            ta.focus();
        });
    }, [text, onChange]);

    const deleteLine = useCallback(() => {
        const ta = taRef.current;
        if (!ta) return;
        const lines = text.split("\n");
        if (lines.length <= 1) {
            onChange("");
            return;
        }
        const before = text.slice(0, ta.selectionStart);
        const lineIdx = before.split("\n").length - 1;
        const col = ta.selectionStart - (before.lastIndexOf("\n") + 1);
        lines.splice(lineIdx, 1);
        const newText = lines.join("\n");
        onChange(newText);
        requestAnimationFrame(() => {
            if (!mountedRef.current) return;
            const safeIdx = Math.min(lineIdx, lines.length - 1);
            const lineStart = lines.slice(0, safeIdx).join("\n").length + (safeIdx > 0 ? 1 : 0);
            ta.selectionStart = ta.selectionEnd = Math.min(lineStart + col, newText.length);
            ta.focus();
        });
    }, [text, onChange]);

    // ── Key handler ────────────────────────────────────────────────────────────
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const ta = e.currentTarget;

        // ── Autocomplete navigation ──────────────────────────────────────────────
        if (ac) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setAc((p) => p ? {...p, selected: (p.selected + 1) % p.items.length} : null);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setAc((p) => p ? {...p, selected: (p.selected - 1 + p.items.length) % p.items.length} : null);
                return;
            }
            if ((e.key === "Enter" || e.key === "Tab") && ac.items[ac.selected]) {
                e.preventDefault();
                applyCompletion(ac.items[ac.selected]);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setAc(null);
                lastTriggerRef.current = null;
                return;
            }
        }

        // ── Find / replace ───────────────────────────────────────────────────────
        if (matchesShortcut(e as unknown as KeyboardEvent, binds["editor.find"] ?? "Ctrl+F")) {
            e.preventDefault();
            setFindOpen(true);
            if (onFind) onFind();
            return;
        }
        if (matchesShortcut(e as unknown as KeyboardEvent, binds["editor.replace"] ?? "Ctrl+H")) {
            e.preventDefault();
            setFindOpen(true);
            setFindState((p) => ({...p, showReplace: true}));
            return;
        }
        if (matchesShortcut(e as unknown as KeyboardEvent, binds["editor.run"] ?? "Ctrl+Enter")) {
            e.preventDefault();
            if (onRunTest) onRunTest();
            return;
        }

        // ── VS Code multiline ops ─────────────────────────────────────────────────
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.altKey && (e.key === "ArrowUp" || e.key === "Up")) {
            e.preventDefault();
            moveLine("up");
            return;
        }
        if (ctrl && e.altKey && (e.key === "ArrowDown" || e.key === "Down")) {
            e.preventDefault();
            moveLine("down");
            return;
        }
        if (ctrl && e.shiftKey && e.key.toUpperCase() === "D") {
            e.preventDefault();
            duplicateLine();
            return;
        }
        if (ctrl && e.shiftKey && e.key.toUpperCase() === "K") {
            e.preventDefault();
            deleteLine();
            return;
        }

        // ── Tab → indent / unindent ───────────────────────────────────────────────
        if (e.key === "Tab") {
            e.preventDefault();
            const s = ta.selectionStart, end = ta.selectionEnd;
            const pad = " ".repeat(prefs.tabSize);
            if (s !== end) {
                const lineStart = text.lastIndexOf("\n", s - 1) + 1;
                const sel = text.slice(lineStart, end);
                const newSel = e.shiftKey
                    ? sel.split("\n").map((l) => l.startsWith(pad) ? l.slice(prefs.tabSize) : l.replace(/^ {1,3}/, "")).join("\n")
                    : sel.split("\n").map((l) => pad + l).join("\n");
                const newText = text.slice(0, lineStart) + newSel + text.slice(end);
                onChange(newText);
                requestAnimationFrame(() => {
                    if (!mountedRef.current) return;
                    ta.selectionStart = lineStart;
                    ta.selectionEnd = lineStart + newSel.length;
                });
            } else {
                onChange(text.slice(0, s) + pad + text.slice(end));
                requestAnimationFrame(() => {
                    if (!mountedRef.current) return;
                    ta.selectionStart = ta.selectionEnd = s + prefs.tabSize;
                });
            }
            return;
        }

        // ── Enter → smart indent ──────────────────────────────────────────────────
        if (e.key === "Enter") {
            const s = ta.selectionStart;
            const {lineText, indent} = getLineInfo(text, s);
            const trimmed = lineText.trimEnd();
            const nextChar = text[s];
            if (trimmed.endsWith("{") && nextChar === "}") {
                e.preventDefault();
                const inner = indent + " ".repeat(prefs.tabSize);
                const ins = `\n${inner}\n${indent}`;
                onChange(text.slice(0, s) + ins + text.slice(s));
                requestAnimationFrame(() => {
                    if (!mountedRef.current) return;
                    ta.selectionStart = ta.selectionEnd = s + 1 + inner.length;
                });
                return;
            }
            if (trimmed.endsWith("{")) {
                e.preventDefault();
                const ins = `\n${indent + " ".repeat(prefs.tabSize)}`;
                onChange(text.slice(0, s) + ins + text.slice(s));
                requestAnimationFrame(() => {
                    if (!mountedRef.current) return;
                    ta.selectionStart = ta.selectionEnd = s + ins.length;
                });
                return;
            }
            if (indent) {
                e.preventDefault();
                const ins = `\n${indent}`;
                onChange(text.slice(0, s) + ins + text.slice(ta.selectionEnd));
                requestAnimationFrame(() => {
                    if (!mountedRef.current) return;
                    ta.selectionStart = ta.selectionEnd = s + ins.length;
                });
                return;
            }
        }

        // ── Backspace: remove auto-close pair ─────────────────────────────────────
        if (e.key === "Backspace") {
            const s = ta.selectionStart;
            if (s > 0 && s === ta.selectionEnd) {
                const prev = text[s - 1], next = text[s];
                if (OPEN_CHARS.has(prev) && CLOSE[prev] === next) {
                    e.preventDefault();
                    onChange(text.slice(0, s - 1) + text.slice(s + 1));
                    requestAnimationFrame(() => {
                        if (!mountedRef.current) return;
                        ta.selectionStart = ta.selectionEnd = s - 1;
                    });
                    return;
                }
            }
        }

        // ── Auto-close brackets / quotes ──────────────────────────────────────────
        if (OPEN_CHARS.has(e.key)) {
            const s = ta.selectionStart, end = ta.selectionEnd;
            const close = CLOSE[e.key];
            if (s !== end) {
                e.preventDefault();
                const sel = text.slice(s, end);
                onChange(text.slice(0, s) + e.key + sel + close + text.slice(end));
                requestAnimationFrame(() => {
                    if (!mountedRef.current) return;
                    ta.selectionStart = s + 1;
                    ta.selectionEnd = end + 1;
                });
                return;
            }
            if (e.key === '"' || e.key === '`') {
                const lineStart = text.lastIndexOf("\n", s - 1) + 1;
                const beforeCursor = text.slice(lineStart, s);
                const quoteCount = (beforeCursor.match(new RegExp(e.key === '"' ? '"' : '`', "g")) ?? []).length;
                if (quoteCount % 2 !== 0) return;
            }
            e.preventDefault();
            onChange(text.slice(0, s) + e.key + close + text.slice(end));
            requestAnimationFrame(() => {
                if (!mountedRef.current) return;
                ta.selectionStart = ta.selectionEnd = s + 1;
            });
            return;
        }

        // ── Skip over matching close char ─────────────────────────────────────────
        if (CLOSE_CHARS.has(e.key) && e.key !== '"' && e.key !== '`') {
            const s = ta.selectionStart;
            if (text[s] === e.key) {
                e.preventDefault();
                requestAnimationFrame(() => {
                    if (!mountedRef.current) return;
                    ta.selectionStart = ta.selectionEnd = s + 1;
                });
                return;
            }
        }
    };

    // After any input: update line tracker and schedule the debounced AC check.
    // We do NOT read any layout here — the debounced callback is pure string ops.
    const handleInput = useCallback(() => {
        updateCurrentLine();
        if (acEnabled) runAcCheck();
        else setAc(null);
    }, [acEnabled, runAcCheck, updateCurrentLine]);

    return (
        <div className="flex flex-col flex-1" style={{minHeight: 0}}>
            <EditorToolbar
                onInsert={insert}
                commandName={commandName}
                onFind={() => setFindOpen(true)}
                onRunTest={onRunTest}
                acEnabled={acEnabled}
                onToggleAc={() => {
                    const next = !acEnabled;
                    setAcEnabled(next);
                    setAc(null);
                    lastTriggerRef.current = null;
                    if (next) localStorage.removeItem(AC_STORAGE_KEY);
                    else localStorage.setItem(AC_STORAGE_KEY, "0");
                }}
            />

            {findOpen && (
                <FindBar
                    find={findState}
                    onChange={handleFindChange}
                    onClose={() => {
                        setFindOpen(false);
                        setMatchHtml("");
                    }}
                    matchCount={matchesRef.current.length}
                    matchIndex={matchIdx}
                    onNext={() => goToMatch(matchIdx + 1)}
                    onPrev={() => goToMatch(matchIdx - 1)}
                    onReplace={handleReplace}
                    onReplaceAll={handleReplaceAll}
                />
            )}

            <div style={{flex: 1, position: "relative", minHeight: 0, overflow: "hidden", backgroundColor: "#080808"}}>
                {/* Current line highlight */}
                <div style={{
                    position: "absolute",
                    left: LINE_GUTTER_W, right: 0,
                    top: lineHighlightTop - (overlayRef.current?.scrollTop ?? 0),
                    height: lineHeight,
                    background: "rgba(255,255,255,0.023)",
                    pointerEvents: "none", zIndex: 1,
                }}/>

                <LineNumbers text={text} prefs={prefs} divRef={gutterRef}/>
                <HighlightLayer html={html} prefs={prefs} divRef={overlayRef}/>
                {matchHtml && <MatchLayer html={matchHtml} prefs={prefs} divRef={matchRef}/>}

                {ac && (
                    <AcDropdown
                        ac={ac}
                        taRef={taRef}
                        lineHeight={lineHeight}
                        onSelect={applyCompletion}
                        onClose={() => {
                            setAc(null);
                            lastTriggerRef.current = null;
                        }}
                    />
                )}

                <textarea
                    ref={taRef}
                    value={text}
                    data-rhai-editor
                    spellCheck={false}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onInput={handleInput}
                    onScroll={syncScroll}
                    onClick={updateCurrentLine}
                    onKeyUp={updateCurrentLine}
                    style={{
                        ...sharedStyle(prefs),
                        position: "absolute", inset: 0, zIndex: 3,
                        resize: "none", border: "none", outline: "none",
                        backgroundColor: "transparent", color: "transparent",
                        caretColor: "#f1f1f1", overflow: "auto",
                    }}
                />
            </div>

            {errors.length > 0 && (
                <div className="flex-shrink-0 px-3 py-1.5"
                     style={{backgroundColor: "#120808", borderTop: "1px solid #2a1010"}}>
                    {errors.slice(0, 3).map((err, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs" style={{color: "#f87171"}}>
                            <WarningIcon size={11}/>
                            <span style={{cursor: "pointer"}} onClick={() => {
                                const ta = taRef.current;
                                if (!ta) return;
                                const lines = text.split("\n");
                                let pos = 0;
                                for (let j = 0; j < Math.min(err.line - 1, lines.length); j++) pos += lines[j].length + 1;
                                ta.focus();
                                ta.setSelectionRange(pos, pos + (lines[err.line - 1]?.length ?? 0));
                                updateCurrentLine();
                            }}>
                line {err.line}: {err.message}
              </span>
                        </div>
                    ))}
                    {errors.length > 3 &&
                        <p className="text-xs mt-0.5" style={{color: "#555"}}>+{errors.length - 3} more</p>}
                </div>
            )}
        </div>
    );
}
