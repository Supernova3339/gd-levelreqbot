import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import type {LayoutNode, WidgetAction} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useAction} from "../../hooks/useAction";
import {PlatformDot} from "./PlatformDot";
import {resolveLucideIcon} from "../lucide";
import {MenuItemsList} from "../inputs/MenuItemsList";

type RowData = Record<string, unknown>;

function RowActionIcon({name}: { name: string }) {
    const Ic = resolveLucideIcon(name);
    return Ic ? <Ic size={11}/> : null;
}

const BADGE_COLORS: Record<string, { bg: string; color: string }> = {
    subscriber: {bg: "#3b0764", color: "#d8b4fe"},
    sub: {bg: "#3b0764", color: "#d8b4fe"},
    viewer: {bg: "#1c1c1c", color: "#666"},
    twitch: {bg: "#2d1060", color: "#c084fc"},
    youtube: {bg: "#450a0a", color: "#fca5a5"},
    quick: {bg: "#78350f22", color: "#fbbf24"},
};

function RowBadge({value}: { value: string }) {
    const style = BADGE_COLORS[value.toLowerCase()] ?? {bg: "#1e1e1e", color: "#555"};
    return (
        <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 3,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            backgroundColor: style.bg,
            color: style.color,
            flexShrink: 0,
        }}>
            {value}
        </span>
    );
}

// Right-click menu for a single row — positioned at the click point via a
// portal (so it isn't clipped by the List's own overflow:auto scroll area),
// closes on outside click, Escape, or after running an item. `copy_field`
// items are handled entirely here (clipboard write, no script dispatch);
// everything else goes through the same dispatch() as RowAction.
function RowContextMenuPanel({
                                 x, y, actions, row, rowIdKey, onClose,
                             }: {
    x: number; y: number; actions: WidgetAction[]; row: RowData; rowIdKey: string; onClose: () => void;
}) {
    const {dispatch} = useAction();
    const panelRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [, setFocusedIdx] = useState(-1);

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
        };
        const k = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", h);
        document.addEventListener("keydown", k);
        return () => {
            document.removeEventListener("mousedown", h);
            document.removeEventListener("keydown", k);
        };
    }, [onClose]);

    const run = (action: WidgetAction) => {
        onClose();
        if (action.copy_field) {
            const val = String(row[action.copy_field] ?? "");
            void navigator.clipboard.writeText(val);
            return;
        }
        const argField = action.arg_field ?? rowIdKey;
        const argVal = String(row[argField] ?? "");
        void dispatch(action.action_key, [argVal]);
    };

    // Clamp so the panel never renders past the right/bottom edge of the window.
    const style: React.CSSProperties = {
        position: "fixed",
        left: Math.min(x, window.innerWidth - 190),
        top: Math.min(y, window.innerHeight - 12 - actions.length * 30),
        minWidth: 168,
        backgroundColor: "#0d0d0d",
        border: "1px solid #1e1e1e",
        borderRadius: 9,
        boxShadow: "0 16px 40px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)",
        zIndex: 2000,
        padding: 4,
    };

    return createPortal(
        <div ref={panelRef} role="menu" style={style}>
            <MenuItemsList
                actions={actions}
                itemRefs={itemRefs}
                onRun={run}
                onFocusIdx={setFocusedIdx}
                onKeyDown={e => {
                    if (e.key === "Escape") onClose();
                }}
            />
        </div>,
        document.body
    );
}

interface SectionRowProps {
    row: RowData;
    rowIdKey: string;
    primary?: string;
    secondary?: string;
    secondaryPrefix?: string;
    platformKey?: string;
    positionField?: string;
    badgeField?: string;
    selKey?: string;
    isSelected: boolean;
    rowActions: WidgetAction[];
    rowContextMenu: WidgetAction[];
    onSelect: () => void;
}

