// counter.rhai — named persistent counters backed by the store proxy

/// Increment counter by 1, return new value.
fn inc(name) { store.incr(`counter:${name}`) }

/// Increment counter by a specific amount, return new value.
fn inc_by(name, amount) { store.incr_by(`counter:${name}`, amount) }

/// Decrement counter by 1, return new value.
fn decr(name) { store.decr(`counter:${name}`) }

/// Decrement counter by a specific amount, return new value.
fn decr_by(name, amount) { store.decr_by(`counter:${name}`, amount) }

/// Get the current value of a counter (0 if not set).
fn get(name) {
    let v = store.get(`counter:${name}`);
    if v == () { 0 } else { v }
}

/// Set a counter to a specific value.
fn set(name, val) { store.set(`counter:${name}`, val); val }

/// Reset a counter to 0.
fn reset(name) { store.set(`counter:${name}`, 0); 0 }

/// Clamp counter so it never goes below `floor`. Increments by 1.
fn inc_clamped(name, floor) {
    let v = get(name) + 1;
    if v < floor { v = floor; }
    set(name, v);
    v
}

/// Clamp counter so it never exceeds `cap`. Increments by 1.
fn inc_capped(name, cap) {
    let v = get(name) + 1;
    if v > cap { v = cap; }
    set(name, v);
    v
}

/// Format counter value using a template string.
/// Placeholders: {value} and {name}.
fn format(name, template) {
    let v = get(name);
    template
        .replace("{value}", `${v}`)
        .replace("{name}", name)
}
