import type {QueueEntry, QueuePage} from "../lib/types";

interface QueueTableProps {
    title: string;
    queuePage: QueuePage | null;
    loading: boolean;
    currentPage: number;
    onPageChange: (page: number) => void;
    onRemove: (levelId: number) => Promise<void>;
}

function formatDate(isoString: string): string {
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
    } catch {
        return isoString;
    }
}

export function QueueTable({
                               title,
                               queuePage,
                               loading,
                               currentPage,
                               onPageChange,
                               onRemove,
                           }: QueueTableProps) {
    const entries: QueueEntry[] = queuePage?.data ?? [];
    const totalPages = queuePage?.total_pages ?? 1;
    const totalItems = queuePage?.total_items ?? 0;

    return (
        <div
            className="flex flex-col rounded-lg overflow-hidden"
            style={{backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a"}}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{borderBottom: "1px solid #2a2a2a"}}
            >
        <span className="text-sm font-semibold" style={{color: "#f1f1f1"}}>
          {title}
        </span>
                <span className="text-xs" style={{color: "#666"}}>
          {totalItems} {totalItems === 1 ? "entry" : "entries"}
        </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                    <tr style={{borderBottom: "1px solid #2a2a2a"}}>
                        <th
                            className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                            style={{color: "#555", width: 50}}
                        >
                            #
                        </th>
                        <th
                            className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                            style={{color: "#555"}}
                        >
                            Level ID
                        </th>
                        <th
                            className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                            style={{color: "#555"}}
                        >
                            Username
                        </th>
                        <th
                            className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                            style={{color: "#555"}}
                        >
                            Added
                        </th>
                        <th
                            className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                            style={{color: "#555", width: 80}}
                        >
                            Action
                        </th>
                    </tr>
                    </thead>
                    <tbody>
                    {loading ? (
                        <tr>
                            <td
                                colSpan={5}
                                className="px-4 py-8 text-center text-sm"
                                style={{color: "#555"}}
                            >
                                Loading...
                            </td>
                        </tr>
                    ) : entries.length === 0 ? (
                        <tr>
                            <td
                                colSpan={5}
                                className="px-4 py-8 text-center text-sm"
                                style={{color: "#555"}}
                            >
                                Queue is empty
                            </td>
                        </tr>
                    ) : (
                        entries.map((entry) => (
                            <tr
                                key={entry.id}
                                className="transition-colors"
                                style={{borderBottom: "1px solid #222"}}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                                        "#222";
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                                        "transparent";
                                }}
                            >
                                <td
                                    className="px-4 py-2.5 tabular-nums"
                                    style={{color: "#555"}}
                                >
                                    {entry.position}
                                </td>
                                <td
                                    className="px-4 py-2.5 font-mono tabular-nums"
                                    style={{color: "#f1f1f1"}}
                                >
                                    {entry.level_id}
                                </td>
                                <td className="px-4 py-2.5" style={{color: "#a0a0a0"}}>
                    <span
                        className={entry.is_subscriber ? "font-semibold" : ""}
                        style={{
                            color: entry.is_subscriber ? "var(--color-accent)" : "#a0a0a0",
                        }}
                    >
                      {entry.username}
                    </span>
                                    {entry.is_subscriber && (
                                        <span
                                            className="ml-1.5 px-1 py-0.5 text-xs rounded"
                                            style={{
                                                backgroundColor: "color-mix(in srgb, var(--color-accent) 13%, transparent)",
                                                color: "var(--color-accent)"
                                            }}
                                        >
                        sub
                      </span>
                                    )}
                                </td>
                                <td
                                    className="px-4 py-2.5 text-xs tabular-nums"
                                    style={{color: "#555"}}
                                >
                                    {formatDate(entry.added_at)}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                    <button
                                        onClick={() => onRemove(entry.level_id)}
                                        className="px-2 py-1 text-xs rounded transition-colors"
                                        style={{
                                            backgroundColor: "#2a1a1a",
                                            color: "#ef4444",
                                            border: "1px solid #3a2020"
                                        }}
                                        onMouseEnter={(e) => {
                                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#3a2020";
                                        }}
                                        onMouseLeave={(e) => {
                                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2a1a1a";
                                        }}
                                    >
                                        Remove
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div
                    className="flex items-center justify-between px-4 py-2"
                    style={{borderTop: "1px solid #2a2a2a"}}
                >
                    <button
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage <= 1}
                        className="px-2 py-1 text-xs rounded transition-opacity"
                        style={{
                            backgroundColor: "#222",
                            color: "#a0a0a0",
                            border: "1px solid #333",
                            opacity: currentPage <= 1 ? 0.4 : 1,
                        }}
                    >
                        Previous
                    </button>
                    <span className="text-xs" style={{color: "#555"}}>
            Page {currentPage} of {totalPages}
          </span>
                    <button
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        className="px-2 py-1 text-xs rounded transition-opacity"
                        style={{
                            backgroundColor: "#222",
                            color: "#a0a0a0",
                            border: "1px solid #333",
                            opacity: currentPage >= totalPages ? 0.4 : 1,
                        }}
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
