// io.rhai — higher-level data I/O utilities (builds on io proxy + str stdlib)

/// Format a list of rows as a plain-text table.
/// headers: [String], rows: [[String]]
///
/// Example:
///   format_table(["Name", "Score"], [["Alice", "120"], ["Bob", "95"]])
fn format_table(headers, rows) {
    // Compute column widths
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

    // Header row
    let cols = []; let c = 0;
    for h in headers {
        cols.push(pad_right(`${h}`, widths[c], " "));
        c += 1;
    }
    out_rows.push(cols.join("  "));

    // Divider
    let divs = [];
    for w in widths {
        let d = ""; let i = 0;
        while i < w { d += "-"; i += 1; }
        divs.push(d);
    }
    out_rows.push(divs.join("  "));

    // Data rows
    for row in rows {
        let cols = []; let c = 0;
        for cell in row {
            let s = `${cell}`;
            cols.push(pad_right(s, widths[c], " "));
            c += 1;
        }
        out_rows.push(cols.join("  "));
    }

    out_rows.join("\n")
}

/// Parse "key=value" style pairs separated by `sep`.
/// Returns a map of key → value.  Values may contain "=".
///
/// Example: kv_parse("a=1,b=hello=world", ",")  →  #{a: "1", b: "hello=world"}
fn kv_parse(s, sep) {
    let result = #{};
    for part in io.split(s, sep) {
        let kv = io.split(part, "=");
        if kv.len() < 2 { continue; }
        let k = kv[0].trim();
        if k == "" { continue; }
        // Rejoin everything after the first "="
        let val_parts = []; let i = 1;
        while i < kv.len() { val_parts.push(kv[i]); i += 1; }
        result[k] = val_parts.join("=").trim();
    }
    result
}

/// Parse a URL query string into a map.
/// Example: query_parse("page=2&sort=asc")  →  #{page: "2", sort: "asc"}
fn query_parse(s) { kv_parse(s, "&") }
