import React, {createContext, useCallback, useContext, useRef, useState} from "react";
import {Button} from "./Button";

export interface DialogOptions {
    title: string;
    body?: React.ReactNode;
    confirmLabel?: string;
    /** null hides the cancel button (plain messagebox). */
    cancelLabel?: string | null;
    danger?: boolean;
}

interface DialogContextValue {
    /** Confirmation dialog — resolves true/false. */
    confirm: (opts: DialogOptions) => Promise<boolean>;
    /** Messagebox — single OK button. */
    alert: (title: string, body?: React.ReactNode) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
    const ctx = useContext(DialogContext);
    if (!ctx) throw new Error("useDialog outside DialogProvider");
    return ctx;
}

/** Classic messagebox: title bar, body text, OK/Cancel row. */
export function DialogProvider({children}: { children: React.ReactNode }) {
    const [active, setActive] = useState<DialogOptions | null>(null);
    const resolver = useRef<(v: boolean) => void>(() => {
    });

    const confirm = useCallback((opts: DialogOptions) => {
        setActive(opts);
        return new Promise<boolean>((resolve) => {
            resolver.current = resolve;
        });
    }, []);

    const alert = useCallback(
        (title: string, body?: React.ReactNode) =>
            confirm({title, body, confirmLabel: "OK", cancelLabel: null}).then(() => {
            }),
        [confirm],
    );

    const close = (result: boolean) => {
        setActive(null);
        resolver.current(result);
    };

    return (
        <DialogContext.Provider value={{confirm, alert}}>
            {children}
            {active && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="w-[400px] max-w-[85vw] bg-bg-card shadow-2xl rounded-none border-t-4 border-accent">
                        <div className="px-5 pt-4 text-[18px] font-light text-text-primary">
                            {active.title}
                        </div>
                        <div className="px-5 py-3 text-[12px] text-text-secondary select-text">
                            {active.body}
                        </div>
                        <div className="flex justify-end gap-1.5 px-4 pb-4">
                            <Button
                                primary={!active.danger}
                                className={active.danger ? "bg-error text-white enabled:hover:bg-error/80" : ""}
                                onClick={() => close(true)}
                                autoFocus
                            >
                                {active.confirmLabel ?? "OK"}
                            </Button>
                            {active.cancelLabel !== null && (
                                <Button onClick={() => close(false)}>
                                    {active.cancelLabel ?? "Cancel"}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
}
