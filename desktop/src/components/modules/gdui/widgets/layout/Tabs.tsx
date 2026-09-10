import {useEffect, useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useModuleResourceImage} from "../../hooks/useModuleResourceImage";
import {NodeRenderer} from "../NodeRenderer";
import {resolveLucideIcon} from "../lucide";

function TabBadge({expr, pill}: { expr?: string; pill?: boolean }) {
    const {state} = useModulePageContext();
    const {data} = useEval(expr, state);
    const n = data != null ? Number(data) : NaN;
    if (isNaN(n) || n === 0) return null;
    const label = n > 999 ? "999+" : String(n);
    if (!pill) {
        return (
            <span style={{fontSize: 10, color: "inherit", fontWeight: 600, opacity: 0.6}}>
                {label}
            </span>
        );
    }
    return (
        <span style={{
            fontSize: 9, fontWeight: 700,
            minWidth: 15, height: 15,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            borderRadius: 99, padding: "0 4px",
            backgroundColor: "rgba(255,255,255,0.12)",
            color: "inherit",
        }}>
            {label}
        </span>
    );
}

function TabIcon({name, size = 12}: { name: string; size?: number }) {
    const {moduleId} = useModulePageContext();
    const [ns, iconName] = name.includes(":") ? name.split(":", 2) : ["lucide", name];

    if (ns === "resource") {
        return <TabResourceIcon moduleId={moduleId} path={iconName} size={size}/>;
    }

    const Comp = resolveLucideIcon(iconName);
    if (!Comp) return null;
    return <span style={{display: "inline-flex", alignItems: "center", opacity: 0.7}}><Comp size={size}/></span>;
}

function TabResourceIcon({moduleId, path, size}: { moduleId: string; path: string; size: number }) {
    const url = useModuleResourceImage(moduleId, path);
    if (!url) return null;
    return (
        <span style={{display: "inline-flex", alignItems: "center", opacity: 0.85}}>
            <img src={url} alt="" width={size} height={size} style={{objectFit: "contain", display: "block"}}/>
        </span>
    );
}

type TabDef = {
    label: string;
    icon?: string;
    badge_expr?: string;
    show_expr?: string;
    show_key?: string;
    content: LayoutNode
};

function UnderlineStrip({tabs, active, onSwitch}: { tabs: TabDef[]; active: number; onSwitch: (i: number) => void }) {
    return (
        <div style={{display: "flex", borderBottom: "1px solid #1c1c1c", flexShrink: 0}}>
            {tabs.map((tab, i) => {
                const isActive = i === active;
                return (
                    <button
                        key={i}
                        onClick={() => onSwitch(i)}
                        style={{
                            padding: "7px 14px",
                            fontSize: 12,
                            border: "none",
                            borderBottom: `2px solid ${isActive ? "var(--color-accent)" : "transparent"}`,
                            cursor: "pointer",
                            backgroundColor: "transparent",
                            color: isActive ? "#f1f1f1" : "#555",
                            fontWeight: isActive ? 500 : 400,
                            display: "flex", alignItems: "center", gap: 5,
                            transition: "color 0.12s",
                            marginBottom: -1,
                        }}
                        onMouseEnter={e => {
                            if (!isActive) e.currentTarget.style.color = "#999";
                        }}
                        onMouseLeave={e => {
                            if (!isActive) e.currentTarget.style.color = "#555";
                        }}
                    >
                        {tab.icon && <TabIcon name={tab.icon}/>}
                        {tab.label}
                        <TabBadge expr={tab.badge_expr}/>
                    </button>
                );
            })}
        </div>
    );
}

function PillsStrip({tabs, active, onSwitch}: { tabs: TabDef[]; active: number; onSwitch: (i: number) => void }) {
    return (
        <div style={{
            display: "flex", gap: 3, padding: "7px 10px",
            borderBottom: "1px solid #1c1c1c", flexShrink: 0,
        }}>
            {tabs.map((tab, i) => {
                const isActive = i === active;
                return (
                    <button
                        key={i}
                        onClick={() => onSwitch(i)}
                        style={{
                            padding: "4px 11px",
                            fontSize: 12,
                            border: `1px solid ${isActive ? "color-mix(in srgb, var(--color-accent) 30%, transparent)" : "transparent"}`,
                            cursor: "pointer",
                            borderRadius: 99,
                            backgroundColor: isActive
                                ? "color-mix(in srgb, var(--color-accent) 14%, transparent)"
                                : "transparent",
                            color: isActive ? "var(--color-accent)" : "#666",
                            fontWeight: isActive ? 500 : 400,
                            display: "flex", alignItems: "center", gap: 5,
                            transition: "background-color 0.1s, color 0.1s, border-color 0.1s",
                        }}
                        onMouseEnter={e => {
                            if (!isActive) {
                                e.currentTarget.style.backgroundColor = "#1e1e1e";
                                e.currentTarget.style.color = "#999";
                            }
                        }}
                        onMouseLeave={e => {
                            if (!isActive) {
                                e.currentTarget.style.backgroundColor = "transparent";
                                e.currentTarget.style.color = "#666";
                            }
                        }}
                    >
                        {tab.icon && <TabIcon name={tab.icon}/>}
                        {tab.label}
                        <TabBadge expr={tab.badge_expr} pill/>
                    </button>
                );
            })}
        </div>
    );
}

