import {invoke} from "@tauri-apps/api/core";

/**
 * Open a native save dialog and write `content` to the chosen file.
 * Returns true if the file was saved, false if the user cancelled.
 */
export async function saveScriptFile(content: string, defaultName: string = "command.gdlqs"): Promise<boolean> {
    try {
        return await invoke<boolean>("save_script_file", {content, filename: defaultName});
    } catch {
        return false;
    }
}

/**
 * Open a native file-open dialog and return the text contents of the chosen
 * file, or null if the user cancelled.
 */
export async function loadScriptFile(): Promise<string | null> {
    try {
        return await invoke<string | null>("load_script_file");
    } catch {
        return null;
    }
}
