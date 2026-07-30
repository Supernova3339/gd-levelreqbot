import {useEffect, useRef, useState} from "react";
import {type GDAccountInfo, gdLogin, gdLogout, getGdAccount} from "../../lib/commands";
import gdLogo from "../../assets/gd.png";

export function GDSettings() {
    const [account, setAccount] = useState<GDAccountInfo | null>(null);
    const [loading, setLoading] = useState(true);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loggingIn, setLoggingIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        getGdAccount()
            .then(setAccount)
            .catch(() => setAccount(null))
            .finally(() => setLoading(false));
    }, []);

    const handleLogin = async () => {
        if (!username.trim() || !password.trim()) return;
        setLoggingIn(true);
        setError(null);
        setSuccess(false);
        try {
            const info = await gdLogin(username.trim(), password);
            setAccount(info);
            setUsername("");
            setPassword("");
            setSuccess(true);
            if (successTimer.current) clearTimeout(successTimer.current);
            successTimer.current = setTimeout(() => setSuccess(false), 3000);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoggingIn(false);
        }
    };

    const handleLogout = async () => {
        try {
            await gdLogout();
            setAccount({account_id: 0, username: "", connected: false, icon_b64: '', icon_url: ''});
        } catch (e) {
            setError(String(e));
        }
    };

    const connected = account?.connected === true;

    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-sm font-semibold mb-1" style={{color: "#f1f1f1"}}>Geometry Dash</h2>
                <p className="text-xs" style={{color: "#555"}}>
                    Link your GD account to enable authenticated level searches and more.
                </p>
            </div>

            {/* Integration card */}
            <div className="rounded-lg overflow-hidden" style={{border: "1px solid #222"}}>
                {/* Card header */}
                <div className="flex items-center gap-3 px-4 py-3"
                     style={{backgroundColor: "#111", borderBottom: "1px solid #1e1e1e"}}>
                    <img src={gdLogo} alt="Geometry Dash" className="w-8 h-8 rounded object-contain shrink-0"
                         style={{imageRendering: "pixelated"}}/>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{color: "#f1f1f1"}}>Geometry Dash</p>
                        <p className="text-xs" style={{color: "#555"}}>boomlings.com account</p>
                    </div>
                    {connected && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" flex-shrink-0>
                            <circle cx="7" cy="7" r="6" fill="#22c55e" fillOpacity="0.15"/>
                            <path d="M4 7l2.2 2.2L10 5" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"
                                  strokeLinejoin="round"/>
                        </svg>
                    )}
                </div>

                {/* Card body */}
                <div className="p-4" style={{backgroundColor: "#0f0f0f"}}>
                    {loading ? (
                        <p className="text-xs" style={{color: "#555"}}>Checking...</p>
                    ) : connected ? (
                        <ConnectedState
                            account={account!}
                            onLogout={handleLogout}
                            error={error}
                        />
                    ) : (
                        <LoginForm
                            username={username}
                            password={password}
                            onUsername={setUsername}
                            onPassword={setPassword}
                            onLogin={handleLogin}
                            loading={loggingIn}
                            error={error}
                            success={success}
                        />
                    )}
                </div>
            </div>

            {/*/!* What it enables *!/*/}
            {/*<div className="flex flex-col gap-1.5 rounded-lg p-3"*/}
            {/*     style={{backgroundColor: "#111", border: "1px solid #1e1e1e"}}>*/}
            {/*    <p className="text-xs font-medium" style={{color: "#888"}}>What this enables</p>*/}
            {/*    <ul className="text-xs flex flex-col gap-1" style={{color: "#555"}}>*/}
            {/*        <li>• Authenticated <code style={{color: "#888"}}>getGJLevels21</code> requests</li>*/}
            {/*        <li>• Access to rated, friend, and account-linked level filters</li>*/}
            {/*        <li>• Your GJP2 is encrypted with a machine-specific key and never stored in plain text</li>*/}
            {/*    </ul>*/}
            {/*</div>*/}
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConnectedState({account, onLogout, error}: {
    account: GDAccountInfo;
    onLogout: () => void;
    error: string | null;
}) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
                {account.icon_b64 ? (
                    <img
                        src={account.icon_b64}
                        alt={account.username}
                        className="w-9 h-9 flex-shrink-0 rounded"
                        style={{imageRendering: "pixelated", objectFit: "contain"}}
                    />
                ) : (
                    <div
                        className="w-9 h-9 rounded flex-shrink-0 flex items-center justify-center text-sm font-bold"
                        style={{backgroundColor: "#1e1e1e", color: "#f1f1f1", border: "1px solid #2a2a2a"}}>
                        {(account.username || "?")[0].toUpperCase()}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{color: "#f1f1f1"}}>{account.username}</p>
                    <p className="text-xs" style={{color: "#555"}}>Account ID: {account.account_id}</p>
                </div>
                <button
                    onClick={onLogout}
                    className="text-xs px-2.5 py-1 rounded flex-shrink-0"
                    style={{backgroundColor: "#2a1a1a", color: "#ef4444", border: "1px solid #3a2020"}}>
                    Disconnect
                </button>
            </div>
            {error && <p className="text-xs" style={{color: "#ef4444"}}>{error}</p>}
        </div>
    );
}

function LoginForm({username, password, onUsername, onPassword, onLogin, loading, error, success}: {
    username: string; password: string;
    onUsername: (v: string) => void; onPassword: (v: string) => void;
    onLogin: () => void; loading: boolean;
    error: string | null; success: boolean;
}) {
    const canSubmit = username.trim() !== "" && password.trim() !== "" && !loading;

    return (
        <div className="flex flex-col gap-3">
            <p className="text-xs" style={{color: "#666"}}>
                Sign in to unlock authenticated level searches and more functionality
            </p>
            <div className="flex flex-col gap-2">
                <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => onUsername(e.target.value)}
                    autoComplete="off"
                    className="w-full px-3 py-2 text-sm rounded"
                    style={{backgroundColor: "#111", color: "#f1f1f1", border: "1px solid #2a2a2a"}}
                    onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-accent)";
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#2a2a2a";
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && canSubmit) onLogin();
                    }}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => onPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full px-3 py-2 text-sm rounded"
                    style={{backgroundColor: "#111", color: "#f1f1f1", border: "1px solid #2a2a2a"}}
                    onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-accent)";
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#2a2a2a";
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && canSubmit) onLogin();
                    }}
                />
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={onLogin}
                    disabled={!canSubmit}
                    className="px-4 py-1.5 text-xs font-semibold rounded"
                    style={{
                        backgroundColor: "var(--color-accent)",
                        color: "#fff",
                        opacity: canSubmit ? 1 : 0.4,
                    }}>
                    {loading ? "Logging in..." : "Log in"}
                </button>
                {success && <span className="text-xs" style={{color: "#22c55e"}}>Connected!</span>}
                {error && <span className="text-xs flex-1" style={{color: "#ef4444"}}>{error}</span>}
            </div>
        </div>
    );
}
