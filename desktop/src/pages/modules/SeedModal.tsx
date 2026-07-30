import {useState} from "react";
import {createPortal} from "react-dom";
import {getLicenseToken} from "../../lib/commands";
import {mpSeedOfficialPackages, type SeedStatus} from "./marketplace-api";
import type {CatalogEntry} from "./useMarketplace";

export function SeedModal({username, entries, onClose}: {
    username: string;
    entries: CatalogEntry[];
    onClose: () => void;
}) {
    const [statuses, setStatuses] = useState<Record<string, SeedStatus>>({});
    const [running, setRunning] = useState(false);
    const [done, setDone] = useState(false);

    // A devWatched module is split into online/local rows sharing one real
    // id (see mergeWithInstalled) — never seed the local shadow, and always
    // submit under the real marketplaceId, not the "online."-prefixed
    // display id.
    const official = entries.filter(e => e.verified && !e.isLocalShadow);

    const run = async () => {
        setRunning(true);
        setStatuses({});
        const token = await getLicenseToken();
        if (!token) {
            setRunning(false);
            return;
        }
        const catalog = official.map(e => ({...e, id: e.marketplaceId}));
        await mpSeedOfficialPackages(username, token, catalog, s => {
            setStatuses(prev => ({...prev, [s.id]: s}));
        });
        setRunning(false);
        setDone(true);
    };

    const icon = (id: string) => {
        const s = statuses[id];
        if (!s || s.status === "pending") return <span style={{color: "#333"}}>·</span>;
        if (s.status === "done") return <span style={{color: "#22c55e"}}>✓</span>;
        if (s.status === "skipped") return <span style={{color: "#555"}}>—</span>;
        return <span style={{color: "#ef4444"}}>✗</span>;
    };

    return createPortal(
        <div style={{
            position: "fixed", inset: 0, zIndex: 9000, display: "flex",
            alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)",
        }} onClick={e => {
            if (!running && e.target === e.currentTarget) onClose();
        }}>
            <div style={{
                backgroundColor: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 10,
                padding: "24px", width: 400,
            }}>
                <p style={{fontSize: 14, fontWeight: 700, color: "#bbb", marginBottom: 4}}>Seed Official Packages</p>
                <p style={{fontSize: 11, color: "#3a3a3a", marginBottom: 16}}>
                    Submits, approves, and publishes all official modules and libraries to the live marketplace. Skips
                    packages that already exist.
                </p>

                <div style={{marginBottom: 16}}>
                    {official.map(pkg => (
                        <div key={pkg.id} style={{display: "flex", alignItems: "center", gap: 8, padding: "4px 0"}}>
                            <span style={{width: 14, textAlign: "center", fontSize: 12}}>{icon(pkg.id)}</span>
                            <span style={{fontSize: 11, color: "#555"}}>{pkg.name}</span>
                            <span style={{fontSize: 9, color: "#333", marginLeft: "auto"}}>
                                {(pkg.package_type ?? "module") === "library" ? "lib" : "mod"}
                            </span>
                            {statuses[pkg.id]?.error && (
                                <span style={{
                                    fontSize: 9, color: "#ef4444",
                                    maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                    {statuses[pkg.id].error}
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                <div style={{display: "flex", gap: 8, justifyContent: "flex-end"}}>
                    <button onClick={onClose} disabled={running} style={{
                        padding: "6px 16px", fontSize: 12, background: "none", color: "#555",
                        border: "1px solid #2a2a2a", borderRadius: 5,
                        cursor: running ? "not-allowed" : "pointer",
                    }}>
                        {done ? "Close" : "Cancel"}
                    </button>
                    {!done && (
                        <button onClick={run} disabled={running} style={{
                            padding: "6px 20px", fontSize: 12, fontWeight: 600,
                            backgroundColor: running ? "#1a1a1a" : "var(--color-accent)",
                            color: running ? "#444" : "#fff",
                            border: "none", borderRadius: 5,
                            cursor: running ? "not-allowed" : "pointer",
                        }}>
                            {running ? "Seeding…" : "Seed All"}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
