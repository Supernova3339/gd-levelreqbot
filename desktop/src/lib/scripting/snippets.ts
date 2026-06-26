export interface Snippet {
    id: string;
    name: string;
    description: string;
    category: SnippetCategory;
    body: string;
    builtin: boolean;
}

export type SnippetCategory = "Guards" | "Messages" | "Queue" | "Flow" | "Data";

export const BUILTIN_SNIPPETS: Snippet[] = [
    // ── Guards ─────────────────────────────────────────────────────────────────
    {
        id: "g-staff", category: "Guards", builtin: true,
        name: "Staff only", description: "Return early if not mod/broadcaster",
        body: `if !user_is_staff() { chat_reply("Mods only."); return; }`
    },
    {
        id: "g-sub", category: "Guards", builtin: true,
        name: "Sub only", description: "Return early if not subscribed",
        body: `if !user_is_sub() { chat_reply("Subs only."); return; }`
    },
    {
        id: "g-args", category: "Guards", builtin: true,
        name: "Require args", description: "Return early if no arguments",
        body: `if args.len() == 0 { chat_reply("Please provide an argument."); return; }`
    },

    // ── Messages ───────────────────────────────────────────────────────────────
    {
        id: "m-reply", category: "Messages", builtin: true,
        name: "Reply to user", description: "Reply with @username",
        body: "chat_reply(`Hey ${username}!`);"
    },
    {
        id: "m-levelinfo", category: "Messages", builtin: true,
        name: "Level info line", description: "Fetch and format GD level info",
        body: `let lv = gd_fetch(args[0]);\nif lv != () {\n    chat_say(\`\${lv.name} — \${lv.difficulty} ★\${lv.stars} | \${lv.length}\`);\n}`
    },

    // ── Queue ──────────────────────────────────────────────────────────────────
    {
        id: "q-add", category: "Queue", builtin: true,
        name: "Add level", description: "Add args[0] to the queue",
        body: `if args.len() == 0 { chat_reply("Provide a level ID."); return; }\nadd();`
    },
    {
        id: "q-next", category: "Queue", builtin: true,
        name: "Next level", description: "Staff-only pop from queue",
        body: `if !user_is_staff() { chat_reply("Mods only."); return; }\nnext();`
    },

    // ── Flow ───────────────────────────────────────────────────────────────────
    {
        id: "f-counter", category: "Flow", builtin: true,
        name: "Persistent counter", description: "Increment and report a named counter",
        body: "let n = store_incr(\"counter.name\");\nchat_reply(`Used ${n} times!`);"
    },
    {
        id: "f-rolechain", category: "Flow", builtin: true,
        name: "Role chain", description: "Different action per role",
        body: `if user_is_broadcaster() {\n    // broadcaster action\n} else if user_is_mod() {\n    // mod action\n} else if user_is_sub() {\n    // sub action\n} else {\n    // viewer action\n}`
    },

    // ── Data ───────────────────────────────────────────────────────────────────
    {
        id: "d-store", category: "Data", builtin: true,
        name: "Read/write store", description: "Persistent key-value store",
        body: `let val = store_get("my.key") ?? 0;\nstore_set("my.key", val + 1);`
    },
    {
        id: "d-userdata", category: "Data", builtin: true,
        name: "Per-user data", description: "Store data keyed by username",
        body: `let key = "user." + username + ".score";\nlet score = store_get(key) ?? 0;\nstore_set(key, score + 1);\nchat_reply(\`Your score: \${score + 1}\`);`
    },
];

export const SNIPPET_CATEGORIES: SnippetCategory[] = ["Guards", "Messages", "Queue", "Flow", "Data"];
