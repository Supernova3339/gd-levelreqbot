# queue.list — full code breakdown

Tracing every layer from the command script down to the Rust primitive.
Nothing is hidden. Every function is editable.

---

## Layer 1 — the command script

What the streamer writes for `!list`:

```javascript
// !list command
let page = if args.len() > 0 { args[0].parse_int() ?? 1 } else { 1 };
queue.list(page);
```

That's it. The work happens in the library below.

---

## Layer 2 — `stdlib/queue.rhai`

```javascript
// stdlib/queue.rhai

fn list(page) {
    let page     = page ?? 1;
    let per_page = store.get("queue.list.per_page") ?? 6;

    // Raw query — returns array of row objects
    let all = db.query(
        "SELECT level_id, username, position, queue_type
         FROM queue
         ORDER BY queue_type DESC, position ASC",
        []
    );

    let total = all.len();

    if total == 0 {
        chat.say("The queue is empty!");
        return;
    }

    // Slice the array to get the current page
    let page_data = arr.page(all, page, per_page);

    // Format each entry as a string
    let lines = page_data.items.map(|row| {
        let tag = if row.queue_type == "subscriber" { "★" } else { "" };
        `${tag}#${row.position} ${row.level_id} (@${row.username})`
    });

    let summary = fmt.list_header(
        "Queue",
        page,
        page_data.total_pages,
        total
    );

    chat.say(`${summary}: ${lines.join(" · ")}`);
}
```

This function uses three things it doesn't define itself:

- `arr.page()` — pagination helper
- `fmt.list_header()` — header formatter
- `db.query()` — Rust primitive (the floor)

---

## Layer 3 — `stdlib/arr.rhai`

The array/data library. All the list manipulation lives here.

```javascript
// stdlib/arr.rhai
//
// Higher-level array operations.
// Rhai arrays already have .map() .filter() .len() .push() .sort() etc.
// This library adds things Rhai doesn't have built-in.

// ── Pagination ────────────────────────────────────────────────────────────────

// Slice an array to a specific page.
// Returns an object: #{ items, page, per_page, total, total_pages, has_prev, has_next }
fn page(items, page, per_page) {
    let total       = items.len();
    let total_pages = if total == 0 { 1 } else { (total + per_page - 1) / per_page };
    let page        = clamp(page, 1, total_pages);
    let start       = (page - 1) * per_page;
    let end         = min(start + per_page, total);

    // Extract the slice
    let slice = [];
    let i = start;
    while i < end {
        slice.push(items[i]);
        i += 1;
    }

    #{
        items:       slice,
        page:        page,
        per_page:    per_page,
        total:       total,
        total_pages: total_pages,
        has_prev:    page > 1,
        has_next:    page < total_pages,
    }
}

// ── Filtering & searching ─────────────────────────────────────────────────────

// First item matching a predicate, or ()
fn find(items, pred) {
    for item in items {
        if pred.call(item) { return item; }
    }
    ()
}

// Index of first match, or -1
fn index_of(items, pred) {
    let i = 0;
    for item in items {
        if pred.call(item) { return i; }
        i += 1;
    }
    -1
}

// Remove duplicates (compares by string representation)
fn unique(items) {
    let seen = #{};
    let out  = [];
    for item in items {
        let key = item.to_string();
        if !seen.contains(key) {
            seen[key] = true;
            out.push(item);
        }
    }
    out
}

// ── Grouping & partitioning ───────────────────────────────────────────────────

// Split into two arrays: [passing, failing]
fn partition(items, pred) {
    let yes = [];
    let no  = [];
    for item in items {
        if pred.call(item) { yes.push(item); } else { no.push(item); }
    }
    [yes, no]
}

// Group into a map keyed by the result of key_fn
// Returns #{ key: [items...], ... }
fn group_by(items, key_fn) {
    let groups = #{};
    for item in items {
        let k = key_fn.call(item).to_string();
        if !groups.contains(k) { groups[k] = []; }
        groups[k].push(item);
    }
    groups
}

// Split into chunks of size n
fn chunk(items, n) {
    let out   = [];
    let chunk = [];
    for item in items {
        chunk.push(item);
        if chunk.len() == n {
            out.push(chunk);
            chunk = [];
        }
    }
    if chunk.len() > 0 { out.push(chunk); }
    out
}

// ── Transforms ────────────────────────────────────────────────────────────────

// Flatten one level of nesting
fn flatten(items) {
    let out = [];
    for item in items {
        if type_of(item) == "array" {
            for inner in item { out.push(inner); }
        } else {
            out.push(item);
        }
    }
    out
}

// Zip two arrays together into array of pairs
fn zip(a, b) {
    let out = [];
    let len = min(a.len(), b.len());
    let i   = 0;
    while i < len {
        out.push([a[i], b[i]]);
        i += 1;
    }
    out
}

// Take first n items
fn take(items, n) {
    items.extract(0, min(n, items.len()))
}

// Skip first n items
fn skip(items, n) {
    let start = min(n, items.len());
    items.extract(start, items.len() - start)
}

