import {useBotStatus} from "../hooks/useBotStatus";

export function StatusBar() {
    const {status, startError, starting, stopping, startBot, stopBot} = useBotStatus();

    const botStatus = status?.status ?? null;
    const isConnected = botStatus === "connected";
    const isConnecting = botStatus === "connecting";
    const isError = !!botStatus && typeof botStatus === "object" && "error" in botStatus;
    const isBusy = starting || stopping || isConnecting;

    const dotColor = isConnected ? "#22c55e"
        : isConnecting || starting ? "#f59e0b"
            : isError ? "#ef4444"
                : "#444";

    return (
        <header
            className="flex items-center justify-between px-3 flex-shrink-0"
            style={{backgroundColor: "#141414", borderBottom: "1px solid #222", height: 36}}
        >
            {/* Status dot + error message */}
            <div className="flex items-center gap-2 min-w-0">
        <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{backgroundColor: dotColor}}
        />
                {startError && (
                    <span
                        className="text-xs truncate"
                        style={{color: "#ef4444", maxWidth: 480}}
                        title={startError}
                    >
            {startError}
          </span>
                )}
                {!startError && isError && typeof botStatus === "object" && (
                    <span className="text-xs truncate" style={{color: "#ef4444"}}>
            {botStatus.error}
          </span>
                )}
            </div>

            {/* Start / Stop */}
            <button
                onClick={isConnected ? stopBot : startBot}
                disabled={isBusy}
                className="flex-shrink-0 px-3 py-1 text-xs font-semibold rounded"
                style={{
                    backgroundColor: isConnected ? "#2a1a1a" : "var(--color-accent)",
                    color: isConnected ? "#ef4444" : "#fff",
                    border: isConnected ? "1px solid #3a2020" : "none",
                    opacity: isBusy ? 0.5 : 1,
                }}
            >
                {stopping ? "Stopping..." : starting || isConnecting ? "Connecting..." : isConnected ? "Stop" : "Start"}
            </button>
        </header>
    );
}
