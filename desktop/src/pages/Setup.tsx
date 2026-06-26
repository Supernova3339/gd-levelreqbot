import {useEffect, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import type {AppConfig} from "../lib/types";
import {connectBotAccount, connectTwitch, connectYouTube, markSetupComplete, saveConfig} from "../lib/commands";

// connectBotAccount used in the connect step for separate bot accounts

interface SetupProps {
    onComplete: (demo?: boolean) => void;
}

// ─── Small shared components ──────────────────────────────────────────────────

function Field({label, id, value, onChange, type = "text", placeholder, hint, required}: {
    label: string; id: string; value: string; onChange: (v: string) => void;
    type?: string; placeholder?: string; hint?: string; required?: boolean;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium flex gap-1" style={{color: "#f1f1f1"}} htmlFor={id}>
                {label}{required && <span style={{color: "var(--color-accent)"}}>*</span>}
            </label>
            <input
                id={id} type={type} value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2.5 text-sm rounded-lg"
                style={{backgroundColor: "#111", color: "#f1f1f1", border: "1px solid #333"}}
                onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-accent)";
                }}
                onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#333";
                }}
            />
            {hint && <p className="text-xs" style={{color: "#555"}}>{hint}</p>}
        </div>
    );
}

function Btn({onClick, disabled, variant = "primary", children}: {
    onClick: () => void; disabled?: boolean;
    variant?: "primary" | "secondary" | "ghost";
    children: React.ReactNode;
}) {
    const styles: Record<string, React.CSSProperties> = {
        primary: {backgroundColor: "var(--color-accent)", color: "#fff"},
        secondary: {backgroundColor: "#222", color: "#a0a0a0", border: "1px solid #333"},
        ghost: {backgroundColor: "transparent", color: "#666", border: "1px solid #2a2a2a"},
    };
    return (
        <button
            onClick={onClick} disabled={disabled}
            className="flex-1 py-2.5 text-sm font-medium rounded-lg transition-opacity"
            style={{...styles[variant], opacity: disabled ? 0.4 : 1}}
        >{children}</button>
    );
}

function StepDots({total, current}: { total: number; current: number }) {
    return (
        <div className="flex gap-1.5 justify-center">
            {Array.from({length: total}).map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full" style={{
                    backgroundColor: i === current ? "var(--color-accent)" : "#333"
                }}/>
            ))}
        </div>
    );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = "twitch" | "youtube";
type Step = "mode" | "providers" | "twitch" | "connect" | "review";

function buildDefault(): AppConfig {
    return {
        auth: {
            bot_username: "", bot_access_token: "", channel: "",
            web_api_token: "",
            twitch_access_token: "", youtube_access_token: "", youtube_api_key: "",
        },
        modes: {gd: true, sub: false, smart: false, youtube: false},
        limits: {viewer_request_limit: 1, subscriber_request_limit: 2},
        setup_complete: false,
        auto_copy_level_id: false,
        level_thumbnails: true,
        thumbnail_quality: "",
    };
}

function ConnectRow({label, hint, connected, connecting, onConnect}: {
    label: string; hint: string;
    connected: boolean; connecting: boolean;
    onConnect: () => void;
}) {
    return (
        <div className="flex flex-col gap-2 p-3 rounded-lg"
             style={{backgroundColor: "#111", border: "1px solid #2a2a2a"}}>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs font-medium" style={{color: "#f1f1f1"}}>{label}</p>
                    <p className="text-xs mt-0.5" style={{color: "#555"}}>{hint}</p>
                </div>
                <span className="w-2 h-2 rounded-full flex-shrink-0 ml-3"
                      style={{backgroundColor: connected ? "#22c55e" : "#444"}}/>
            </div>
            <button
                onClick={onConnect}
                disabled={connecting || connected}
                className="w-full py-1.5 text-xs font-medium rounded"
                style={{
                    backgroundColor: connected ? "#1a2a1a" : "#222",
                    color: connected ? "#22c55e" : "#a0a0a0",
                    border: `1px solid ${connected ? "#22c55e44" : "#333"}`,
                    opacity: connecting ? 0.5 : 1,
                }}
            >
                {connecting ? "Waiting for browser..." : connected ? "Connected" : "Connect"}
            </button>
        </div>
    );
}

