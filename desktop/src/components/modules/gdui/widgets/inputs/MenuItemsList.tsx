import type {MutableRefObject} from "react";
import type {WidgetAction} from "../../../../../lib/types";
import {resolveLucideIcon} from "../lucide";

// Shared item-rendering for any dropdown/context-style menu — used by
// ActionMenu (click-to-open, anchored under a trigger button) and the
// List row context menu (right-click, positioned at the cursor). Keeping
// this in one place means both always look and behave the same (icons,
// separators, danger/success coloring, keyboard focus) instead of drifting
// apart as two copies of the same ~80 lines.

function MenuIcon({name, color}: { name: string; color: string }) {
    const Ic = resolveLucideIcon(name);
    return Ic ? <Ic size={12} color={color}/> : null;
}

interface MenuItemsListProps {
    actions: WidgetAction[];
    itemRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
    onRun: (action: WidgetAction) => void;
    onFocusIdx: (i: number) => void;
    onKeyDown: (e: React.KeyboardEvent, idx: number) => void;
}

export function MenuItemsList({actions, itemRefs, onRun, onFocusIdx, onKeyDown}: MenuItemsListProps) {
    if (actions.length === 0) {
        return (
            <div style={{padding: "7px 10px", fontSize: 11, color: "#3a3a3a"}}>
                No actions
            </div>
        );
    }

    return (
        <>
            {actions.map((action, i) => {
                if (action.type === "separator") {
                    return action.label ? (
                        <div key={i} role="separator" style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "6px 10px 3px", marginTop: i === 0 ? 0 : 2,
                        }}>
                            <span style={{
                                fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                                color: "#3a3a3a", textTransform: "uppercase", userSelect: "none",
                            }}>
                                {action.label}
                            </span>
                        </div>
                    ) : (
                        <div key={i} role="separator"
                             style={{height: 1, backgroundColor: "#1c1c1c", margin: "3px 4px"}}/>
                    );
                }

                const isDanger = action.style === "danger";
                const isSuccess = action.style === "success";
                const color = isDanger ? "#f87171" : isSuccess ? "#4ade80" : "#c4c4c4";
                const hoverBg = isDanger ? "#1f0909" : "#191919";

                return (
                    <button
                        key={i}
                        ref={el => {
                            itemRefs.current[i] = el;
                        }}
                        role="menuitem"
                        onClick={() => onRun(action)}
                        onKeyDown={e => onKeyDown(e, i)}
                        onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = hoverBg;
                            onFocusIdx(i);
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        onFocus={e => {
                            e.currentTarget.style.backgroundColor = hoverBg;
                        }}
                        onBlur={e => {
                            e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        style={{
                            display: "flex",
                            alignItems: action.text ? "flex-start" : "center",
                            gap: 8, width: "100%", padding: "7px 10px", fontSize: 12,
                            color, cursor: "pointer", borderRadius: 6, border: "none",
                            backgroundColor: "transparent", textAlign: "left",
                            transition: "background-color 0.08s", userSelect: "none", outline: "none",
                        }}
                    >
                        {action.icon && (
                            <span style={{flexShrink: 0, marginTop: action.text ? 1 : 0}}>
                                <MenuIcon name={action.icon} color={color}/>
                            </span>
                        )}
                        <span style={{flex: 1, minWidth: 0}}>
                            <span style={{display: "block", lineHeight: 1.4}}>{action.label}</span>
                            {action.text && (
                                <span style={{
                                    display: "block",
                                    fontSize: 11,
                                    color: "#484848",
                                    lineHeight: 1.4,
                                    marginTop: 1
                                }}>
                                    {action.text}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </>
    );
}
