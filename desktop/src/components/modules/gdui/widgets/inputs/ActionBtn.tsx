import {resolveLucideIcon} from "../lucide";

const STYLES: Record<string, { bg: string; color: string; hoverBg: string }> = {
    danger: {bg: "#3a1515", color: "#f87171", hoverBg: "#4a1c1c"},
    success: {bg: "#0f3a1f", color: "#4ade80", hoverBg: "#163d20"},
    primary: {bg: "var(--color-accent)", color: "#fff", hoverBg: "var(--color-accent)"},
    default: {bg: "#1e1e1e", color: "#bbb", hoverBg: "#252525"},
};

export function ActionBtn({
                              label,
                              icon,
                              style = "default",
                              onClick,
                              disabled,
                              small,
                          }: {
    label?: string;
    icon?: string;
    style?: string;
    onClick: () => void;
    disabled?: boolean;
    small?: boolean;
}) {
    const c = STYLES[style] ?? STYLES.default;
    const iconOnly = !label && !!icon;

    let iconEl: React.ReactNode = null;
    if (icon) {
        const IconComponent = resolveLucideIcon(icon);
        if (IconComponent) {
            iconEl = <IconComponent size={small ? 13 : 14} color={c.color}/>;
        }
    }

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={iconOnly ? icon : undefined}
            aria-label={iconOnly ? icon : undefined}
            style={{
                padding: iconOnly ? (small ? "2px" : "4px") : (small ? "2px 7px" : "4px 10px"),
                width: iconOnly ? (small ? 21 : 26) : undefined,
                height: iconOnly ? (small ? 21 : 26) : undefined,
                borderRadius: 5,
                fontSize: small ? 11 : 12,
                fontWeight: 500,
                backgroundColor: c.bg,
                color: c.color,
                border: "none",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.4 : 1,
                transition: "opacity 0.1s, background-color 0.1s",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: iconEl && label ? 5 : 0,
            }}
            onMouseEnter={e => {
                if (!disabled) e.currentTarget.style.backgroundColor = c.hoverBg;
            }}
            onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = c.bg;
            }}
        >
            {iconEl}
            {label}
        </button>
    );
}
