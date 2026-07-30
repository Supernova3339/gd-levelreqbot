import React from "react";

interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: React.ReactNode;
    hint?: string;
    indent?: boolean;
    disabled?: boolean;
}

/** Plain 13px checkbox row, native input. */
export function Checkbox({checked, onChange, label, hint, indent, disabled}: CheckboxProps) {
    return (
        <label
            className={
                "flex items-start gap-2 py-0.5 text-[12px] text-text-primary cursor-pointer " +
                (indent ? "ml-5 " : "") +
                (disabled ? "opacity-50 cursor-default" : "")
            }
        >
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
                className="mt-[2px] accent-[var(--color-accent)]"
            />
            <span className="leading-snug">
                {label}
                {hint && <span className="block text-[11px] text-text-muted">{hint}</span>}
            </span>
        </label>
    );
}
