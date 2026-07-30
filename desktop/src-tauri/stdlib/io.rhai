// io.rhai — data parsing and formatting utilities

/// Format a list of rows as a plain-text table.
/// headers: [String], rows: [[String]]
fn format_table(headers, rows) {
    let widths = [];
    for h in headers { widths.push(`${h}`.len()); }
    for row in rows {
        let c = 0;
        for cell in row {
            if c < widths.len() {
                let cl = `${cell}`.len();
                if cl > widths[c] { widths[c] = cl; }
            }
            c += 1;
        }
    }

    let out_rows = [];

    let cols = []; let c = 0;
    for h in headers {
        cols.push(pad_right(`${h}`, widths[c], " "));
        c += 1;
    }
    out_rows.push(cols.join("  "));

    let divs = [];
    for w in widths {
        let d = ""; let i = 0;
        while i < w { d += "-"; i += 1; }
        divs.push(d);
    }
    out_rows.push(divs.join("  "));

    for row in rows {
        let cols = []; let c = 0;
        for cell in row {
            cols.push(pad_right(`${cell}`, widths[c], " "));
            c += 1;
        }
        out_rows.push(cols.join("  "));
    }

    out_rows.join("\n")
}

/// Parse "key=value" pairs separated by `sep`. Values may contain "=".
/// Example: kv_parse("a=1,b=x=y", ",")  →  #{a: "1", b: "x=y"}
fn kv_parse(s, sep) {
    let result = #{};
    for part in s.split(sep) {
        let kv = part.split("=");
        if kv.len() < 2 { continue; }
        let k = kv[0].trim();
        if k == "" { continue; }
        let val_parts = []; let i = 1;
        while i < kv.len() { val_parts.push(kv[i]); i += 1; }
        result[k] = val_parts.join("=").trim();
    }
    result
}

/// Parse a URL query string. Example: query_parse("page=2&sort=asc")
fn query_parse(s) { kv_parse(s, "&") }

/// Split a delimited string and trim each part.
fn split_trim(s, sep) {
    let out = [];
    for p in s.split(sep) {
        let p = p.trim();
        if p != "" { out.push(p); }
    }
    out
}

/// Build a "key=value" string from a map.
fn kv_encode(map, sep) {
    let parts = [];
    for k in map.keys() { parts.push(`${k}=${map[k]}`); }
    parts.join(sep)
}

/// Return the first non-empty string from a list of candidates.
fn coalesce(candidates) {
    for c in candidates {
        let s = `${c}`.trim();
        if s != "" { return s; }
    }
    ""
}

/// Format a number with thousands separators.
/// Example: thousands(1234567) → "1,234,567"
fn thousands(n) {
    let s = `${n}`; let out = ""; let count = 0;
    let i = s.len() - 1;
    while i >= 0 {
        if count > 0 && count % 3 == 0 { out = "," + out; }
        out = s.sub_string(i, 1) + out;
        count += 1; i -= 1;
    }
    out
}

/// Wrap text at `width` characters, breaking on spaces.
fn word_wrap(s, width) {
    let words = s.split(" ");
    let lines = []; let line = "";
    for w in words {
        if w.len() == 0 { continue; }
        if line.len() == 0 {
            line = w;
        } else if line.len() + 1 + w.len() <= width {
            line += " " + w;
        } else {
            lines.push(line); line = w;
        }
    }
    if line.len() > 0 { lines.push(line); }
    lines.join("\n")
}
