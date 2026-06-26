import type {InputHTMLAttributes} from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    hint?: string;
    mono?: boolean;
}

export function Input({label, hint, mono, style, ...rest}: Props) {
    const input = (
        <input
            {...rest}
            style={{
                backgroundColor: "#0d0d0d",
                color: "#d0d0d0",
                border: "1px solid #1e1e1e",
                borderRadius: 5,
                padding: "5px 8px",
                fontSize: 12,
                outline: "none",
                width: "100%",
                fontFamily: mono ? '"JetBrains Mono","Fira Code",monospace' : undefined,
                ...style,
            }}
            onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-accent)44";
                rest.onFocus?.(e);
            }}
            onBlur={(e) => {
                e.currentTarget.style.borderColor = "#1e1e1e";
                rest.onBlur?.(e);
            }}
        />
    );
    if (!label && !hint) return input;
    return (
        <div className="flex flex-col gap-1">
            {label && <span style={{fontSize: 11, color: "#555", fontWeight: 500}}>{label}</span>}
            {input}
            {hint && <span style={{fontSize: 10, color: "#333"}}>{hint}</span>}
        </div>
    );
}
