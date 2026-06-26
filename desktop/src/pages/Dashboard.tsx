import {useEffect, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {useQueue} from "../hooks/useQueue";
import {useConfig} from "../hooks/useConfig";
import {searchGdLevel} from "../lib/commands";
import type {GDLevel, NextLevel, QueueEntry} from "../lib/types";
import {invoke} from "@tauri-apps/api/core";

function thumbnailUrl(levelId: number, quality: string) {
    const q = quality ? `/${quality}` : "";
    return `https://levelthumbs.prevter.me/thumbnail/${levelId}${q}`;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const now = new Date().toISOString();
const DEMO_ENTRIES: QueueEntry[] = [
    {
        id: 1,
        level_id: 137065003,
        username: "Bonneville1",
        is_subscriber: false,
        position: 1,
        queue_type: "viewer",
        platform: "twitch",
        added_at: now
    },
    {
        id: 2,
        level_id: 103853867,
        username: "ArcticWoof",
        is_subscriber: true,
        position: 1,
        queue_type: "subscriber",
        platform: "twitch",
        added_at: now
    },
    {
        id: 3,
        level_id: 128,
        username: "Real Storm",
        is_subscriber: false,
        position: 2,
        queue_type: "viewer",
        platform: "youtube",
        added_at: now
    },
    {
        id: 4,
        level_id: 93733469,
        username: "Onilink",
        is_subscriber: true,
        position: 2,
        queue_type: "subscriber",
        platform: "twitch",
        added_at: now
    },
    {
        id: 5,
        level_id: 79539185,
        username: "Doggie",
        is_subscriber: false,
        position: 3,
        queue_type: "viewer",
        platform: "twitch",
        added_at: now
    },
];

// ─── Platform gradient ────────────────────────────────────────────────────────

const PLATFORM_COLOR: Record<string, string> = {
    twitch: "#9146ff",
    youtube: "#ff0000",
};

function platformGradient(entry: QueueEntry) {
    const base = PLATFORM_COLOR[entry.platform] ?? "#888";
    if (entry.is_subscriber) {
        return `linear-gradient(90deg, ${base}30 0%, transparent 70%)`;
    }
    return `linear-gradient(90deg, ${base}14 0%, transparent 70%)`;
}

function PlatformDot({platform}: { platform: string }) {
    const color = PLATFORM_COLOR[platform] ?? "#555";
    return (
        <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            title={platform}
            style={{backgroundColor: color}}
        />
    );
}

// ─── Queue entry row ─────────────────────────────────────────────────────────

function EntryRow({entry, active, onClick}: {
    entry: QueueEntry; active: boolean; onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
            style={{
                background: active ? "color-mix(in srgb, var(--color-accent) 10%, transparent)" : platformGradient(entry),
                borderLeft: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
            }}
            onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "#1a1a1a";
            }}
            onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = platformGradient(entry);
            }}
        >
            {/* Position */}
            <span className="text-xs w-5 flex-shrink-0 text-center tabular-nums" style={{color: "#555"}}>
        {entry.position}
      </span>

            {/* Platform dot */}
            <PlatformDot platform={entry.platform}/>

            {/* Subscriber flair */}
            {entry.is_subscriber && (
                <span className="w-1 h-1 rounded-full flex-shrink-0"
                      style={{backgroundColor: "var(--color-accent)", opacity: 0.8}}/>
            )}

            {/* Level ID */}
            <code className="text-xs font-bold flex-shrink-0" style={{color: "#d0d0d0"}}>
                {entry.level_id}
            </code>

            {/* Username */}
            <span className="text-xs truncate" style={{color: "#555"}}>
        @{entry.username}
      </span>

            {/* Queue type badge */}
            {entry.queue_type === "subscriber" && (
                <span className="ml-auto text-xs flex-shrink-0 px-1.5 py-0.5 rounded"
                      style={{backgroundColor: "rgba(34,197,94,0.1)", color: "#4ade80", fontSize: 10}}>
          sub
        </span>
            )}
        </button>
    );
}

