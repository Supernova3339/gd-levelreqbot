// Directive metadata — lines of the form `// @key value` at the top of a
// Rhai script file.  Rhai treats them as plain comments; we parse them to
// populate DB columns (trigger, aliases, description, roles, etc.).

export interface Directive {
    trigger?: string;
    aliases?: string[];
    description?: string;
    roles?: string[];   // friendly: "mod" | "owner" | "sub"
    platform?: "all" | "twitch" | "youtube";
    cooldown?: number;
    user_cooldown?: number;
    editor?: "text" | "visual";  // locked editor mode for this command
}

const ROLE_TO_DB: Record<string, string> = {
    mod: "moderator", moderator: "moderator",
    owner: "broadcaster", broadcaster: "broadcaster",
    sub: "subscriber", subscriber: "subscriber",
};
const DB_TO_ROLE: Record<string, string> = {
    moderator: "mod", broadcaster: "owner", subscriber: "sub",
};

export function rolesToDb(roles: string[]): string[] {
    return roles.map((r) => ROLE_TO_DB[r.toLowerCase()] ?? r);
}

export function dbToRoles(badges: string[]): string[] {
    return badges.map((b) => DB_TO_ROLE[b] ?? b);
}

export function parseDirectives(text: string): Directive {
    const d: Directive = {};
    for (const raw of text.split("\n")) {
        const m = raw.trim().match(/^\/\/\s*@(\w+)\s*(.*)/);
        if (!m) continue;
        const [, key, val] = m;
        const v = val.trim();
        switch (key) {
            case "trigger":
                d.trigger = v;
                break;
            case "alias":
            case "aliases":
                d.aliases = v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
                break;
            case "description":
                d.description = v;
                break;
            case "role":
            case "roles":
                d.roles = v === "everyone" || !v ? [] : v.split(",").map((s) => s.trim()).filter(Boolean);
                break;
            case "platform":
                d.platform = (v || "all") as Directive["platform"];
                break;
            case "cooldown":
                d.cooldown = parseInt(v) || 0;
                break;
            case "user_cooldown":
                d.user_cooldown = parseInt(v) || 0;
                break;
            case "editor":
                d.editor = v === "visual" ? "visual" : "text";
                break;
        }
    }
    return d;
}

export function serializeDirectives(d: Directive): string {
    return [
        `// @trigger ${d.trigger ?? ""}`,
        `// @alias ${(d.aliases ?? []).join(", ")}`,
        `// @description ${d.description ?? ""}`,
        `// @roles ${(d.roles ?? []).length === 0 ? "everyone" : (d.roles ?? []).join(", ")}`,
        `// @platform ${d.platform ?? "all"}`,
        `// @cooldown ${d.cooldown ?? 0}`,
        `// @user_cooldown ${d.user_cooldown ?? 0}`,
    ].join("\n");
}

/** Strip all `// @` directive lines, return the remaining Rhai body. */
export function getBodyText(text: string): string {
    return text
        .split("\n")
        .filter((line) => !/^\s*\/\/\s*@/.test(line))
        .join("\n")
        .trim();
}

/** Combine directive header + Rhai body into a full script file. */
export function buildScript(d: Directive, body: string): string {
    const header = serializeDirectives(d);
    const trimmed = body.trim();
    return trimmed ? `${header}\n\n${trimmed}` : header;
}
