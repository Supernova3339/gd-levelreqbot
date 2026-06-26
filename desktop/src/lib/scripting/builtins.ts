// Built-in command scripts — valid Rhai code shown as the default for each
// built-in command in the editor.  These are overridable by the user.
//
// str.rhai provides parse_int(), parse_float(), is_number(), words(), etc.
// queue.rhai provides add(), remove(), next(), list(), position(), etc.
// fmt.rhai provides compact(), ordinal(), duration(), etc.

export const BUILTIN_SCRIPTS: Record<string, string> = {

    request: `\
// @trigger !request
// @alias !r
// @description Add a GD level to the queue
// @roles everyone
// @platform all
// @cooldown 0
// @user_cooldown 30

let id = if args.len() > 0 { args[0].trim() } else { "" };
if id == "" {
    chat.reply("Usage: !r <level_id>  —  provide a 3–9 digit level ID.");
    return;
}
let result = queue.add(id);
chat.say(result);`,

    next: `\
// @trigger !next
// @alias !skip
// @description Pop the next level from the queue
// @roles mod, owner
// @platform all
// @cooldown 0
// @user_cooldown 0

if !user.isStaff() {
    chat.reply("Only mods and the broadcaster can use !next.");
    return;
}
let result = queue.next();
chat.say(result);`,

    list: `\
// @trigger !list
// @alias !queue
// @description Show the current queue in chat
// @roles everyone
// @platform all
// @cooldown 10
// @user_cooldown 0

let page = 1;
if args.len() > 0 {
    let p = parse_int(args[0]);
    if p != () && p > 0 { page = p; }
}

let items = queue.list(page);
let total = queue.size();

if total == 0 {
    chat.say("The queue is empty!");
    return;
}

if items.len() == 0 {
    chat.say(\`No entries on page \${page}. The queue has \${total} level(s) total.\`);
    return;
}

let parts = items.map(|e| \`#\${e.position} \${e.level_id} (@\${e.username})\`);
let total_pages = (total + 5) / 6;
chat.say(\`Queue [p.\${page}/\${total_pages}, \${total} total]: \${parts.join(" | ")}\`);`,

    position: `\
// @trigger !pos
// @alias !position
// @description Show a level's position in the queue
// @roles everyone
// @platform all
// @cooldown 5
// @user_cooldown 10

let id = if args.len() > 0 { args[0].trim() } else { "" };
if id == "" {
    chat.reply("Usage: !pos <level_id>");
    return;
}

let pos = queue.position(id);
if pos == 0 {
    chat.say(\`Level \${id} is not in the queue.\`);
} else {
    let total = queue.size();
    chat.say(\`Level \${id} is #\${pos} out of \${total} in the queue.\`);
}`,

    remove: `\
// @trigger !remove
// @alias !rem
// @description Remove a level from the queue
// @roles everyone
// @platform all
// @cooldown 0
// @user_cooldown 0

let id = if args.len() > 0 { args[0].trim() } else { "" };
if id == "" {
    chat.reply("Usage: !remove <level_id>");
    return;
}
let result = queue.remove(id);
chat.say(result);`,

    clear: `\
// @trigger !clear
// @alias
// @description Clear the entire queue
// @roles mod, owner
// @platform all
// @cooldown 0
// @user_cooldown 0

if !user.isStaff() {
    chat.reply("Only mods and the broadcaster can clear the queue.");
    return;
}
let result = queue.clear();
chat.say(result);`,

    info: `\
// @trigger !info
// @alias
// @description Show GD level details from the Boomlings API
// @roles everyone
// @platform all
// @cooldown 5
// @user_cooldown 15

let id = if args.len() > 0 { args[0].trim() } else { "" };
if id == "" {
    chat.reply("Usage: !info <level_id>");
    return;
}

let level = gd.fetch(id);
if level == () {
    chat.say(\`Level \${id} was not found on the GD servers.\`);
    return;
}

let flags = [];
if level.is_demon    { flags.push("Demon"); }
if level.is_epic     { flags.push("Epic"); }
if level.is_featured { flags.push("Featured"); }
if level.is_auto     { flags.push("Auto"); }

let tag = if flags.len() > 0 { \` [\${flags.join(", ")}]\` } else { "" };
let dl  = compact(level.downloads);
let lk  = compact(level.likes);

chat.say(\`\${level.name} (#\${id})\${tag} — \${level.difficulty} ★\${level.stars} | \${level.length} | ↓\${dl} ♥\${lk}\`);`,

};

export const BUILTIN_KEYS = Object.keys(BUILTIN_SCRIPTS);