function BoxedStrip({tabs, active, onSwitch}: { tabs: TabDef[]; active: number; onSwitch: (i: number) => void }) {
    return (
        <div style={{padding: "8px 10px", flexShrink: 0}}>
            <div style={{
                display: "flex", gap: 2, padding: 3,
                backgroundColor: "#141414",
                borderRadius: 7,
            }}>
                {tabs.map((tab, i) => {
                    const isActive = i === active;
                    return (
                        <button
                            key={i}
                            onClick={() => onSwitch(i)}
                            style={{
                                flex: 1,
                                padding: "5px 10px",
                                fontSize: 12,
                                border: "none",
                                cursor: "pointer",
                                borderRadius: 5,
                                backgroundColor: isActive ? "#242424" : "transparent",
                                color: isActive ? "#ebebeb" : "#666",
                                fontWeight: isActive ? 500 : 400,
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                                transition: "background-color 0.12s, color 0.12s",
                                boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.04)" : "none",
                            }}
                            onMouseEnter={e => {
                                if (!isActive) {
                                    e.currentTarget.style.backgroundColor = "#1a1a1a";
                                    e.currentTarget.style.color = "#999";
                                }
                            }}
                            onMouseLeave={e => {
                                if (!isActive) {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                    e.currentTarget.style.color = "#666";
                                }
                            }}
                        >
                            {tab.icon && <TabIcon name={tab.icon}/>}
                            {tab.label}
                            <TabBadge expr={tab.badge_expr} pill/>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function Tabs({node}: { node: LayoutNode }) {
    const {state, setState} = useModulePageContext();
    const tabs = node.tabs ?? [];
    const variant = node.tabs_variant ?? "underline";
    const [activeTab, setActiveTab] = useState(0);

    // Rhai-driven visibility (showExpr): batch every tab's condition into ONE eval
    // call — [expr1, expr2, ...] — instead of one round trip per tab. showKey-driven
    // tabs are resolved from local state synchronously and excluded from the batch.
    const showExprs = tabs.map(t => (t.show_key ? undefined : t.show_expr));
    const hasExprGate = showExprs.some(Boolean);
    const combinedExpr = hasExprGate ? `[${showExprs.map(e => e ?? "true").join(", ")}]` : undefined;
    const {data: exprResults} = useEval(combinedExpr, state);
    const exprArr = Array.isArray(exprResults) ? exprResults : null;

    // Optimistic default (visible) while the batched eval is still in flight, so
    // gated tabs don't flash hidden-then-shown on every mount/refresh.
    const visible = tabs.map((t, i) => {
        if (t.show_key) return Boolean(state[t.show_key]);
        if (!t.show_expr) return true;
        return exprArr ? Boolean(exprArr[i]) : true;
    });

    const visibleTabs = tabs.filter((_, i) => visible[i]);
    const originalIndices = tabs.map((_, i) => i).filter(i => visible[i]);
    const activePos = originalIndices.indexOf(activeTab);

    // The active tab just became hidden (e.g. a setting it depends on was toggled
    // off) — jump to the first still-visible tab instead of showing empty content.
    useEffect(() => {
        if (activePos === -1 && originalIndices.length > 0) {
            setActiveTab(originalIndices[0]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePos, originalIndices.join(",")]);

    const switchTab = (pos: number) => {
        const real = originalIndices[pos];
        setActiveTab(real);
        if (node.selection_key) setState(node.selection_key, undefined);
    };

    const Strip = variant === "pills" ? PillsStrip : variant === "boxed" ? BoxedStrip : UnderlineStrip;

    return (
        <div style={{display: "flex", flexDirection: "column", flex: 1, minHeight: 0}}>
            <Strip tabs={visibleTabs} active={activePos} onSwitch={switchTab}/>
            <div style={{flex: 1, minHeight: 0, display: "flex", flexDirection: "column"}}>
                {tabs[activeTab] && visible[activeTab] && <NodeRenderer node={tabs[activeTab].content}/>}
            </div>
        </div>
    );
}
