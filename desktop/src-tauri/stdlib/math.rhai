// math.rhai — mathematical utilities (pure Rhai, builds on Rhai built-ins)

fn clamp(val, lo, hi) {
    if val < lo { lo } else if val > hi { hi } else { val }
}

fn lerp(a, b, t) {
    a.to_float() + (b.to_float() - a.to_float()) * t.to_float()
}

fn inv_lerp(a, b, val) {
    let range = b.to_float() - a.to_float();
    if range == 0.0 { return 0.0; }
    (val.to_float() - a.to_float()) / range
}

fn map_range(val, from_lo, from_hi, to_lo, to_hi) {
    let t = inv_lerp(from_lo, from_hi, val);
    lerp(to_lo, to_hi, t)
}

fn in_range(val, lo, hi) { val >= lo && val <= hi }

fn round_to(n, places) {
    let factor = 1.0; let i = 0;
    while i < places { factor *= 10.0; i += 1; }
    (n.to_float() * factor).round() / factor
}

fn snap(val, step) {
    let s = step.to_float();
    if s == 0.0 { return val.to_float(); }
    (val.to_float() / s).round() * s
}

fn average(items) {
    if items.len() == 0 { return 0.0; }
    let total = 0.0;
    for x in items { total += x.to_float(); }
    total / items.len().to_float()
}

fn median(items) {
    if items.len() == 0 { return 0.0; }
    let sorted = items;
    let n = sorted.len(); let i = 1;
    while i < n {
        let j = i;
        while j > 0 && sorted[j-1] > sorted[j] {
            let tmp = sorted[j]; sorted[j] = sorted[j-1]; sorted[j-1] = tmp; j -= 1;
        }
        i += 1;
    }
    let mid = n / 2;
    if n % 2 == 0 {
        (sorted[mid - 1].to_float() + sorted[mid].to_float()) / 2.0
    } else {
        sorted[mid].to_float()
    }
}

fn variance(items) {
    if items.len() < 2 { return 0.0; }
    let avg = average(items);
    let sum = 0.0;
    for x in items {
        let d = x.to_float() - avg;
        sum += d * d;
    }
    sum / items.len().to_float()
}

fn std_dev(items) {
    variance(items).sqrt()
}

fn gcd(a, b) {
    let a = abs(a); let b = abs(b);
    while b != 0 { let t = b; b = a % b; a = t; }
    a
}

fn lcm(a, b) {
    if a == 0 || b == 0 { return 0; }
    abs(a / gcd(a, b) * b)
}

fn factorial(n) {
    if n <= 1 { return 1; }
    let r = 1; let i = 2;
    while i <= n { r *= i; i += 1; }
    r
}

fn pow_int(base, exp) {
    if exp == 0 { return 1; }
    let r = 1; let i = 0;
    while i < exp { r *= base; i += 1; }
    r
}

fn sign(n) {
    if n > 0 { 1 } else if n < 0 { -1 } else { 0 }
}

fn abs(n) {
    if n < 0 { -n } else { n }
}

fn max_val(a, b) { if a > b { a } else { b } }
fn min_val(a, b) { if a < b { a } else { b } }

fn sum_range(lo, hi) {
    let n = hi - lo + 1;
    if n <= 0 { return 0; }
    n * (lo + hi) / 2
}

fn is_even(n) { n % 2 == 0 }
fn is_odd(n)  { n % 2 != 0 }

fn percentage(part, total) {
    if total == 0 { return 0.0; }
    (part.to_float() / total.to_float()) * 100.0
}
