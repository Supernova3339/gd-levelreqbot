use rhai::{Dynamic, Engine};
use std::sync::{Arc, Mutex};

fn rand_u64(seed_cell: &Arc<Mutex<u64>>) -> u64 {
    let mut s = seed_cell.lock().unwrap();
    // xorshift64
    *s ^= *s << 13;
    *s ^= *s >> 7;
    *s ^= *s << 17;
    *s
}

fn make_seed() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u64
        | 1
}

#[derive(Clone)]
pub struct RandProxy {
    seed: Arc<Mutex<u64>>,
}

impl RandProxy {
    pub fn new() -> Self {
        Self { seed: Arc::new(Mutex::new(make_seed())) }
    }
}

pub fn register(engine: &mut Engine) {
    engine.register_type_with_name::<RandProxy>("Rand");

    // rand.int(lo, hi) — random integer in [lo, hi)
    engine.register_fn("int", |r: &mut RandProxy, lo: i64, hi: i64| -> i64 {
        if lo >= hi { return lo; }
        lo + (rand_u64(&r.seed) % (hi - lo) as u64) as i64
    });

    // rand.float() — random float in [0.0, 1.0)
    engine.register_fn("float", |r: &mut RandProxy| -> f64 {
        rand_u64(&r.seed) as f64 / u64::MAX as f64
    });

    // rand.bool() — random boolean
    engine.register_fn("bool", |r: &mut RandProxy| -> bool {
        rand_u64(&r.seed) & 1 == 0
    });

    // rand.pick(items) — pick one element at random
    engine.register_fn("pick", |r: &mut RandProxy, items: Vec<Dynamic>| -> Dynamic {
        if items.is_empty() { return Dynamic::UNIT; }
        items[(rand_u64(&r.seed) % items.len() as u64) as usize].clone()
    });

    // rand.shuffle(items) — return a shuffled copy of the array
    engine.register_fn("shuffle", |r: &mut RandProxy, mut items: Vec<Dynamic>| -> Vec<Dynamic> {
        let n = items.len();
        for i in (1..n).rev() {
            let j = (rand_u64(&r.seed) % (i + 1) as u64) as usize;
            items.swap(i, j);
        }
        items
    });

    // rand.sample(items, n) — pick n unique elements (without replacement)
    engine.register_fn("sample", |r: &mut RandProxy, items: Vec<Dynamic>, n: i64| -> Vec<Dynamic> {
        let n = (n as usize).min(items.len());
        let mut indices: Vec<usize> = (0..items.len()).collect();
        for i in 0..n {
            let j = i + (rand_u64(&r.seed) % (items.len() - i) as u64) as usize;
            indices.swap(i, j);
        }
        indices[..n].iter().map(|&i| items[i].clone()).collect()
    });

    // rand.weighted_pick(items, weights) — pick based on relative weights
    engine.register_fn("weighted_pick", |r: &mut RandProxy, items: Vec<Dynamic>, weights: Vec<Dynamic>| -> Dynamic {
        if items.is_empty() { return Dynamic::UNIT; }
        let weights: Vec<f64> = weights.iter().map(|w| {
            w.clone().as_float().unwrap_or_else(|_| w.clone().as_int().map(|i| i as f64).unwrap_or(1.0))
        }).collect();
        let total: f64 = weights.iter().sum();
        if total <= 0.0 { return Dynamic::UNIT; }
        let mut target = (rand_u64(&r.seed) as f64 / u64::MAX as f64) * total;
        for (item, &w) in items.iter().zip(weights.iter()) {
            target -= w;
            if target <= 0.0 { return item.clone(); }
        }
        items.last().cloned().unwrap_or(Dynamic::UNIT)
    });

    // rand.seed(val) — seed the generator for reproducible results
    engine.register_fn("seed", |r: &mut RandProxy, val: i64| {
        *r.seed.lock().unwrap() = val as u64 | 1;
    });
}
