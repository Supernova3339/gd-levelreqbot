import {Tile} from "../components/Tile";

interface UninstallChoiceProps {
    onRepair: () => void;
    onRemove: () => void;
}

/**
 * The first hurdle: maybe you don't want to uninstall at all! Repair gets
 * the big friendly tile; removal is the quiet option underneath.
 */
export function UninstallChoice({onRepair, onRemove}: UninstallChoiceProps) {
    return (
        <div className="flex flex-col gap-3 pt-1">
            <p className="m-0 text-[12px] text-text-secondary">
                What would you like to do?
            </p>
            <Tile
                primary
                title="Repair (recommended)"
                description="Something acting up? Reinstall the app files and fix shortcuts — your settings and data stay exactly as they are."
                onClick={onRepair}
            />
            <Tile
                title="Remove from this computer"
                description="Continue to uninstall."
                onClick={onRemove}
            />
        </div>
    );
}
