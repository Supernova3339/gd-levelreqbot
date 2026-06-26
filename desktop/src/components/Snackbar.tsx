import {createContext, useCallback, useContext, useRef, useState} from "react";
import {CloseIcon} from "./icons";

interface SnackbarOptions {
    message: string;
    variant?: "info" | "success" | "error";
    duration?: number;
}

interface SnackbarContextValue {
    show: (options: SnackbarOptions) => void;
}

const SnackbarContext = createContext<SnackbarContextValue>({
    show: () => {
    }
});

export function useSnackbar() {
    return useContext(SnackbarContext).show;
}

interface SnackbarItem extends SnackbarOptions {
    id: number;
}

const COLORS = {
    info: {bg: "#1a1a2e", border: "#2a2a4e", text: "#a0a8f0"},
    success: {bg: "#0f2a1a", border: "#1a4a2a", text: "#4ade80"},
    error: {bg: "#2a0f0f", border: "#4a1a1a", text: "#f87171"},
};

export function SnackbarProvider({children}: { children: React.ReactNode }) {
    const [items, setItems] = useState<SnackbarItem[]>([]);
    const counter = useRef(0);

    const show = useCallback((options: SnackbarOptions) => {
        const id = ++counter.current;
        setItems((prev) => [...prev.slice(-2), {...options, id}]); // keep max 3
        const duration = options.duration ?? 3500;
        setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), duration);
    }, []);

    const dismiss = (id: number) =>
        setItems((prev) => prev.filter((i) => i.id !== id));

    return (
        <SnackbarContext.Provider value={{show}}>
            {children}
            {items.length > 0 && (
                <div
                    className="fixed left-0 right-0 flex flex-col items-center gap-2 pointer-events-none"
                    style={{bottom: 24, zIndex: 200}}
                >
                    {items.map((item) => {
                        const colors = COLORS[item.variant ?? "info"];
                        return (
                            <div
                                key={item.id}
                                className="flex items-center gap-3 px-4 py-2.5 rounded-lg pointer-events-auto"
                                style={{
                                    backgroundColor: colors.bg,
                                    border: `1px solid ${colors.border}`,
                                    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                                    maxWidth: 480,
                                    animation: "snackbar-in 0.2s ease",
                                }}
                            >
                                <span className="text-sm" style={{color: colors.text}}>{item.message}</span>
                                <button
                                    onClick={() => dismiss(item.id)}
                                    className="flex-shrink-0 ml-2"
                                    style={{color: colors.text, opacity: 0.6}}
                                    onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLButtonElement).style.opacity = "0.6";
                                    }}
                                >
                                    <CloseIcon size={10}/>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
            <style>{`
        @keyframes snackbar-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </SnackbarContext.Provider>
    );
}
