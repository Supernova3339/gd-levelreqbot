import {Component, type ReactNode, useCallback, useEffect, useRef, useState} from "react";
import {listen} from "@tauri-apps/api/event";
import type {LayoutNode} from "../../../lib/types";
import {type ParsedPage, parseGduiDocument} from "./parser";
import {loadGduiDocument} from "./imports";
import {ModulePageProvider, useModulePageContext} from "./context";
import {NodeRenderer} from "./widgets/NodeRenderer";

class RenderErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = {error: null};
    }

    static getDerivedStateFromError(err: unknown) {
        return {error: err instanceof Error ? err.message : String(err)};
    }

    render() {
        if (this.state.error) {
            return (
                <div style={{padding: 24, color: "#ef4444", fontSize: 12, lineHeight: 1.6}}>
                    <strong>Page render error</strong><br/>
                    <span style={{color: "#555", fontFamily: "monospace"}}>{this.state.error}</span>
                </div>
            );
        }
        return this.props.children;
    }
}

interface Props {
    moduleId: string;
    /** Relative path within the module directory, e.g. "ui/queue.gdui" */
    pageFile: string;
}

// Auto-clear timing per status kind. Errors persist until dismissed or
// replaced by a newer status — everything else clears itself.
const STATUS_AUTO_CLEAR_MS: Record<string, number> = {
    info: 3000,
    pending: 8000,
    success: 2000,
};

const STATUS_STYLE: Record<string, { bg: string; border: string; color: string }> = {
    info: {bg: "#0d1a2a", border: "#1a3a5e", color: "#7dd3fc"},
    pending: {bg: "#181405", border: "#3a3010", color: "#eab308"},
    success: {bg: "#08150c", border: "#153a20", color: "#4ade80"},
    error: {bg: "#1a0808", border: "#4a1515", color: "#f87171"},
};

/**
 * Persistent topbar for page-wide status — the one place any widget (action
 * buttons, autosaving Forms, anything dispatched via useAction) reports what
 * just happened, instead of each rendering its own toast/footer.
 */
function PageStatusBar() {
    const {pageStatus, setPageStatus} = useModulePageContext();

    useEffect(() => {
        if (!pageStatus) return;
        const ms = STATUS_AUTO_CLEAR_MS[pageStatus.kind];
        if (!ms) return; // "error" — stays until dismissed or replaced
        const t = setTimeout(() => setPageStatus(null), ms);
        return () => clearTimeout(t);
    }, [pageStatus, setPageStatus]);

    if (!pageStatus) return null;
    const style = STATUS_STYLE[pageStatus.kind];

    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "5px 12px", flexShrink: 0,
            backgroundColor: style.bg, borderBottom: `1px solid ${style.border}`,
            color: style.color, fontSize: 11,
        }}>
            <span style={{flex: 1, wordBreak: "break-word"}}>{pageStatus.message}</span>
            {pageStatus.kind === "error" && (
                <button
                    onClick={() => setPageStatus(null)}
                    style={{
                        background: "none", border: "none", color: "inherit",
                        cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 2, opacity: 0.7,
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.opacity = "1";
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.opacity = "0.7";
                    }}
                >
                    ×
                </button>
            )}
        </div>
    );
}

function PageContent({
                         layout,
                         subPages,
                     }: {
    layout: LayoutNode;
    subPages: Record<string, LayoutNode>;
}) {
    const {subPage, navigate} = useModulePageContext();
    const currentLayout = (subPage && subPages[subPage]) ? subPages[subPage] : layout;

    return (
        <div style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative"
        }}>
            <PageStatusBar/>
            {subPage && (
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 12px",
                    borderBottom: "1px solid #1a1a1a",
                    flexShrink: 0,
                    backgroundColor: "#0d0d0d",
                }}>
                    <button
                        onClick={() => navigate(null)}
                        style={{
                            display: "flex", alignItems: "center", gap: 3,
                            background: "none", border: "none", cursor: "pointer",
                            color: "#555", fontSize: 11, padding: "2px 5px", borderRadius: 3,
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.color = "#999";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.color = "#555";
                        }}
                    >
                        <svg width="10" height="10" viewBox="0 0 12 12">
                            <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                                  strokeLinejoin="round" fill="none"/>
                        </svg>
                        Back
                    </button>
                    <span style={{fontSize: 11, color: "#666", fontWeight: 500}}>
                        {subPage.charAt(0).toUpperCase() + subPage.slice(1).replace(/-/g, " ")}
                    </span>
                </div>
            )}
            {/* Must itself be a flex container (not just a flex ITEM) — `flex`/
                `minHeight` on this div only take effect because PageContent's
                root above is `display:flex`, but without `display:flex` here
                too, the page's root layout node (a <Tabs>/<Stack fill="true">
                setting flex:1/minHeight:0 on ITSELF) has no flex-container
                parent to stretch within, so it collapses to content height
                instead — and since this div's own overflow is "hidden", any
                content taller than the pane gets silently clipped instead of
                becoming scrollable. Missing this was the actual root cause of
                "settings pages aren't scrollable," not anything module-side. */}
            <div style={{flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column"}}>
                <NodeRenderer node={currentLayout}/>
            </div>
        </div>
    );
}

export function PageRenderer({moduleId, pageFile}: Props) {
    const [parsed, setParsed] = useState<ParsedPage | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Guards against a slower, now-stale load (e.g. rapid module/page switching)
    // resolving after a newer one and clobbering it.
    const requestIdRef = useRef(0);

    const loadPage = useCallback(() => {
        const requestId = ++requestIdRef.current;
        setError(null);
        loadGduiDocument(moduleId, pageFile)
            .then(doc => {
                if (requestId !== requestIdRef.current) return;
                setParsed(parseGduiDocument(doc));
            })
            .catch(e => {
                if (requestId !== requestIdRef.current) return;
                console.error(`Failed to load GDUI page ${moduleId}/${pageFile}`, e);
                setError(String(e));
            });
    }, [moduleId, pageFile]);

    useEffect(() => {
        setParsed(null);
        loadPage();
    }, [loadPage]);

    useEffect(() => {
        const unsub = listen<string>("module-scripts-updated", e => {
            if (e.payload === moduleId) loadPage();
        });
        return () => {
            unsub.then(f => f());
        };
    }, [moduleId, loadPage]);

    if (error) {
        return (
            <div style={{padding: 24, color: "#ef4444", fontSize: 12, lineHeight: 1.6}}>
                <strong>Failed to load page</strong><br/>
                <span style={{color: "#555"}}>{error}</span>
            </div>
        );
    }

    if (!parsed) {
        return (
            <div style={{padding: 24, color: "#2a2a2a", fontSize: 12}}>
                Loading…
            </div>
        );
    }

    return (
        <ModulePageProvider moduleId={moduleId}>
            <RenderErrorBoundary>
                <PageContent layout={parsed.layout} subPages={parsed.subPages}/>
            </RenderErrorBoundary>
        </ModulePageProvider>
    );
}