// ─── Setup wizard ─────────────────────────────────────────────────────────────

export function Setup({onComplete}: SetupProps) {
    const [step, setStep] = useState<Step>("mode");
    const [config, setConfig] = useState<AppConfig>(buildDefault);
    const [providers, setProviders] = useState<Set<Provider>>(new Set());
    const [useChannelAsBot, setUseChannelAsBot] = useState(false);
    const [twitchConnected, setTwitchConnected] = useState(false);
    const [botConnected, setBotConnected] = useState(false);
    const [youtubeConnected, setYoutubeConnected] = useState(false);
    const [connecting, setConnecting] = useState<"twitch" | "bot" | "youtube" | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Listen for real token-saved events from the Axum server
    useEffect(() => {
        const unlistenTwitch = listen("twitch-token-saved", () => {
            setTwitchConnected(true);
            setConnecting(null);
        });
        const unlistenBot = listen("twitch-bot-token-saved", () => {
            setBotConnected(true);
            setConnecting(null);
        });
        const unlistenYoutube = listen("youtube-token-saved", () => {
            setYoutubeConnected(true);
            setConnecting(null);
        });
        return () => {
            unlistenTwitch.then((f) => f());
            unlistenBot.then((f) => f());
            unlistenYoutube.then((f) => f());
        };
    }, []);

    const setAuth = (key: keyof AppConfig["auth"], value: string) =>
        setConfig((p) => ({...p, auth: {...p.auth, [key]: value}}));

    const toggleProvider = (p: Provider) =>
        setProviders((prev) => {
            const next = new Set(prev);
            next.has(p) ? next.delete(p) : next.add(p);
            return next;
        });

    const channelValid = config.auth.channel.trim() !== "";
    // When using a separate bot, username must be set;
    // the bot account is connected via OAuth in the Connect step, not validated here
    const botValid = useChannelAsBot ? true : config.auth.bot_username.trim() !== "";

    const handleConnect = async (target: "twitch" | "bot" | "youtube") => {
        setConnecting(target);
        try {
            if (target === "twitch") await connectTwitch();
            else if (target === "bot") await connectBotAccount();
            else await connectYouTube();
        } catch {
            setConnecting(null);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            await saveConfig({
                ...config,
                auth: {
                    ...config.auth,
                    bot_username: useChannelAsBot ? config.auth.channel : config.auth.bot_username,
                },
                modes: {...config.modes, youtube: providers.has("youtube")},
            });
            await markSetupComplete();
            onComplete();
        } catch (err) {
            setSaveError(String(err));
            setSaving(false);
        }
    };

    // Which steps to show based on provider selection
    const needsTwitch = providers.has("twitch");
    const stepCount = 3 + (needsTwitch ? 1 : 0); // mode, providers, [twitch,] connect, review
    const stepIndex: Record<Step, number> = {
        mode: 0, providers: 1,
        twitch: 2, connect: needsTwitch ? 3 : 2, review: needsTwitch ? 4 : 3
    };

    return (
        <div className="flex items-center justify-center min-h-full p-6" style={{backgroundColor: "#0f0f0f"}}>
            <div className="w-full" style={{maxWidth: 480}}>

                <div className="text-center mb-8">
                    <h1 className="text-xl font-semibold mb-1" style={{color: "#f1f1f1"}}>GD Level Request Bot</h1>
                </div>

                <div className="rounded-xl p-6 flex flex-col gap-5"
                     style={{backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a"}}>

                    {/* ── Mode ── */}
                    {step === "mode" && (
                        <>
                            <div>
                                <h2 className="text-base font-semibold mb-1" style={{color: "#f1f1f1"}}>What do you want
                                    to do?</h2>
                            </div>

                            <button
                                onClick={() => onComplete(true)}
                                className="w-full p-4 rounded-lg text-left"
                                style={{backgroundColor: "#111", border: "1px solid #2a2a2a"}}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = "#444";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = "#2a2a2a";
                                }}
                            >
                                <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>Just browsing</p>
                                <p className="text-xs mt-0.5" style={{color: "#555"}}>Load demo data and explore the
                                    interface</p>
                            </button>

                            <button
                                onClick={() => setStep("providers")}
                                className="w-full p-4 rounded-lg text-left"
                                style={{backgroundColor: "#111", border: "1px solid #2a2a2a"}}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = "var(--color-accent)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = "#2a2a2a";
                                }}
                            >
                                <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>Set up the bot</p>
                                <p className="text-xs mt-0.5" style={{color: "#555"}}>Connect to a platform and start
                                    taking requests</p>
                            </button>
                        </>
                    )}

                    {/* ── Providers ── */}
                    {step === "providers" && (
                        <>
                            <div>
                                <h2 className="text-base font-semibold mb-1" style={{color: "#f1f1f1"}}>Which
                                    platform?</h2>
                                <p className="text-xs" style={{color: "#555"}}>Pick the ones you stream on. You can add
                                    more later.</p>
                            </div>

                            {(["twitch", "youtube"] as Provider[]).map((p) => {
                                const selected = providers.has(p);
                                return (
                                    <button
                                        key={p}
                                        onClick={() => toggleProvider(p)}
                                        className="w-full p-4 rounded-lg text-left flex items-center gap-3"
                                        style={{
                                            backgroundColor: "#111",
                                            border: `1px solid ${selected ? "var(--color-accent)" : "#2a2a2a"}`,
                                        }}
                                    >
                                        <div
                                            className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-xs"
                                            style={{
                                                backgroundColor: selected ? "var(--color-accent)" : "transparent",
                                                border: `2px solid ${selected ? "var(--color-accent)" : "#444"}`,
                                                color: "#fff",
                                            }}
                                        >
                                            {selected && "✓"}
                                        </div>
                                        <span className="text-sm font-medium capitalize"
                                              style={{color: "#f1f1f1"}}>{p}</span>
                                    </button>
                                );
                            })}

                            <div className="flex gap-3 mt-2">
                                <Btn variant="secondary" onClick={() => setStep("mode")}>Back</Btn>
                                <Btn onClick={() => setStep(providers.has("twitch") ? "twitch" : "connect")}
                                     disabled={providers.size === 0}>
                                    Next
                                </Btn>
                            </div>

                            <StepDots total={stepCount} current={stepIndex.providers}/>
                        </>
                    )}

                    {/* ── Twitch account ── */}
                    {step === "twitch" && (
                        <>
                            <div>
                                <h2 className="text-base font-semibold mb-1" style={{color: "#f1f1f1"}}>Twitch</h2>
                            </div>

                            <Field
                                label="Channel name" id="channel"
                                value={config.auth.channel}
                                onChange={(v) => {
                                    setAuth("channel", v);
                                    if (useChannelAsBot) setAuth("bot_username", v);
                                }}
                                placeholder="yourchannel" hint="Without #" required
                            />

                            <button
                                onClick={() => {
                                    const next = !useChannelAsBot;
                                    setUseChannelAsBot(next);
                                    if (next) {
                                        setAuth("bot_username", config.auth.channel);
                                        setAuth("bot_access_token", "");
                                    } else {
                                        setAuth("bot_username", "");
                                    }
                                }}
                                className="w-full p-3 rounded-lg text-left flex items-center gap-3"
                                style={{
                                    backgroundColor: "#111",
                                    border: `1px solid ${useChannelAsBot ? "var(--color-accent)" : "#2a2a2a"}`
                                }}
                            >
                                <div
                                    className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-xs"
                                    style={{
                                        backgroundColor: useChannelAsBot ? "var(--color-accent)" : "transparent",
                                        border: `2px solid ${useChannelAsBot ? "var(--color-accent)" : "#444"}`,
                                        color: "#fff",
                                    }}
                                >
                                    {useChannelAsBot && "✓"}
                                </div>
                                <div>
                                    <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>Use my channel account
                                        as the bot</p>
                                    <p className="text-xs mt-0.5" style={{color: "#555"}}>The bot sends messages as you.
                                        Uncheck to use a separate bot account.</p>
                                </div>
                            </button>

                            {!useChannelAsBot && (
                                <>
                                    <Field
                                        label="Bot username" id="bot_username"
                                        value={config.auth.bot_username} onChange={(v) => setAuth("bot_username", v)}
                                        placeholder="mybot"
                                        hint="The Twitch account that will join chat"
                                        required
                                    />
                                    <p className="text-xs" style={{color: "#555"}}>
                                        You'll connect the bot account via OAuth on the next step.
                                    </p>
                                </>
                            )}

                            <div className="flex gap-3 mt-2">
                                <Btn variant="secondary" onClick={() => setStep("providers")}>Back</Btn>
                                <Btn onClick={() => setStep("connect")} disabled={!channelValid || !botValid}>Next</Btn>
                            </div>

                            <StepDots total={stepCount} current={stepIndex.twitch}/>
                        </>
                    )}

                    {/* ── Connect ── */}
                    {step === "connect" && (
                        <>
                            <div>
                                <h2 className="text-base font-semibold mb-1" style={{color: "#f1f1f1"}}>Connect
                                    accounts</h2>
                                <p className="text-xs" style={{color: "#555"}}>Opens a browser window. You can skip and
                                    do this later.</p>
                            </div>

                            {providers.has("twitch") && (
                                <div className="flex flex-col gap-3">
                                    {/* Channel account — always needed */}
                                    <ConnectRow
                                        label="Your channel account"
                                        hint="For announcements and subscriber detection"
                                        connected={twitchConnected}
                                        connecting={connecting === "twitch"}
                                        onConnect={() => handleConnect("twitch")}
                                    />
                                    {/* Bot account — only when using a separate bot */}
                                    {!useChannelAsBot && (
                                        <ConnectRow
                                            label="Bot account"
                                            hint="Sign in as the bot that joins your chat"
                                            connected={botConnected}
                                            connecting={connecting === "bot"}
                                            onConnect={() => handleConnect("bot")}
                                        />
                                    )}
                                </div>
                            )}

                            {providers.has("youtube") && (
                                <ConnectRow
                                    label="YouTube account"
                                    hint="Read level requests from your live chat"
                                    connected={youtubeConnected}
                                    connecting={connecting === "youtube"}
                                    onConnect={() => handleConnect("youtube")}
                                />
                            )}

                            <div className="flex gap-3 mt-2">
                                <Btn variant="secondary"
                                     onClick={() => setStep(providers.has("twitch") ? "twitch" : "providers")}>Back</Btn>
                                <Btn variant="ghost" onClick={() => setStep("review")}>Skip for now</Btn>
                                <Btn onClick={() => setStep("review")}>Next</Btn>
                            </div>

                            <StepDots total={stepCount} current={stepIndex.connect}/>
                        </>
                    )}

                    {/* ── Review ── */}
                    {step === "review" && (
                        <>
                            <div>
                                <h2 className="text-base font-semibold mb-1" style={{color: "#f1f1f1"}}>Ready</h2>
                            </div>

                            <div className="rounded-lg p-4 flex flex-col gap-3 text-sm"
                                 style={{backgroundColor: "#111", border: "1px solid #2a2a2a"}}>
                                {providers.has("twitch") && (
                                    <>
                                        <Row label="Channel" value={`#${config.auth.channel}`}/>
                                        <Row label="Bot"
                                             value={useChannelAsBot ? `@${config.auth.channel}` : `@${config.auth.bot_username}`}/>
                                        <Row label="Twitch"
                                             value={twitchConnected ? "Connected" : "Not connected — set up in Settings"}/>
                                    </>
                                )}
                                {providers.has("youtube") && (
                                    <Row label="YouTube"
                                         value={youtubeConnected ? "Connected" : "Not connected — set up in Settings"}/>
                                )}
                            </div>

                            {saveError && (
                                <div className="px-3 py-2 rounded text-xs" style={{
                                    backgroundColor: "#2a1a1a",
                                    color: "#ef4444",
                                    border: "1px solid #3a2020"
                                }}>
                                    {saveError}
                                </div>
                            )}

                            <div className="flex gap-3 mt-2">
                                <Btn variant="secondary" onClick={() => setStep("connect")}>Back</Btn>
                                <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Start"}</Btn>
                            </div>

                            <StepDots total={stepCount} current={stepIndex.review}/>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function Row({label, value, warn}: { label: string; value: string; warn?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span style={{color: "#666"}}>{label}</span>
            <span className="font-mono text-right truncate"
                  style={{color: warn ? "#f59e0b" : "#f1f1f1", maxWidth: 220}}>
        {value || "—"}
      </span>
        </div>
    );
}
