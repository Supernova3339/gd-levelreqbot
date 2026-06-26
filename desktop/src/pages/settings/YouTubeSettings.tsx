import {useEffect, useState} from "react";
import {useConfig} from "../../hooks/useConfig";
import {connectYouTube, disconnectYouTube, getYouTubeUserInfo, type YouTubeUserInfo,} from "../../lib/commands";

export function YouTubeSettings({refreshKey = 0}: { refreshKey?: number }) {
    const {config, loading, error, save} = useConfig();
    const [apiKey, setApiKey] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [connecting, setConnecting] = useState(false);
    const [ytUser, setYtUser] = useState<YouTubeUserInfo | null>(null);
    const [userLoading, setUserLoading] = useState(false);
    const [userError, setUserError] = useState<string | null>(null);

    const loadYtUser = async () => {
        setUserLoading(true);
        setUserError(null);
        try {
            setYtUser(await getYouTubeUserInfo());
        } catch (err) {
            setYtUser(null);
            setUserError(String(err));
            console.error("[youtube] get_youtube_user_info failed:", err);
        } finally {
            setUserLoading(false);
        }
    };

    useEffect(() => {
        if (config) {
            setApiKey(config.auth.youtube_api_key);
            if (config.auth.youtube_access_token) loadYtUser();
        }
    }, [config]);

    // Re-load user info when parent signals a token was saved
    useEffect(() => {
        if (refreshKey > 0) loadYtUser();
    }, [refreshKey]);

    if (loading || !config) return <div className="text-xs py-8 text-center" style={{color: "#555"}}>Loading...</div>;
    if (error) return <div className="text-xs" style={{color: "#ef4444"}}>Failed to load config: {error}</div>;

    const handleSave = async () => {
        setSaving(true);
        setSaveMsg(null);
        try {
            await save({...config, auth: {...config.auth, youtube_api_key: apiKey}});
            setSaveMsg({ok: true, text: "Saved"});
            setTimeout(() => setSaveMsg(null), 3000);
        } catch (err) {
            setSaveMsg({ok: false, text: String(err)});
        } finally {
            setSaving(false);
        }
    };

    const handleConnect = async () => {
        setConnecting(true);
        try {
            await connectYouTube();
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        await disconnectYouTube();
        setYtUser(null);
    };

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-sm font-semibold mb-1" style={{color: "#f1f1f1"}}>YouTube</h2>
                <p className="text-xs" style={{color: "#555"}}>Read level requests from YouTube Live Chat.</p>
            </div>

            {/* OAuth — shows connected account or connect prompt */}
            <div className="flex flex-col gap-2 p-3 rounded-lg"
                 style={{backgroundColor: "#111", border: "1px solid #2a2a2a"}}>
                <p className="text-xs font-medium" style={{color: "#a0a0a0"}}>Google account</p>

                {userLoading ? (
                    <p className="text-xs" style={{color: "#555"}}>Checking...</p>
                ) : userError ? (
                    <div className="flex items-center gap-3">
                        <p className="text-xs flex-1" style={{color: "#ef4444"}}>{userError}</p>
                        <button onClick={handleConnect} disabled={connecting}
                                className="px-3 py-1.5 text-xs font-medium rounded flex-shrink-0"
                                style={{
                                    backgroundColor: "var(--color-accent)",
                                    color: "#fff",
                                    opacity: connecting ? 0.5 : 1
                                }}>
                            {connecting ? "Opening..." : "Reconnect"}
                        </button>
                    </div>
                ) : ytUser ? (
                    <div className="flex items-center gap-3">
                        {ytUser.picture ? (
                            <img
                                src={ytUser.picture}
                                alt=""
                                className="w-8 h-8 rounded-full flex-shrink-0"
                                style={{border: "1px solid #333"}}
                                onError={(e) => {
                                    // Fall back to a generated initial avatar if the URL fails
                                    e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(ytUser.name || "?")}&background=333&color=fff&size=32`;
                                }}
                            />
                        ) : (
                            <div
                                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                                style={{backgroundColor: "#333", color: "#f1f1f1", border: "1px solid #444"}}
                            >
                                {(ytUser.name || ytUser.email || "?")[0].toUpperCase()}
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>{ytUser.name}</p>
                            <p className="text-xs" style={{color: "#555"}}>{ytUser.email}</p>
                        </div>
                        <button
                            onClick={handleDisconnect}
                            className="text-xs px-2.5 py-1 rounded flex-shrink-0"
                            style={{backgroundColor: "#2a1a1a", color: "#ef4444", border: "1px solid #3a2020"}}
                        >
                            Disconnect
                        </button>
                        <button
                            onClick={handleConnect}
                            disabled={connecting}
                            className="text-xs px-2.5 py-1 rounded flex-shrink-0"
                            style={{
                                backgroundColor: "#222",
                                color: "#a0a0a0",
                                border: "1px solid #333",
                                opacity: connecting ? 0.5 : 1
                            }}
                        >
                            {connecting ? "Opening..." : "Switch"}
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <p className="text-xs flex-1" style={{color: "#555"}}>Not connected — opens a browser window to
                            sign in with Google.</p>
                        <button
                            onClick={handleConnect}
                            disabled={connecting}
                            className="px-3 py-1.5 text-xs font-medium rounded flex-shrink-0"
                            style={{
                                backgroundColor: "var(--color-accent)",
                                color: "#fff",
                                opacity: connecting ? 0.5 : 1
                            }}
                        >
                            {connecting ? "Opening..." : "Connect"}
                        </button>
                    </div>
                )}
            </div>

            {/* API key */}
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{color: "#a0a0a0"}} htmlFor="yt_api_key">
                    API key <span className="font-normal"
                                  style={{color: "#555"}}>— optional, for read-only polling</span>
                </label>
                <input id="yt_api_key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                       placeholder="AIza..."
                       className="w-full px-3 py-2 text-sm rounded"
                       style={{backgroundColor: "#111", color: "#f1f1f1", border: "1px solid #333"}}
                       onFocus={(e) => {
                           e.currentTarget.style.borderColor = "var(--color-accent)";
                       }}
                       onBlur={(e) => {
                           e.currentTarget.style.borderColor = "#333";
                       }}
                />
                <span className="text-xs" style={{color: "#555"}}>From console.cloud.google.com — not required if OAuth is connected.</span>
            </div>

            <div className="flex items-center gap-3 pt-2" style={{borderTop: "1px solid #2a2a2a"}}>
                {saveMsg &&
                    <span className="text-xs" style={{color: saveMsg.ok ? "#22c55e" : "#ef4444"}}>{saveMsg.text}</span>}
                <button onClick={handleSave} disabled={saving}
                        className="px-4 py-1.5 text-xs font-semibold rounded"
                        style={{backgroundColor: "var(--color-accent)", color: "#fff", opacity: saving ? 0.5 : 1}}>
                    {saving ? "Saving..." : "Save"}
                </button>
            </div>
        </div>
    );
}
