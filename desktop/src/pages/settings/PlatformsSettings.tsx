import {useEffect, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {useConfig} from "../../hooks/useConfig";
import {checkTwitchToken, checkYouTubeToken, connectTwitch, connectYouTube,} from "../../lib/commands";

interface PlatformRowProps {
    label: string;
    hasToken: boolean;
    onConnect: () => Promise<void>;
    onCheck: () => Promise<boolean>;
}

function PlatformRow({label, hasToken, onConnect, onCheck}: PlatformRowProps) {
    const [valid, setValid] = useState<boolean | null>(null);
    const [connecting, setConnecting] = useState(false);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        if (hasToken) {
            onCheck().then(setValid).catch(() => setValid(false));
        }
    }, [hasToken]);

    const handleConnect = async () => {
        setConnecting(true);
        try {
            await onConnect();
            await new Promise((r) => setTimeout(r, 2500));
            const ok = await onCheck();
            setValid(ok);
        } catch {
            setValid(false);
        } finally {
            setConnecting(false);
        }
    };

    const handleCheck = async () => {
        setChecking(true);
        try {
            const ok = await onCheck();
            setValid(ok);
        } finally {
            setChecking(false);
        }
    };

    const statusColor =
        valid === null ? (hasToken ? "#f59e0b" : "#555") : valid ? "#22c55e" : "#ef4444";
    const statusText =
        valid === null
            ? hasToken ? "Token stored" : "Not connected"
            : valid ? "Token valid" : "Token invalid";

    return (
        <div
            className="rounded-lg p-4 flex flex-col gap-3"
            style={{backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a"}}
        >
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{color: "#f1f1f1"}}>{label}</span>
                <div className="flex items-center gap-2">
          <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{backgroundColor: statusColor}}
          />
                    <span className="text-xs" style={{color: "#a0a0a0"}}>{statusText}</span>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="px-3 py-1.5 text-xs font-medium rounded"
                    style={{backgroundColor: "var(--color-accent)", color: "#fff", opacity: connecting ? 0.5 : 1}}
                >
                    {connecting ? "Opening browser..." : `Connect ${label}`}
                </button>
                <button
                    onClick={handleCheck}
                    disabled={checking || connecting}
                    className="px-3 py-1.5 text-xs rounded"
                    style={{
                        backgroundColor: "#222",
                        color: "#a0a0a0",
                        border: "1px solid #333",
                        opacity: checking ? 0.5 : 1,
                    }}
                >
                    {checking ? "Checking..." : "Verify token"}
                </button>
            </div>
        </div>
    );
}

export function PlatformsSettings() {
    const {config, loading} = useConfig();
    const [twitchHasToken, setTwitchHasToken] = useState(false);
    const [youtubeHasToken, setYoutubeHasToken] = useState(false);

    useEffect(() => {
        if (config) {
            setTwitchHasToken(!!config.auth.twitch_access_token);
            setYoutubeHasToken(!!config.auth.youtube_access_token);
        }
    }, [config]);

    // Listen for token-saved events from the auth callback
    useEffect(() => {
        const unlistenTwitch = listen("twitch-token-saved", () => {
            setTwitchHasToken(true);
        });
        const unlistenYouTube = listen("youtube-token-saved", () => {
            setYoutubeHasToken(true);
        });
        return () => {
            unlistenTwitch.then((f) => f());
            unlistenYouTube.then((f) => f());
        };
    }, []);

    if (loading) {
        return <div className="flex items-center justify-center h-32" style={{color: "#555"}}>Loading...</div>;
    }

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-sm font-semibold mb-1" style={{color: "#f1f1f1"}}>Platforms</h2>
                <p className="text-xs" style={{color: "#555"}}>OAuth connections for Twitch and YouTube.</p>
            </div>

            <div className="flex flex-col gap-3">
                <PlatformRow
                    label="Twitch"
                    hasToken={twitchHasToken}
                    onConnect={connectTwitch}
                    onCheck={checkTwitchToken}
                />
                <PlatformRow
                    label="YouTube"
                    hasToken={youtubeHasToken}
                    onConnect={connectYouTube}
                    onCheck={checkYouTubeToken}
                />
            </div>
        </div>
    );
}
