import {createContext, useCallback, useContext, useMemo, useState, type ReactNode} from "react";

/**
 * A single shared status line for the whole page — the "topbar" any widget can
 * post to (action-dispatch errors, Form save progress, anything else that wants
 * to tell the user something happened). Only one message shows at a time; a
 * newer post replaces whatever's showing. PageRenderer owns how long each kind
 * stays up before auto-clearing (errors persist until dismissed/replaced).
 */
export type PageStatusKind = "info" | "pending" | "success" | "error";

export interface PageStatus {
    message: string;
    kind: PageStatusKind;
}

interface ModulePageContextValue {
    moduleId: string;
    /** Flat key-value bag shared across all widgets on the page (e.g. selection state). */
    state: Record<string, unknown>;
    setState: (key: string, value: unknown) => void;
    /**
     * Monotonically-increasing counter. useEval includes this in its dependency
     * array so every live expression re-evaluates when an action completes.
     */
    refresh: number;
    incrementRefresh: () => void;
    /** Currently active sub-page ID, or null for the root layout. */
    subPage: string | null;
    navigate: (id: string | null) => void;
    /** Current topbar message, or null when idle. */
    pageStatus: PageStatus | null;
    setPageStatus: (status: PageStatus | null) => void;
}

const ModulePageContext = createContext<ModulePageContextValue>({
    moduleId: "",
    state: {},
    setState: () => {
    },
    refresh: 0,
    incrementRefresh: () => {
    },
    subPage: null,
    navigate: () => {
    },
    pageStatus: null,
    setPageStatus: () => {
    },
});

export const useModulePageContext = () => useContext(ModulePageContext);

export function ModulePageProvider({
                                       moduleId,
                                       children,
                                   }: {
    moduleId: string;
    children: ReactNode;
}) {
    const [state, setStateInternal] = useState<Record<string, unknown>>({});
    const [refresh, setRefresh] = useState(0);
    const [subPage, setSubPage] = useState<string | null>(null);
    const [pageStatus, setPageStatus] = useState<PageStatus | null>(null);

    const setState = useCallback((key: string, value: unknown) => {
        setStateInternal(prev => ({...prev, [key]: value}));
    }, []);

    const incrementRefresh = useCallback(() => {
        setRefresh(n => n + 1);
    }, []);

    const navigate = useCallback((id: string | null) => {
        setSubPage(id);
    }, []);

    const value = useMemo(
        () => ({moduleId, state, setState, refresh, incrementRefresh, subPage, navigate, pageStatus, setPageStatus}),
        [moduleId, state, setState, refresh, incrementRefresh, subPage, navigate, pageStatus],
    );

    return (
        <ModulePageContext.Provider value={value}>
            {children}
        </ModulePageContext.Provider>
    );
}

/**
 * Injects extra variables into the page state for a subtree.
 * Used by Each to inject loop variables (e.g. `item`) into child expressions.
 */
export function ScopeProvider({
                                  extra,
                                  children,
                              }: {
    extra: Record<string, unknown>;
    children: ReactNode;
}) {
    const parent = useModulePageContext();
    const value = useMemo(
        () => ({...parent, state: {...parent.state, ...extra}}),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [parent, JSON.stringify(extra)],
    );
    return (
        <ModulePageContext.Provider value={value}>
            {children}
        </ModulePageContext.Provider>
    );
}
