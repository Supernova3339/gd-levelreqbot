import {useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";

interface WsConfig {
    enabled: boolean;
    port: number;
    secret: string;
}

interface WsStatus {
    running: boolean;
    clients: number;
    port: number;
    url: string;
}

const DEFAULT: WsConfig = {enabled: false, port: 24364, secret: ""};

export function WebSocketSettings() {
    const [config, setConfig] = useState<WsConfig>(DEFAULT);
    const [status, setStatus] = useState<WsStatus | null>(null);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [showSecret, setShowSecret] = useState(false);

    const load = async () => {
        try {
            const [cfg, sts] = await Promise.all([
                invoke<WsConfig>("get_ws_config"),
                invoke<WsStatus>("get_ws_status"),
            ]);
            setConfig(cfg);
            setStatus(sts);
        } catch { /* backend not ready */
        }
    };

    useEffect(() => {
        load();
    }, []);

    // Poll status every 3s when running to keep client count fresh
    useEffect(() => {
        if (!status?.running) return;
        const id = setInterval(async () => {
            try {
                setStatus(await invoke<WsStatus>("get_ws_status"));
            } catch {
            }
        }, 3000);
        return () => clearInterval(id);
    }, [status?.running]);

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        try {
            await invoke("save_ws_config", {
                enabled: config.enabled,
                port: config.port,
                secret: config.secret,
            });
            const sts = await invoke<WsStatus>("get_ws_status");
            setStatus(sts);
            setMsg({ok: true, text: config.enabled ? "Server started." : "Server stopped."});
        } catch (e) {
            setMsg({ok: false, text: String(e)});
        } finally {
            setSaving(false);
            setTimeout(() => setMsg(null), 3000);
        }
    };

    const copyUrl = () => {
        if (status) navigator.clipboard.writeText(
            status.url + (config.secret ? `?token=${config.secret}` : "")
        );
    };

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-sm font-semibold mb-1" style={{color: "#f1f1f1"}}>WebSocket Server</h2>
                <p className="text-xs" style={{color: "#555"}}>
                    External tools and overlays can connect to receive bot events in real time.
                </p>
            </div>

            {/* Status pill */}
            {status && (
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                         style={{backgroundColor: status.running ? "#22c55e" : "#333"}}/>
                    <span className="text-xs" style={{color: status.running ? "#22c55e" : "#555"}}>
            {status.running
                ? `Running · ${status.clients} client${status.clients !== 1 ? "s" : ""} connected`
                : "Stopped"}
          </span>
                </div>
            )}

            {/* Enable toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative flex-shrink-0"
                     onClick={() => setConfig((c) => ({...c, enabled: !c.enabled}))}>
                    <div className="w-9 h-5 rounded-full"
                         style={{backgroundColor: config.enabled ? "var(--color-accent)" : "#333"}}>
                        <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                             style={{transform: config.enabled ? "translateX(18px)" : "translateX(2px)"}}/>
                    </div>
                </div>
                <div onClick={() => setConfig((c) => ({...c, enabled: !c.enabled}))}>
                    <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>Enable WebSocket server</p>
                    <p className="text-xs mt-0.5" style={{color: "#555"}}>
                        Starts a local server that broadcasts events from your scripts.
                    </p>
                </div>
            </label>

            {/* Port */}
            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>Port</label>
                <input
                    type="number" min={1024} max={65535}
                    value={config.port}
                    onChange={(e) => setConfig((c) => ({...c, port: Number(e.target.value)}))}
                    className="px-3 py-2 text-sm rounded w-32"
                    style={{backgroundColor: "#111", color: "#f1f1f1", border: "1px solid #2a2a2a"}}
                    onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-accent)";
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#2a2a2a";
                    }}
                />
            </div>

            {/* Secret token */}
            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{color: "#a0a0a0"}}>
                    Secret token <span style={{color: "#555", fontWeight: 400}}>(optional)</span>
                </label>
                <div className="relative" style={{maxWidth: 320}}>
                    <input
                        type={showSecret ? "text" : "password"}
                        value={config.secret}
                        onChange={(e) => setConfig((c) => ({...c, secret: e.target.value}))}
                        placeholder="leave blank for open access"
                        className="w-full px-3 py-2 text-sm rounded"
                        style={{
                            backgroundColor: "#111",
                            color: "#f1f1f1",
                            border: "1px solid #2a2a2a",
                            paddingRight: 60
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = "var(--color-accent)";
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = "#2a2a2a";
                        }}
                    />
                    <button onClick={() => setShowSecret((v) => !v)}
                            className="absolute text-xs"
                            style={{right: 10, top: "50%", transform: "translateY(-50%)", color: "#555"}}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = "#aaa";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = "#555";
                            }}>
                        {showSecret ? "hide" : "show"}
                    </button>
                </div>
                <p className="text-xs" style={{color: "#444"}}>
                    Clients must pass <code style={{color: "#888"}}>?token=…</code> in the URL if set.
                </p>
            </div>

            {/* Connection URL */}
            {status && (
                <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium" style={{color: "#a0a0a0"}}>Connection URL</p>
                    <div className="flex items-center gap-2">
                        <code className="text-xs px-3 py-2 rounded flex-1"
                              style={{backgroundColor: "#0a0a0a", color: "#818cf8", border: "1px solid #1e1e1e"}}>
                            {status.url}{config.secret ? `?token=${config.secret}` : ""}
                        </code>
                        <button onClick={copyUrl}
                                className="text-xs px-2.5 py-2 rounded flex-shrink-0"
                                style={{backgroundColor: "#1a1a1a", color: "#888", border: "1px solid #2a2a2a"}}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "#f1f1f1";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "#888";
                                }}>
                            Copy
                        </button>
                    </div>
                </div>
            )}

            {/* Message format info */}
            <div className="text-xs p-3 rounded" style={{backgroundColor: "#0d0d0d", border: "1px solid #1e1e1e"}}>
                <p className="font-semibold mb-1" style={{color: "#888"}}>Message format</p>
                <code style={{color: "#555"}}>
                    {'{"event":"level_added","data":"{\\"id\\":\\"12345\\"}"}'}
                </code>
                <p className="mt-1" style={{color: "#444"}}>
                    Send events from scripts with <code style={{color: "#818cf8"}}>event.emit(name, payload)</code>.
                </p>
            </div>

            <div className="flex items-center gap-3">
                {msg && <span className="text-xs" style={{color: msg.ok ? "#22c55e" : "#ef4444"}}>{msg.text}</span>}
                <button onClick={handleSave} disabled={saving}
                        className="px-4 py-1.5 text-xs font-semibold rounded"
                        style={{backgroundColor: "var(--color-accent)", color: "#fff", opacity: saving ? 0.5 : 1}}>
                    {saving ? "Saving…" : "Save"}
                </button>
            </div>
        </div>
    );
}
