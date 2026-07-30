// WebSocket server — clients connect to receive bot events in real time.
// Start/stop is controlled via Tauri commands (see commands/ws.rs).
// Events arrive via the broadcast channel; event.emit() in scripts feeds it.

use anyhow::Result;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State as AxumState,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use serde::Deserialize;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
use tokio::sync::broadcast;
use tracing::{info, warn};

// ── Shared state ──────────────────────────────────────────────────────────────

pub struct WsState {
    /// Events from event.emit() arrive here; WS handlers subscribe to it.
    pub tx:      broadcast::Sender<String>,
    /// Live count of connected WebSocket clients.
    pub clients: Arc<AtomicUsize>,
    /// Handle to the running server task (None when stopped).
    task:        Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl WsState {
    pub fn new() -> Arc<Self> {
        let (tx, _) = broadcast::channel(512);
        Arc::new(Self {
            tx,
            clients: Arc::new(AtomicUsize::new(0)),
            task:    Mutex::new(None),
        })
    }

    pub fn client_count(&self) -> usize { self.clients.load(Ordering::Relaxed) }
    pub fn is_running(&self)   -> bool  { self.task.lock().unwrap().is_some() }

    pub fn start(self: &Arc<Self>, port: u16, secret: String) {
        let ws   = Arc::clone(self);
        let task = tokio::spawn(async move {
            if let Err(e) = run_server(port, secret, ws).await {
                warn!("WebSocket server error: {e}");
            }
        });
        *self.task.lock().unwrap() = Some(task);
        info!("WebSocket server started on port {port}");
    }

    pub fn stop(&self) {
        if let Some(h) = self.task.lock().unwrap().take() {
            h.abort();
            info!("WebSocket server stopped");
        }
    }
}

// ── Axum server ───────────────────────────────────────────────────────────────

#[derive(Clone)]
struct ServerState {
    ws:     Arc<WsState>,
    secret: String,
}

async fn run_server(port: u16, secret: String, ws: Arc<WsState>) -> Result<()> {
    let state = ServerState { ws, secret };
    let app   = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(state);

    let addr = format!("0.0.0.0:{port}");
    let listener = {
        let mut last_err = None;
        let mut result   = None;
        for attempt in 0..5u32 {
            match tokio::net::TcpListener::bind(&addr).await {
                Ok(l)  => { result = Some(l); break; }
                Err(e) => {
                    last_err = Some(e);
                    if attempt < 4 {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                }
            }
        }
        result.ok_or_else(|| anyhow::anyhow!(
            "WS server bind failed on {addr} after 5 attempts: {}. \
             Is another instance already running?",
            last_err.unwrap()
        ))?
    };

    axum::serve(listener, app).await.map_err(Into::into)
}

#[derive(Deserialize)]
struct WsQuery { token: Option<String> }

/// Constant-time byte comparison — deliberately doesn't short-circuit on the
/// first mismatch, so comparison time doesn't leak how many bytes matched.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() { return false; }
    a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

async fn ws_handler(
    ws:                  WebSocketUpgrade,
    AxumState(state):    AxumState<ServerState>,
    Query(q):            Query<WsQuery>,
) -> impl IntoResponse {
    // If a secret is configured, require it as a ?token= query param.
    // Compared in constant time — this gate gets attempted across a network
    // (OBS/companion-app source, LAN), so a naive != comparison would leak
    // timing information about how many leading bytes of the secret matched.
    if !state.secret.is_empty() {
        let matches = match q.token.as_deref() {
            Some(t) => constant_time_eq(t.as_bytes(), state.secret.as_bytes()),
            None    => false,
        };
        if !matches {
            return axum::response::Response::builder()
                .status(401)
                .body(axum::body::Body::from("Unauthorized"))
                .unwrap();
        }
    }
    ws.on_upgrade(move |socket| handle_socket(socket, state.ws))
        .into_response()
}

async fn handle_socket(mut socket: WebSocket, ws: Arc<WsState>) {
    ws.clients.fetch_add(1, Ordering::Relaxed);
    let mut rx = ws.tx.subscribe();

    loop {
        tokio::select! {
            event = rx.recv() => {
                match event {
                    Ok(text) => {
                        if socket.send(Message::Text(text)).await.is_err() { break; }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Ping(d))) => {
                        let _ = socket.send(Message::Pong(d)).await;
                    }
                    None | Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }

    ws.clients.fetch_sub(1, Ordering::Relaxed);
}
