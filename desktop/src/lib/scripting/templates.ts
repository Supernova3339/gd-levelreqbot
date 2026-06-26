// IMPORTANT: Rhai string interpolation uses ${expr} inside backtick strings.
// In these JS template literals, escape Rhai's ${} as \${} so JS doesn't consume them.

export interface ScriptTemplate {
    id: string;
    name: string;
    description: string;
    category: TemplateCategory;
    script: string;
}

export type TemplateCategory = "Queue" | "Moderation" | "Engagement" | "Utility";

export const BUILTIN_TEMPLATES: ScriptTemplate[] = [

    // ── Queue ──────────────────────────────────────────────────────────────────
    {
        id: "queue-request", name: "Level request", category: "Queue",
        description: "Accept a GD level ID and add it to the queue",
        script: `\
// @trigger !request
// @alias !r
// @description Add a GD level to the queue
// @roles everyone
// @platform all
// @cooldown 0
// @user_cooldown 30

let id = if args.len() > 0 { args[0].trim() } else { "" };
if id == "" {
    chat.reply("Usage: !r <level_id>  —  e.g. !r 12345678");
    return;
}
let result = queue.add(id);
chat.say(result);`,
    },

    {
        id: "queue-size", name: "Queue size", category: "Queue",
        description: "Report how many levels are currently in the queue",
        script: `\
// @trigger !queuelength
// @alias !ql
// @description Show how many levels are queued
// @roles everyone
// @platform all
// @cooldown 10
// @user_cooldown 0

let n = queue.size();
if n == 0 {
    chat.say("The queue is empty!");
} else {
    chat.say(\`There are \${n} level(s) in the queue.\`);
}`,
    },

    {
        id: "queue-sub-only", name: "Sub-only request", category: "Queue",
        description: "Subscribers can request levels; mods bypass the check",
        script: `\
// @trigger !subrequest
// @alias !sr
// @description Subscriber-only level request
// @roles everyone
// @platform all
// @cooldown 0
// @user_cooldown 60

let id = if args.len() > 0 { args[0].trim() } else { "" };
if id == "" { chat.reply("Usage: !sr <level_id>"); return; }
if !user.isStaff() && !user.isSub() {
    chat.reply("This command is for subscribers only!");
    return;
}
chat.say(queue.add(id));`,
    },

    {
        id: "queue-mypos", name: "My position", category: "Queue",
        description: "Let a viewer check where their level sits in the queue",
        script: `\
// @trigger !mypos
// @alias !myposition
// @description Check your level's position in the queue
// @roles everyone
// @platform all
// @cooldown 5
// @user_cooldown 15

let id = if args.len() > 0 { args[0].trim() } else { "" };
if id == "" { chat.reply("Usage: !mypos <level_id>"); return; }
let pos   = queue.position(id);
let total = queue.size();
if pos == 0 {
    chat.say(\`Level \${id} is not in the queue.\`);
} else {
    chat.say(\`Level \${id} is #\${pos} of \${total} in the queue.\`);
}`,
    },

    // ── Moderation ─────────────────────────────────────────────────────────────
    {
        id: "mod-only", name: "Mod-only command", category: "Moderation",
        description: "A command restricted to moderators and the broadcaster",
        script: `\
// @trigger !modcmd
// @alias
// @description Moderator-only command template
// @roles mod, owner
// @platform all
// @cooldown 0
// @user_cooldown 0

if !user.isStaff() {
    chat.reply("Only mods and the broadcaster can use this.");
    return;
}
chat.say(\`Done, \${username}!\`);`,
    },

    {
        id: "mod-shoutout", name: "Shoutout", category: "Moderation",
        description: "Shout out a viewer by username",
        script: `\
// @trigger !so
// @alias !shoutout
// @description Give a shoutout to a viewer
// @roles mod, owner
// @platform all
// @cooldown 5
// @user_cooldown 0

if !user.isStaff() { chat.reply("Mods only."); return; }
let name = if args.len() > 0 { args[0].trim().trim_start_matches("@") } else { "" };
if name == "" { chat.reply("Usage: !so <username>"); return; }
chat.say(\`Go check out \${name} over at twitch.tv/\${name} — give them a follow! PogChamp\`);`,
    },

    {
        id: "mod-role-chain", name: "Who am I", category: "Moderation",
        description: "Shows the viewer's role in chat",
        script: `\
// @trigger !whoami
// @alias
// @description Show a viewer their role in chat
// @roles everyone
// @platform all
// @cooldown 5
// @user_cooldown 15

let role = if user.isBroadcaster() { "broadcaster" }
           else if user.isMod()    { "moderator"   }
           else if user.isSub()    { "subscriber"  }
           else                    { "viewer"       };
chat.say(\`\${username} is a \${role}!\`);`,
    },

    // ── Engagement ─────────────────────────────────────────────────────────────
    {
        id: "eng-response", name: "Simple response", category: "Engagement",
        description: "Bot replies with a fixed message",
        script: `\
// @trigger !hello
// @alias
// @description Greet a viewer by name
// @roles everyone
// @platform all
// @cooldown 5
// @user_cooldown 30

chat.say(\`Hey \${username}! Welcome to the stream! \`);`,
    },

    {
        id: "eng-counter", name: "Usage counter", category: "Engagement",
        description: "Track and display how many times a command has been used",
        script: `\
// @trigger !count
// @alias
// @description Count how many times this command has been used
// @roles everyone
// @platform all
// @cooldown 0
// @user_cooldown 10

let n = store.incr("counter.count");
chat.reply(\`This command has been used \${n} time(s)!\`);`,
    },

    {
        id: "eng-random", name: "Random response", category: "Engagement",
        description: "Pick one message at random from a list",
        script: `\
// @trigger !hype
// @alias
// @description Send a random hype message
// @roles everyone
// @platform all
// @cooldown 10
// @user_cooldown 30

let opts = ["Pog!", "GG!", "Let's go!", "HYPE!", "PogChamp!", "Clap"];
chat.say(rand.pick(opts));`,
    },

    {
        id: "eng-points", name: "Point tracker", category: "Engagement",
        description: "Give and check viewer points stored in the key-value store",
        script: `\
// @trigger !points
// @alias !pts
// @description Check your accumulated points
// @roles everyone
// @platform all
// @cooldown 5
// @user_cooldown 10

let key = \`points.\${username}\`;
let pts = store.get(key);
if pts == () { pts = "0"; }
chat.reply(\`You have \${pts} point(s)!\`);`,
    },

    // ── Utility ────────────────────────────────────────────────────────────────
    {
        id: "util-levelinfo", name: "Level info", category: "Utility",
        description: "Look up a GD level by ID and show details",
        script: `\
// @trigger !level
// @alias !li
// @description Show GD level details from the Boomlings API
// @roles everyone
// @platform all
// @cooldown 5
// @user_cooldown 15

let id = if args.len() > 0 { args[0].trim() } else { "" };
if id == "" { chat.reply("Usage: !level <id>"); return; }
let level = gd.fetch(id);
if level == () { chat.say(\`Level \${id} not found.\`); return; }
let flags = [];
if level.is_demon    { flags.push("Demon");    }
if level.is_epic     { flags.push("Epic");     }
if level.is_featured { flags.push("Featured"); }
let tag = if flags.len() > 0 { \` [\${flags.join(", ")}]\` } else { "" };
chat.say(\`\${level.name} (\${id})\${tag} — \${level.difficulty} ★\${level.stars} | \${level.length} | ↓\${compact(level.downloads)} ♥\${compact(level.likes)}\`);`,
    },

    {
        id: "util-time", name: "Current time", category: "Utility",
        description: "Show the current UTC time in chat",
        script: `\
// @trigger !time
// @alias
// @description Show the current UTC time
// @roles everyone
// @platform all
// @cooldown 30
// @user_cooldown 0

chat.say(\`Current time (UTC): \${time.utc()}\`);`,
    },

    {
        id: "util-echo", name: "Echo args", category: "Utility",
        description: "Repeat what the user typed back in chat (mod only)",
        script: `\
// @trigger !echo
// @alias
// @description Repeat the caller's message back in chat
// @roles mod, owner
// @platform all
// @cooldown 0
// @user_cooldown 0

if !user.isStaff() { chat.reply("Mods only."); return; }
if args.len() == 0 { chat.reply("Nothing to echo."); return; }
chat.say(args.join(" "));`,
    },

    {
        id: "util-web-fetch", name: "HTTP fetch", category: "Utility",
        description: "Fetch a value from an API and post it in chat",
        script: `\
// @trigger !api
// @alias
// @description Fetch data from an HTTP API and show it in chat
// @roles mod, owner
// @platform all
// @cooldown 30
// @user_cooldown 0

let data = web.get_json("https://api.example.com/data");
if data == () {
    chat.say("Could not reach the API.");
    return;
}
// Access a field: data["key"]
chat.say(\`Result: \${data["value"]}\`);`,
    },

];

export const TEMPLATE_CATEGORIES: TemplateCategory[] = ["Queue", "Moderation", "Engagement", "Utility"];
