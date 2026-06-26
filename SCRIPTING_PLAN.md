# Scripting Plan

## What we're doing

Replacing the current custom DSL with **Rhai** — a real scripting language (Rust-like syntax,
JS/Python feel). Scripts and libraries are plain text stored in the database. Everything is
readable and editable, including the standard library.

---

## The two layers

### 1. Rust primitives (the only things in Rust)

Raw capabilities that Rhai can call. No business logic here.

- `db` — SQLite queries, exec, one-row fetch
- `http` — raw HTTP GET/POST with headers, JSON parsing
- `store` — persistent key-value (SQLite-backed)
- `chat` — send a message to Twitch/YouTube chat
- `event` — emit/receive events (overlay, UI, other scripts)
- `log` — debug logging

### 2. Everything else is Rhai

All libraries — queue, gd, rand, str, time, etc. — are `.rhai` files you can open,
read, and edit. Nothing is hidden.

---

## Everything in scope for a script

### `command` — metadata about the command being run

```javascript
command.name       // "request"  (no ! prefix)
command.trigger    // "!request"
command.aliases    // ["!r"]
command.platform   // "all" | "twitch" | "youtube"
command.counter    // how many times this command has run (lifetime)
```

No more hardcoding `!request` in your response — use `command.trigger`.

---

### `user` — the person who typed the command

```javascript
user.name          // login name
user.display       // display name
user.platform      // "twitch" | "youtube"
user.isMod()
user.isSub()
user.isBroadcaster()
user.isStaff()     // mod OR broadcaster
```

---

### `args` — what they typed after the command

```javascript
args               // Rhai array: ["hello", "world"]
args[0]            // first argument
args.len()         // count
args.join(", ")    // rejoin as string (it's a real array)
```

---

### `queue` — the level queue  *(standard library, editable)*

```javascript
queue.add(level_id)
queue.remove(level_id)
queue.next()
queue.list(page)           // page is optional, defaults to 1
queue.position(level_id)
queue.clear()
queue.size()               // returns number
queue.has(level_id)        // returns bool
queue.entries(limit)       // returns array of row objects
```

---

### `gd` — Geometry Dash API  *(standard library, editable)*

```javascript
gd.fetch(level_id)         // returns Level object or ()
gd.search(query)           // returns array of Level objects
gd.user(account_id)        // returns GDUser object or ()
gd.isValidId(string)       // returns bool

// Level object fields:
// .id  .name  .difficulty  .stars  .length
// .downloads  .likes  .isDemon  .isEpic  .isFeatured
// .creator  .version  .coins  .hasPassword

// GDUser fields:
// .username  .id  .accountId  .stars  .demons
// .creatorPoints  .rank
```

---

### `platform` — Twitch/YouTube platform APIs  *(standard library, editable)*

```javascript
// Which platform is the command coming from?
platform.name              // "twitch" | "youtube"
platform.isTwitch()
platform.isYoutube()
platform.channel           // channel login name

// Twitch-specific
platform.twitch.announce(message)          // channel announcement (different from a message!)
platform.twitch.shoutout(username)         // /shoutout
platform.twitch.timeout(username, seconds)
platform.twitch.ban(username, reason)
platform.twitch.clip()                     // create a clip, returns clip URL
platform.twitch.prediction(title, options) // create a prediction
platform.twitch.poll(title, options, secs) // create a poll
platform.twitch.raid(target_channel)

// YouTube-specific
platform.youtube.announce(message)         // YouTube announcement post
platform.youtube.isMember()               // is the sender a member?
```

So for a "announce this in chat" command that works on both platforms:

```javascript
// Works on Twitch AND YouTube — different API, same script
platform.twitch.announce(`Level ${args[0]} is up next!`);
// or for cross-platform:
if platform.isTwitch() {
    platform.twitch.announce(args[0]);
} else {
    chat.say(args[0]);   // YouTube doesn't have announcements
}
```

---

### `rand` — randomisation  *(standard library, editable)*

```javascript
rand.int(min, max)         // random integer in range (inclusive)
rand.float()               // random float 0.0 – 1.0
rand.bool()                // random true/false
rand.pick(array)           // random element from an array
rand.shuffle(array)        // returns a shuffled copy
rand.weighted(items)       // items = [#{ value: "x", weight: 3 }, ...]
rand.seed(n)               // seed the RNG (for reproducible draws)
rand.uuid()                // random UUID string

// Example: weighted random with seeding
rand.seed(42);
let winner = rand.pick(["Alice", "Bob", "Carol"]);
```

---

### `str` — string utilities  *(standard library, editable)*

