/**
 * Direct HTTP helpers for the marketplace external API.
 * These are fetch() calls, not Tauri invoke() — they go straight to the server.
 */

import type { MarketplaceEntry } from "../../lib/types";

const BASE = "https://dl.supers0ft.us/gdlvlreqbot/marketplace";

async function api<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(body || `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
}

// ── Public ────────────────────────────────────────────────────────────────────

export interface Release {
    version: string;
    download_url: string;
    checksum: string;
    changelog: string;
    pub_date: string;
}

export async function mpFetchReleases(id: string): Promise<Release[]> {
    return api<Release[]>(`/catalog/${id}/releases`);
}

export async function mpRecordInstall(id: string): Promise<void> {
    await api<unknown>(`/install/${id}`, { method: "POST" }).catch(() => {});
}

// ── Authenticated ─────────────────────────────────────────────────────────────

export interface MeResponse {
    github_id: number;
    username: string;
    is_sponsor: boolean;
    is_owner: boolean;
}

export async function mpFetchMe(token: string): Promise<MeResponse> {
    return api<MeResponse>("/me", undefined, token);
}

export interface SubmitPackageData {
    id: string;
    name: string;
    author: string;
    description: string;
    package_type: "module" | "library" | "package";
    icon: string;
    min_app_version?: string;
    tags?: string[];
    version: string;
    download_url: string;
    checksum?: string;
    changelog?: string;
}

export async function mpSubmitPackage(data: SubmitPackageData, token: string): Promise<{ id: string }> {
    return api<{ id: string }>("/submit", { method: "POST", body: JSON.stringify(data) }, token);
}

export async function mpFetchMySubmissions(token: string): Promise<MarketplaceEntry[]> {
    return api<MarketplaceEntry[]>("/my/submissions", undefined, token);
}

// ── Owner-only ────────────────────────────────────────────────────────────────

export async function mpFetchQueue(token: string): Promise<MarketplaceEntry[]> {
    return api<MarketplaceEntry[]>("/admin/queue", undefined, token);
}

export async function mpApprove(id: string, token: string): Promise<void> {
    await api<unknown>(`/admin/module/${id}/approve`, { method: "POST" }, token);
}

export async function mpDeny(id: string, reason: string, token: string): Promise<void> {
    await api<unknown>(`/admin/module/${id}/deny`, { method: "POST", body: JSON.stringify({ reason }) }, token);
}

export async function mpUpdateMeta(id: string, data: object, token: string): Promise<void> {
    await api<unknown>(`/admin/module/${id}`, { method: "PATCH", body: JSON.stringify(data) }, token);
}

export async function mpAddRelease(id: string, data: {
    version: string;
    download_url: string;
    checksum?: string;
    changelog?: string;
    pub_date?: string;
}, token: string): Promise<void> {
    await api<unknown>(`/admin/module/${id}/release`, { method: "POST", body: JSON.stringify(data) }, token);
}

export async function mpPublish(id: string, publish: boolean, token: string): Promise<void> {
    const action = publish ? "publish" : "unpublish";
    await api<unknown>(`/admin/module/${id}/${action}`, { method: "POST" }, token);
}

export interface CreateModuleData {
    id: string;
    name: string;
    author: string;
    description: string;
    package_type: "module" | "library" | "package";
    icon?: string;
    min_app_version?: string;
    tags?: string[];
    verified?: boolean;
    premium?: boolean;
    status?: "draft" | "published";
}

export async function mpCreateModule(data: CreateModuleData, token: string): Promise<{ id: string }> {
    return api<{ id: string }>("/admin/module", { method: "POST", body: JSON.stringify(data) }, token);
}

export async function mpDeleteModule(id: string, token: string): Promise<void> {
    await api<unknown>(`/admin/module/${id}`, { method: "DELETE" }, token);
}

export async function mpAdminList(token: string): Promise<MarketplaceEntry[]> {
    return api<MarketplaceEntry[]>("/admin/modules", undefined, token);
}

// ── Resources ─────────────────────────────────────────────────────────────────

export interface ResourceRecord {
    id: number;
    resource_type: "icon" | "screenshot" | "banner" | "asset";
    url: string;
    filename: string;
}

export async function mpUploadResource(
    moduleId: string,
    file: File,
    resourceType: ResourceRecord["resource_type"],
    token: string,
): Promise<ResourceRecord> {
    const form = new FormData();
    form.append("file", file);
    form.append("resource_type", resourceType);
    const res = await fetch(`${BASE}/admin/module/${moduleId}/resource`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    return res.json() as Promise<ResourceRecord>;
}

export async function mpDeleteResource(moduleId: string, resourceId: number, token: string): Promise<void> {
    await api<unknown>(`/admin/module/${moduleId}/resource/${resourceId}`, { method: "DELETE" }, token);
}

// ── Official package seed ─────────────────────────────────────────────────────

export type SeedStatus = { id: string; name: string; status: "pending" | "done" | "skipped" | "error"; error?: string };

/** Seed official packages from the live catalog into the marketplace. Takes the
 *  catalog from fetchMarketplace() so nothing is hardcoded here. */
export async function mpSeedOfficialPackages(
    username: string,
    token: string,
    catalog: MarketplaceEntry[],
    onProgress: (s: SeedStatus) => void,
): Promise<void> {
    let existing = new Set<string>();
    try {
        const live = await api<Array<{ id: string }>>("/catalog");
        existing = new Set(live.map(e => e.id));
    } catch { /* offline — continue */ }

    const official = catalog.filter(e => e.verified);

    for (const pkg of official) {
        if (existing.has(pkg.id)) {
            onProgress({ id: pkg.id, name: pkg.name, status: "skipped" });
            continue;
        }
        try {
            await mpSubmitPackage({
                id: pkg.id,
                name: pkg.name,
                author: username,
                description: pkg.description,
                package_type: (pkg.package_type ?? "module") as "module" | "library" | "package",
                icon: pkg.icon,
                version: pkg.version,
                download_url: pkg.download_url,
                checksum: pkg.checksum || undefined,
                tags: pkg.tags,
                min_app_version: pkg.min_app_version,
            }, token);
            await mpApprove(pkg.id, token);
            await mpPublish(pkg.id, true, token);
            onProgress({ id: pkg.id, name: pkg.name, status: "done" });
        } catch (e) {
            onProgress({ id: pkg.id, name: pkg.name, status: "error", error: String(e) });
        }
    }
}
