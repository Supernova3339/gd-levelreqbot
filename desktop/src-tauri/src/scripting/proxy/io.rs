// io proxy — data format and parse utilities for scripts.
// Shared json_to_dynamic / dynamic_to_json are pub so web.rs can reuse them.
//
// io.parse_json(str)          → Dynamic    — JSON string → Rhai value
// io.encode_json(val)         → String     — Rhai value → JSON string
// io.encode_json_pretty(val)  → String     — pretty-printed JSON
// io.parse_int(str)           → i64 or ()  — parse integer, () on failure
// io.parse_float(str)         → f64 or ()  — parse float, () on failure
// io.csv_split(line)          → [String]   — split CSV respecting quoted fields
// io.split(str, sep)          → [String]   — split string by separator

use rhai::{Array, Dynamic, Engine, Map};
use serde_json::Value;

#[derive(Clone)]
pub struct IoProxy;

// ── Shared JSON ↔ Dynamic conversion ─────────────────────────────────────────

pub fn json_to_dynamic(val: Value) -> Dynamic {
    match val {
        Value::Null       => Dynamic::UNIT,
        Value::Bool(b)    => Dynamic::from(b),
        Value::Number(n)  => {
            if let Some(i) = n.as_i64()      { Dynamic::from(i) }
            else if let Some(f) = n.as_f64() { Dynamic::from(f) }
            else                              { Dynamic::UNIT }
        }
        Value::String(s)   => Dynamic::from(s),
        Value::Array(arr)  => Dynamic::from_array(arr.into_iter().map(json_to_dynamic).collect()),
        Value::Object(obj) => {
            let mut map = Map::new();
            for (k, v) in obj { map.insert(k.into(), json_to_dynamic(v)); }
            Dynamic::from_map(map)
        }
    }
}

pub fn dynamic_to_json(val: Dynamic) -> Value {
    if val.is_unit()          { return Value::Null; }
    if let Ok(b) = val.clone().as_bool()  { return Value::Bool(b); }
    if let Ok(i) = val.clone().as_int()   { return Value::Number(i.into()); }
    if let Ok(f) = val.clone().as_float() {
        return serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null);
    }
    if val.is_string() {
        let s: rhai::ImmutableString = val.cast();
        return Value::String(s.to_string());
    }
    if val.is_array() {
        let arr: Array = val.cast();
        return Value::Array(arr.into_iter().map(dynamic_to_json).collect());
    }
    if val.is_map() {
        let map: Map = val.cast();
        let obj: serde_json::Map<String, Value> = map
            .into_iter()
            .map(|(k, v)| (k.to_string(), dynamic_to_json(v)))
            .collect();
        return Value::Object(obj);
    }
    Value::String(val.to_string())
}

// ── CSV parser ────────────────────────────────────────────────────────────────

fn split_csv(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut cur    = String::new();
    let mut quoted = false;
    let mut chars  = line.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' if !quoted => quoted = true,
            '"' if quoted  => {
                if chars.peek() == Some(&'"') { chars.next(); cur.push('"'); }
                else { quoted = false; }
            }
            ',' if !quoted => { fields.push(cur.trim().to_string()); cur = String::new(); }
            _              => cur.push(c),
        }
    }
    fields.push(cur.trim().to_string());
    fields
}

// ── Registration ──────────────────────────────────────────────────────────────

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<IoProxy>("Io");

    engine.register_fn("parse_json", |_: &mut IoProxy, s: &str| -> Dynamic {
        match serde_json::from_str::<Value>(s) {
            Ok(v)  => json_to_dynamic(v),
            Err(_) => Dynamic::UNIT,
        }
    });

    engine.register_fn("encode_json", |_: &mut IoProxy, val: Dynamic| -> String {
        serde_json::to_string(&dynamic_to_json(val)).unwrap_or_else(|_| "null".to_string())
    });

    engine.register_fn("encode_json_pretty", |_: &mut IoProxy, val: Dynamic| -> String {
        serde_json::to_string_pretty(&dynamic_to_json(val)).unwrap_or_else(|_| "null".to_string())
    });

    engine.register_fn("parse_int", |_: &mut IoProxy, s: &str| -> Dynamic {
        match s.trim().parse::<i64>() {
            Ok(n)  => Dynamic::from(n),
            Err(_) => Dynamic::UNIT,
        }
    });

    engine.register_fn("parse_float", |_: &mut IoProxy, s: &str| -> Dynamic {
        match s.trim().parse::<f64>() {
            Ok(f)  => Dynamic::from(f),
            Err(_) => Dynamic::UNIT,
        }
    });

    engine.register_fn("csv_split", |_: &mut IoProxy, line: &str| -> Vec<Dynamic> {
        split_csv(line).into_iter().map(Dynamic::from).collect()
    });

    engine.register_fn("split", |_: &mut IoProxy, s: &str, sep: &str| -> Vec<Dynamic> {
        s.split(sep).map(|p| Dynamic::from(p.to_string())).collect()
    });
}