```javascript
str.upper("hello")                 // "HELLO"
str.lower("HELLO")                 // "hello"
str.trim("  hi  ")                 // "hi"
str.split("a,b,c", ",")           // ["a","b","c"]
str.replace("hello", "l", "r")    // "herro"
str.contains("hello", "ell")       // true
str.starts_with("hello", "he")
str.ends_with("hello", "lo")
str.pad_left("5", 3, "0")         // "005"
str.truncate("long text", 8, "…") // "long te…"
str.escape(s)                      // escape for safe embedding
str.template("Hello {name}!", #{ name: "world" })  // "Hello world!"
```

---

### `fmt` — display formatting  *(standard library, editable)*

```javascript
fmt.number(1234567)        // "1,234,567"
fmt.compact(1234567)       // "1.2M"
fmt.bytes(1048576)         // "1 MB"
fmt.duration(3661)         // "1h 1m 1s"
fmt.ordinal(1)             // "1st"
fmt.ordinal(22)            // "22nd"
fmt.list(["a","b","c"])    // "a, b, and c"
fmt.percent(0.742)         // "74.2%"
fmt.pad(s, width)          // right-pad with spaces
```

---

### `time` — date and time  *(standard library, editable)*

```javascript
time.now()                 // Unix timestamp (seconds, integer)
time.utc()                 // "14:23 UTC"
time.date()                // "2026-06-21"
time.format(ts, "%H:%M")  // format a Unix timestamp
time.elapsed(since_ts)    // seconds since that timestamp
time.parse("2026-01-01")  // string → Unix timestamp
```

---

### `math` — maths  *(standard library, editable)*

```javascript
math.min(a, b)
math.max(a, b)
math.abs(n)
math.clamp(n, min, max)
math.floor(n)
math.ceil(n)
math.round(n)
math.pow(base, exp)
math.sqrt(n)
math.sign(n)               // -1, 0, or 1
```

---

### `web` — HTTP and data fetching  *(standard library, editable)*

```javascript
// Simple
web.get("https://api.example.com/data")        // returns body string
web.json("https://api.example.com/data")        // returns parsed object

// With options
web.get("url", #{
    headers: #{ "Authorization": "Bearer abc" },
    timeout: 5,     // seconds
})

// POST
web.post("url", "body string")
web.post_json("url", #{ key: "value" })

// Parse JSON path
web.json_path("https://api.example.com", "data.items[0].title")

// Example: fetch current Spotify song via a webhook
let song = web.json("https://mywebhook.example.com/song");
chat.say(`Now playing: ${song.title} by ${song.artist}`);
```

---

### `json` — JSON helpers  *(standard library, editable)*

```javascript
json.parse(string)             // string → Rhai object
json.stringify(obj)            // Rhai object → JSON string
json.get(obj, "a.b[0].c")     // dot/bracket path accessor
json.has(obj, "path")          // check if path exists
```

---

### `store` — persistent key-value storage

```javascript
store.get("key")               // returns value or ()
store.set("key", value)        // value can be any Rhai type
store.delete("key")
store.keys("prefix")           // list keys starting with prefix
store.incr("key")              // increment a number by 1
store.incr_by("key", n)
store.get_or("key", default)   // get with a fallback value

// Examples
store.set("deaths", 0);
store.incr("deaths");
chat.say(`Deaths: ${store.get("deaths")}`);

// Per-user data
store.set(`user.${user.name}.requests`, count);
```

---

### `counter` — named persistent counters  *(standard library, uses store underneath)*

```javascript
counter.inc("deaths")           // increment by 1
counter.inc_by("deaths", 3)
counter.get("deaths")           // returns number
counter.set("deaths", 0)        // reset or set
counter.reset("deaths")         // alias for set to 0
counter.format("deaths", "💀 Deaths: {value}")  // returns formatted string
```

---

### `event` — events between scripts and the UI

```javascript
// Emit (your script → overlay, UI, other listeners)
event.emit("queue_updated",  #{ action: "add", level_id: "12345" });
event.emit("level_nexted",   #{ level_id: "12345", username: "player" });
event.emit("my_custom_event", #{ any: "data" });

// The UI and overlay listen for: queue_updated, level_nexted, level_copied
// You can add your own event listeners in a library:

// In a library file:
event.on("subscription", fn(data) {
    store.incr("subs.total");
    chat.say(`Thanks for the sub, @${data.username}! 🎉`);
});
```

---

### `db` — direct database access

