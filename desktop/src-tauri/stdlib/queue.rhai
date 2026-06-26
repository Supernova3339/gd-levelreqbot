// queue.rhai — full queue library wrapping the built-in `queue` proxy.

/// Add the level ID from the first argument to the queue.
fn add() {
    let id = if args.len() > 0 { args[0].trim() } else { "" };
    if id == "" { return "Please provide a level ID (3–9 digits)."; }
    queue.add(id)
}

/// Remove a level from the queue by ID (first arg).
/// Mods/broadcaster can remove any level; viewers can only remove their own.
fn remove() {
    let id = if args.len() > 0 { args[0].trim() } else { "" };
    if id == "" { return "Please provide a level ID to remove."; }
    queue.remove(id)
}

/// Pop the next level from the queue (respects sub-mode weighting).
fn next() { queue.next() }

/// Get a paginated list of queue entries.
/// page: 1-indexed. Returns array of maps: {level_id, username, position}.
fn list(pg) { queue.list(pg) }

/// Get the position of a level ID in the queue. Returns 0 if not found.
fn position(id) { queue.position(id) }

/// Clear the entire queue.
fn clear() { queue.clear() }

/// Return the number of entries in the queue.
fn size() { queue.size() }

/// Check if a level ID is already in the queue.
fn has(id) { queue.has(id) }

/// Get up to `limit` recent queue entries (returns first page with up to 6 items).
fn entries(limit) { queue.list(1) }

/// Return whether the queue is empty.
fn is_empty() { queue.size() == 0 }

/// Format one page of the queue for chat display.
/// "#1 12345678 (@alice) | #2 87654321 (@bob)"
fn format_page(pg) {
    let items = queue.list(pg);
    if items.len() == 0 { return "The queue is empty."; }
    let parts = [];
    for entry in items {
        parts.push(`#${entry.position} ${entry.level_id} (@${entry.username})`);
    }
    parts.join(" | ")
}

/// Return a short summary line for the queue.
fn summary() {
    let n = queue.size();
    if n == 0 { return "The queue is empty."; }
    if n == 1 { return "1 level in the queue."; }
    `${n} levels in the queue.`
}

/// Format a queue page with a header showing page/total info.
fn format_page_full(pg, per_page) {
    let total = queue.size();
    if total == 0 { return "The queue is empty."; }
    let total_pages = (total + per_page - 1) / per_page;
    let items = queue.list(pg);
    if items.len() == 0 { return `Queue is empty on page ${pg}.`; }
    let parts = [];
    for entry in items {
        parts.push(`#${entry.position} ${entry.level_id} (@${entry.username})`);
    }
    `[p.${pg}/${total_pages}] ${parts.join(" | ")} (${total} total)`
}
