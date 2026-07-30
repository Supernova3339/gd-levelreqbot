import {Tile} from "../components/Tile";
import type {SetupState} from "../lib/ipc";

interface ModeSelectProps {
    state: SetupState;
    onExpress: () => void;
    onCustom: () => void;
}

/**
 * The corporate opener: one big recommended button that decides everything
 * for you, and a quieter one for people who ask questions.
 */
export function ModeSelect({state, onExpress, onCustom}: ModeSelectProps) {
    const update = state.existing !== null;
    return (
        <div className="flex flex-col gap-3 pt-1">
            <p className="m-0 text-[12px] text-text-secondary">
                {update
                    ? "Good news — you already have it. We'll bring everything up to date."
                    : "This will only take a moment. How would you like to set things up?"}
            </p>
            <Tile
                primary
                title={update ? "Update now (recommended)" : "Express setup (recommended)"}
                description={
                    update
                        ? "Keeps your settings and uses your previous choices."
                        : "Uses the recommended settings. Shortcuts, file types — we'll handle it."
                }
                onClick={onExpress}
            />
            <Tile
                title="Custom setup"
                description="Choose components, install location and optional modules yourself."
                onClick={onCustom}
            />
            {state.forced_dry && (
                <p className="m-0 text-[11px] text-warning">
                    Development build — everything runs as a simulation. Your computer stays untouched.
                </p>
            )}
        </div>
    );
}
