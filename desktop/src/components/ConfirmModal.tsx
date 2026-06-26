import {createContext, useCallback, useContext, useState} from "react";

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

type Resolver = (value: boolean) => void;

interface ConfirmContextValue {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({confirm: async () => false});

export function useConfirm() {
    return useContext(ConfirmContext).confirm;
}

export function ConfirmProvider({children}: { children: React.ReactNode }) {
    const [state, setState] = useState<(ConfirmOptions & { resolve: Resolver }) | null>(null);

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> =>
        new Promise((resolve) => setState({...options, resolve})), []);

    const resolve = (value: boolean) => {
        state?.resolve(value);
        setState(null);
    };

    return (
        <ConfirmContext.Provider value={{confirm}}>
            {children}
            {state && (
                <div
                    className="fixed inset-0 flex items-center justify-center"
                    style={{backgroundColor: "rgba(0,0,0,0.6)", zIndex: 100, backdropFilter: "blur(2px)"}}
                    onClick={() => resolve(false)}
                >
                    <div
                        className="flex flex-col gap-4 rounded-xl p-6"
                        style={{
                            backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a",
                            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
                            width: "min(380px, 90vw)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {state.title && (
                            <p className="text-sm font-semibold" style={{color: "#f1f1f1"}}>{state.title}</p>
                        )}
                        <p className="text-sm" style={{color: "#a0a0a0", lineHeight: 1.6}}>{state.message}</p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => resolve(false)}
                                className="px-4 py-1.5 text-xs rounded"
                                style={{backgroundColor: "#222", color: "#888", border: "1px solid #2a2a2a"}}
                            >
                                {state.cancelLabel ?? "Cancel"}
                            </button>
                            <button
                                onClick={() => resolve(true)}
                                className="px-4 py-1.5 text-xs font-semibold rounded"
                                style={{
                                    backgroundColor: state.destructive ? "#ef4444" : "var(--color-accent)",
                                    color: "#fff",
                                }}
                            >
                                {state.confirmLabel ?? "Confirm"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}
