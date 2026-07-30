interface TextFieldProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

/** Plain single-line path/text input. */
export function TextField({value, onChange, disabled}: TextFieldProps) {
    return (
        <input
            type="text"
            value={value}
            disabled={disabled}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-8 px-2.5 text-[12px] rounded-none bg-bg-base border-2 border-bg-surface
                       text-text-primary focus:border-accent disabled:opacity-50"
        />
    );
}
