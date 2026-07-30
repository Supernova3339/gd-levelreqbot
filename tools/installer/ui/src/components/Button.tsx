import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    primary?: boolean;
}

/** Flat metro block button. Square corners, solid fills, no chrome. */
export function Button({primary, className = "", children, ...rest}: ButtonProps) {
    return (
        <button
            className={
                "h-8 min-w-[96px] px-6 text-[12px] rounded-none border-0 transition-colors " +
                (primary
                    ? "bg-accent text-white enabled:hover:bg-accent-hover "
                    : "bg-bg-surface text-text-primary enabled:hover:bg-bg-hover ") +
                "disabled:opacity-40 disabled:cursor-default " +
                className
            }
            {...rest}
        >
            {children}
        </button>
    );
}
