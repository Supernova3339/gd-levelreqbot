import type {ButtonHTMLAttributes} from "react";

type Variant = "primary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
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

export function Button({variant = "outline", size = "md", style, children, ...rest}: Props) {
    return (
        <button
            {...rest}
            style={{
                cursor: rest.disabled ? "default" : "pointer",
                opacity: rest.disabled ? 0.45 : 1,
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "opacity 0.1s",
                ...VARIANTS[variant],
                ...SIZES[size],
                ...style,
            }}>
            {children}
        </button>
    );
}
