import type {ChangeEvent, InputHTMLAttributes, TextareaHTMLAttributes} from "react";

interface CommonProps {
    label?: string;
    hint?: string;
    mono?: boolean;
    /** Shown in red under the field, and swaps the border red — for
     *  per-field validation instead of one shared form-level error string. */
    error?: string;
}

type SingleLineProps = CommonProps & InputHTMLAttributes<HTMLInputElement> & {
    multiline?: false;
};

type MultilineProps = CommonProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> & {
    multiline: true;
    onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
};

type Props = SingleLineProps | MultilineProps;

const sharedStyle = (mono?: boolean): React.CSSProperties => ({
    backgroundColor: "#0d0d0d",
    color: "#d0d0d0",
    border: "1px solid #1e1e1e",
    borderRadius: 5,
    padding: "5px 8px",
    fontSize: 12,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: mono ? '"JetBrains Mono","Fira Code",monospace' : "inherit",
});

export function Input(props: Props) {
    const {label, hint, mono, error, style} = props;
    const borderColor = error ? "#ef4444" : "#1e1e1e";

    let field: React.ReactNode;
    if (props.multiline) {
        const {multiline: _m, label: _l, hint: _h, mono: _mo, error: _e, style: _s, rows, ...rest} = props;
        field = (
            <textarea
                {...rest}
                rows={rows ?? 3}
                style={{...sharedStyle(mono), borderColor, resize: "vertical", ...style}}
                onFocus={(e) => {
                    e.currentTarget.style.borderColor = error ? "#ef4444" : "var(--color-accent)44";
                    rest.onFocus?.(e);
                }}
                onBlur={(e) => {
                    e.currentTarget.style.borderColor = borderColor;
                    rest.onBlur?.(e);
                }}
            />
        );
    } else {
        const {multiline: _m, label: _l, hint: _h, mono: _mo, error: _e, style: _s, ...rest} = props;
        field = (
            <input
                {...rest}
                style={{...sharedStyle(mono), borderColor, ...style}}
                onFocus={(e) => {
                    e.currentTarget.style.borderColor = error ? "#ef4444" : "var(--color-accent)44";
                    rest.onFocus?.(e);
                }}
                onBlur={(e) => {
                    e.currentTarget.style.borderColor = borderColor;
                    rest.onBlur?.(e);
                }}
            />
        );
    }

    if (!label && !hint && !error) return field;
    return (
        <div className="flex flex-col gap-1">
            {label && <span style={{fontSize: 11, color: "#555", fontWeight: 500}}>{label}</span>}
            {field}
            {error
                ? <span style={{fontSize: 10, color: "#ef4444"}}>{error}</span>
                : hint && <span style={{fontSize: 10, color: "#333"}}>{hint}</span>}
        </div>
    );
}
