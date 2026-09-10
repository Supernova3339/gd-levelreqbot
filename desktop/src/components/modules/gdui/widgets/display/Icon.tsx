import {useEffect, useState} from "react";
import type {LayoutNode} from "../../../../../lib/types";
import {useModulePageContext} from "../../context";
import {readModulePage} from "../../../../../lib/commands";
import {resolveLucideIcon} from "../lucide";
import {sanitizeSvg} from "../../../../../lib/sanitizeSvg";
import {useModuleResourceImage} from "../../hooks/useModuleResourceImage";

// Built-in named SVG icons (same registry as Layout.tsx sidebar icons)
const BUILTIN: Record<string, (s: number, c: string) => string> = {
    queue: (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="${c}"><rect x="2" y="4" width="14" height="2" rx="1" opacity="0.9"/><rect x="2" y="8" width="10" height="2" rx="1" opacity="0.6"/><rect x="2" y="12" width="12" height="2" rx="1" opacity="0.35"/></svg>`,
    music: (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="${c}"><path d="M7 3v9.5A3.5 3.5 0 1 0 9 16V6.5l5-1V3H7Z"/></svg>`,
    star: (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="${c}"><polygon points="9,3 11,7 16,7.5 12.5,11 13.5,15.5 9,13 4.5,15.5 5.5,11 2,7.5 7,7"/></svg>`,
    coins: (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="${c}"><circle cx="9" cy="9" r="7" opacity="0.25"/><circle cx="9" cy="9" r="4.5" opacity="0.55"/><circle cx="9" cy="9" r="2.5"/></svg>`,
    check: (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><polyline points="3,9 7,13 15,5"/></svg>`,
    error: (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="9" r="7"/><line x1="9" y1="6" x2="9" y2="10"/><circle cx="9" cy="13" r="0.5" fill="${c}"/></svg>`,
};

function BuiltinIcon({name, size, color}: { name: string; size: number; color: string }) {
    const renderer = BUILTIN[name];
    if (renderer) {
        return (
            <span
                style={{display: "inline-flex", alignItems: "center", color}}
                dangerouslySetInnerHTML={{__html: renderer(size, "currentColor")}}
            />
        );
    }
    // Fallback: placeholder box
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
        </svg>
    );
}

function LucideIcon({name, size, color}: { name: string; size: number; color: string }) {
    const Comp = resolveLucideIcon(name);
    if (Comp) return <Comp size={size} color={color}/>;
    // Fallback: placeholder
    return (
        <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
        </svg>
    );
}

function LocalIcon({moduleId, name, size, color}: { moduleId: string; name: string; size: number; color: string }) {
    const [svg, setSvg] = useState<string | null>(null);

    useEffect(() => {
        readModulePage(moduleId, `resources/icons/${name}.svg`)
            .then(raw => setSvg(sanitizeSvg(raw)))
            .catch(() => setSvg(null));
    }, [moduleId, name]);

    if (!svg) {
        return (
            <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
                <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.2"/>
            </svg>
        );
    }

    return (
        <span
            style={{display: "inline-flex", alignItems: "center", width: size, height: size, color}}
            dangerouslySetInnerHTML={{__html: svg}}
        />
    );
}

function ResourceIcon({moduleId, path, size}: { moduleId: string; path: string; size: number }) {
    const url = useModuleResourceImage(moduleId, path);
    if (!url) {
        return (
            <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
                <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.2"/>
            </svg>
        );
    }
    return <img src={url} alt="" width={size} height={size} style={{objectFit: "contain", display: "block"}}/>;
}

/** Namespace-dispatch shared by <Icon> and anything else (e.g. PlatformDot)
 * that needs to resolve a bare "lucide:x" / "builtin:x" / "local:x" /
 * "resource:x" string to an actual icon, without needing a full LayoutNode. */
export function IconByName({name, size = 18, color = "currentColor"}: { name: string; size?: number; color?: string }) {
    const {moduleId} = useModulePageContext();
    const [ns, iconName] = name.includes(":") ? name.split(":", 2) : ["lucide", name];

    if (ns === "builtin") return <BuiltinIcon name={iconName} size={size} color={color}/>;
    if (ns === "local") return <LocalIcon moduleId={moduleId} name={iconName} size={size} color={color}/>;
    // "resource:" — an arbitrary raster file under the module's own
    // resources/ folder (e.g. a third-party logo), unlike "local:" which is
    // specifically an SVG under resources/icons/.
    if (ns === "resource") return <ResourceIcon moduleId={moduleId} path={iconName} size={size}/>;
    // Default: lucide
    return <LucideIcon name={iconName} size={size} color={color}/>;
}

export function Icon({node}: { node: LayoutNode }) {
    return <IconByName name={node.icon_name ?? ""} size={node.icon_size ?? 18}
                       color={node.icon_color ?? "currentColor"}/>;
}
