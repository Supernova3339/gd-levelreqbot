/**
 * Direct HTTP helpers for the marketplace external API.
 * These are fetch() calls, not Tauri invoke() — they go straight to the server.
 */

import type {MarketplaceEntry} from "../../lib/types";
import {MARKETPLACE_BASE as BASE} from "../../lib/urls";

/** Bundles a Turnstile token with the dev-build flag the server needs to
 *  pick the matching secret (see CaptchaService::resolveSecret on the
 *  server) — the one place that decides "is_dev", spread into every
 *  captcha-gated request body instead of repeating `import.meta.env.DEV`
 *  at each call site. */
export function captchaFields(token: string): { captcha_token: string; is_dev: boolean } {
    return {captcha_token: token, is_dev: import.meta.env.DEV};
}

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

export type MarketplaceRole = "user" | "author" | "staff" | "admin";

export interface MeResponse {
    github_id: number;
    username: string;
    is_sponsor: boolean;
    is_owner: boolean;
    role: MarketplaceRole;
    vanity: string | null;
}

export async function mpFetchMe(token: string): Promise<MeResponse> {
    return api<MeResponse>("/me", undefined, token);
}

/** One-time, immutable — only succeeds while the account has no vanity yet. */
export async function mpSetVanity(vanity: string, token: string): Promise<{ vanity: string }> {
    return api<{ vanity: string }>("/me/vanity", {method: "PATCH", body: JSON.stringify({vanity})}, token);
}

/** user < author < staff < admin — each level is a superset of the one below. */
const ROLE_RANK: Record<MarketplaceRole, number> = {user: 0, author: 1, staff: 2, admin: 3};

export function roleAtLeast(role: MarketplaceRole | undefined, minimum: MarketplaceRole): boolean {
    return ROLE_RANK[role ?? "user"] >= ROLE_RANK[minimum];
}

/** Fixed single-value taxonomy — mirrors external/server/src/Support/Categories.php's ALLOWED list. */
export type MarketplaceCategory = "Utility" | "Chat Commands" | "Moderation" | "Integrations" | "Fun" | "Automation";

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
    "Utility", "Chat Commands", "Moderation", "Integrations", "Fun", "Automation",
];

