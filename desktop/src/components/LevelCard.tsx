import type {NextLevel} from "../lib/types";

interface LevelCardProps {
    level: NextLevel;
    onDismiss: () => void;
}

const QUEUE_TYPE_LABELS: Record<string, string> = {
    viewer: "Viewer",
    subscriber: "Subscriber",
    sub: "Subscriber",
};

export function LevelCard({level, onDismiss}: LevelCardProps) {
    const queueLabel = QUEUE_TYPE_LABELS[level.queue_type] ?? level.queue_type;

    return (
        <div
            className="rounded-lg p-4 flex items-start gap-4"
            style={{
                backgroundColor: "#1a1a1a",
                border: "2px solid var(--color-accent)",
                boxShadow: "0 0 20px color-mix(in srgb, var(--color-accent) 20%, transparent)",
            }}
        >
            <div
                className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-xl"
                style={{backgroundColor: "color-mix(in srgb, var(--color-accent) 13%, transparent)"}}
            >
                ▶
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{color: "var(--color-accent)"}}>
            Now Playing
          </span>
                    <span
                        className="px-1.5 py-0.5 text-xs rounded"
                        style={{backgroundColor: "#222", color: "#666", border: "1px solid #333"}}
                    >
            {queueLabel}
          </span>
                </div>

                <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono tabular-nums" style={{color: "#f1f1f1"}}>
            {level.level_id}
          </span>
                </div>

                <div className="mt-1 text-sm" style={{color: "#a0a0a0"}}>
                    Requested by{" "}
                    <span className="font-semibold" style={{color: "var(--color-accent)"}}>
            {level.username}
          </span>
                </div>
            </div>

            <button
                onClick={onDismiss}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-xs transition-colors"
                style={{color: "#555"}}
                onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "#a0a0a0";
                }}
                onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "#555";
                }}
                title="Dismiss"
            >
                ✕
            </button>
        </div>
    );
}
