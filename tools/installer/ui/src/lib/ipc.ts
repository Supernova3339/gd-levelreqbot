import {invoke} from "@tauri-apps/api/core";
import {listen, type UnlistenFn} from "@tauri-apps/api/event";

// ─── Types mirrored from the Rust side (src/manifest.rs, src/install/) ───────

export interface FileAssoc {
    ext: string;
    prog_id: string;
    description: string;
}

export interface Offer {
    id: string;
    name: string;
    description: string;
    default: boolean;
}

export interface Manifest {
    product_name: string;
    identifier: string;
    version: string;
    publisher: string;
    homepage: string;
    exe_name: string;
    cli_name: string | null;
    license: string;
    file_associations: FileAssoc[];
    offers: Offer[];
}

export interface InstallOptions {
    dir: string;
    desktop_shortcut: boolean;
    start_menu: boolean;
    install_cli: boolean;
    enable_dev: boolean;
    file_assoc: boolean;
    launch_after: boolean;
    autostart: boolean;
    selected_offers: string[];
    dry_run: boolean;
}

export interface InstallRecord {
    product_name: string;
    identifier: string;
    version: string;
    installed_at: string;
    options: InstallOptions;
    files: string[];
}

export interface SetupState {
    manifest: Manifest;
    mode: "install" | "uninstall";
    existing: InstallRecord | null;
    options: InstallOptions;
    unattended: boolean;
    kill_running: boolean;
    purge: boolean;
    forced_dry: boolean;
    dev_build: boolean;
    quiz_required: boolean;
}

export interface ProgressEvent {
    fraction: number;
    message: string;
}

export interface FinishedEvent {
    ok: boolean;
    error: string | null;
}

// ─── Commands ────────────────────────────────────────────────────────────────

export const getSetupState = () => invoke<SetupState>("get_setup_state");
export const recordQuizPassed = () => invoke<void>("record_quiz_passed");
export const checkAppRunning = () => invoke<boolean>("check_app_running");
export const closeRunningApp = () => invoke<void>("close_running_app");
export const startInstall = (options: InstallOptions) => invoke<void>("start_install", {options});
export const startUninstall = (purge: boolean, dryRun: boolean, reason?: string) =>
    invoke<void>("start_uninstall", {purge, dryRun, reason: reason ?? null});
export const launchAppNow = (dir: string) => invoke<void>("launch_app_now", {dir});
export const finalizeUninstallNow = (dir: string) => invoke<void>("finalize_uninstall_now", {dir});
export const exitInstaller = (code = 0) => invoke<void>("exit_installer", {code});
export const restartMachine = () => invoke<void>("restart_machine");

// ─── Events ──────────────────────────────────────────────────────────────────

export const onProgress = (cb: (p: ProgressEvent) => void): Promise<UnlistenFn> =>
    listen<ProgressEvent>("progress", (e) => cb(e.payload));

export const onFinished = (cb: (f: FinishedEvent) => void): Promise<UnlistenFn> =>
    listen<FinishedEvent>("finished", (e) => cb(e.payload));
