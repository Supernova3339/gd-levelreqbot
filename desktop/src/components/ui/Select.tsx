import {useCallback, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {computePosition, flip, offset, shift, size as sizeMiddleware} from "@floating-ui/dom";

/**
 * <select> replacement: a trigger button + a floating, portaled menu (via
 * @floating-ui/dom) instead of the native OS popup. Native <select> popups
 * are known to misbehave in frameless/custom-titlebar webviews (Tauri's
 * WebView2 on Windows in particular) — wrong position, clipped, or simply
 * not opening. This sidesteps that whole class of bug by staying in-DOM.
 */

export interface SelectOption<T extends string> {
    value: T;
    label: string;
}

interface Props<T extends string> {
    value: T;
    options: SelectOption<T>[];
    onChange: (v: T) => void;
    disabled?: boolean;
    label?: string;
    /** Visual density — "sm" matches compact filter-bar controls, "md" is the default form-field size. */
    size?: "sm" | "md";
    style?: React.CSSProperties;
}

export function Select<T extends string>({
                                             value, options, onChange, disabled, label, size = "md", style,
                                         }: Props<T>) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({top: -9999, left: -9999, width: 0});
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const cancelPos = useRef(false);

    const reposition = useCallback(() => {
        if (!btnRef.current || !menuRef.current) return;
        cancelPos.current = false;
        computePosition(btnRef.current, menuRef.current, {
            placement: "bottom-start",
            middleware: [
                offset(4), flip(), shift({padding: 8}),
                sizeMiddleware({
                    apply({rects, elements}) {
                        Object.assign(elements.floating.style, {minWidth: `${rects.reference.width}px`});
                    },
                }),
            ],
        }).then(({x, y}) => {
            if (!cancelPos.current) setPos({top: y, left: x, width: btnRef.current!.offsetWidth});
        });
    }, []);

    const setMenuRef = useCallback((node: HTMLDivElement | null) => {
        menuRef.current = node;
        if (node) reposition();
    }, [reposition]);

    useEffect(() => {
        if (!open) {
            cancelPos.current = true;
            return;
        }
        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
        return () => {
            cancelPos.current = true;
            window.removeEventListener("resize", reposition);
            window.removeEventListener("scroll", reposition, true);
        };
    }, [open, reposition]);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const key = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", key);
        return () => {
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", key);
        };
    }, [open]);

    const current = options.find(o => o.value === value);
    const sm = size === "sm";

    const trigger = (
        <button
            ref={btnRef}
            type="button"
            disabled={disabled}
            onClick={() => setOpen(o => !o)}
            onFocus={e => {
                e.currentTarget.style.borderColor = "var(--color-accent)";
            }}
            onBlur={e => {
                e.currentTarget.style.borderColor = "#1e1e1e";
            }}
            style={{
                display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between",
                fontSize: sm ? 10 : 12, padding: sm ? "3px 6px" : "6px 10px",
                backgroundColor: "#111", color: sm ? "#666" : "#999",
                border: "1px solid #1e1e1e", borderRadius: sm ? 5 : 6,
                // outline:none needs a replacement focus indicator, not just
                // removal — the borderColor swap above is it.
                outline: "none", cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.5 : 1, flexShrink: 0, width: sm ? "auto" : "100%",
                boxSizing: "border-box",
                ...style,
            }}
        >
            <span style={{overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                {current?.label ?? "—"}
            </span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
                 style={{flexShrink: 0, transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.1s"}}>
                <path d="M1.5 3L4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
        </button>
    );

    const menu = open && createPortal(
        <div ref={setMenuRef} style={{
            position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999,
            backgroundColor: "#111", border: "1px solid #242424", borderRadius: 8,
            padding: "4px 0", maxHeight: 280, overflowY: "auto",
            boxShadow: "0 12px 32px rgba(0,0,0,0.8)",
        }}>
            {options.map(o => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => {
                            onChange(o.value);
                            setOpen(false);
                        }}
                        style={{
                            display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                            padding: "6px 10px", fontSize: 11, whiteSpace: "nowrap",
                            color: active ? "var(--color-accent)" : "#aaa",
                            fontWeight: active ? 700 : 400,
                            background: "none", border: "none", cursor: "pointer",
                        }}
                        onMouseEnter={e => {
                            if (!active) e.currentTarget.style.backgroundColor = "#1a1a1a";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = "transparent";
                        }}
                    >
                        <span style={{width: 12, flexShrink: 0}}>{active ? "✓" : ""}</span>
                        <span style={{overflow: "hidden", textOverflow: "ellipsis"}}>{o.label}</span>
                    </button>
                );
            })}
        </div>,
        document.body
    );

    if (!label) return <>{trigger}{menu}</>;
    return (
        <label className="flex flex-col gap-1">
            <span style={{fontSize: 11, color: "#555", fontWeight: 500}}>{label}</span>
            {trigger}
            {menu}
        </label>
    );
}