// Sum a field across objects: arr.sum_by(rows, |r| r.count)
fn sum_by(items, fn) {
    let total = 0;
    for item in items { total += fn.call(item); }
    total
}

// ── Sorting ───────────────────────────────────────────────────────────────────

// Sort objects by a field value (ascending)
fn sort_by(items, key_fn) {
    // Rhai's built-in sort takes a comparison closure
    let sorted = items.clone();
    sorted.sort(|a, b| {
        let ka = key_fn.call(a);
        let kb = key_fn.call(b);
        if ka < kb { -1 } else if ka > kb { 1 } else { 0 }
    });
    sorted
}

fn sort_by_desc(items, key_fn) {
    let sorted = sort_by(items, key_fn);
    sorted.reverse();
    sorted
}
```

---

## Layer 4 — `stdlib/fmt.rhai`

The formatting library. Also fully editable.

```javascript
// stdlib/fmt.rhai

// "Queue [p.2/4 · 18 total]"
fn list_header(label, page, total_pages, total) {
    if total_pages <= 1 {
        `${label} [${total} total]`
    } else {
        `${label} [p.${page}/${total_pages} · ${total} total]`
    }
}

// 1234567 → "1.2M"
fn compact(n) {
    if      n >= 1_000_000 { `${round_1(n / 1_000_000.0)}M` }
    else if n >= 1_000     { `${round_1(n / 1_000.0)}K` }
    else                   { n.to_string() }
}

// ["a","b","c"] → "a, b, and c"
fn natural_list(items) {
    if items.len() == 0 { return ""; }
    if items.len() == 1 { return items[0].to_string(); }
    if items.len() == 2 { return `${items[0]} and ${items[1]}`; }
    let all   = items.clone();
    let last  = all.pop();
    `${all.join(", ")}, and ${last}`
}

// 3661 → "1h 1m 1s"
fn duration(secs) {
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    let parts = [];
    if h > 0 { parts.push(`${h}h`); }
    if m > 0 { parts.push(`${m}m`); }
    if s > 0 || parts.len() == 0 { parts.push(`${s}s`); }
    parts.join(" ")
}

// 1 → "1st", 2 → "2nd", 11 → "11th"
fn ordinal(n) {
    let suffix = if n % 100 >= 11 && n % 100 <= 13 {
        "th"
    } else {
        switch n % 10 {
            1 => "st",
            2 => "nd",
            3 => "rd",
            _ => "th",
        }
    };
    `${n}${suffix}`
}

// 0.742 → "74.2%"
fn percent(f) {
    `${math.round(f * 1000.0) / 10.0}%`
}

// 1048576 → "1 MB"
fn bytes(n) {
    if      n >= 1_073_741_824 { `${round_1(n / 1_073_741_824.0)} GB` }
    else if n >= 1_048_576     { `${round_1(n / 1_048_576.0)} MB` }
    else if n >= 1_024         { `${round_1(n / 1_024.0)} KB` }
    else                       { `${n} B` }
}

// internal
fn round_1(f) {
    math.round(f * 10.0) / 10.0
}
```

---

## Layer 5 — `db.query()` (Rust, the floor)

```rust
// This is the only thing written in Rust.
// Takes a SQL string and array of params, returns array of row objects.
// Users don't need to touch this.

db.query(
    "SELECT level_id, username, position, queue_type FROM queue ...",
    []
)
```

Returns an array of objects where each field is a column name.
Accessed as `row.level_id`, `row.username`, etc.

---

## The full call chain visualised

```
!list (command script)
  │
  └─ queue.list(page)                      [stdlib/queue.rhai]
       │
       ├─ db.query("SELECT ...", [])        [Rust primitive — the floor]
       │    └─ returns Array of row objects
       │
       ├─ arr.page(all, page, per_page)     [stdlib/arr.rhai]
       │    ├─ all.len()                   [built into Rhai]
       │    └─ items.extract(start, count) [built into Rhai]
       │
       ├─ page_data.items.map(|row| ...)   [built into Rhai]
       │
       ├─ lines.join(" · ")               [built into Rhai]
       │
       └─ fmt.list_header(...)             [stdlib/fmt.rhai]
            └─ returns formatted string
```

Every box except the Rust primitive is a `.rhai` file you can open and edit.

---

## What `arr.rhai` makes possible that wasn't possible before

Without `arr.rhai`, the queue library would have to manually implement
pagination, sorting, grouping every time. With it:

```javascript
// Show only subscriber queue entries
let subs = all.filter(|r| r.queue_type == "subscriber");

// Group by platform
let by_platform = arr.group_by(all, |r| r.platform);
// → #{ "twitch": [...], "youtube": [...] }

// Sort by something custom
let sorted = arr.sort_by(all, |r| r.position);

// Show entries 7-12 (page 2, 6 per page)
let p2 = arr.page(all, 2, 6);

// All level IDs as a flat list
let ids = all.map(|r| r.level_id).join(", ");
```

Any command script or library can use `arr.*` the same way.
