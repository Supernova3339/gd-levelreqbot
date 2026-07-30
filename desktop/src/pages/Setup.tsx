import {useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import type {AppConfig, MarketplaceEntry} from "../lib/types";
import {
    connectBotAccount,
    connectTwitch,
    connectYouTube,
    fetchMarketplace,
    installMarketplaceModule,
    markSetupComplete,
    saveConfig
} from "../lib/commands";

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
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#333"; }}
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
type Step = "mode" | "providers" | "twitch" | "connect" | "packages" | "review";

type InstallStatus = "pending" | "installing" | "done" | "failed";

function buildDefault(): AppConfig {
    return {
        auth: {
            bot_username: "", bot_access_token: "", channel: "",
            web_api_token: "",
            twitch_access_token: "", youtube_access_token: "", youtube_api_key: "",
        },
        modes: {gd: true, sub: false, smart: false, youtube: false},
        limits: {viewer_request_limit: 1, subscriber_request_limit: 2, max_queue_size: 0},
        setup_complete: false,
        auto_copy_level_id: false,
        level_thumbnails: true,
        thumbnail_quality: "",
        queue_open: true,
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

    // Packages step state
    const [catalog, setCatalog] = useState<MarketplaceEntry[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const catalogFetched = useRef(false);
    const [selectedPkgs, setSelectedPkgs] = useState<Set<string>>(new Set());
    const [installProgress, setInstallProgress] = useState<Record<string, InstallStatus>>({});
    const [installing, setInstalling] = useState(false);
    const [installDone, setInstallDone] = useState(false);

    useEffect(() => {
        const unlistenTwitch  = listen("twitch-token-saved",     () => { setTwitchConnected(true);  setConnecting(null); });
        const unlistenBot     = listen("twitch-bot-token-saved", () => { setBotConnected(true);     setConnecting(null); });
        const unlistenYoutube = listen("youtube-token-saved",    () => { setYoutubeConnected(true); setConnecting(null); });
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

    const enterPackagesStep = async () => {
        setStep("packages");
        if (catalogFetched.current) return;
        catalogFetched.current = true;
        setCatalogLoading(true);
        try {
            const entries = await fetchMarketplace();
            const verified = entries.filter(e => e.verified);
            setCatalog(verified);
            setSelectedPkgs(new Set(verified.map(e => e.id)));
        } catch { /* offline — no catalog */ }
        finally { setCatalogLoading(false); }
    };

    const togglePkg = (id: string) =>
        setSelectedPkgs(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    const channelValid = config.auth.channel.trim() !== "";
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

    const handleInstallPackages = async () => {
        const toInstall = [...selectedPkgs];
        if (toInstall.length === 0) { setInstallDone(true); return; }

        setInstalling(true);
        const progress: Record<string, InstallStatus> = {};
        for (const id of toInstall) progress[id] = "pending";
        setInstallProgress({...progress});

        for (const id of toInstall) {
            setInstallProgress(p => ({ ...p, [id]: "installing" }));
            try {
                await installMarketplaceModule(id);
                setInstallProgress(p => ({ ...p, [id]: "done" }));
            } catch {
                setInstallProgress(p => ({ ...p, [id]: "failed" }));
            }
        }

        setInstalling(false);
        setInstallDone(true);
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

    const needsTwitch = providers.has("twitch");
    // mode, providers, [twitch,] connect, packages, review
    const stepCount = 4 + (needsTwitch ? 1 : 0);
    const stepIndex: Record<Step, number> = {
        mode: 0, providers: 1,
        twitch: 2, connect: needsTwitch ? 3 : 2,
        packages: needsTwitch ? 4 : 3,
        review: needsTwitch ? 5 : 4,
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
                                <h2 className="text-base font-semibold mb-1" style={{color: "#f1f1f1"}}>What do you want to do?</h2>
                            </div>

                            <button
                                onClick={() => onComplete(true)}
                                className="w-full p-4 rounded-lg text-left"
                                style={{backgroundColor: "#111", border: "1px solid #2a2a2a"}}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#444"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                            >
                                <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>Just browsing</p>
                                <p className="text-xs mt-0.5" style={{color: "#555"}}>Load demo data and explore the interface</p>
                            </button>

                            <button
                                onClick={() => setStep("providers")}
                                className="w-full p-4 rounded-lg text-left"
                                style={{backgroundColor: "#111", border: "1px solid #2a2a2a"}}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                            >
                                <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>Set up the bot</p>
                                <p className="text-xs mt-0.5" style={{color: "#555"}}>Connect to a platform and start taking requests</p>
                            </button>
                        </>
                    )}

                    {/* ── Providers ── */}
                    {step === "providers" && (
                        <>
                            <div>
                                <h2 className="text-base font-semibold mb-1" style={{color: "#f1f1f1"}}>Which platform?</h2>
                                <p className="text-xs" style={{color: "#555"}}>Pick the ones you stream on. You can add more later.</p>
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
                                        <span className="text-sm font-medium capitalize" style={{color: "#f1f1f1"}}>{p}</span>
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
                                    <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>Use my channel account as the bot</p>
                                    <p className="text-xs mt-0.5" style={{color: "#555"}}>The bot sends messages as you. Uncheck to use a separate bot account.</p>
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
                                <h2 className="text-base font-semibold mb-1" style={{color: "#f1f1f1"}}>Connect accounts</h2>
                                <p className="text-xs" style={{color: "#555"}}>Opens a browser window. You can skip and do this later.</p>
                            </div>

                            {providers.has("twitch") && (
                                <div className="flex flex-col gap-3">
                                    <ConnectRow
                                        label="Your channel account"
                                        hint="For announcements and subscriber detection"
                                        connected={twitchConnected}
                                        connecting={connecting === "twitch"}
                                        onConnect={() => handleConnect("twitch")}
                                    />
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
                                <Btn variant="ghost" onClick={() => enterPackagesStep()}>Skip for now</Btn>
                                <Btn onClick={() => enterPackagesStep()}>Next</Btn>
                            </div>

                            <StepDots total={stepCount} current={stepIndex.connect}/>
                        </>
                    )}

                    {/* ── Packages ── */}
                    {step === "packages" && (
                        <>
                            <div>
                                <h2 className="text-base font-semibold mb-1" style={{color: "#f1f1f1"}}>Recommended packages</h2>
                                <p className="text-xs" style={{color: "#555"}}>Install modules and libraries. All are selected by default — uncheck anything you don't need.</p>
                            </div>

                            {catalogLoading ? (
                                <div className="text-xs" style={{color: "#3a3a3a", padding: "12px 0"}}>Loading packages…</div>
                            ) : catalog.length === 0 ? (
                                <div className="text-xs" style={{color: "#3a3a3a", padding: "12px 0"}}>
                                    Could not reach the marketplace. You can install packages later from the Modules tab.
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {catalog.map(pkg => {
                                        const checked    = selectedPkgs.has(pkg.id);
                                        const status     = installProgress[pkg.id];
                                        const showStatus = installDone || !!status;
                                        const isLib      = (pkg.package_type ?? "module") === "library";
                                        return (
                                            <button
                                                key={pkg.id}
                                                onClick={() => { if (!installing && !installDone) togglePkg(pkg.id); }}
                                                className="w-full p-3 rounded-lg text-left flex items-start gap-3"
                                                style={{
                                                    backgroundColor: "#111",
                                                    border: `1px solid ${checked && !installDone ? "color-mix(in srgb, var(--color-accent) 40%, transparent)" : "#2a2a2a"}`,
                                                    cursor: installing || installDone ? "default" : "pointer",
                                                }}
                                            >
                                                <div
                                                    className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-xs mt-0.5"
                                                    style={{
                                                        backgroundColor: checked && !installDone ? "var(--color-accent)" : "transparent",
                                                        border: `2px solid ${checked && !installDone ? "var(--color-accent)" : "#444"}`,
                                                        color: "#fff",
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {checked && !installDone && "✓"}
                                                </div>
                                                <div style={{flex: 1, minWidth: 0}}>
                                                    <div style={{display: "flex", alignItems: "center", gap: 5}}>
                                                        <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>{pkg.name}</p>
                                                        {isLib && (
                                                            <span style={{fontSize: 8, fontWeight: 700, color: "#555", border: "1px solid #2a2a2a", borderRadius: 3, padding: "0 3px"}}>LIB</span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs mt-0.5" style={{color: "#555"}}>{pkg.description}</p>
                                                </div>
                                                {showStatus && selectedPkgs.has(pkg.id) && (
                                                    <span style={{
                                                        fontSize: 10, fontWeight: 700, flexShrink: 0, alignSelf: "center",
                                                        color: status === "done" ? "#22c55e" : status === "failed" ? "#ef4444" : status === "installing" ? "#f59e0b" : "#555",
                                                    }}>
                                                        {status === "done" ? "Installed" : status === "failed" ? "Failed" : status === "installing" ? "Installing…" : "Pending"}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {!installDone ? (
                                <div className="flex gap-3 mt-2">
                                    <Btn variant="secondary" onClick={() => setStep("connect")} disabled={installing}>Back</Btn>
                                    <Btn variant="ghost" onClick={() => { setInstallDone(true); setStep("review"); }} disabled={installing}>
                                        Skip
                                    </Btn>
                                    <Btn onClick={handleInstallPackages} disabled={installing || selectedPkgs.size === 0 || catalogLoading}>
                                        {installing ? "Installing…" : `Install${selectedPkgs.size > 0 ? ` (${selectedPkgs.size})` : ""}`}
                                    </Btn>
                                </div>
                            ) : (
                                <div className="flex gap-3 mt-2">
                                    <Btn onClick={() => setStep("review")}>Continue</Btn>
                                </div>
                            )}

                            <StepDots total={stepCount} current={stepIndex.packages}/>
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
                                        <Row label="Bot" value={useChannelAsBot ? `@${config.auth.channel}` : `@${config.auth.bot_username}`}/>
                                        <Row label="Twitch" value={twitchConnected ? "Connected" : "Not connected — set up in Settings"}/>
                                    </>
                                )}
                                {providers.has("youtube") && (
                                    <Row label="YouTube" value={youtubeConnected ? "Connected" : "Not connected — set up in Settings"}/>
                                )}
                                {installDone && selectedPkgs.size > 0 && (
                                    <Row
                                        label="Modules"
                                        value={`${[...selectedPkgs].filter(id => installProgress[id] === "done").length} of ${selectedPkgs.size} installed`}
                                    />
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
                                <Btn variant="secondary" onClick={() => enterPackagesStep()}>Back</Btn>
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

function Row({label, value}: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span style={{color: "#666"}}>{label}</span>
            <span className="font-mono text-right truncate" style={{color: "#f1f1f1", maxWidth: 220}}>
                {value || "—"}
            </span>
        </div>
    );
}
