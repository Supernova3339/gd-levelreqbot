import React from "react";

interface State {
    error: Error | null
}

export class ErrorBoundary extends React.Component<
    { children: React.ReactNode; label?: string },
    State
> {
    state: State = {error: null};

    static getDerivedStateFromError(error: Error): State {
        return {error};
    }

    render() {
        const {error} = this.state;
        if (!error) return this.props.children;

        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8"
                 style={{backgroundColor: "#0d0d0d"}}>
                <p className="text-sm font-semibold" style={{color: "#ef4444"}}>
                    {this.props.label ?? "Component"} crashed
                </p>
                <pre className="text-xs rounded p-3 w-full max-w-lg overflow-auto"
                     style={{
                         backgroundColor: "#1a0808", color: "#f87171", border: "1px solid #3a1010",
                         fontFamily: "monospace", lineHeight: 1.5, maxHeight: 200
                     }}>
          {error.message}
                    {error.stack ? "\n\n" + error.stack : ""}
        </pre>
                <button
                    onClick={() => this.setState({error: null})}
                    className="text-xs px-3 py-1.5 rounded"
                    style={{backgroundColor: "#1a1a1a", color: "#888", border: "1px solid #2a2a2a"}}>
                    Try again
                </button>
            </div>
        );
    }
}
