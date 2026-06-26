// Autocomplete dropdown for the Rhai script editor.
// Triggered when typing "proxy." — shows matching methods for that proxy.

import {useEffect, useRef} from "react";
import type {CompletionItem} from "../../../lib/scripting/proxy-api";

interface Props {
    items: CompletionItem[];
    selected: number;
    top: number;
    left: number;
    onSelect: (item: CompletionItem) => void;
    onClose: () => void;
}

export function AutocompleteDropdown({items, selected, top, left, onSelect, onClose}: Props) {
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    // Scroll selected item into view
    useEffect(() => {
        const el = ref.current?.querySelector(`[data-idx="${selected}"]`) as HTMLElement | null;
        el?.scrollIntoView({block: "nearest"});
    }, [selected]);

    if (items.length === 0) return null;

    // Clamp position to viewport
    const W = 300, H = Math.min(items.length * 30 + 8, 248);
    const clampedTop = Math.min(top, window.innerHeight - H - 8);
    const clampedLeft = Math.min(left, window.innerWidth - W - 8);

    return (
        <div ref={ref} style={{
            position: "fixed",
            top: clampedTop,
            left: clampedLeft,
            zIndex: 99998,
            backgroundColor: "#0e0e0e",
            border: "1px solid #1e1e1e",
            borderRadius: 5,
            boxShadow: "0 8px 28px rgba(0,0,0,0.85)",
            width: W,
            maxHeight: H,
            overflowY: "auto",
            padding: "4px 0",
        }}>
            {items.map((item, i) => (
                <div
                    key={item.label}
                    data-idx={i}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(item);
                    }}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "4px 10px",
                        cursor: "pointer",
                        backgroundColor: i === selected ? "#1a1a1a" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.backgroundColor = "#181818";
                    }}>
                    <code style={{
                        color: "#ffcb6b",
                        fontSize: 11,
                        fontFamily: '"JetBrains Mono","Fira Code",monospace',
                        flexShrink: 0
                    }}>
                        {item.label}
                    </code>
                    <span style={{
                        color: "#2a2a2a",
                        fontSize: 10,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                    }}>
            {item.docs}
          </span>
                </div>
            ))}
        </div>
    );
}

// ── Caret position helper ─────────────────────────────────────────────────────
// Mirrors the textarea into a hidden div to measure pixel position of the caret.

let mirror: HTMLDivElement | null = null;

function getMirror(): HTMLDivElement {
    if (!mirror) {
        mirror = document.createElement("div");
        mirror.setAttribute("aria-hidden", "true");
        mirror.style.cssText = [
            "position:absolute", "top:-9999px", "left:-9999px",
            "visibility:hidden", "white-space:pre-wrap", "word-wrap:break-word",
            "overflow-wrap:break-word", "overflow:hidden",
        ].join(";");
        document.body.appendChild(mirror);
    }
    return mirror;
}

const COPIED_PROPS = [
    "box-sizing", "width", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "font-size", "font-family", "font-weight", "line-height", "letter-spacing",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "tab-size", "white-space",
] as const;

export function getCaretCoordinates(
    ta: HTMLTextAreaElement,
    pos: number,
): { top: number; left: number } {
    const div = getMirror();
    const style = window.getComputedStyle(ta);
    for (const prop of COPIED_PROPS) {
        (div.style as unknown as Record<string, string>)[prop] = style.getPropertyValue(prop);
    }
    div.style.width = ta.offsetWidth + "px";

    const text = ta.value.slice(0, pos);
    div.textContent = text;

    const span = document.createElement("span");
    span.textContent = "​"; // zero-width space to measure position
    div.appendChild(span);

    const taRect = ta.getBoundingClientRect();

    // Remove the mirror content for next call
    div.textContent = "";

    return {
        top: taRect.top + span.offsetTop - ta.scrollTop + parseInt(style.lineHeight),
        left: taRect.left + span.offsetLeft - ta.scrollLeft,
    };
}

// ── Trigger detection ─────────────────────────────────────────────────────────

export interface TriggerResult {
    proxyName: string;
    prefix: string;  // characters typed after the dot
}

export function detectTrigger(text: string, cursorPos: number): TriggerResult | null {
    const before = text.slice(0, cursorPos);
    // Match "proxyname.prefix" at end of text-before-cursor
    const m = before.match(/(\w+)\.(\w*)$/);
    if (!m) return null;
    return {proxyName: m[1], prefix: m[2]};
}
