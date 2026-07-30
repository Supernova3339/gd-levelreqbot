import React from "react";

interface TileProps {
    title: string;
    description: React.ReactNode;
    primary?: boolean;
    onClick: () => void;
}

/** Big flat metro tile — the corporate "one obvious choice" pattern. */
export function Tile({title, description, primary, onClick}: TileProps) {
    return (
        <button
            onClick={onClick}
            className={
                "block w-full text-left px-5 py-4 rounded-none border-0 transition-colors " +
                (primary
                    ? "bg-accent text-white hover:bg-accent-hover"
                    : "bg-bg-card text-text-primary hover:bg-bg-hover")
            }
        >
            <div className="text-[17px] font-light">{title}</div>
            <div className={"text-[11px] mt-0.5 " + (primary ? "text-white/75" : "text-text-muted")}>
                {description}
            </div>
        </button>
    );
}
