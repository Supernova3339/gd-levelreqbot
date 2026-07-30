import {useEffect, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {CheckIcon} from "./icons";

interface ToastItem {
    id: number;
    kind: "copied";
    levelId: string;
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
        // Clipboard copy (only fires when auto-copy is on)
        const unCopied = listen<string>("level-copied", (e) => {
            push({kind: "copied", levelId: e.payload});
        });

        return () => {
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
                        backgroundColor: "#0f2a1a",
                        border: "1px solid #1a4a2a",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
                        minWidth: 220, maxWidth: 300,
                        animation: "snackbar-in 0.2s ease",
                    }}
                >
          <span
              className="flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 mt-0.5"
              style={{backgroundColor: "#22c55e"}}
          >
            <CheckIcon size={10} style={{color: "#fff"}}/>
          </span>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold" style={{color: "#22c55e"}}>Copied to clipboard</p>
                        <p className="text-xs font-mono" style={{color: "#4ade80"}}>Level ID: {item.levelId}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}
