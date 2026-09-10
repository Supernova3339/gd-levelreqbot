import {useEffect, useState} from "react";
import {readModuleResourceDataUrl} from "../../../../lib/commands";

const cache = new Map<string, string>();

/** Resolves a "resource:"-namespace icon path (relative to the module's own
 * resources/ folder, e.g. "strawpoll/logo.png" -> resources/strawpoll/logo.png
 * on disk — same shorthand convention as "local:" being relative to
 * resources/icons/) to a data: URI, for places that need an actual <img src>. */
export function useModuleResourceImage(moduleId: string, path: string): string | null {
    const fullPath = path.startsWith("resources/") ? path : `resources/${path}`;
    const key = `${moduleId}::${fullPath}`;
    const [url, setUrl] = useState<string | null>(cache.get(key) ?? null);

    useEffect(() => {
        const cached = cache.get(key);
        if (cached) {
            setUrl(cached);
            return;
        }
        let cancelled = false;
        readModuleResourceDataUrl(moduleId, fullPath)
            .then(dataUrl => {
                if (cancelled) return;
                cache.set(key, dataUrl);
                setUrl(dataUrl);
            })
            .catch(e => {
                if (cancelled) return;
                console.error(`useModuleResourceImage: failed to load ${fullPath} for ${moduleId}`, e);
                setUrl(null);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return url;
}
