import {Checkbox} from "../components/Checkbox";
import {RadioGroup} from "../components/Radio";
import {GroupBox} from "../components/WizardFrame";
import type {SetupState} from "../lib/ipc";

export type SetupAction = "install" | "uninstall" | "repair";

interface DoneProps {
    state: SetupState;
    action: SetupAction;
    dryRun: boolean;
    launch: boolean;
    onLaunch: (launch: boolean) => void;
    /** CLI landed on PATH — offer the time-honored restart prompt. */
    offerRestart: boolean;
    restartNow: boolean;
    onRestartNow: (now: boolean) => void;
}

export function Done({state, action, dryRun, launch, onLaunch, offerRestart, restartNow, onRestartNow}: DoneProps) {
    const m = state.manifest;
    return (
        <div className="text-[12px] text-text-secondary flex flex-col gap-3 pt-1">
            {dryRun ? (
                <>
                    <p className="m-0 text-[15px] font-light text-text-primary">
                        That was a rehearsal — and it went great.
                    </p>
                    <p className="m-0">Nothing on this computer was changed. The full run is in the log.</p>
                </>
            ) : action === "uninstall" ? (
                <>
                    <p className="m-0 text-[15px] font-light text-text-primary">
                        All cleaned up.
                    </p>
                    <p className="m-0">{m.product_name} has been removed. Thanks for giving it a try.</p>
                </>
            ) : action === "repair" ? (
                <>
                    <p className="m-0 text-[15px] font-light text-text-primary">
                        Good as new.
                    </p>
                    <p className="m-0">
                        The app files were reinstalled and shortcuts fixed. Your settings and data
                        weren't touched.
                    </p>
                    <Checkbox checked={launch} onChange={onLaunch} label={`Start ${m.product_name} now`}/>
                </>
            ) : (
                <>
                    <p className="m-0 text-[15px] font-light text-text-primary">
                        Everything's ready to go.
                    </p>
                    <Checkbox
                        checked={launch && !restartNow}
                        onChange={onLaunch}
                        disabled={restartNow}
                        label={`Start ${m.product_name} now`}
                    />
                </>
            )}
            {offerRestart && (
                <GroupBox label="One more thing">
                    <p className="m-0 mb-1.5 text-[11px] text-text-muted">
                        The command-line tool was added to your PATH. A restart makes sure every
                        terminal and application picks it up.
                    </p>
                    <RadioGroup
                        name="restart-choice"
                        value={restartNow ? "now" : "later"}
                        onChange={(id) => onRestartNow(id === "now")}
                        options={[
                            {id: "now", label: "Restart my computer now (recommended)"},
                            {id: "later", label: "I'll restart later"},
                        ]}
                    />
                </GroupBox>
            )}
        </div>
    );
}