function SectionRow({
                        row, rowIdKey, primary, secondary, secondaryPrefix, platformKey,
                        positionField, badgeField,
                        selKey, isSelected, rowActions, rowContextMenu, onSelect,
                    }: SectionRowProps) {
    const {dispatch, busy} = useAction();
    const isBusy = busy !== null;
    const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

    const positionVal = positionField ? row[positionField] : undefined;
    const badgeVal = badgeField ? String(row[badgeField] ?? "") : undefined;

    const closeMenu = useCallback(() => setMenuPos(null), []);

    return (
        <div
            onClick={() => selKey && onSelect()}
            onContextMenu={e => {
                if (rowContextMenu.length === 0) return;
                e.preventDefault();
                setMenuPos({x: e.clientX, y: e.clientY});
            }}
            style={{
                padding: "6px 10px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: selKey ? "pointer" : "default",
                backgroundColor: isSelected
                    ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                    : "transparent",
                borderLeft: `2px solid ${isSelected ? "var(--color-accent)" : "transparent"}`,
                opacity: isBusy ? 0.5 : 1,
                transition: "background-color 0.08s, border-color 0.08s",
            }}
            onMouseEnter={e => {
                if (!isSelected) e.currentTarget.style.backgroundColor = "#181818";
            }}
            onMouseLeave={e => {
                if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
            }}
        >
            {/* Position number */}
            {positionVal !== undefined && (
                <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#555",
                    width: 22,
                    textAlign: "right",
                    flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                }}>
                    #{String(positionVal)}
                </div>
            )}

            {platformKey && <PlatformDot platform={String(row[platformKey] ?? "")}/>}

            <div style={{flex: 1, minWidth: 0}}>
                {primary && (
                    <div style={{
                        fontSize: 13, color: "#e0e0e0", fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                        {String(row[primary] ?? "")}
                    </div>
                )}
                {secondary && (
                    <div style={{
                        fontSize: 11, color: "#666",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                        {secondaryPrefix ?? ""}{String(row[secondary] ?? "")}
                    </div>
                )}
            </div>

            {/* Trailing badge */}
            {badgeVal && <RowBadge value={badgeVal}/>}

            {rowActions.map((action, ai) => {
                const argField = action.arg_field ?? rowIdKey;
                const argVal = String(row[argField] ?? "");
                const iconOnly = !action.label && !!action.icon;
                return (
                    <button
                        key={ai}
                        onClick={e => {
                            e.stopPropagation();
                            dispatch(action.action_key, [argVal]);
                        }}
                        disabled={!!busy}
                        title={iconOnly ? action.icon : undefined}
                        aria-label={iconOnly ? action.icon : undefined}
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            gap: action.label ? 4 : 0,
                            padding: iconOnly ? 4 : "2px 6px",
                            borderRadius: 3,
                            fontSize: 11,
                            backgroundColor: "transparent",
                            color: action.style === "danger" ? "#f87171" : "#555",
                            border: "none",
                            cursor: "pointer",
                            opacity: !!busy ? 0.3 : 1,
                            transition: "color 0.1s",
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.color = action.style === "danger" ? "#ef4444" : "#bbb";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.color = action.style === "danger" ? "#f87171" : "#555";
                        }}
                    >
                        {action.icon && <RowActionIcon name={action.icon}/>}
                        {action.label}
                    </button>
                );
            })}

            {menuPos && (
                <RowContextMenuPanel
                    x={menuPos.x}
                    y={menuPos.y}
                    actions={rowContextMenu}
                    row={row}
                    rowIdKey={rowIdKey}
                    onClose={closeMenu}
                />
            )}
        </div>
    );
}

interface SectionBlockProps {
    section: { label?: string; data_expr: string };
    node: LayoutNode;
}

