import type {ButtonHTMLAttributes} from "react";

type Variant = "primary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    /** Shows a small spinner in place of the icon slot and forces disabled —
     *  for async submit buttons instead of just dimming + swapping to "…". */
    loading?: boolean;
}

const VARIANTS: Record<Variant, React.CSSProperties> = {
    primary: {backgroundColor: "var(--color-accent)", color: "#fff"},
    ghost: {backgroundColor: "transparent", color: "#666", border: "1px solid transparent"},
    danger: {backgroundColor: "transparent", color: "#ef4444", border: "1px solid #2a1010"},
    outline: {backgroundColor: "transparent", color: "#666", border: "1px solid #1e1e1e"},
};
const SIZES: Record<Size, React.CSSProperties> = {
    sm: {fontSize: 11, padding: "2px 8px", borderRadius: 4},
    md: {fontSize: 12, padding: "5px 12px", borderRadius: 5},
};

function Spinner() {
    return (
        <span style={{
            width: 10, height: 10, borderRadius: "50%",
            border: "1.5px solid currentColor", borderTopColor: "transparent",
            display: "inline-block", animation: "gdlq-btn-spin 0.6s linear infinite",
        }}/>
    );
}

export function Button({variant = "outline", size = "md", loading, disabled, style, children, ...rest}: Props) {
    return (
        <button
            {...rest}
            disabled={disabled || loading}
            style={{
                cursor: (disabled || loading) ? "default" : "pointer",
                opacity: disabled ? 0.45 : 1,
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "opacity 0.1s",
                ...VARIANTS[variant],
                ...SIZES[size],
                ...style,
            }}>
            {loading && <Spinner/>}
            {children}
            <style>{`@keyframes gdlq-btn-spin { to { transform: rotate(360deg); } }`}</style>
        </button>
    );
}
