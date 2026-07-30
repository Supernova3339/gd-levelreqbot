//! Best-effort system benchmark and network speed test, run at the very
//! start of a real install and surfaced as ordinary progress-log lines.
//! Purely informational: nothing here affects whether or how the install
//! proceeds, and any measurement that fails or times out just produces a
//! shorter message instead of an error.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::time::{Duration, Instant};

/// Busy-loop a fixed wall-clock budget and report how many million
/// iterations of cheap integer work we got through. Not a rigorous
/// benchmark suite — just enough to produce a rough, comparable number.
pub fn benchmark_cpu() -> String {
    let budget = Duration::from_millis(120);
    let start = Instant::now();
    let mut acc: u64 = 0xDEAD_BEEF_u64;
    let mut iters: u64 = 0;
    while start.elapsed() < budget {
        for _ in 0..10_000u32 {
            acc = acc.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
        }
        iters += 10_000;
    }
    // Keep the accumulator "used" so the optimizer can't fold the loop away.
    if acc == 0 {
        iters += 1;
    }
    let secs = start.elapsed().as_secs_f64().max(0.001);
    let mops = (iters as f64 / secs) / 1_000_000.0;
    format!("Benchmark: CPU ~{mops:.0}M ops/sec")
}

/// Write, then read back, a temporary file and report throughput. Uses
/// `dir` if it already exists (an update, or a directory created earlier
/// in this run), otherwise the system temp directory.
pub fn benchmark_disk(dir: &Path) -> String {
    let fallback = std::env::temp_dir();
    let target = if dir.exists() { dir } else { fallback.as_path() };
    let path = target.join(".gdlqb-install-benchmark.tmp");
    let payload = vec![0x42u8; 8 * 1024 * 1024]; // 8 MB

    let write_start = Instant::now();
    let wrote = std::fs::File::create(&path)
        .and_then(|mut f| f.write_all(&payload).and_then(|_| f.sync_all()));
    if wrote.is_err() {
        return "Benchmark: disk — couldn't measure (no write access here)".to_string();
    }
    let write_secs = write_start.elapsed().as_secs_f64().max(0.001);
    let write_mbps = (payload.len() as f64 / write_secs) / (1024.0 * 1024.0);

    let read_start = Instant::now();
    let read = std::fs::read(&path);
    let read_secs = read_start.elapsed().as_secs_f64().max(0.001);
    let _ = std::fs::remove_file(&path);

    match read {
        Ok(buf) => {
            let read_mbps = (buf.len() as f64 / read_secs) / (1024.0 * 1024.0);
            format!("Benchmark: disk {write_mbps:.0} MB/s write / {read_mbps:.0} MB/s read")
        }
        Err(_) => format!("Benchmark: disk {write_mbps:.0} MB/s write"),
    }
}

/// Quick, cheap connectivity probe against a couple of well-known, highly
/// available hosts, each given a short timeout. Exists so we can skip the
/// slower download-based speed test outright when there's clearly no
/// connection, rather than making the user sit through several seconds of
/// doomed connect/read timeouts for nothing.
pub fn has_network_connectivity() -> bool {
    const PROBES: &[(&str, u16)] = &[("1.1.1.1", 443), ("8.8.8.8", 443)];
    const PROBE_TIMEOUT: Duration = Duration::from_millis(800);

    PROBES.iter().any(|&(host, port)| {
        host.parse::<std::net::IpAddr>()
            .ok()
            .map(|ip| std::net::SocketAddr::new(ip, port))
            .and_then(|addr| TcpStream::connect_timeout(&addr, PROBE_TIMEOUT).ok())
            .is_some()
    })
}

/// Best-effort download-based throughput estimate over a plain HTTP
/// connection, capped at a few seconds. Skips itself entirely when
/// `has_network_connectivity` finds nothing reachable. Any other
/// failure — blocked, slow DNS, a dead test host — is swallowed and
/// reported as a skipped measurement rather than an install error.
pub fn speedtest_network() -> String {
    const HOST: &str = "ipv4.download.thinkbroadband.com";
    const PATH: &str = "/5MB.zip";
    const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
    const READ_CAP: Duration = Duration::from_secs(4);
    const MIN_USEFUL_BYTES: u64 = 256 * 1024;

    if !has_network_connectivity() {
        return "Network: skipped — no connection detected, install will continue offline".to_string();
    }

    let addr = match (HOST, 80u16).to_socket_addrs().ok().and_then(|mut a| a.next()) {
        Some(a) => a,
        None => return "Network: couldn't measure (no address resolved)".to_string(),
    };

    let connect_start = Instant::now();
    let mut stream = match TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT) {
        Ok(s) => s,
        Err(_) => return "Network: couldn't measure (offline or blocked)".to_string(),
    };
    let connect_ms = connect_start.elapsed().as_millis();

    if stream.set_read_timeout(Some(READ_CAP)).is_err() {
        return "Network: couldn't measure".to_string();
    }
    let request = format!(
        "GET {PATH} HTTP/1.1\r\nHost: {HOST}\r\nConnection: close\r\nUser-Agent: gdlqb-installer\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return "Network: couldn't measure (offline or blocked)".to_string();
    }

    let start = Instant::now();
    let mut buf = [0u8; 64 * 1024];
    let mut total: u64 = 0;
    loop {
        if start.elapsed() > READ_CAP {
            break;
        }
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => total += n as u64,
            Err(_) => break,
        }
    }
    let secs = start.elapsed().as_secs_f64().max(0.05);

    if total < MIN_USEFUL_BYTES {
        return "Network: couldn't measure (offline or blocked)".to_string();
    }
    let mbps = (total as f64 * 8.0 / secs) / 1_000_000.0;
    format!("Network: ~{mbps:.1} Mbps down, {connect_ms} ms to connect")
}
