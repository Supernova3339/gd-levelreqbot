// Directive metadata — lines of the form `// @key value` at the top of a
// Rhai script file.  Rhai treats them as plain comments; we parse them to
// populate DB columns (trigger, aliases, description, roles, etc.).

export interface DirectiveListener {
    type: "twitch_redemption" | "event";
    config: string;
}

export interface Directive {
    trigger?: string;
    aliases?: string[];
    description?: string;
    roles?: string[];   // friendly: "mod" | "owner" | "sub"
    platform?: "all" | "twitch" | "youtube";
    cooldown?: number;
    user_cooldown?: number;
    editor?: "text" | "visual";  // locked editor mode for this command
    /** Off lets the command exist purely as a listener, invisible to chat. */
    chatEnabled?: boolean;
    /** Zero or more additional ways this command can fire, independent of
     *  (and in addition to) the chat trigger — a Twitch redemption, an
     *  internal event name (from `event.emit()`), or several of either. */
    listeners?: DirectiveListener[];
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
            case "chat":
                d.chatEnabled = v !== "false";
                break;
            case "listener": {
                // "<type> <rest of line is config>" — space-split so a config
                // value (a reward title, say) can itself contain punctuation
                // like ':' without ambiguity.
                const sp = v.indexOf(" ");
                const type = (sp === -1 ? v : v.slice(0, sp)) as DirectiveListener["type"];
                const config = sp === -1 ? "" : v.slice(sp + 1);
                if (type === "twitch_redemption" || type === "event") {
                    d.listeners = [...(d.listeners ?? []), {type, config}];
                }
                break;
            }
        }
    }
    return d;
}

export function serializeDirectives(d: Directive): string {
    const lines = [
        `// @trigger ${d.trigger ?? ""}`,
        `// @alias ${(d.aliases ?? []).join(", ")}`,
        `// @description ${d.description ?? ""}`,
        `// @roles ${(d.roles ?? []).length === 0 ? "everyone" : (d.roles ?? []).join(", ")}`,
        `// @platform ${d.platform ?? "all"}`,
        `// @cooldown ${d.cooldown ?? 0}`,
        `// @user_cooldown ${d.user_cooldown ?? 0}`,
        `// @chat ${d.chatEnabled === false ? "false" : "true"}`,
    ];
    for (const l of d.listeners ?? []) {
        lines.push(`// @listener ${l.type} ${l.config}`);
    }
    return lines.join("\n");
}

// `// @lock` / `// @unlock` (lockRegions.ts) share this file's `// @word`
// directive shape but aren't directives — they're code-region markers that
// need to survive into the body text, or lock-detection never sees them
// (this was a real bug: enforcement reads the raw file directly and worked
// fine, but every UI signal derived from getBodyText() — the visual strip,
// the frontend pre-save check — silently had nothing to find).
const NON_DIRECTIVE_AT_LINES = new Set(["// @lock", "// @unlock"]);

/** Strip all `// @` directive lines, return the remaining Rhai body. Leaves
 *  `// @lock` / `// @unlock` markers in place — see NON_DIRECTIVE_AT_LINES. */
export function getBodyText(text: string): string {
    return text
        .split("\n")
        .filter((line) => NON_DIRECTIVE_AT_LINES.has(line.trim()) || !/^\s*\/\/\s*@/.test(line))
        .join("\n")
        .trim();
}

/** Combine directive header + Rhai body into a full script file. */
export function buildScript(d: Directive, body: string): string {
    const header = serializeDirectives(d);
    const trimmed = body.trim();
    return trimmed ? `${header}\n\n${trimmed}` : header;
}
