use std::collections::VecDeque;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Emitter};
use tracing::debug;

pub struct DevLogger {
    pub enabled: AtomicBool,
    buffer: Mutex<VecDeque<String>>,
    app: AppHandle,
}

impl DevLogger {
    pub fn new(app: AppHandle) -> Arc<Self> {
        Arc::new(Self {
            enabled: AtomicBool::new(false),
            buffer: Mutex::new(VecDeque::with_capacity(500)),
            app,
        })
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    pub fn log(&self, msg: impl Into<String>) {
        if !self.is_enabled() {
            return;
        }
        let s: String = msg.into();
        debug!("[dev] {s}");
        {
            let mut buf = self.buffer.lock().unwrap();
            if buf.len() >= 500 {
                buf.pop_front();
            }
            buf.push_back(s.clone());
        }
        self.app.emit("dev-log", s).ok();
    }

    pub fn get_logs(&self) -> Vec<String> {
        self.buffer.lock().unwrap().iter().cloned().collect()
    }

    pub fn clear(&self) {
        self.buffer.lock().unwrap().clear();
    }
}
