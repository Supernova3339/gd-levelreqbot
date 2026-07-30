import {getCurrentWindow} from "@tauri-apps/api/window";

interface TitleBarProps {
    title: string;
    /** Close handler — routed through the app's cancel/quit flow. */
    onClose: () => void;
}

/**
 * Custom window bar for the frameless window. Same accent fill as the header
 * band below it, so the two read as one block. The whole bar is a drag
 * region; the caption buttons follow Windows conventions (close turns red).
 */
export function TitleBar({title, onClose}: TitleBarProps) {
    return (
        <div
            data-tauri-drag-region
            className="flex-shrink-0 h-8 bg-accent flex items-center justify-between select-none"
        >
            <span className="pl-4 text-[11px] text-white/70 pointer-events-none">{title}</span>
            <div className="flex h-full">
                <button
                    onClick={() => void getCurrentWindow().minimize()}
                    title="Minimize"
                    className="w-11 h-full flex items-center justify-center bg-transparent border-0
                               text-white/80 hover:bg-white/15 hover:text-white rounded-none"
                >
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1"/>
                    </svg>
                </button>
                <button
                    onClick={onClose}
                    title="Close"
                    className="w-11 h-full flex items-center justify-center bg-transparent border-0
                               text-white/80 hover:bg-error hover:text-white rounded-none"
                >
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1"/>
                        <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1"/>
                    </svg>
                </button>
            </div>
        </div>
    );
}
