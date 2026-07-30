import type {CSSProperties} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {evalModulePanelData} from "../../../../../lib/commands";
import {useModulePageContext} from "../../context";
import {useEval} from "../../hooks/useEval";
import {useAction} from "../../hooks/useAction";
import {resolveLucideIcon} from "../lucide";

const VARIANT_STYLES: Record<string, CSSProperties & { hoverBg?: string }> = {
    primary: {
        backgroundColor: "var(--color-accent, #7c3aed)",
        color: "#fff",
        border: "none",
        hoverBg: "color-mix(in srgb, var(--color-accent) 80%, white 20%)"
    },
    ghost: {backgroundColor: "transparent", color: "#aaa", border: "1px solid #333", hoverBg: "#1c1c1c"},
    danger: {backgroundColor: "#7f1d1d", color: "#fca5a5", border: "none", hoverBg: "#9b2323"},
    warn: {backgroundColor: "#78350f", color: "#fde68a", border: "none", hoverBg: "#8f4010"},
    success: {backgroundColor: "#14532d", color: "#86efac", border: "none", hoverBg: "#1a6935"},
    default: {backgroundColor: "#222", color: "#ddd", border: "1px solid #333", hoverBg: "#2c2c2c"},
};

export function Button({node}: { node: LayoutNode }) {
    const {moduleId, state, setState, navigate} = useModulePageContext();
    const {dispatch, busy} = useAction();

    const variant = node.button_variant ?? "default";
    const style = VARIANT_STYLES[variant] ?? VARIANT_STYLES.default;

    // Optional icon
    const iconName = node.button_icon as string | undefined;
    let iconEl: React.ReactNode = null;
    if (iconName) {
        const Ic = resolveLucideIcon(iconName);
        if (Ic) iconEl = <Ic size={13} color={style.color as string}/>;
    }

    const {data: labelData} = useEval(node.button_label_expr, state);
    const {data: disabled} = useEval(node.button_disabled_expr, state);

    const label = node.button_label_expr
        ? (labelData !== undefined && labelData !== null ? String(labelData) : (node.button_label ?? ""))
        : (node.button_label ?? "Button");

    const isBusy = busy !== null;
    const isDisabled = isBusy || Boolean(disabled);

    // argState is one dot-path into state ("selected.level_id"), or several
    // comma-separated ("new_level_id, new_level_username") for actions that
    // take more than one arg — each resolves independently, missing ones are
    // just omitted rather than failing the whole button.
    const resolveArgState = (): string[] => {
        if (!node.button_arg_state) return node.button_args ?? [];
        const keys = node.button_arg_state.split(",").map(k => k.trim()).filter(Boolean);
        const results: string[] = [];
        for (const key of keys) {
            const parts = key.split(".");
            let val: unknown = state[parts[0]];
            for (let i = 1; i < parts.length && val != null; i++) {
                val = typeof val === "object" ? (val as Record<string, unknown>)[parts[i]] : undefined;
            }
            if (val != null) results.push(String(val));
        }
        return results;
    };

    const handleClick = async () => {
        if (isDisabled) return;

        if (node.button_navigate) {
            navigate(node.button_navigate === ".." ? null : node.button_navigate);
            return;
        }

        if (node.button_state_key) {
            setState(node.button_state_key, node.button_state_value ?? true);
        }

        if (node.button_action) {
            const ok = await dispatch(node.button_action, resolveArgState());
            if (ok && node.button_after_state_key && node.button_after_state_expr) {
                try {
                    const result = await evalModulePanelData(moduleId, node.button_after_state_expr, state);
                    setState(node.button_after_state_key, result);
                } catch {
                    // non-fatal — the action itself already succeeded
                }
            }
        }
    };

    const iconOnly = iconEl && !node.button_label && !node.button_label_expr;

    return (
        <button
            onClick={handleClick}
            disabled={isDisabled}
            title={iconOnly ? label : undefined}
            style={{
                backgroundColor: style.backgroundColor as string,
                color: style.color as string,
                border: style.border as string,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: iconEl && !iconOnly ? 5 : 0,
                padding: iconOnly ? "6px" : "6px 14px",
                width: node.button_full_width ? "100%" : undefined,
                minWidth: 0,
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: isDisabled ? "not-allowed" : "pointer",
                opacity: isDisabled ? 0.5 : 1,
                transition: "background-color 0.1s, opacity 0.1s",
                flexShrink: 0,
                lineHeight: 1.4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
            }}
            onMouseEnter={e => {
                if (!isDisabled && style.hoverBg) e.currentTarget.style.backgroundColor = style.hoverBg;
            }}
            onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = style.backgroundColor as string;
            }}
        >
            {isBusy && node.button_action ? "…" : (
                <>
                    {iconEl}
                    {!iconOnly && label}
                </>
            )}
        </button>
    );
}
