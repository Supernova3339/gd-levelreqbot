import type {LayoutNode, WidgetAction} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useAction} from "../../hooks/useAction";
import {PlatformDot} from "./PlatformDot";
import {resolveLucideIcon} from "../lucide";

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
    onSelect: () => void;
}

function SectionRow({
                        row, rowIdKey, primary, secondary, secondaryPrefix, platformKey,
                        positionField, badgeField,
                        selKey, isSelected, rowActions, onSelect,
                    }: SectionRowProps) {
    const {dispatch, busy} = useAction();
    const isBusy = busy !== null;

    const positionVal = positionField ? row[positionField] : undefined;
    const badgeVal = badgeField ? String(row[badgeField] ?? "") : undefined;

    return (
        <div
            onClick={() => selKey && onSelect()}
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

    const rowIdKey = node.row_id ?? "_id";
    const selKey = node.selection_key;
    const navigateTo = node.row_navigate_to;

    // Compare selected row by its ID field, not by object identity
    const selectedRow = (selKey ? state[selKey] : undefined) as RowData | undefined;
    const selectedRowId = selectedRow != null && typeof selectedRow === "object"
        ? String(selectedRow[rowIdKey] ?? "")
        : String(selectedRow ?? "");

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
                <span style={{fontSize: 12}}>{node.empty_message ?? "Nothing here yet."}</span>
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