```javascript
// Full SQLite access — your data, your queries
db.query("SELECT * FROM queue ORDER BY position ASC", [])
db.query("SELECT * FROM queue WHERE username = ?", [user.name])
db.query_one("SELECT COUNT(*) AS n FROM queue", [])
db.exec("UPDATE queue SET position = position - 1 WHERE position > ?", [3])
db.last_id()    // ID of the last inserted row

// Returns: array of row objects for query, integer for exec
// Fields accessed as obj.column_name
```

---

## A realistic example — custom announce command

```javascript
// !announce command — staff only, sends a platform-appropriate announcement

if !user.isStaff() {
    chat.reply("Only staff can use this.");
    return;
}

if args.len() == 0 {
    chat.reply(`Usage: ${command.trigger} <message>`);
    return;
}

let message = args.join(" ");   // rejoin all args as one string

if platform.isTwitch() {
    platform.twitch.announce(message);
    log.info(`Announcement sent on Twitch: ${message}`);
} else if platform.isYoutube() {
    // YouTube has no announcement API, just send as a message
    chat.say(`📢 ${message}`);
}
```

---

## A realistic example — weighted giveaway

```javascript
// !giveaway enter — anyone can enter
// !giveaway draw — staff only, picks a weighted winner (subs get 3x entries)

if args.len() == 0 { chat.reply(`Usage: ${command.trigger} enter|draw`); return; }

if args[0] == "enter" {
    let key = `giveaway.entries.${user.name}`;
    if store.get(key) != () {
        chat.reply("You're already entered!");
        return;
    }
    let weight = if user.isSub() { 3 } else { 1 };
    store.set(key, #{ username: user.name, weight: weight });
    chat.reply(`You're in! (${weight}x entries as ${if user.isSub() { "sub" } else { "viewer" }})`);

} else if args[0] == "draw" {
    if !user.isStaff() { chat.reply("Staff only."); return; }

    let keys    = store.keys("giveaway.entries.");
    let entries = keys.map(|k| store.get(k));

    if entries.len() == 0 { chat.say("No one entered!"); return; }

    let winner = rand.weighted(entries.map(|e| #{ value: e.username, weight: e.weight }));

    // Clear entries
    keys.for_each(|k| store.delete(k));

    event.emit("giveaway_winner", #{ username: winner });
    chat.say(`🎉 Congratulations to @${winner}! You won the giveaway!`);
    platform.twitch.announce(`🎉 @${winner} won the giveaway!`);
}
```

---

## What the Libraries tab contains

Every library is a `.rhai` file. Click any to view or edit.

```
Standard Library           (viewable, forkable — not edited directly)
  queue.rhai               queue.add / remove / next / list / etc.
  gd.rhai                  gd.fetch / search / user / isValidId
  platform.rhai            twitch.announce / shoutout / timeout / etc.
  rand.rhai                int / float / pick / shuffle / weighted / seed
  str.rhai                 upper / lower / trim / split / template / etc.
  fmt.rhai                 number / compact / duration / ordinal / etc.
  time.rhai                now / utc / date / format / elapsed
  math.rhai                min / max / clamp / round / etc.
  web.rhai                 get / post / json / json_path
  json.rhai                parse / stringify / get / has
  counter.rhai             inc / get / set / reset / format

Your Libraries             (fully editable)
  mylib.rhai
  (+ New library)
```

**Fork any standard library** → creates an editable copy in Your Libraries that
overrides the standard one. You can see and change every line of how `queue.add` works.

---

## Data storage options

| What           | How                             | Persists        |
|----------------|---------------------------------|-----------------|
| Queue entries  | `db.exec(...)`                  | ✅               |
| Any value      | `store.set("key", value)`       | ✅               |
| Named counters | `counter.inc("name")`           | ✅               |
| Per-user data  | `store.set("user.name.key", v)` | ✅               |
| Temp in script | `let x = 5`                     | ❌ this run only |
| Events/overlay | `event.emit(...)`               | ❌ in-memory     |

---

## Open questions before we build

1. **`db` access** — full raw SQL, or limit to safe helper functions?
   Recommendation: full access with a visible warning. Power users need it.

2. **Auto-import vs explicit** — should `queue`, `rand`, etc. be automatically
   in scope, or `import "queue" as queue` at the top?
   Recommendation: auto-import the standard library so simple scripts stay simple.

3. **Block mode** — keep a simple drag-and-drop that generates Rhai, or drop it?
   Recommendation: drop it. Rhai is readable enough.

4. **Platform API keys** — Twitch `platform.twitch.announce()` needs the Helix API
   (client credentials). Already have these in the auth system.
   YouTube announcements need the YouTube Data API — also already set up.
