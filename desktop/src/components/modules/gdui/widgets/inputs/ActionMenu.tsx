import {useCallback, useEffect, useRef, useState} from "react";
import type {LayoutNode, WidgetAction} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useAction} from "../../hooks/useAction";
import {resolveLucideIcon} from "../lucide";
import {MenuItemsList} from "./MenuItemsList";

const TRIGGER: Record<string, { bg: string; color: string; border: string; hoverBg: string }> = {
    primary: {
        bg: "var(--color-accent)",
        color: "#fff",
        border: "none",
        hoverBg: "color-mix(in srgb, var(--color-accent) 80%, white 20%)"
    },
    ghost: {bg: "transparent", color: "#888", border: "1px solid #2a2a2a", hoverBg: "#1a1a1a"},
    default: {bg: "#1e1e1e", color: "#ccc", border: "1px solid #2e2e2e", hoverBg: "#262626"},
};

export function ActionMenu({node}: { node: LayoutNode }) {
    const {navigate, state} = useModulePageContext();
    const {dispatch, busy} = useAction();
    const [open, setOpen] = useState(false);
    const [focusedIdx, setFocusedIdx] = useState(-1);
    const menuRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const actions = (node.actions ?? []) as WidgetAction[];
    const label = (node.menu_label as string | undefined) ?? "Actions";
    const variant = (node.menu_variant as string | undefined) ?? "default";
    const iconName = node.menu_icon as string | undefined;
    const isBusy = busy !== null;
    const ts = TRIGGER[variant] ?? TRIGGER.default;

    // Labels like "···" "..." "⋯" are purely decorative — suppress the chevron
    const isSymbol = /^[·.…⋯\s]+$/.test(label);

    // Indices of real (non-separator) items for arrow-key navigation
    const navItems = actions
        .map((a, i) => ({a, i}))
        .filter(({a}) => a.type !== "separator")
        .map(({i}) => i);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const h = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
                setFocusedIdx(-1);
            }
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open]);

    // Focus first real item whenever the menu opens
    useEffect(() => {
        if (open) setFocusedIdx(navItems[0] ?? -1);
        else setFocusedIdx(-1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Imperatively focus the target button
    useEffect(() => {
        if (open && focusedIdx >= 0) itemRefs.current[focusedIdx]?.focus();
    }, [open, focusedIdx]);

    const close = useCallback(() => {
        setOpen(false);
        setFocusedIdx(-1);
    }, []);

    const resolveArgs = (action: WidgetAction): string[] => {
        if (action.args) return action.args;
        if (action.arg_field) {
            const selKey = node.selection_key as string | undefined;
            const sel = selKey ? state[selKey] as Record<string, unknown> | undefined : undefined;
            const val = sel?.[action.arg_field];
            return val != null ? [String(val)] : [];
        }
        return [];
    };

    const run = (action: WidgetAction) => {
        close();
        if (action.navigate_to) navigate(action.navigate_to === ".." ? null : action.navigate_to);
        else void dispatch(action.action_key, resolveArgs(action));
    };

    const handleKey = (e: React.KeyboardEvent, idx: number) => {
        const pos = navItems.indexOf(idx);
        if (e.key === "Escape" || e.key === "Tab") {
            e.preventDefault();
            close();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setFocusedIdx(navItems[(pos + 1) % navItems.length] ?? idx);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setFocusedIdx(navItems[(pos - 1 + navItems.length) % navItems.length] ?? idx);
        } else if (e.key === "Home") {
            e.preventDefault();
            if (navItems[0] !== undefined) setFocusedIdx(navItems[0]);
        } else if (e.key === "End") {
            e.preventDefault();
            const last = navItems[navItems.length - 1];
            if (last !== undefined) setFocusedIdx(last);
        }
    };

    // Trigger icon
    let TriggerIcon: React.ReactNode = null;
    if (iconName) {
        const Ic = resolveLucideIcon(iconName);
        if (Ic) TriggerIcon = <Ic size={13} color={ts.color}/>;
    }

    return (
        <div ref={menuRef} style={{position: "relative", display: "inline-block"}}>
            {/* Trigger */}
            <button
                onClick={() => setOpen(o => !o)}
                disabled={isBusy}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: TriggerIcon ? 5 : 2,
                    padding: isSymbol && !TriggerIcon ? "5px 7px" : "5px 11px",
                    backgroundColor: ts.bg,
                    color: ts.color,
                    border: ts.border,
                    borderRadius: 6,
                    fontSize: isSymbol ? 13 : 12,
                    letterSpacing: isSymbol ? "0.08em" : undefined,
                    fontWeight: 500,
                    cursor: isBusy ? "not-allowed" : "pointer",
                    opacity: isBusy ? 0.5 : 1,
                    transition: "background-color 0.1s, opacity 0.1s",
                    flexShrink: 0,
                    outline: "none",
                }}
                onMouseEnter={e => {
                    if (!isBusy) e.currentTarget.style.backgroundColor = ts.hoverBg;
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = ts.bg;
                }}
            >
                {TriggerIcon}
                {label}
                {!isSymbol && (
                    <svg
                        width="8" height="8" viewBox="0 0 8 8" fill="none"
                        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                        style={{
                            opacity: 0.5,
                            transition: "transform 0.14s",
                            transform: open ? "rotate(180deg)" : "none"
                        }}
                    >
                        <polyline points="1,2.5 4,5.5 7,2.5"/>
                    </svg>
                )}
            </button>

            {/* Dropdown panel */}
            {open && (
                <div
                    role="menu"
                    style={{
                        position: "absolute",
                        top: "calc(100% + 5px)",
                        right: 0,
                        minWidth: 168,
                        backgroundColor: "#0d0d0d",
                        border: "1px solid #1e1e1e",
                        borderRadius: 9,
                        boxShadow: "0 16px 40px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)",
                        zIndex: 1000,
                        padding: 4,
                        animationName: "gdui-menu-in",
                        animationDuration: "0.1s",
                        animationTimingFunction: "ease",
                        animationFillMode: "both",
                    }}
                >
                    <style>{`
                        @keyframes gdui-menu-in {
                            from { opacity: 0; transform: scale(0.96) translateY(-3px); }
                            to   { opacity: 1; transform: scale(1)    translateY(0);    }
                        }
                    `}</style>

                    <MenuItemsList
                        actions={actions}
                        itemRefs={itemRefs}
                        onRun={run}
                        onFocusIdx={setFocusedIdx}
                        onKeyDown={handleKey}
                    />
                </div>
            )}
        </div>
    );
}