// ─── Level detail panel ───────────────────────────────────────────────────────

function LevelDetail({entry, gdLevel, loading, showThumbnail, thumbnailQuality}: {
    entry: QueueEntry; gdLevel: GDLevel | null; loading: boolean;
    showThumbnail: boolean; thumbnailQuality: string;
}) {
    const [imgError, setImgError] = useState(false);
    // Reset error state when level changes
    useEffect(() => setImgError(false), [entry.level_id]);
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-5 py-4 flex-shrink-0" style={{borderBottom: "1px solid #222"}}>
                {loading ? (
                    <p className="text-sm" style={{color: "#555"}}>Loading level info...</p>
                ) : gdLevel ? (
                    <>
                        <p className="text-base font-bold mb-0.5" style={{color: "#f1f1f1"}}>{gdLevel.level_name}</p>
                        <p className="text-xs" style={{color: "#555"}}>
                            ID {entry.level_id} · requested by @{entry.username}
                        </p>
                    </>
                ) : (
                    <>
                        <p className="text-base font-bold mb-0.5 font-mono"
                           style={{color: "#f1f1f1"}}>{entry.level_id}</p>
                        <p className="text-xs" style={{color: "#555"}}>Requested by @{entry.username}</p>
                    </>
                )}
            </div>

            {/* Thumbnail */}
            {showThumbnail && !imgError && (
                <div className="flex-shrink-0" style={{borderBottom: "1px solid #222"}}>
                    <img
                        src={thumbnailUrl(entry.level_id, thumbnailQuality)}
                        alt={`Level ${entry.level_id}`}
                        className="w-full"
                        style={{maxHeight: 180, objectFit: "cover", objectPosition: "center", display: "block"}}
                        onError={() => setImgError(true)}
                    />
                </div>
            )}

            {/* GD info */}
            <div className="flex-1 overflow-y-auto p-5">
                {gdLevel ? (
                    <div className="flex flex-col gap-4">
                        {gdLevel.description && (
                            <div className="flex flex-col gap-1">
                                <p className="text-xs font-semibold uppercase tracking-wider"
                                   style={{color: "#444"}}>Description</p>
                                <p className="text-sm"
                                   style={{color: "#888", lineHeight: 1.6}}>{gdLevel.description}</p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            {[
                                ["Difficulty", gdLevel.difficulty + (gdLevel.auto ? " (Auto)" : "")],
                                ["Stars", gdLevel.stars > 0 ? `${gdLevel.stars} ★` : "Unrated"],
                                ["Length", gdLevel.length],
                                ["Version", `v${gdLevel.version}`],
                                ["Downloads", gdLevel.downloads.toLocaleString()],
                                ["Likes", gdLevel.likes.toLocaleString()],
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <p className="text-xs" style={{color: "#555"}}>{label}</p>
                                    <p className="text-sm font-medium" style={{color: "#d0d0d0"}}>{value}</p>
                                </div>
                            ))}
                        </div>

                        {(gdLevel.featured || gdLevel.epic || gdLevel.demon || gdLevel.verified_coins) && (
                            <div className="flex flex-wrap gap-1.5">
                                {gdLevel.epic && <Tag label="Epic" color="#f97316"/>}
                                {gdLevel.featured && <Tag label="Featured" color="#3b82f6"/>}
                                {gdLevel.demon && <Tag label="Demon" color="#ef4444"/>}
                                {gdLevel.verified_coins && <Tag label="Coins" color="#f59e0b"/>}
                            </div>
                        )}

                        {entry.is_subscriber && (
                            <div className="px-3 py-2 rounded text-xs"
                                 style={{
                                     backgroundColor: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
                                     border: "1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)",
                                     color: "var(--color-accent)"
                                 }}>
                                Submitted by a subscriber
                            </div>
                        )}
                    </div>
                ) : !loading ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs" style={{color: "#555"}}>GD level info not available.</p>
                        <p className="text-xs" style={{color: "#444"}}>
                            Queue position: #{entry.position} in {entry.queue_type} queue
                        </p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function Tag({label, color}: { label: string; color: string }) {
    return (
        <span className="text-xs px-2 py-0.5 rounded"
              style={{backgroundColor: color + "22", color, border: `1px solid ${color}44`}}>
      {label}
    </span>
    );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({label, count}: { label: string; count: number }) {
    return (
        <div className="px-3 py-1.5 flex items-center gap-2 flex-shrink-0"
             style={{borderBottom: "1px solid #1e1e1e"}}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{color: "#444"}}>{label}</span>
            <span className="text-xs" style={{color: "#333"}}>{count}</span>
        </div>
    );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard({demo = false}: { demo?: boolean }) {
    const queue = useQueue();
    const {config} = useConfig();
    const showThumbnail = demo ? true : (config?.level_thumbnails ?? true);
    const thumbQuality = config?.thumbnail_quality ?? "";
    const [selected, setSelected] = useState<QueueEntry | null>(null);
    const [gdLevel, setGdLevel] = useState<GDLevel | null>(null);
    const [gdLoading, setGdLoading] = useState(false);
    const [lastLevel, setLastLevel] = useState<NextLevel | null>(null);
    const [nextLoading, setNextLoading] = useState(false);
    const [clearLoading, setClearLoading] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    // Combine all queue entries for the list
    const allViewers = demo
        ? DEMO_ENTRIES.filter((e) => e.queue_type === "viewer")
        : (queue.viewerQueue?.data ?? []);
    const allSubs = demo
        ? DEMO_ENTRIES.filter((e) => e.queue_type === "subscriber")
        : (queue.subscriberQueue?.data ?? []);

    // Fetch GD level info when selection changes
    useEffect(() => {
        if (!selected || demo) return;
        setGdLevel(null);
        setGdLoading(true);
        searchGdLevel(selected.level_id)
            .then(setGdLevel)
            .catch(() => setGdLevel(null))
            .finally(() => setGdLoading(false));
    }, [selected?.level_id]);

    // Queue updated — reload list
    useEffect(() => {
        const unlisten = listen("queue-updated", () => queue.reload());
        return () => {
            unlisten.then((f) => f());
        };
    }, []);

    // Next level triggered from chat (!next) or dashboard button — update the Now Playing card
    useEffect(() => {
        const unlisten = listen<{ level_id: number; username: string; queue_type: string }>(
            "level-nexted",
            (e) => {
                setLastLevel({
                    level_id: e.payload.level_id,
                    username: e.payload.username,
                    queue_type: e.payload.queue_type,
                });
                setSelected(null);
            }
        );
        return () => {
            unlisten.then((f) => f());
        };
    }, []);

    const handleNext = async () => {
        if (demo) {
            setLastLevel({level_id: 98006888, username: "KrmaL", queue_type: "viewer"});
            return;
        }
        setNextLoading(true);
        setActionError(null);
        try {
            const result: NextLevel | null = await invoke("next_level");
            if (result) {
                setLastLevel(result);
                setSelected(null);
            } else setActionError("Queue is empty.");
            queue.reload();
        } catch (err) {
            setActionError(String(err));
        } finally {
            setNextLoading(false);
        }
    };

    const handleClear = async () => {
        if (demo) return;
        setClearLoading(true);
        setActionError(null);
        try {
            await queue.clearQueue();
            setSelected(null);
        } catch (err) {
            setActionError(String(err));
        } finally {
            setClearLoading(false);
        }
    };

    const totalCount = allViewers.length + allSubs.length;

    return (
        <div className="flex h-full" style={{minHeight: 0}}>
            {/* ── Left: queue list ── */}
            <div className="flex flex-col flex-shrink-0"
                 style={{width: 260, borderRight: "1px solid #222", backgroundColor: "#111"}}>

                {/* Actions */}
                <div className="flex gap-1.5 p-2 flex-shrink-0" style={{borderBottom: "1px solid #1e1e1e"}}>
                    <button
                        onClick={handleNext}
                        disabled={nextLoading || totalCount === 0}
                        className="flex-1 py-1.5 text-xs font-semibold rounded"
                        style={{
                            backgroundColor: "var(--color-accent)", color: "#fff",
                            opacity: (nextLoading || totalCount === 0) ? 0.5 : 1
                        }}>
                        {nextLoading ? "Loading..." : "Next Level"}
                    </button>
                    {!demo && (
                        <button
                            onClick={queue.reload}
                            className="px-2.5 py-1.5 text-xs rounded"
                            style={{backgroundColor: "#1a1a1a", color: "#555", border: "1px solid #2a2a2a"}}>
                            ↻
                        </button>
                    )}
                    <button
                        onClick={handleClear}
                        disabled={clearLoading || totalCount === 0}
                        className="px-2.5 py-1.5 text-xs rounded"
                        style={{
                            backgroundColor: "#2a1a1a", color: "#ef4444", border: "1px solid #3a2020",
                            opacity: (clearLoading || totalCount === 0) ? 0.5 : 1
                        }}>
                        Clear
                    </button>
                </div>

                {/* Error */}
                {actionError && (
                    <div className="px-3 py-1.5 text-xs flex-shrink-0"
                         style={{color: "#ef4444", backgroundColor: "#1a0a0a"}}>
                        {actionError}
                    </div>
                )}

                {/* Entries */}
                <div className="flex-1 overflow-y-auto">
                    {queue.loading && !demo ? (
                        <p className="text-xs text-center py-6" style={{color: "#555"}}>Loading...</p>
                    ) : totalCount === 0 ? (
                        <p className="text-xs text-center py-6" style={{color: "#333"}}>Queue is empty</p>
                    ) : (
                        <>
                            {allSubs.length > 0 && (
                                <>
                                    <SectionHeader label="Subscribers" count={allSubs.length}/>
                                    {allSubs.map((e) => (
                                        <EntryRow key={e.id} entry={e}
                                                  active={selected?.id === e.id} onClick={() => setSelected(e)}/>
                                    ))}
                                </>
                            )}
                            {allViewers.length > 0 && (
                                <>
                                    {allSubs.length > 0 && <SectionHeader label="Viewers" count={allViewers.length}/>}
                                    {allViewers.map((e) => (
                                        <EntryRow key={e.id} entry={e}
                                                  active={selected?.id === e.id} onClick={() => setSelected(e)}/>
                                    ))}
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Right: level detail or next level result ── */}
            <div className="flex-1 min-w-0 flex flex-col" style={{backgroundColor: "#0f0f0f"}}>
                {lastLevel ? (
                    /* Now playing card */
                    <div className="flex flex-col h-full">
                        <div className="px-5 py-4 flex items-start justify-between flex-shrink-0"
                             style={{borderBottom: "1px solid #222"}}>
                            <div>
                                <p className="text-xs uppercase tracking-wider mb-1"
                                   style={{color: "var(--color-accent)"}}>
                                    Now playing
                                </p>
                                <p className="text-base font-bold" style={{color: "#f1f1f1"}}>
                                    {lastLevel.level_id}
                                </p>
                                <p className="text-xs mt-0.5" style={{color: "#555"}}>
                                    from @{lastLevel.username} · {lastLevel.queue_type} queue
                                </p>
                            </div>
                            <button onClick={() => setLastLevel(null)}
                                    className="text-xs px-3 py-1.5 rounded"
                                    style={{backgroundColor: "#222", color: "#888", border: "1px solid #2a2a2a"}}>
                                Dismiss
                            </button>
                        </div>
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-xs" style={{color: "#333"}}>Select a level in the list to view
                                details</p>
                        </div>
                    </div>
                ) : selected ? (
                    <LevelDetail
                        entry={selected} gdLevel={gdLevel} loading={gdLoading}
                        showThumbnail={showThumbnail} thumbnailQuality={thumbQuality}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full flex-col gap-2">
                        <p className="text-sm" style={{color: "#2a2a2a"}}>Select a level to view details</p>
                    </div>
                )}
            </div>
        </div>
    );
}
