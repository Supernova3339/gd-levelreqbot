//! File logger for silent mode — the exe has no console on Windows, so
//! `%TEMP%/<product>-setup.log` is the paper trail.

use std::io::Write;

use super::paths::setup_log_path;

pub struct Log {
    file: Option<std::fs::File>,
    pub echo: bool,
}

impl Log {
    pub fn new(product_slug: &str) -> Log {
        let path = setup_log_path(product_slug);
        Log {
            file: std::fs::OpenOptions::new().create(true).append(true).open(path).ok(),
            echo: true,
        }
    }

    pub fn line(&mut self, msg: &str) {
        if self.echo {
            println!("{msg}");
        }
        if let Some(f) = &mut self.file {
            let _ = writeln!(f, "[{}] {msg}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"));
        }
    }
}
