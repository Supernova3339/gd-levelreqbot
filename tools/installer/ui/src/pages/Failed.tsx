export function Failed({error}: { error: string }) {
    return (
        <div className="flex flex-col h-full min-h-0 gap-3 pt-1">
            <p className="m-0 text-[13px] text-text-secondary">
                We couldn't finish setting things up. Sorry about that — here's what happened:
            </p>
            <pre
                className="flex-1 min-h-0 overflow-auto m-0 bg-bg-card p-3
                           font-mono text-[11px] text-error whitespace-pre-wrap select-text"
            >
                {error}
            </pre>
            <p className="m-0 text-[11px] text-text-muted">
                A full log was saved to your temp folder (…-setup.log). Nothing else was changed.
            </p>
        </div>
    );
}
