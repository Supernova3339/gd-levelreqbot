// arr.rhai — array utilities

fn page(items, pg, per_page) {
    let total = items.len();
    if total == 0 { return []; }
    let start = (pg - 1) * per_page;
    if start >= total { return []; }
    let end = if start + per_page > total { total } else { start + per_page };
    let out = []; let i = start;
    while i < end { out.push(items[i]); i += 1; }
    out
}

fn find(items, pred) {
    for item in items { if pred.call(item) { return item; } }
    ()
}

fn index_of(items, pred) {
    let i = 0;
    for item in items { if pred.call(item) { return i; } i += 1; }
    -1
}

fn unique(items) {
    let seen = #{}; let out = [];
    for item in items {
        let k = `${item}`;
        if !seen.contains(k) { seen[k] = true; out.push(item); }
    }
    out
}

fn partition(items, pred) {
    let yes = []; let no = [];
    for item in items { if pred.call(item) { yes.push(item); } else { no.push(item); } }
    [yes, no]
}

fn group_by(items, key_fn) {
    let map = #{};
    for item in items {
        let k = `${key_fn.call(item)}`;
        if !map.contains(k) { map[k] = []; }
        map[k].push(item);
    }
    map
}

fn chunk(items, size) {
    let out = []; let buf = []; let i = 0;
    for item in items {
        buf.push(item); i += 1;
        if i >= size { out.push(buf); buf = []; i = 0; }
    }
    if buf.len() > 0 { out.push(buf); }
    out
}

fn flatten(items) {
    let out = [];
    for item in items { for x in item { out.push(x); } }
    out
}

fn zip(a, b) {
    let out = []; let len = if a.len() < b.len() { a.len() } else { b.len() };
    let i = 0;
    while i < len { out.push([a[i], b[i]]); i += 1; }
    out
}

fn take(items, n) {
    let out = []; let i = 0;
    while i < n && i < items.len() { out.push(items[i]); i += 1; }
    out
}

fn skip(items, n) {
    let out = []; let i = n;
    while i < items.len() { out.push(items[i]); i += 1; }
    out
}

fn sort_by(items, key_fn) {
    let arr = items; let n = arr.len(); let i = 1;
    while i < n {
        let j = i;
        while j > 0 && key_fn.call(arr[j-1]) > key_fn.call(arr[j]) {
            let tmp = arr[j]; arr[j] = arr[j-1]; arr[j-1] = tmp;
            j -= 1;
        }
        i += 1;
    }
    arr
}

fn sort_by_desc(items, key_fn) {
    let arr = items; let n = arr.len(); let i = 1;
    while i < n {
        let j = i;
        while j > 0 && key_fn.call(arr[j-1]) < key_fn.call(arr[j]) {
            let tmp = arr[j]; arr[j] = arr[j-1]; arr[j-1] = tmp;
            j -= 1;
        }
        i += 1;
    }
    arr
}

fn first(items) {
    if items.len() == 0 { () } else { items[0] }
}

fn last(items) {
    if items.len() == 0 { () } else { items[items.len() - 1] }
}

fn sum(items) {
    let total = 0;
    for item in items { total += item; }
    total
}

fn min_by(items, key_fn) {
    if items.len() == 0 { return (); }
    let best = items[0]; let best_key = key_fn.call(best);
    let i = 1;
    while i < items.len() {
        let k = key_fn.call(items[i]);
        if k < best_key { best = items[i]; best_key = k; }
        i += 1;
    }
    best
}

fn max_by(items, key_fn) {
    if items.len() == 0 { return (); }
    let best = items[0]; let best_key = key_fn.call(best);
    let i = 1;
    while i < items.len() {
        let k = key_fn.call(items[i]);
        if k > best_key { best = items[i]; best_key = k; }
        i += 1;
    }
    best
}

fn count_by(items, pred) {
    let n = 0;
    for item in items { if pred.call(item) { n += 1; } }
    n
}

fn flat_map(items, fn) {
    let out = [];
    for item in items { for x in fn.call(item) { out.push(x); } }
    out
}

fn rotate(items, n) {
    let len = items.len();
    if len == 0 { return []; }
    let n = n % len;
    if n < 0 { n = n + len; }
    let out = [];
    let i = n;
    while i < len { out.push(items[i]); i += 1; }
    let i = 0;
    while i < n { out.push(items[i]); i += 1; }
    out
}