export interface SubmitPackageData {
    id: string;
    name: string;
    author: string;
    description: string;
    package_type: "module" | "library" | "package";
    icon: string;
    min_app_version?: string;
    tags?: string[];
    category?: MarketplaceCategory;
    version: string;
    download_url: string;
    checksum?: string;
    changelog?: string;
    /** Submit on behalf of a team instead of yourself — `id` must then be
     *  namespaced under the team's vanity, not the caller's own. */
    team_id?: number;
    /** Cloudflare Turnstile response token — server verifies before accepting.
     *  Optional in the type only for the trusted owner-only seeding path
     *  (mpSeedOfficialPackages); the real submit UI (SubmitModal) always
     *  supplies one and the server enforces it for anyone below staff. */
    captcha_token?: string;
    /** Tells the server which Turnstile secret to verify captcha_token
     *  against — see mpPostReview for why. */
    is_dev?: boolean;
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

export type ReleasePayload =
    | {
    version: string;
    download_url: string;
    checksum?: string;
    changelog?: string;
    pub_date?: string;
    is_published?: boolean
}
    | {
    source_type: "github";
    github_repo: string;
    github_dir?: string;
    github_tag?: string;
    version?: string;
    changelog?: string;
    is_published?: boolean
};

export async function mpAddRelease(id: string, data: ReleasePayload, token: string): Promise<void> {
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
    category?: MarketplaceCategory;
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

// ── Package co-owners (flat per-package list, only applies when the package
//    isn't team-owned — see the standalone Team API further down) ─────────────

export interface PackageOwner {
    github_id: number;
    github_username: string | null;
    added_at: string;
}

export async function mpFetchPackageOwners(moduleId: string, token: string): Promise<PackageOwner[]> {
    return api<PackageOwner[]>(`/admin/module/${moduleId}/team`, undefined, token);
}

export async function mpAddPackageOwner(moduleId: string, githubId: number, token: string): Promise<void> {
    await api<unknown>(`/admin/module/${moduleId}/team`, {
        method: "POST",
        body: JSON.stringify({github_id: githubId})
    }, token);
}

export async function mpRemovePackageOwner(moduleId: string, githubId: number, token: string): Promise<void> {
    await api<unknown>(`/admin/module/${moduleId}/team/${githubId}`, {method: "DELETE"}, token);
}

// ── Teams (standalone entity — own immutable vanity, can own multiple
//    packages via team_id at submission time) ──────────────────────────────────

export interface Team {
    id: number;
    vanity: string;
    name: string;
    created_by?: number;
    created_at?: string;
}

export interface TeamMember {
    github_id: number;
    github_username: string | null;
    added_at: string;
}

export async function mpCreateTeam(vanity: string, name: string, captchaToken: string, token: string): Promise<{
    id: number;
    vanity: string;
    name: string
}> {
    return api<{ id: number; vanity: string; name: string }>(
        "/teams",
        {method: "POST", body: JSON.stringify({vanity, name, ...captchaFields(captchaToken)})},
        token,
    );
}

export async function mpMyTeams(token: string): Promise<Team[]> {
    return api<Team[]>("/teams/mine", undefined, token);
}

export async function mpTeamMembers(teamId: number, token: string): Promise<TeamMember[]> {
    return api<TeamMember[]>(`/teams/${teamId}/members`, undefined, token);
}

export async function mpAddTeamMember(teamId: number, githubId: number, token: string): Promise<void> {
    await api<unknown>(`/teams/${teamId}/members`, {
        method: "POST",
        body: JSON.stringify({github_id: githubId})
    }, token);
}

export async function mpRemoveTeamMember(teamId: number, githubId: number, token: string): Promise<void> {
    await api<unknown>(`/teams/${teamId}/members/${githubId}`, {method: "DELETE"}, token);
}

/** Assigns (or clears, with `teamId: null`) which standalone Team owns a
 *  package — distinct from the flat per-package co-owner list above. */
export async function mpSetOwnerTeam(moduleId: string, teamId: number | null, token: string): Promise<void> {
    await api<unknown>(`/admin/module/${moduleId}/owner-team`, {
        method: "PATCH",
        body: JSON.stringify({team_id: teamId})
    }, token);
}

export interface UserSearchResult {
    github_id: number;
    github_username: string;
}

/** Username autocomplete for the co-owner picker — author+, not admin-gated. */
export async function mpSearchUsers(query: string, token: string): Promise<UserSearchResult[]> {
    return api<UserSearchResult[]>(`/users/search?q=${encodeURIComponent(query)}`, undefined, token);
}

// ── Resources ─────────────────────────────────────────────────────────────────

export interface ResourceRecord {
    id: number;
    resource_type: "icon" | "screenshot" | "banner" | "asset";
    url: string;
    filename: string;
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}

export async function mpUploadResource(
    moduleId: string,
    file: File,
    resourceType: ResourceRecord["resource_type"],
    token: string,
): Promise<ResourceRecord> {
    const url = await fileToDataUrl(file);
    // The server only echoes back { success, id } — build the full record
    // ourselves from what we already know instead of relying on a response
    // shape the API never actually returns.
    const {id} = await api<{ success: boolean; id: number }>(`/admin/module/${moduleId}/resource`, {
        method: "POST",
        body: JSON.stringify({resource_type: resourceType, filename: file.name, url}),
    }, token);
    return {id, resource_type: resourceType, url, filename: file.name};
}

export async function mpDeleteResource(moduleId: string, resourceId: number, token: string): Promise<void> {
    await api<unknown>(`/admin/module/${moduleId}/resource/${resourceId}`, { method: "DELETE" }, token);
}

// ── Community reviews ─────────────────────────────────────────────────────────

export interface Review {
    id: number;
    github_id: number;
    username: string;
    rating: number;
    body: string;
    created_at: string;
    updated_at: string;
    helpful_count: number;
    unhelpful_count: number;
}

export interface ReviewsResponse {
    reviews: Review[];
    count: number;
    avg_rating: number | null;
    distribution: Record<number, number>;
}

export async function mpFetchReviews(moduleId: string): Promise<ReviewsResponse> {
    return api<ReviewsResponse>(`/catalog/${moduleId}/reviews`);
}

export async function mpPostReview(moduleId: string, rating: number, body: string, captchaToken: string, token: string): Promise<void> {
    await api<unknown>(`/catalog/${moduleId}/reviews`, {
        method: "POST",
        body: JSON.stringify({rating, body, ...captchaFields(captchaToken)}),
    }, token);
}

export async function mpDeleteReview(reviewId: number, token: string): Promise<void> {
    await api<unknown>(`/reviews/${reviewId}`, {method: "DELETE"}, token);
}

export async function mpVoteReviewHelpful(reviewId: number, helpful: boolean, token: string): Promise<void> {
    await api<unknown>(`/reviews/${reviewId}/vote`, {method: "POST", body: JSON.stringify({helpful})}, token);
}

// ── Reports (community moderation) ────────────────────────────────────────────

export type ReportReason = "spam" | "malicious" | "broken" | "inappropriate" | "copyright" | "other";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
    {value: "spam", label: "Spam"},
    {value: "malicious", label: "Malicious code"},
    {value: "broken", label: "Broken / doesn't work"},
    {value: "inappropriate", label: "Inappropriate content"},
    {value: "copyright", label: "Copyright violation"},
    {value: "other", label: "Other"},
];

export async function mpReportModule(moduleId: string, reason: ReportReason, details: string, captchaToken: string, token: string): Promise<void> {
    await api<unknown>(`/catalog/${moduleId}/report`, {
        method: "POST",
        body: JSON.stringify({reason, details, ...captchaFields(captchaToken)})
    }, token);
}

export async function mpReportReview(reviewId: number, reason: ReportReason, details: string, captchaToken: string, token: string): Promise<void> {
    await api<unknown>(`/reviews/${reviewId}/report`, {
        method: "POST",
        body: JSON.stringify({reason, details, ...captchaFields(captchaToken)})
    }, token);
}

export interface ReportRecord {
    kind: "module" | "review";
    id: number;
    target_id: string;
    target_label: string | null;
    reporter_github_id: number;
    reason: ReportReason;
    details: string;
    status: "open" | "actioned" | "dismissed";
    resolved_by: number | null;
    resolved_at: string | null;
    created_at: string;
}

/** Staff+ moderation queue: combined module + review reports, newest first.
 *  The server defaults to open-only; the UI shows both open and resolved in
 *  one screen, so request "all" explicitly (still capped server-side). */
export async function mpFetchReports(token: string, status: "open" | "all" = "all"): Promise<ReportRecord[]> {
    return api<ReportRecord[]>(`/admin/reports?status=${status}`, undefined, token);
}

export async function mpResolveReport(kind: "module" | "review", id: number, action: "resolve" | "dismiss", token: string): Promise<void> {
    await api<unknown>(`/admin/reports/${id}/${action}?kind=${kind}`, {method: "POST"}, token);
}

// ── Users & roles (admin-only) ─────────────────────────────────────────────────

export interface MarketplaceUserRecord {
    github_id: number;
    github_username: string;
    is_sponsor: boolean;
    role: MarketplaceRole;
    created_at: string;
    updated_at: string;
}

export async function mpFetchUsers(token: string): Promise<MarketplaceUserRecord[]> {
    return api<MarketplaceUserRecord[]>("/admin/users", undefined, token);
}

export async function mpSetUserRole(githubId: number, role: MarketplaceRole, token: string): Promise<void> {
    await api<unknown>(`/admin/users/${githubId}/role`, {method: "PATCH", body: JSON.stringify({role})}, token);
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
