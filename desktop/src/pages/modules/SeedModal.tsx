import {useState} from "react";
import {getLicenseToken} from "../../lib/commands";
import {mpSeedOfficialPackages, type SeedStatus} from "./marketplace-api";
import {MModal} from "./shared";
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

    return (
        <MModal
            title="Seed Official Packages"
            subtitle="Submits, approves, and publishes all official modules and libraries to the live marketplace. Skips packages that already exist."
            onClose={running ? () => {
            } : onClose}
            onSubmit={run}
            submitLabel={done ? "Done" : "Seed All"}
            submitDisabled={done}
            cancelLabel={done ? "Close" : "Cancel"}
            busy={running}
            err={null}
        >
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
        </MModal>
    );
}
