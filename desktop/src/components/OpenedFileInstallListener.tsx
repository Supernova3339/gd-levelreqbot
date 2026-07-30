import {useEffect} from "react";
import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {useConfirm} from "./ConfirmModal";
import {useSnackbar} from "./Snackbar";

/**
 * A .gdmod/.gdpck/.gdlib file opened via the OS file association is queued
 * Rust-side (PendingOpenedFile in lib.rs) rather than acted on immediately —
 * it can arrive before this component ever mounts (cold start: the file is
 * queued from within Tauri's `.setup()`, before the webview finishes
 * loading). So this checks for a pending file once on mount (picking up
 * anything queued before we were ready) and again on the "opened-file-pending"
 * event (the app was already running and a second launch attempt got
 * redirected here by the single-instance plugin).
 *
 * Renders nothing itself — the confirmation is an in-app modal via
 * useConfirm(), not a native OS dialog.
 */
interface PendingFileInfo {
    status: "NotSupported" | "Ready";
    path?: string;
    name?: string;
    id?: string;
    version?: string;
    author?: string;
    package_type?: string;
    description?: string;
}

export function OpenedFileInstallListener() {
    const confirm = useConfirm();
    const showSnackbar = useSnackbar();

    useEffect(() => {
        let cancelled = false;

        const checkPending = async () => {
            let info: PendingFileInfo | null;
            try {
                info = await invoke<PendingFileInfo | null>("peek_pending_opened_file");
            } catch (e) {
                if (!cancelled) showSnackbar({message: String(e), variant: "error"});
                return;
            }
            if (cancelled || !info) return;

            if (info.status === "NotSupported") {
                showSnackbar({message: "This action is not supported on your device.", variant: "info"});
                return;
            }

            const lines = [`${info.id}  ·  v${info.version}  ·  ${info.package_type}`];
            if (info.author) lines.push(`by ${info.author}`);
            if (info.description) lines.push("", info.description);

            const ok = await confirm({
                title: `Install "${info.name}"?`,
                message: lines.join("\n"),
                confirmLabel: "Install",
            });
            if (cancelled || !ok) return;

            try {
                await invoke("install_pending_opened_file", {path: info.path});
                showSnackbar({message: `Installed "${info.name}".`, variant: "success"});
            } catch (e) {
                showSnackbar({message: String(e), variant: "error"});
            }
        };

        checkPending();
        const unlisten = listen("opened-file-pending", () => {
            checkPending();
        });
        return () => {
            cancelled = true;
            unlisten.then(f => f());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
}
