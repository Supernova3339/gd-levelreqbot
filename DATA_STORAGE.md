# User Data Storage

Three tiers. Use the simplest one that fits.

---

## Tier 1 — `store` (key-value)

Already planned. Simple values, simple access. Good for counters,
per-user settings, flags.

```javascript
store.set("deaths", 42);
store.get("deaths");             // 42
store.get("deaths") ?? 0;       // with fallback
store.incr("deaths");            // atomic increment
store.delete("deaths");
store.keys("user.Bob.");         // list all keys starting with this prefix
```

Backed by a `kv_store` table in SQLite. Every value is a JSON blob,
so you can store anything: numbers, strings, arrays, objects.

```javascript
store.set("config", #{
    greeting: "Hello",
    max_requests: 3,
    tags: ["gd", "level-req"],
});
let cfg = store.get("config");
cfg.greeting;                    // "Hello"
```

**Use when:** You have a handful of named values with no complex querying.

---

## Tier 2 — `data` (document collections)

For structured data where you need to find, filter, and delete specific records.
Think of it like a simple database — collections of objects, each with an auto ID.

```javascript
// Insert a document into a named collection
data.insert("giveaway", #{
    username: user.name,
    weight:   if user.isSub() { 3 } else { 1 },
    entered:  time.now(),
});

// Find documents
data.find("giveaway", #{username: "Bob"})       // all docs where username = "Bob"
data.find_one("giveaway", #{username: "Bob"})   // first match, or ()
data.find_all("giveaway")                        // everything in the collection
data.where("giveaway", |doc| doc.weight > 1)    // filter with a function

// Count
data.count("giveaway")
data.count("giveaway", #{username: "Bob"})

// Update
data.update("giveaway", #{username: "Bob"}, #{weight: 5})

// Delete
data.delete("giveaway", #{username: "Bob"})
data.clear("giveaway")                           // wipe the whole collection

// Each document gets an auto-assigned _id and _created/_updated timestamps
let doc = data.find_one("giveaway", #{username: "Alice"});
doc._id;       // "a3f9b2c1"
doc._created;  // Unix timestamp
doc.username;  // "Alice"
```

Backed by a single `user_data` SQLite table, namespaced by collection name.
Collections are created automatically on first use — no schema definition needed.

```javascript
// Full giveaway example using data
fn enter_giveaway() {
    if data.find_one("giveaway", #{username: user.name}) != () {
        chat.reply("You're already entered!");
        return;
    }
    data.insert("giveaway", #{
        username: user.name,
        weight:   if user.isSub() { 3 } else { 1 },
    });
    chat.reply("You're in! Good luck.");
}

fn draw_winner() {
    if !user.isStaff() { chat.reply("Staff only."); return; }
    let entries = data.find_all("giveaway");
    if entries.len() == 0 { chat.say("Nobody entered!"); return; }
    let winner = rand.weighted(entries.map(|e| #{ value: e.username, weight: e.weight }));
    data.clear("giveaway");
    event.emit("giveaway_winner", #{ username: winner });
    chat.say(`🎉 @${winner} wins!`);
}
```

**Use when:** You have records you need to find, update, or delete individually.

---

## Tier 3 — `db` (raw SQL)

Full SQLite access. You own the tables, you write the SQL.
The bot's own tables are still there — don't drop them.

```javascript
// Create your own table (do this once, in a library's init function)
db.exec("
    CREATE TABLE IF NOT EXISTS donation_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        username   TEXT NOT NULL,
        amount     INTEGER NOT NULL,
        message    TEXT,
        created_at INTEGER NOT NULL
    )
", []);

// Insert
db.exec(
    "INSERT INTO donation_log (username, amount, message, created_at) VALUES (?, ?, ?, ?)",
    [user.name, 500, "PogChamp", time.now()]
);

// Query
let top = db.query("
    SELECT username, SUM(amount) AS total
    FROM donation_log
    GROUP BY username
    ORDER BY total DESC
    LIMIT 5
", []);

// top is an array of row objects
top.map(|r| `${r.username}: ${fmt.compact(r.total)}`).join(", ");

// One row
let user_total = db.query_one(
    "SELECT SUM(amount) AS total FROM donation_log WHERE username = ?",
    [user.name]
);
user_total.total ?? 0;
```

**Convention:** prefix your own tables with something unique (`mystream_`, `giveaway_`,
anything that won't clash with the bot's tables: `queue`, `config`, `bot_commands`,
`integrations`, `kv_store`, `user_data`).

**Use when:** You need joins, aggregation, indexes, or complex queries that
`data` can't express.

---

## Comparison

|                      | `store`             | `data`                     | `db`                            |
|----------------------|---------------------|----------------------------|---------------------------------|
| Best for             | Simple named values | Records you query by field | Complex structured data         |
| Schema               | None                | Auto, schema-free          | You define it                   |
| Find by field        | ❌ (keys only)       | ✅                          | ✅                               |
| Joins / aggregation  | ❌                   | ❌                          | ✅                               |
| Setup needed         | None                | None                       | `CREATE TABLE` once             |
| Risk of breaking bot | None                | None                       | Possible if you drop bot tables |

---

## Where the data actually lives

All three tiers use the same SQLite file (`data.db`).

```
data.db
├── queue             ← bot managed
├── config            ← bot managed
├── bot_commands      ← bot managed
├── integrations      ← bot managed
├── kv_store          ← store.get/set
├── user_data         ← data.insert/find/delete
└── your_table_name   ← db.exec (you own this)
```

No separate files or databases to manage. Backups get everything at once.
