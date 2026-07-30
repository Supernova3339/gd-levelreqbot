import {Checkbox} from "../components/Checkbox";
import {TextField} from "../components/TextField";
import {GroupBox} from "../components/WizardFrame";
import type {SetupState} from "../lib/ipc";

interface UninstallConfirmProps {
    state: SetupState;
    purge: boolean;
    onPurge: (purge: boolean) => void;
    confirmText: string;
    onConfirmText: (text: string) => void;
}

export function UninstallConfirm({state, purge, onPurge, confirmText, onConfirmText}: UninstallConfirmProps) {
    const dir = state.existing?.options.dir ?? state.options.dir;
    return (
        <div className="flex flex-col gap-3 pt-1">
            <p className="m-0 text-[12px] text-text-secondary">
                Before you go — this will remove {state.manifest.product_name} from your computer.
            </p>
            <GroupBox label="Removing from">
                <div className="font-mono text-[11px] text-text-primary select-text py-0.5">{dir}</div>
            </GroupBox>
            <Checkbox
                checked={purge}
                onChange={onPurge}
                label="Also remove my data"
                hint="Settings, queue history and installed modules will be deleted. This can't be undone."
            />
            <GroupBox label="Just so we're sure it's really you">
                <p className="m-0 mb-1.5 text-[11px] text-text-muted">
                    Type <span className="font-mono text-text-secondary">UNINSTALL</span> to unlock
                    the button below.
                </p>
                <TextField value={confirmText} onChange={onConfirmText}/>
            </GroupBox>
        </div>
    );
}
