// fmt.rhai — formatting utilities

fn compact(n) {
    if n >= 1000000 {
        let m = (n / 100000).to_float() / 10.0;
        return `${m}M`;
    }
    if n >= 1000 {
        let k = (n / 100).to_float() / 10.0;
        return `${k}K`;
    }
    `${n}`
}

fn duration(secs) {
    let s = secs;
    if s < 60 { return `${s}s`; }
    if s < 3600 {
        let m = s / 60; let r = s % 60;
        if r == 0 { return `${m}m`; }
        return `${m}m ${r}s`;
    }
    let h = s / 3600; let m = (s % 3600) / 60;
    if m == 0 { return `${h}h`; }
    `${h}h ${m}m`
}

fn ordinal(n) {
    let suffix = "th";
    let mod10 = n % 10; let mod100 = n % 100;
    if mod100 < 11 || mod100 > 13 {
        if mod10 == 1 { suffix = "st"; }
        else if mod10 == 2 { suffix = "nd"; }
        else if mod10 == 3 { suffix = "rd"; }
    }
    `${n}${suffix}`
}

fn percent(f) {
    let p = (f * 100.0).floor();
    `${p}%`
}

fn percent_of(part, total) {
    if total == 0 { return "0%"; }
    let p = ((part.to_float() / total.to_float()) * 100.0).floor();
    `${p}%`
}

fn bytes(n) {
    if n >= 1073741824 {
        let g = (n / 107374182).to_float() / 10.0;
        return `${g} GB`;
    }
    if n >= 1048576 {
        let m = (n / 104858).to_float() / 10.0;
        return `${m} MB`;
    }
    if n >= 1024 {
        let k = (n / 102).to_float() / 10.0;
        return `${k} KB`;
    }
    `${n} B`
}

fn natural_list(items) {
    let n = items.len();
    if n == 0 { return ""; }
    if n == 1 { return `${items[0]}`; }
    if n == 2 { return `${items[0]} and ${items[1]}`; }
    let out = ""; let i = 0;
    while i < n - 1 { out += `${items[i]}, `; i += 1; }
    out += `and ${items[n-1]}`;
    out
}

fn list_header(label, pg, total_pages, total) {
    `${label} — page ${pg}/${total_pages} (${total} total)`
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

fn title_case(s) {
    let words = s.split(" ");
    let out = [];
    for w in words {
        if w.len() == 0 { continue; }
        let first = w.sub_string(0, 1).to_upper();
        let rest  = if w.len() > 1 { w.sub_string(1) } else { "" };
        out.push(first + rest);
    }
    out.join(" ")
}

fn upper_first(s) {
    if s.len() == 0 { return s; }
    s.sub_string(0, 1).to_upper() + if s.len() > 1 { s.sub_string(1) } else { "" }
}

fn zero_pad(n, width) {
    pad_left(`${n}`, width, "0")
}

fn sign_str(n) {
    if n > 0 { `+${n}` } else { `${n}` }
}

fn pluralize(n, singular, plural) {
    if n == 1 { `${n} ${singular}` } else { `${n} ${plural}` }
}

fn currency(n, symbol) {
    let whole = n / 100; let cents = n % 100;
    let cents_str = if cents < 10 { `0${cents}` } else { `${cents}` };
    `${symbol}${whole}.${cents_str}`
}
