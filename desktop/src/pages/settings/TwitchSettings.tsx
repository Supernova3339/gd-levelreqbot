import {useEffect, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import type {AppConfig} from "../../lib/types";
import {useConfig} from "../../hooks/useConfig";
import {
    checkTwitchToken,
    connectBotAccount,
    connectTwitch,
    disconnectBotAccount,
    disconnectTwitch,
    getBotAccountInfo,
    getTwitchUserInfo,
    refreshTwitchToken,
    type TwitchUserInfo,
} from "../../lib/commands";
import {TwitchRewardPicker} from "../../components/TwitchRewardPicker";

function AccountCard({
                         title, description, user, loading, error, connecting,
                         onConnect, onDisconnect, onSwitch, onRefresh
                     }: {
    title: string;
    description: string;
    user: TwitchUserInfo | null;
    loading: boolean;
    error: string | null;
    connecting: boolean;
    onConnect: () => Promise<void>;
    onDisconnect: () => Promise<void>;
    onSwitch: () => Promise<void>;
    onRefresh?: () => Promise<void>;
}) {
    return (
        <div className="flex flex-col gap-2 rounded-lg p-4"
             style={{backgroundColor: "#111", border: "1px solid #222"}}>
            <div>
                <p className="text-xs font-semibold" style={{color: "#f1f1f1"}}>{title}</p>
                <p className="text-xs mt-0.5" style={{color: "#555"}}>{description}</p>
            </div>

            {loading ? (
                <p className="text-xs" style={{color: "#555"}}>Checking...</p>
            ) : error ? (
                <div className="flex flex-col gap-2">
                    <p className="text-xs" style={{color: "#ef4444"}}>
                        {error.includes("invalid") || error.includes("expired")
                            ? "Token expired. Try refreshing, or reconnect if that fails."
                            : error}
                    </p>
                    <div className="flex items-center gap-2">
                        {onRefresh && (
                            <button onClick={onRefresh}
                                    className="px-3 py-1.5 text-xs rounded"
                                    style={{backgroundColor: "#1e1e1e", color: "#c0c0c0", border: "1px solid #2a2a2a"}}>
                                ↺ Refresh token
                            </button>
                        )}
                        <button onClick={onConnect} disabled={connecting}
                                className="px-3 py-1.5 text-xs font-medium rounded"
                                style={{
                                    backgroundColor: "var(--color-accent)",
                                    color: "#fff",
                                    opacity: connecting ? 0.5 : 1
                                }}>
                            {connecting ? "Opening..." : "Reconnect"}
                        </button>
                    </div>
                </div>
            ) : user ? (
                <div className="flex items-center gap-3">
                    <div
                        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                        style={{backgroundColor: "#2a2a2a", color: "#f1f1f1", border: "1px solid #333"}}>
                        {(user.display_name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>{user.display_name}</p>
                        {user.login !== user.display_name && (
                            <p className="text-xs" style={{color: "#555"}}>@{user.login}</p>
                        )}
                    </div>
                    <button onClick={onDisconnect}
                            className="text-xs px-2.5 py-1 rounded"
                            style={{backgroundColor: "#2a1a1a", color: "#ef4444", border: "1px solid #3a2020"}}>
                        Disconnect
                    </button>
                    <button onClick={onSwitch} disabled={connecting}
                            className="text-xs px-2.5 py-1 rounded"
                            style={{
                                backgroundColor: "#222",
                                color: "#888",
                                border: "1px solid #2a2a2a",
                                opacity: connecting ? 0.5 : 1
                            }}>
                        {connecting ? "Opening..." : "Switch"}
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-3">
                    <p className="text-xs flex-1" style={{color: "#555"}}>
                        Not connected — opens a browser window.
                    </p>
                    <button onClick={onConnect} disabled={connecting}
                            className="px-3 py-1.5 text-xs font-medium rounded flex-shrink-0"
                            style={{
                                backgroundColor: "var(--color-accent)",
                                color: "#fff",
                                opacity: connecting ? 0.5 : 1
                            }}>
                        {connecting ? "Opening..." : "Connect"}
                    </button>
                </div>
            )}
        </div>
    );
}

export function TwitchSettings({refreshKey = 0}: { refreshKey?: number }) {
    const {config, loading, error, save} = useConfig();
    const [form, setForm] = useState<AppConfig | null>(null);
    const [useChannelAsBot, setUseChannelAsBot] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

    // Channel account
    const [channelUser, setChannelUser] = useState<TwitchUserInfo | null>(null);
    const [channelLoading, setChannelLoading] = useState(false);
    const [channelError, setChannelError] = useState<string | null>(null);
    const [channelConnecting, setChannelConnecting] = useState(false);

    // Bot account (separate)
    const [botUser, setBotUser] = useState<TwitchUserInfo | null>(null);
    const [botLoading, setBotLoading] = useState(false);
    const [botError, setBotError] = useState<string | null>(null);
    const [botConnecting, setBotConnecting] = useState(false);

    const loadChannelUser = async () => {
        setChannelLoading(true);
        setChannelError(null);
        try {
            // Silently refresh an expired access token before fetching user info.
            // check_twitch_token validates and, if expired, exchanges the refresh token.
            const valid = await checkTwitchToken();
            if (!valid) throw new Error("Token invalid or expired — reconnect in Settings → Twitch.");
            setChannelUser(await getTwitchUserInfo());
        } catch (e) {
            setChannelUser(null);
            setChannelError(String(e));
        } finally {
            setChannelLoading(false);
        }
    };

    const loadBotUser = async () => {
        setBotLoading(true);
        setBotError(null);
        try {
            setBotUser(await getBotAccountInfo());
        } catch (e) {
            setBotUser(null);
            setBotError(null);
        } // silently null when no bot token
        finally {
            setBotLoading(false);
        }
    };

    useEffect(() => {
        if (config && !form) {
            const f = JSON.parse(JSON.stringify(config)) as AppConfig;
            setForm(f);
            setUseChannelAsBot(!f.auth.bot_username || f.auth.bot_username === f.auth.channel);
            if (f.auth.twitch_access_token) loadChannelUser();
            if (f.auth.bot_access_token) loadBotUser();
        }
    }, [config, form]);

    useEffect(() => {
        const unT = listen("twitch-token-saved", () => loadChannelUser());
        const unB = listen("twitch-bot-token-saved", () => loadBotUser());
        return () => {
            unT.then((f) => f());
            unB.then((f) => f());
        };
    }, []);

    useEffect(() => {
        if (refreshKey > 0) {
            loadChannelUser();
            loadBotUser();
        }
    }, [refreshKey]);

    if (loading || !form) return <div className="text-xs py-8 text-center" style={{color: "#555"}}>Loading...</div>;
    if (error) return <div className="text-xs" style={{color: "#ef4444"}}>Failed to load: {error}</div>;

    const setAuth = (key: keyof typeof form.auth, value: string) =>
        setForm((p) => p ? {...p, auth: {...p.auth, [key]: value}} : p);

    const handleSave = async () => {
        if (!form) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            await save({
                ...form, auth: {
                    ...form.auth,
                    bot_username: useChannelAsBot ? form.auth.channel : form.auth.bot_username
                }
            });
            setSaveMsg({ok: true, text: "Saved"});
            setTimeout(() => setSaveMsg(null), 3000);
        } catch (err) {
            setSaveMsg({ok: false, text: String(err)});
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-sm font-semibold mb-1" style={{color: "#f1f1f1"}}>Twitch</h2>
                <p className="text-xs" style={{color: "#555"}}>Chat connection and channel account.</p>
            </div>

            {/* Channel name */}
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>Channel</label>
                <input value={form.auth.channel}
                       onChange={(e) => {
                           setAuth("channel", e.target.value);
                           if (useChannelAsBot) setAuth("bot_username", e.target.value);
                       }}
                       placeholder="yourchannel"
                       className="px-3 py-2 text-sm rounded"
                       style={{backgroundColor: "#111", color: "#f1f1f1", border: "1px solid #2a2a2a"}}
                       onFocus={(e) => {
                           e.currentTarget.style.borderColor = "var(--color-accent)";
                       }}
                       onBlur={(e) => {
                           e.currentTarget.style.borderColor = "#2a2a2a";
                       }}
                />
                <p className="text-xs" style={{color: "#555"}}>Your Twitch channel — no #</p>
            </div>

            {/* Bot toggle */}
            <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer"
                   style={{
                       backgroundColor: "#111",
                       border: `1px solid ${useChannelAsBot ? "color-mix(in srgb, var(--color-accent) 30%, transparent)" : "#2a2a2a"}`
                   }}>
                <div className="relative mt-0.5 flex-shrink-0"
                     onClick={() => {
                         const v = !useChannelAsBot;
                         setUseChannelAsBot(v);
                         if (v) setAuth("bot_username", form.auth.channel); else setAuth("bot_username", "");
                     }}>
                    <div className="w-9 h-5 rounded-full"
                         style={{backgroundColor: useChannelAsBot ? "var(--color-accent)" : "#333"}}>
                        <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                             style={{transform: useChannelAsBot ? "translateX(18px)" : "translateX(2px)"}}/>
                    </div>
                </div>
                <div onClick={() => {
                    const v = !useChannelAsBot;
                    setUseChannelAsBot(v);
                    if (v) setAuth("bot_username", form.auth.channel); else setAuth("bot_username", "");
                }}>
                    <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>Use my channel account as the bot</p>
                    <p className="text-xs mt-0.5" style={{color: "#555"}}>Messages appear as you. Turn off to use a
                        separate bot account.</p>
                </div>
            </label>

            {/* Your channel account (Twitch OAuth) */}
            <AccountCard
                title="Your channel account"
                description="Used for announcements and subscriber detection."
                user={channelUser} loading={channelLoading} error={channelError} connecting={channelConnecting}
                onConnect={async () => {
                    setChannelConnecting(true);
                    try {
                        await connectTwitch();
                    } finally {
                        setChannelConnecting(false);
                    }
                }}
                onDisconnect={async () => {
                    await disconnectTwitch();
                    setChannelUser(null);
                }}
                onSwitch={async () => {
                    setChannelConnecting(true);
                    try {
                        await connectTwitch();
                    } finally {
                        setChannelConnecting(false);
                    }
                }}
                onRefresh={async () => {
                    try {
                        await refreshTwitchToken();
                        await loadChannelUser();
                    } catch (e) {
                        setChannelError(`Refresh failed: ${e}. Try reconnecting.`);
                    }
                }}
            />

            {/* Bot account — only when using separate bot */}
            {!useChannelAsBot && (
                <>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>Bot username</label>
                        <input value={form.auth.bot_username} onChange={(e) => setAuth("bot_username", e.target.value)}
                               placeholder="mybot"
                               className="px-3 py-2 text-sm rounded"
                               style={{backgroundColor: "#111", color: "#f1f1f1", border: "1px solid #2a2a2a"}}
                               onFocus={(e) => {
                                   e.currentTarget.style.borderColor = "var(--color-accent)";
                               }}
                               onBlur={(e) => {
                                   e.currentTarget.style.borderColor = "#2a2a2a";
                               }}
                        />
                    </div>
                    <AccountCard
                        title="Bot account"
                        description="Sign in with your bot's Twitch account to connect it to chat."
                        user={botUser} loading={botLoading} error={botError} connecting={botConnecting}
                        onConnect={async () => {
                            setBotConnecting(true);
                            try {
                                await connectBotAccount();
                            } finally {
                                setBotConnecting(false);
                            }
                        }}
                        onDisconnect={async () => {
                            await disconnectBotAccount();
                            setBotUser(null);
                        }}
                        onSwitch={async () => {
                            setBotConnecting(true);
                            try {
                                await connectBotAccount();
                            } finally {
                                setBotConnecting(false);
                            }
                        }}
                    />
                </>
            )}

            <div className="flex items-center gap-3 pt-2" style={{borderTop: "1px solid #222"}}>
                {saveMsg &&
                    <span className="text-xs" style={{color: saveMsg.ok ? "#22c55e" : "#ef4444"}}>{saveMsg.text}</span>}
                <button onClick={handleSave} disabled={saving}
                        className="px-4 py-1.5 text-xs font-semibold rounded"
                        style={{backgroundColor: "var(--color-accent)", color: "#fff", opacity: saving ? 0.5 : 1}}>
                    {saving ? "Saving..." : "Save"}
                </button>
            </div>

            {/* Channel points work automatically once connected — this is just reward
                management (create/edit/delete). Which reward triggers what is wired up
                per-module (e.g. Level Queue → Settings → Integrations) or per-command
                (Settings → Commands → a command's "Additional listener"). */}
            <div className="flex flex-col gap-2">
                <div>
                    <h3 className="text-xs font-semibold" style={{color: "#a0a0a0"}}>Channel-point rewards</h3>
                    <p className="text-xs mt-0.5" style={{color: "#555"}}>
                        Manage rewards here; bind one to a command's listener in Settings → Commands, or to a
                        module's redemption settings. Icons can only be set from the Twitch dashboard — Twitch's
                        API doesn't expose that, so there's no control for it here.
                    </p>
                </div>
                <TwitchRewardPicker/>
            </div>
        </div>
    );
}
