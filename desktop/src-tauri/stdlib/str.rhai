// str.rhai — string utilities (wraps the io proxy for parsing; adds text helpers)

/// Parse a string to integer. Returns () if not a valid integer.
fn parse_int(s) { io.parse_int(`${s}`) }

/// Parse a string to float. Returns () if not a valid number.
fn parse_float(s) { io.parse_float(`${s}`) }

/// Returns true if the string can be parsed as a number.
fn is_number(s) {
    let s = `${s}`.trim();
    io.parse_int(s) != () || io.parse_float(s) != ()
}

/// Split a string into non-empty whitespace-separated words.
fn words(s) {
    let parts = io.split(s.trim(), " ");
    let out = [];
    for p in parts {
        let p = p.trim();
        if p != "" { out.push(p); }
    }
    out
}

/// Split a string into lines.
fn lines(s) { io.split(s, "\n") }

/// Left-pad a string to `width` characters using `ch`.
fn pad_left(s, width, ch) {
    let s = `${s}`; let n = width - s.len();
    if n <= 0 { return s; }
    let pad = ""; let i = 0;
    while i < n { pad += ch; i += 1; }
    pad + s
}

/// Right-pad a string to `width` characters using `ch`.
fn pad_right(s, width, ch) {
    let s = `${s}`; let n = width - s.len();
    if n <= 0 { return s; }
    let pad = ""; let i = 0;
    while i < n { pad += ch; i += 1; }
    s + pad
}

/// Truncate to `max_len` characters, appending "..." if cut.
fn truncate(s, max_len) {
    if s.len() <= max_len { return s; }
    let cut = if max_len > 3 { max_len - 3 } else { max_len };
    s.sub_string(0, cut) + "..."
}

/// Truncate with a custom suffix.
fn truncate_with(s, max_len, suffix) {
    if s.len() <= max_len { return s; }
    let cut = max_len - suffix.len();
    if cut <= 0 { return suffix; }
    s.sub_string(0, cut) + suffix
}

/// Repeat a string n times.
fn repeat(s, n) {
    let out = ""; let i = 0;
    while i < n { out += s; i += 1; }
    out
}
