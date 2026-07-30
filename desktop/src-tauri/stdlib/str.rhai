// str.rhai — string utilities

fn words(s) {
    let parts = s.trim().split(" ");
    let out = [];
    for p in parts {
        let p = p.trim();
        if p != "" { out.push(p); }
    }
    out
}

fn lines(s) {
    s.split("\n")
}

fn pad_left(s, width, ch) {
    let s = `${s}`; let n = width - s.len();
    if n <= 0 { return s; }
    let pad = ""; let i = 0;
    while i < n { pad += ch; i += 1; }
    pad + s
}

fn pad_right(s, width, ch) {
    let s = `${s}`; let n = width - s.len();
    if n <= 0 { return s; }
    let pad = ""; let i = 0;
    while i < n { pad += ch; i += 1; }
    s + pad
}

fn truncate(s, max_len) {
    if s.len() <= max_len { return s; }
    let cut = if max_len > 3 { max_len - 3 } else { max_len };
    s.sub_string(0, cut) + "..."
}

fn truncate_with(s, max_len, suffix) {
    if s.len() <= max_len { return s; }
    let cut = max_len - suffix.len();
    if cut <= 0 { return suffix; }
    s.sub_string(0, cut) + suffix
}

fn repeat(s, n) {
    let out = ""; let i = 0;
    while i < n { out += s; i += 1; }
    out
}

fn count_occurrences(s, sub) {
    if sub.len() == 0 { return 0; }
    let count = 0;
    let parts = s.split(sub);
    parts.len() - 1
}

fn capitalize(s) {
    if s.len() == 0 { return s; }
    s.sub_string(0, 1).to_upper() + s.sub_string(1).to_lower()
}

fn reverse_str(s) {
    let chars = s.chars();
    let out = ""; let i = chars.len() - 1;
    while i >= 0 { out += chars[i]; i -= 1; }
    out
}

fn starts_with_any(s, prefixes) {
    for p in prefixes { if s.starts_with(p) { return true; } }
    false
}

fn ends_with_any(s, suffixes) {
    for suf in suffixes { if s.ends_with(suf) { return true; } }
    false
}

fn strip_prefix(s, prefix) {
    if s.starts_with(prefix) { s.sub_string(prefix.len()) } else { s }
}

fn strip_suffix(s, suffix) {
    if s.ends_with(suffix) { s.sub_string(0, s.len() - suffix.len()) } else { s }
}

fn indent(s, prefix) {
    let ls = s.split("\n");
    let out = [];
    for l in ls { out.push(prefix + l); }
    out.join("\n")
}

fn is_blank(s) {
    s.trim().len() == 0
}

fn between(s, open, close) {
    let start = s.index_of(open);
    if start < 0 { return ""; }
    let inner_start = start + open.len();
    let end = s.index_of(close);
    if end <= inner_start { return ""; }
    s.sub_string(inner_start, end - inner_start)
}

fn center(s, width, ch) {
    let s = `${s}`; let gap = width - s.len();
    if gap <= 0 { return s; }
    let left = gap / 2; let right = gap - left;
    let l = ""; let i = 0; while i < left  { l += ch; i += 1; }
    let r = ""; let i = 0; while i < right { r += ch; i += 1; }
    l + s + r
}
