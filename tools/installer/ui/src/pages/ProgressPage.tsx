import {useEffect, useRef, useState} from "react";

interface ProgressPageProps {
    fraction: number;
    /** Every progress message so far — hidden behind "technical details". */
    log: string[];
}

/** Fun tips for users: reassure, distract with tips, bury the log. */
const TIPS = [
    "Did you know? Viewers can request levels straight from chat with our official queue module.",
    "Tip: you can write your own commands with Rhai scripts.",
    "Did you know? Marketplace modules add new features in one click.",
    "Tip: overlay widgets update live as your data changes.",
    "Did you know? The queue keeps working even while you're in a level.",
    "Did you know? The bot speaks both Twitch and YouTube Live Chat — at the same time.",
    "Tip: sub mode lets subscribers keep requesting while the queue is closed to everyone else.",
    "Did you know? Level thumbnails load right in the queue, so you can spot a troll level early.",
    "Tip: set separate request limits for viewers and subscribers, so regulars can't flood the queue.",
    "Did you know? The script editor has autocomplete, find & replace, and a built-in test runner.",
    "Tip: double-clicking a .gdlqs file opens it straight in the app.",
    "Did you know? You can rebind almost every shortcut in Settings → Keybinds.",
    "Tip: link your GD account and the bot can pull your icon and account details automatically.",
    "Did you know? The WebSocket API lets your own tools react to queue changes in real time.",
    "Tip: auto-copy puts the next level ID on your clipboard the moment you advance the queue.",
    "Did you know? Modules can ship their own settings pages, right inside the app.",
    "Tip: the command-line tool can drive the queue from scripts and stream decks.",
    "Did you know? You can close the queue and still let the current list play out.",
];

export function ProgressPage({fraction, log}: ProgressPageProps) {
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    const [tip, setTip] = useState(0);
    const [details, setDetails] = useState(false);
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 4500);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        const el = logRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [log.length, details]);

    return (
        <div className="flex flex-col h-full min-h-0 gap-3 pt-1">
            <div className="text-[42px] font-light leading-none text-text-primary tabular-nums">
                {pct}<span className="text-[20px] text-text-muted">%</span>
            </div>
            <div className="h-1 w-full bg-bg-surface">
                <div
                    className="h-full bg-accent transition-[width] duration-150"
                    style={{width: `${pct}%`}}
                />
            </div>

            {!details && (
                <div className="flex-1 flex items-center">
                    <p className="m-0 text-[13px] text-text-secondary font-light">{TIPS[tip]}</p>
                </div>
            )}
            {details && (
                <div
                    ref={logRef}
                    className="flex-1 min-h-0 overflow-y-auto bg-bg-card p-2
                               font-mono text-[10px] leading-snug text-text-muted select-text"
                >
                    {log.map((line, i) => (
                        <div key={i} className="whitespace-nowrap">{line}</div>
                    ))}
                </div>
            )}

            <button
                onClick={() => setDetails((d) => !d)}
                className="self-start bg-transparent border-0 p-0 text-[11px] text-text-muted hover:text-accent"
            >
                {details ? "Hide technical details" : "Show technical details"}
            </button>
        </div>
    );
}
