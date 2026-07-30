import React from "react";

export interface RadioOption {
    id: string;
    label: React.ReactNode;
    hint?: string;
}

interface RadioGroupProps {
    options: RadioOption[];
    value: string | null;
    onChange: (id: string) => void;
    name: string;
}

/** Plain radio list, native inputs — matches the Checkbox styling. */
export function RadioGroup({options, value, onChange, name}: RadioGroupProps) {
    return (
        <div className="flex flex-col">
            {options.map((opt) => (
                <label
                    key={opt.id}
                    className="flex items-start gap-2 py-1 text-[12px] text-text-primary cursor-pointer"
                >
                    <input
                        type="radio"
                        name={name}
                        checked={value === opt.id}
                        onChange={() => onChange(opt.id)}
                        className="mt-[2px] accent-[var(--color-accent)]"
                    />
                    <span className="leading-snug">
                        {opt.label}
                        {opt.hint && <span className="block text-[11px] text-text-muted">{opt.hint}</span>}
                    </span>
                </label>
            ))}
        </div>
    );
}
