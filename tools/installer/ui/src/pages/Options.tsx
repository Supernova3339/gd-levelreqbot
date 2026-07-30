import React from "react";
import {Checkbox} from "../components/Checkbox";
import {GroupBox} from "../components/WizardFrame";
import type {InstallOptions, SetupState} from "../lib/ipc";

interface OptionsProps {
    state: SetupState;
    opts: InstallOptions;
    onChange: (opts: InstallOptions) => void;
}

/** Hover-highlighted row wrapper for the component checkboxes. */
function Row({children}: { children: React.ReactNode }) {
    return (
        <div className="px-1.5 -mx-1.5 rounded-none hover:bg-bg-hover transition-colors">
            {children}
        </div>
    );
}

export function Options({state, opts, onChange}: OptionsProps) {
    const m = state.manifest;
    const set = (patch: Partial<InstallOptions>) => onChange({...opts, ...patch});
    const exts = m.file_associations.map((a) => `.${a.ext}`).join("  ");

    const toggleDevMode = (checked: boolean) => {
        set(checked ? {enable_dev: true, install_cli: true} : {enable_dev: false});
    };

    return (
        <>
            <GroupBox label="Everyday things">
                <div className="flex flex-col">
                    <Row>
                        <Checkbox
                            checked={opts.desktop_shortcut}
                            onChange={(v) => set({desktop_shortcut: v})}
                            label="Desktop shortcut"
                            hint="One double-click away."
                        />
                    </Row>
                    <Row>
                        <Checkbox
                            checked={opts.start_menu}
                            onChange={(v) => set({start_menu: v})}
                            label="Start Menu entry"
                            hint="App and uninstaller, in their own folder."
                        />
                    </Row>
                    {m.file_associations.length > 0 && (
                        <Row>
                            <Checkbox
                                checked={opts.file_assoc}
                                onChange={(v) => set({file_assoc: v})}
                                label="Open bot files with the app"
                                hint={exts}
                            />
                        </Row>
                    )}
                </div>
            </GroupBox>

            {m.cli_name && (
                <GroupBox label="For creators">
                    <Row>
                        <Checkbox
                            checked={opts.enable_dev}
                            onChange={toggleDevMode}
                            label="Developer mode"
                            hint="Make your own modules, packages and commands for the marketplace. Installs the CLI and unlocks the in-app Development tab."
                        />
                    </Row>
                </GroupBox>
            )}

            <GroupBox label="Where it goes">
                <div className="flex items-center gap-2 py-0.5">
                    <svg width="11" height="11" viewBox="0 0 12 12" className="flex-shrink-0 text-text-muted">
                        <rect x="2" y="5" width="8" height="6" fill="currentColor" opacity="0.85"/>
                        <path d="M4 5V3.5a2 2 0 1 1 4 0V5" fill="none" stroke="currentColor" strokeWidth="1.4"/>
                    </svg>
                    <span className="font-mono text-[11px] text-text-secondary select-text truncate" title={opts.dir}>
                        {opts.dir}
                    </span>
                </div>
                <p className="m-0 mt-1 text-[11px] text-text-muted">
                    {state.existing
                        ? "Updating your existing install — same spot as before."
                        : "We picked the right spot so you don't have to."}
                </p>
            </GroupBox>

            {(state.dev_build || opts.dry_run) && (
                <Checkbox
                    checked={opts.dry_run}
                    onChange={(v) => set({dry_run: v})}
                    disabled={state.forced_dry}
                    label="Simulation only (dry run)"
                    hint={
                        state.forced_dry
                            ? "Forced: this build contains no payload."
                            : "Performs every step without modifying the computer. Development builds only."
                    }
                />
            )}
        </>
    );
}
