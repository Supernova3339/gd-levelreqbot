import {useCallback, useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import {
    clearLicenseToken,
    fetchMarketplaceMe,
    getLicenseToken,
    openGithubLogin,
    setLicenseToken,
    verifyLicenseToken,
} from "../../lib/commands";

export type MarketplaceRole = "user" | "author" | "staff" | "admin";

export interface AccountState {
    loading: boolean;
    username: string | null;
    avatarUrl: string | null;
    isSponsor: boolean;
    isOwner: boolean;
    expiresAt: string | null;
    role: MarketplaceRole;
}

const ROLE_RANK: Record<MarketplaceRole, number> = {user: 0, author: 1, staff: 2, admin: 3};

export function roleAtLeast(role: MarketplaceRole, minimum: MarketplaceRole): boolean {
    return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export interface UseAccountReturn {
    account: AccountState;
    login: () => Promise<void>;
    logout: () => Promise<void>;
}

const BLANK: AccountState = {
    loading: false,
    username: null,
    avatarUrl: null,
    isSponsor: false,
    isOwner: false,
    expiresAt: null,
    role: "user"
};
const OWNER_GITHUB_ID = 63515814;

function decodeTokenPayload(token: string): { username: string | null; avatarUrl: string | null } {
    try {
        // Handle both standard and URL-safe base64
        const raw = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
        const padded = raw + "=".repeat((4 - raw.length % 4) % 4);
        const p = JSON.parse(atob(padded)) as { usr?: string; sub?: number | string };
        const username = p.usr ?? null;
        const avatarUrl = p.sub ? `https://avatars.githubusercontent.com/u/${p.sub}?v=4&s=64` : null;
        return {username, avatarUrl};
    } catch {
        return {username: null, avatarUrl: null};
    }
}

function randomState(len = 24): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    for (const byte of arr) out += chars[byte % chars.length];
    return out;
}

export function useAccount(): UseAccountReturn {
    // Start as BLANK (not loading) — widget is always interactive immediately.
    // Account fills in once getLicenseToken() resolves.
    const [account, setAccount] = useState<AccountState>(BLANK);
    const pendingState = useRef<string | null>(null);
    const mounted = useRef(false);
    // Reset to true on every (re)mount so async resolves after Strict Mode cycles work.
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        getLicenseToken().then(async token => {
            if (!mounted.current || !token) return;

            // Best-effort local decode for instant display
            const {username, avatarUrl} = decodeTokenPayload(token);

            // Show signed-in immediately — use decoded username or a placeholder
            setAccount({
                loading: false,
                username: username ?? "...",
                avatarUrl,
                isSponsor: false, isOwner: false, expiresAt: null, role: "user",
            });

            // Background: verify fills in real username + sponsor/owner status
            try {
                const res = await verifyLicenseToken(token);
                if (!mounted.current) return;
                if (res.valid) {
                    const ghId = res.github_id ?? null;
                    setAccount(prev => ({
                        ...prev,
                        username: res.github_username ?? prev.username,
                        isSponsor: res.is_sponsor ?? false,
                        isOwner: (res.is_owner ?? (ghId === OWNER_GITHUB_ID)) || prev.isOwner,
                        expiresAt: res.expires_at ?? null,
                        avatarUrl: ghId
                            ? `https://avatars.githubusercontent.com/u/${ghId}?v=4&s=64`
                            : prev.avatarUrl,
                    }));
                } else {
                    // The server reached a verdict and rejected the token (expired,
                    // revoked, bad signature) — not a network/server error, which
                    // verifyLicenseToken() throws instead of resolving. Drop back to
                    // signed-out (username: null) so the UI shows the sign-in prompt
                    // rather than leaving the "..." placeholder stuck forever.
                    console.warn("[useAccount] stored license token rejected:", res.error);
                    await clearLicenseToken().catch(() => {
                    });
                    if (mounted.current) setAccount(BLANK);
                    return;
                }
                // Also try /me for richer owner info (e.g. if verify doesn't return is_owner yet)
                try {
                    const me = await fetchMarketplaceMe(token);
                    if (!mounted.current) return;
                    setAccount(prev => ({
                        ...prev,
                        isOwner: me.is_owner || me.github_id === OWNER_GITHUB_ID,
                        role: me.role,
                        avatarUrl: `https://avatars.githubusercontent.com/u/${me.github_id}?v=4&s=64`,
                    }));
                } catch { /* marketplace /me offline — verify result used instead */
                }
            } catch { /* licensing server offline — local decode is enough */
            }
        }).catch((err) => {
            console.error("[useAccount] getLicenseToken failed:", err);
        });
    }, []);

    // OAuth callback
    useEffect(() => {
        const unsub = listen<{ token: string; state: string }>("license-token-received", async e => {
            const {token, state} = e.payload;
            if (pendingState.current && state !== pendingState.current) return;
            pendingState.current = null;

            const {username, avatarUrl} = decodeTokenPayload(token);
            if (mounted.current && username) {
                setAccount({
                    loading: false,
                    username,
                    avatarUrl,
                    isSponsor: false,
                    isOwner: false,
                    expiresAt: null,
                    role: "user"
                });
            }

            // Persist immediately so the next page load finds the token even if verify fails.
            await setLicenseToken(token).catch(() => {
            });

            try {
                const res = await verifyLicenseToken(token);
                if (!mounted.current) return;
                if (!res.valid) {
                    console.warn("[useAccount] login callback token rejected:", res.error);
                    await clearLicenseToken().catch(() => {
                    });
                    if (mounted.current) setAccount(BLANK);
                    return;
                }
                const ghId = res.github_id ?? null;
                setAccount(prev => ({
                    ...prev,
                    username: res.github_username ?? prev.username,
                    isSponsor: res.is_sponsor ?? false,
                    isOwner: (res.is_owner ?? (ghId === OWNER_GITHUB_ID)) || prev.isOwner,
                    expiresAt: res.expires_at ?? null,
                    avatarUrl: ghId
                        ? `https://avatars.githubusercontent.com/u/${ghId}?v=4&s=64`
                        : prev.avatarUrl,
                }));
                try {
                    const me = await fetchMarketplaceMe(token);
                    if (!mounted.current) return;
                    setAccount(prev => ({
                        ...prev,
                        isOwner: me.is_owner || me.github_id === OWNER_GITHUB_ID,
                        role: me.role,
                        avatarUrl: `https://avatars.githubusercontent.com/u/${me.github_id}?v=4&s=64`,
                    }));
                } catch { /* offline */
                }
            } catch { /* verification failed */
            }
        });
        return () => {
            unsub.then(f => f());
        };
    }, []);

    const login = useCallback(async () => {
        const state = randomState();
        pendingState.current = state;
        await openGithubLogin(state);
    }, []);

    const logout = useCallback(async () => {
        await clearLicenseToken();
        pendingState.current = null;
        if (mounted.current) setAccount(BLANK);
    }, []);

    return {account, login, logout};
}
