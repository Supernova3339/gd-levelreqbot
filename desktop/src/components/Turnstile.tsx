import {useEffect, useRef, useState} from "react";
import {MARKETPLACE_BASE} from "../lib/urls";

type TurnstileMessage =
    | { source: "gdlrb-turnstile"; type: "verify"; token: string }
    | { source: "gdlrb-turnstile"; type: "expire" }
    | { source: "gdlrb-turnstile"; type: "error" };

function isTurnstileMessage(data: unknown): data is TurnstileMessage {
    return !!data && typeof data === "object" && (data as { source?: unknown }).source === "gdlrb-turnstile";
}

/**
 * Cloudflare Turnstile widget — the anti-abuse check gating reviews,
 * reports, and package submission/creation.
 *
 * This can't render Turnstile directly inside Tauri's webview: Turnstile's
 * challenge flow internally creates nested sandboxed about:blank iframes,
 * and Tauri's custom-protocol webview blocks script execution inside those
 * ("Blocked script execution in 'about:blank' because the document's frame
 * is sandboxed and the 'allow-scripts' permission is not set"). No CSP or
 * iframe sandbox attribute fixes this — it's Turnstile's own behavior
 * clashing with the webview, not something under our control.
 *
 * Instead, the widget is hosted on a real HTTPS origin (see the /turnstile
 * route in external/server/public/index.php) and embedded here via
 * <iframe>. That page runs in a normal browsing context where Turnstile's
 * nested iframes work as designed, and posts the verification token back
 * via postMessage.
 *
 * Sized to Turnstile's own fixed "normal" dimensions (300x65 — Cloudflare's
 * documented default), matching the hosted page's own fixed html/body size.
 * scrolling="no" plus overflow:hidden on both ends belt-and-suspenders
 * against any scrollbar ever appearing on the embed.
 */
export function Turnstile({onVerify, onExpire}: { onVerify: (token: string) => void; onExpire?: () => void }) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        function handleMessage(event: MessageEvent) {
            if (event.source !== iframeRef.current?.contentWindow) return;
            if (!isTurnstileMessage(event.data)) return;
            if (event.data.type === "verify") onVerify(event.data.token);
            else if (event.data.type === "expire") onExpire?.();
            else if (event.data.type === "error") setFailed(true);
        }

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (failed) {
        return <p style={{fontSize: 11, color: "#ef4444"}}>Could not load the verification check. Check your connection
            and try again.</p>;
    }
    return (
        <iframe
            ref={iframeRef}
            src={`${MARKETPLACE_BASE}/turnstile${import.meta.env.DEV ? "?dev=1" : ""}`}
            title="Verification check"
            onError={() => setFailed(true)}
            scrolling="no"
            width={300}
            height={65}
            style={{width: 300, height: 65, border: "none", overflow: "hidden", colorScheme: "dark"}}
        />
    );
}
