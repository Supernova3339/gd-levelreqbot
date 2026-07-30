/**
 * Sanitizes a module-bundled SVG icon before it's rendered via
 * dangerouslySetInnerHTML (see gdui/widgets/display/Icon.tsx's LocalIcon).
 *
 * This content comes straight from a file inside a marketplace module's
 * package (resources/icons/*.svg) — a third-party author's bytes, not ours.
 * Raw SVG can carry <script>, event-handler attributes (onload, onerror…),
 * or javascript:/data: URIs in href/xlink:href, any of which would execute
 * arbitrary JS in this webview the moment the icon renders. Because
 * tauri.conf.json sets withGlobalTauri: true, that JS has window.__TAURI__
 * available and can invoke any registered Tauri command directly — this
 * sanitizer is the only thing standing between a crafted icon file and full
 * app compromise, so it fails closed (returns null) on anything it can't
 * confidently clean rather than best-effort stripping and rendering anyway.
 */

const DISALLOWED_TAGS = new Set([
    "script", "foreignobject", "iframe", "embed", "object", "style",
    "a", "audio", "video", "animate", "animatetransform", "animatemotion", "set",
]);

function stripDangerous(el: Element): void {
    // Walk children back-to-front so removing a node doesn't disturb iteration.
    for (let i = el.children.length - 1; i >= 0; i--) {
        const child = el.children[i];
        if (DISALLOWED_TAGS.has(child.tagName.toLowerCase())) {
            child.remove();
            continue;
        }
        stripDangerous(child);
    }

    for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith("on")) {
            el.removeAttribute(attr.name);
            continue;
        }
        if ((name === "href" || name === "xlink:href") && !value.startsWith("#")) {
            // Icons never need to reference external/javascript/data URIs —
            // only same-document fragment refs (e.g. <use> of a local <defs>).
            el.removeAttribute(attr.name);
        }
    }
}

/** Returns sanitized SVG markup, or null if the input isn't a well-formed <svg>. */
export function sanitizeSvg(raw: string): string | null {
    let doc: Document;
    try {
        doc = new DOMParser().parseFromString(raw, "image/svg+xml");
    } catch {
        return null;
    }
    if (doc.querySelector("parsererror")) return null;

    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== "svg") return null;

    stripDangerous(root);
    return new XMLSerializer().serializeToString(root);
}
