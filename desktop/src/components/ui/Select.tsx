import type {SelectHTMLAttributes} from "react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
}

export function Select({label, style, children, ...rest}: Props) {
    const select = (
        <select
            {...rest}
            style={{
                backgroundColor: "#0d0d0d",
                color: "#d0d0d0",
                border: "1px solid #1e1e1e",
                borderRadius: 5,
                padding: "5px 8px",
                fontSize: 12,
                cursor: "pointer",
                outline: "none",
                width: "100%",
                ...style,
            }}>
            {children}
        </select>
    );
    if (!label) return select;
    return (
        <label className="flex flex-col gap-1">
            <span style={{fontSize: 11, color: "#555", fontWeight: 500}}>{label}</span>
            {select}
        </label>
    );
}
