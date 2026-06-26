import {useEffect, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {CheckIcon} from "./icons";

interface NextLevelPayload {
    level_id: number;
    username: string;
    queue_type: string;
}

interface ToastItem {
    id: number;
    kind: "nexted" | "copied";
    levelId: string;
    username?: string;
}

let _counter = 0;

export function LevelCopiedOverlay() {
    const [items, setItems] = useState<ToastItem[]>([]);

    const push = (item: Omit<ToastItem, "id">, duration = 4000) => {
        const id = ++_counter;
        setItems((prev) => [...prev.slice(-2), {id, ...item}]);
        setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), duration);
    };

    useEffect(() => {
        // Dashboard button OR !next chat command
        const unNexted = listen<NextLevelPayload>("level-nexted", (e) => {
            push({
                kind: "nexted",
                levelId: String(e.payload.level_id),
                username: e.payload.username,
            });
        });

        // Clipboard copy (only fires when auto-copy is on)
        const unCopied = listen<string>("level-copied", (e) => {
            push({kind: "copied", levelId: e.payload});
        });

        return () => {
            unNexted.then((f) => f());
            unCopied.then((f) => f());
        };
    }, []);

    if (items.length === 0) return null;

    return (
        <div
            className="fixed pointer-events-none"
            style={{top: 52, right: 12, zIndex: 300, display: "flex", flexDirection: "column", gap: 8}}
        >
            {items.map((item) => (
                <div
                    key={item.id}
                    className="flex items-start gap-3 px-4 py-3 rounded-lg pointer-events-auto"
                    style={{
                        backgroundColor: item.kind === "nexted" ? "#141428" : "#0f2a1a",
                        border: `1px solid ${item.kind === "nexted" ? "#2a2a5e" : "#1a4a2a"}`,
                        boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
                        minWidth: 220, maxWidth: 300,
                        animation: "snackbar-in 0.2s ease",
                    }}
                >
          <span
              className="flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 mt-0.5"
              style={{backgroundColor: item.kind === "nexted" ? "#818cf8" : "#22c55e"}}
          >
            <CheckIcon size={10} style={{color: "#fff"}}/>
          </span>
                    <div className="min-w-0">
                        {item.kind === "nexted" ? (
                            <>
                                <p className="text-xs font-semibold" style={{color: "#818cf8"}}>Now playing</p>
                                <p className="text-sm font-bold font-mono" style={{color: "#f1f1f1"}}>
                                    {item.levelId}
                                </p>
                                {item.username && (
                                    <p className="text-xs" style={{color: "#555"}}>requested by @{item.username}</p>
                                )}
                            </>
                        ) : (
                            <>
                                <p className="text-xs font-semibold" style={{color: "#22c55e"}}>Copied to clipboard</p>
                                <p className="text-xs font-mono" style={{color: "#4ade80"}}>Level ID: {item.levelId}</p>
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