function SectionBlock({section, node}: SectionBlockProps) {
    const {state, setState, navigate} = useModulePageContext();
    const {data, loading, error} = useEval(section.data_expr);
    const rows = Array.isArray(data) ? (data as RowData[]) : [];
    const {data: emptyMsgData} = useEval(node.empty_message_expr);
    const emptyMessage = (node.empty_message_expr && typeof emptyMsgData === "string")
        ? emptyMsgData
        : node.empty_message ?? "Nothing here yet.";

    const rowIdKey = node.row_id ?? "_id";
    const selKey = node.selection_key;
    const navigateTo = node.row_navigate_to;

    // Compare selected row by its ID field, not by object identity
    const selectedRow = (selKey ? state[selKey] : undefined) as RowData | undefined;
    const selectedRowId = selectedRow != null && typeof selectedRow === "object"
        ? String(selectedRow[rowIdKey] ?? "")
        : String(selectedRow ?? "");

    // `selected` is otherwise a snapshot frozen at click time — if the
    // underlying row's OWN fields change later (a module mutating a
    // collection doc in place, not just a separate key the detail view
    // re-fetches on its own), nothing here ever refreshed it, so a widget
    // reading straight off `selected.someField` would keep showing stale
    // data indefinitely. Re-sync it to the live copy (by id) whenever the
    // list's data changes, so `selected` always reflects the current row —
    // clears it if that row was removed rather than leaving a dangling
    // reference to something no longer in the list.
    const freshSelected = useMemo(() => {
        if (!selKey || selectedRowId === "") return undefined;
        return rows.find(r => String(r[rowIdKey] ?? "") === selectedRowId);
    }, [rows, selKey, selectedRowId, rowIdKey]);

    useEffect(() => {
        if (!selKey || selectedRowId === "") return;
        if (freshSelected === undefined) {
            setState(selKey, undefined);
        } else if (JSON.stringify(freshSelected) !== JSON.stringify(selectedRow)) {
            setState(selKey, freshSelected);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [freshSelected, selKey, selectedRowId]);

    if (loading && rows.length === 0) {
        return (
            <div style={{padding: "10px 12px", fontSize: 12, color: "#2a2a2a"}}>
                Loading…
            </div>
        );
    }

    if (error && rows.length === 0) {
        return (
            <div style={{padding: "16px 12px", fontSize: 12, color: "#f87171"}}>
                Failed to load data: {error}
            </div>
        );
    }

    if (!loading && rows.length === 0) {
        return (
            <div style={{
                padding: "28px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                color: "#2a2a2a",
            }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                     strokeLinecap="round">
                    <rect x="3" y="5" width="18" height="2" rx="1" opacity="0.8"/>
                    <rect x="3" y="10" width="14" height="2" rx="1" opacity="0.5"/>
                    <rect x="3" y="15" width="16" height="2" rx="1" opacity="0.3"/>
                </svg>
                <span style={{fontSize: 12}}>{emptyMessage}</span>
            </div>
        );
    }

    return (
        <>
            {section.label && rows.length > 0 && (
                <div style={{
                    padding: "5px 12px 3px",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#3a3a3a",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                }}>
                    {section.label}
                </div>
            )}
            {rows.map(row => {
                const rowId = String(row[rowIdKey] ?? "");
                const isSelected = selectedRowId !== "" && selectedRowId === rowId;

                return (
                    <SectionRow
                        key={rowId}
                        row={row}
                        rowIdKey={rowIdKey}
                        primary={node.row_primary}
                        secondary={node.row_secondary}
                        secondaryPrefix={node.row_secondary_prefix}
                        platformKey={node.row_platform}
                        positionField={node.row_position_field}
                        badgeField={node.row_badge_field}
                        selKey={selKey}
                        isSelected={isSelected}
                        rowActions={node.row_actions ?? []}
                        rowContextMenu={node.row_context_menu ?? []}
                        onSelect={() => {
                            if (selKey) setState(selKey, row);
                            if (navigateTo) navigate(navigateTo);
                        }}
                    />
                );
            })}
        </>
    );
}

export function List({node}: { node: LayoutNode }) {
    const sections = node.sections ?? [];

    return (
        <div style={{
            flex: 1, overflowY: "auto", minHeight: 0,
            scrollbarWidth: "thin", scrollbarColor: "#2a2a2a transparent",
        }}>
            {sections.length === 0 && (
                <div style={{padding: 24, fontSize: 12, color: "#333", textAlign: "center"}}>
                    {node.empty_message ?? "Nothing here yet."}
                </div>
            )}
            {sections.map((section, i) => (
                <SectionBlock key={i} section={section} node={node}/>
            ))}
        </div>
    );
}
