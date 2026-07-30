use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use axum::{
    extract::{State as AxumState, WebSocketUpgrade},
    response::{Html, Response},
};
use axum::extract::ws::{Message, WebSocket};
use tauri::Manager;
use tokio::sync::broadcast;
use tracing::{info, warn};

use super::ApiState;

// ── Broadcast channel shared across all preview WS clients ───────────────────

pub struct PreviewBroadcast {
    tx:        broadcast::Sender<Arc<Vec<u8>>>,
    listeners: Arc<AtomicUsize>,
    /// Most recent encoded frame — sent to new subscribers immediately so they
    /// see the app right away even when the screen content is static (the
    /// capture loop skips unchanged frames).
    last_frame: std::sync::Mutex<Option<Arc<Vec<u8>>>>,
    /// Kicked by the input handler so the capture loop grabs a frame right
    /// after an interaction instead of waiting for the next timer tick.
    pub kick: tokio::sync::Notify,
}

impl PreviewBroadcast {
    pub fn new() -> Arc<Self> {
        let (tx, _) = broadcast::channel(2);
        Arc::new(Self {
            tx,
            listeners: Arc::new(AtomicUsize::new(0)),
            last_frame: std::sync::Mutex::new(None),
            kick: tokio::sync::Notify::new(),
        })
    }

    pub fn send_frame(&self, frame: Vec<u8>) {
        let frame = Arc::new(frame);
        *self.last_frame.lock().unwrap() = Some(Arc::clone(&frame));
        if self.listeners.load(Ordering::Relaxed) > 0 {
            let _ = self.tx.send(frame);
        }
    }

    fn cached_frame(&self) -> Option<Arc<Vec<u8>>> {
        self.last_frame.lock().unwrap().clone()
    }

    pub fn has_listeners(&self) -> bool {
        self.listeners.load(Ordering::Relaxed) > 0
    }

    fn subscribe(&self) -> broadcast::Receiver<Arc<Vec<u8>>> {
        self.listeners.fetch_add(1, Ordering::Relaxed);
        self.tx.subscribe()
    }

    fn unsubscribe(&self) {
        self.listeners.fetch_sub(1, Ordering::Relaxed);
    }
}

// ── Encode raw RGBA bytes → PNG ───────────────────────────────────────────────

/// JPEG is ~10x faster to encode than PNG and much smaller over the wire —
/// the preferred stream format. Alpha is dropped (screenshots are opaque).
pub fn encode_jpeg(width: u32, height: u32, rgba: Vec<u8>) -> Vec<u8> {
    use image::{DynamicImage, ImageBuffer, Rgba};
    let buf: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_raw(width, height, rgba)
            .unwrap_or_else(|| ImageBuffer::new(width, height));
    let rgb = DynamicImage::ImageRgba8(buf).to_rgb8();
    let mut out = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut out);
    let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, 82);
    enc.encode_image(&rgb).ok();
    drop(enc);
    drop(cursor);
    out
}

// ── Window capture via Win32 PrintWindow ─────────────────────────────────────
// BitBlt from the screen DC produces a black frame for GPU-accelerated windows
// (WebView2 / Chromium renders via DirectComposition, not GDI).
// PrintWindow with PW_RENDERFULLCONTENT asks DWM to composite all layers —
// including GPU surfaces — into our target DC, regardless of occlusion.
// windows-rs v0.61 doesn't wrap PrintWindow, so we declare it manually.

#[cfg(target_os = "windows")]
extern "system" {
    fn PrintWindow(
        hwnd:    windows::Win32::Foundation::HWND,
        hdc_blt: windows::Win32::Graphics::Gdi::HDC,
        n_flags: u32,
    ) -> i32; // win32 BOOL = i32; non-zero = success
}

// Find WebView2 child windows inside the Tauri parent by class-name prefix.
// "Chrome_WidgetWin" hosts the composited surface (used for capture);
// "Chrome_RenderWidgetHostHWND" is the descendant that receives input events.
// Declared manually like PrintWindow to avoid BOOL/LPARAM type issues in windows-rs 0.61.
#[cfg(target_os = "windows")]
extern "system" {
    fn EnumChildWindows(
        hwnd:   windows::Win32::Foundation::HWND,
        lpenfn: Option<unsafe extern "system" fn(windows::Win32::Foundation::HWND, isize) -> i32>,
        lparam: isize,
    ) -> i32;
    fn GetClassNameW(
        hwnd: windows::Win32::Foundation::HWND,
        lp:   *mut u16,
        nmax: i32,
    ) -> i32;
}

#[cfg(target_os = "windows")]
unsafe fn find_child_by_class(
    parent: windows::Win32::Foundation::HWND,
    prefix: &str,
) -> Option<windows::Win32::Foundation::HWND> {
    use windows::Win32::Foundation::HWND;

    struct State<'a> { found: HWND, prefix: &'a str }

    unsafe extern "system" fn cb(hwnd: HWND, lparam: isize) -> i32 {
        let state = &mut *(lparam as *mut State);
        let mut buf = [0u16; 256];
        let n = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if n > 0 && String::from_utf16_lossy(&buf[..n as usize]).starts_with(state.prefix) {
            state.found = hwnd;
            return 0; // stop enumeration
        }
        1
    }

    let mut st = State { found: HWND(std::ptr::null_mut()), prefix };
    // EnumChildWindows walks all descendants, not just direct children.
    EnumChildWindows(parent, Some(cb), &mut st as *mut State as isize);
    if st.found.0.is_null() { None } else { Some(st.found) }
}

#[cfg(target_os = "windows")]
unsafe fn find_webview2_hwnd(
    parent: windows::Win32::Foundation::HWND,
) -> Option<windows::Win32::Foundation::HWND> {
    find_child_by_class(parent, "Chrome_WidgetWin")
}

/// Longest edge of a streamed frame. The full window is rendered by
/// PrintWindow, then StretchBlt'ed down to this size before readback —
/// shrinking the pixel copy, hash, RGB conversion, and JPEG encode ~3-4x.
#[cfg(target_os = "windows")]
const STREAM_MAX_WIDTH: i32 = 1400;

/// Capture the webview as raw RGBA pixels, downscaled for streaming.
/// Returns (width, height, pixels). Encoding is left to the caller so it can
/// run on a blocking thread and be skipped when content hasn't changed.
#[cfg(target_os = "windows")]
pub fn capture_window_raw(hwnd: windows::Win32::Foundation::HWND) -> Option<(u32, u32, Vec<u8>)> {
    use std::mem;
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::{
        BI_RGB, BITMAPINFO, CreateCompatibleBitmap, CreateCompatibleDC,
        DeleteDC, DeleteObject, GetDC, GetDIBits, DIB_RGB_COLORS, HALFTONE,
        HGDIOBJ, ReleaseDC, SelectObject, SetStretchBltMode, SRCCOPY, StretchBlt,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetClientRect;

    // PW_RENDERFULLCONTENT — composite GPU / DirectComposition layers into the DC
    const PW_RENDERFULLCONTENT: u32 = 0x0000_0002;

    // Prefer the WebView2 child window so we capture only the webview content.
    let target = unsafe { find_webview2_hwnd(hwnd) }.unwrap_or(hwnd);

    unsafe {
        let mut rect = RECT::default();
        // GetClientRect gives left=0, top=0, right=w, bottom=h in client coords.
        if GetClientRect(target, &mut rect).is_err() { return None; }
        let w = rect.right;
        let h = rect.bottom;
        if w <= 0 || h <= 0 { return None; }

        // Output dimensions — downscale if wider than the stream cap
        let (tw, th) = if w > STREAM_MAX_WIDTH {
            (STREAM_MAX_WIDTH, (h * STREAM_MAX_WIDTH) / w)
        } else {
            (w, h)
        };
        if tw <= 0 || th <= 0 { return None; }

        // Need a screen-compatible DC to create bitmaps with the right pixel format.
        let hdc_screen = GetDC(None);
        if hdc_screen.0.is_null() { return None; }

        let hdc_full  = CreateCompatibleDC(Some(hdc_screen));
        let hbmp_full = CreateCompatibleBitmap(hdc_screen, w, h);
        let hdc_out   = CreateCompatibleDC(Some(hdc_screen));
        let hbmp_out  = CreateCompatibleBitmap(hdc_screen, tw, th);
        let _         = ReleaseDC(None, hdc_screen);

        if hdc_full.0.is_null() || hbmp_full.0.is_null()
            || hdc_out.0.is_null() || hbmp_out.0.is_null() {
            if !hdc_full.0.is_null()  { let _ = DeleteDC(hdc_full); }
            if !hbmp_full.0.is_null() { let _ = DeleteObject(HGDIOBJ(hbmp_full.0)); }
            if !hdc_out.0.is_null()   { let _ = DeleteDC(hdc_out); }
            if !hbmp_out.0.is_null()  { let _ = DeleteObject(HGDIOBJ(hbmp_out.0)); }
            return None;
        }

        let old_full = SelectObject(hdc_full, HGDIOBJ(hbmp_full.0));
        let old_out  = SelectObject(hdc_out,  HGDIOBJ(hbmp_out.0));

        let mut ok = PrintWindow(target, hdc_full, PW_RENDERFULLCONTENT) != 0;

        if ok && (tw != w || th != h) {
            // HALFTONE gives readable downscaled text (box filter)
            let _ = SetStretchBltMode(hdc_out, HALFTONE);
            ok = StretchBlt(
                hdc_out, 0, 0, tw, th,
                Some(hdc_full), 0, 0, w, h,
                SRCCOPY,
            ).as_bool();
        }
        // No downscale needed → read straight from the full bitmap
        let (read_dc, read_bmp) = if tw != w || th != h {
            (hdc_out, hbmp_out)
        } else {
            (hdc_full, hbmp_full)
        };

        let result = if ok {
            let mut bmi = BITMAPINFO::default();
            bmi.bmiHeader.biSize        = mem::size_of_val(&bmi.bmiHeader) as u32;
            bmi.bmiHeader.biWidth       = tw;
            bmi.bmiHeader.biHeight      = -th; // top-down
            bmi.bmiHeader.biPlanes      = 1;
            bmi.bmiHeader.biBitCount    = 32;
            bmi.bmiHeader.biCompression = BI_RGB.0;

            let mut pixels = vec![0u8; (tw * th * 4) as usize];
            GetDIBits(
                read_dc, read_bmp, 0, th as u32,
                Some(pixels.as_mut_ptr().cast()),
                &mut bmi, DIB_RGB_COLORS,
            );
            // Win32 gives BGRA → convert to RGBA for the encoder
            for c in pixels.chunks_exact_mut(4) { c.swap(0, 2); }
            Some((tw as u32, th as u32, pixels))
        } else {
            None
        };

        SelectObject(hdc_full, old_full);
        SelectObject(hdc_out,  old_out);
        let _ = DeleteObject(HGDIOBJ(hbmp_full.0));
        let _ = DeleteObject(HGDIOBJ(hbmp_out.0));
        let _ = DeleteDC(hdc_full);
        let _ = DeleteDC(hdc_out);

        result
    }
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

pub async fn preview_page() -> Html<&'static str> {
    Html(VIEWER_HTML)
}

pub async fn preview_stream(
    ws:               WebSocketUpgrade,
    AxumState(state): AxumState<ApiState>,
) -> Response {
    ws.on_upgrade(move |socket| push_frames(socket, state))
}

async fn push_frames(mut socket: WebSocket, state: ApiState) {
    let broadcast: Arc<PreviewBroadcast> = Arc::clone(
        state.app_handle.state::<Arc<PreviewBroadcast>>().inner()
    );
    let mut rx = broadcast.subscribe();
    info!("Preview WS client connected");

    // Show the latest frame immediately — the capture loop only broadcasts on
    // content change, which could otherwise leave a new client blank for a while.
    if let Some(frame) = broadcast.cached_frame() {
        if socket.send(Message::Binary((*frame).clone())).await.is_err() {
            broadcast.unsubscribe();
            return;
        }
    }

    loop {
        match rx.recv().await {
            Ok(frame) => {
                if socket.send(Message::Binary((*frame).clone())).await.is_err() {
                    break;
                }
            }
            Err(broadcast::error::RecvError::Lagged(n)) => {
                warn!("Preview client lagged {n} frames — skipping");
            }
            Err(_) => break,
        }
    }

    broadcast.unsubscribe();
    info!("Preview WS client disconnected");
}

// ── Input injection (WS /preview/input → synthesized DOM events) ─────────────
// The JCEF viewer forwards mouse/keyboard events as compact JSON. We eval
// `window.__gdlqPreviewInput(ev)` inside the app's own webview, where a small
// frontend bridge (src/lib/previewInput.ts) replays them as DOM events.
// This works regardless of focus/occlusion — Win32 message injection does not,
// because Chromium validates injected input against real cursor/key state.

// Coordinates are normalized fractions of the frame (0.0–1.0) so the stream
// resolution, window size, and DPI never have to agree between the three layers.
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(tag = "t")]
enum InputEvent {
    /// mk = MK_* button mask held during the move (enables dragging)
    #[serde(rename = "mm")] MouseMove { x: f32, y: f32, #[serde(default)] mk: u8 },
    #[serde(rename = "md")] MouseDown { x: f32, y: f32, b: u8 },
    #[serde(rename = "mu")] MouseUp   { x: f32, y: f32, b: u8 },
    /// d = raw wheel delta in browser pixels (positive = scroll down)
    #[serde(rename = "wh")] Wheel     { x: f32, y: f32, d: i32 },
    #[serde(rename = "kd")] KeyDown   { vk: u32 },
    #[serde(rename = "ku")] KeyUp     { vk: u32 },
    #[serde(rename = "ch")] Char      { c: u32 },
}

pub async fn preview_input(
    ws:               WebSocketUpgrade,
    AxumState(state): AxumState<ApiState>,
) -> Response {
    ws.on_upgrade(move |socket| receive_input(socket, state))
}

async fn receive_input(mut socket: WebSocket, state: ApiState) {
    info!("Preview input client connected");
    while let Some(Ok(msg)) = socket.recv().await {
        if let Message::Text(txt) = msg {
            // Parse for validation, re-serialize so only well-formed events reach eval
            let Ok(ev) = serde_json::from_str::<InputEvent>(&txt) else { continue };
            let Ok(json) = serde_json::to_string(&ev) else { continue };
            if let Some(win) = state.app_handle.get_webview_window("main") {
                let _ = win.eval(&format!(
                    "window.__gdlqPreviewInput&&window.__gdlqPreviewInput({json})"
                ));
                // Wake the capture loop so the visual result streams back ASAP
                let bc: tauri::State<Arc<PreviewBroadcast>> = state.app_handle.state();
                bc.kick.notify_one();
            }
        }
    }
    info!("Preview input client disconnected");
}


// ── Viewer HTML (served at GET /preview) ─────────────────────────────────────

const VIEWER_HTML: &str = r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GDLQBot Preview</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    height: 100%; width: 100%; overflow: hidden;
    background: #0a0a0a; color: #ccc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  body { display: flex; flex-direction: column; }

  #bar {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 12px;
    background: #0d0d0d;
    border-bottom: 1px solid #1c1c1c;
    flex-shrink: 0;
    font-size: 11px; color: #555;
    user-select: none;
    transition: opacity 0.35s ease;
  }
  #dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #2a2a2a; flex-shrink: 0;
    transition: background 0.3s;
  }
  #dot.ok   { background: #4ade80; box-shadow: 0 0 6px #4ade8088; }
  #dot.err  { background: #f87171; }
  #dot.wait { background: #facc15; }

  #wrap { flex: 1; overflow: hidden; position: relative; }

  #frame {
    display: none;
    width: 100%; height: 100%;
    object-fit: contain;
    object-position: center top;
  }

  #empty {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 12px; color: #2a2a2a;
  }
  #empty p { font-size: 12px; text-align: center; line-height: 1.6; max-width: 240px; }
</style>
</head>
<body>
<div id="bar">
  <div id="dot" class="wait"></div>
  <span id="msg">Connecting to GDLQBot…</span>
</div>
<div id="wrap">
  <img id="frame" alt="Live preview"/>
  <div id="empty">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
         stroke="#1e1e1e" stroke-width="1.2" stroke-linecap="round">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
    <p>Open GDLQBot and navigate to a module.<br>It will appear here as a live stream.</p>
  </div>
</div>
<script>
  const bar   = document.getElementById('bar');
  const dot   = document.getElementById('dot');
  const msg   = document.getElementById('msg');
  const frame = document.getElementById('frame');
  const empty = document.getElementById('empty');
  let prevUrl = null;
  let retryMs = 1000;
  let hideTimer = null;

  function showBar() {
    clearTimeout(hideTimer);
    hideTimer = null;
    bar.style.display = '';
    // tick so display:flex registers before we restore opacity
    requestAnimationFrame(() => { bar.style.opacity = ''; });
  }

  function scheduleHideBar() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      bar.style.opacity = '0';
      // after fade completes, pull it out of layout so the frame fills the panel
      setTimeout(() => { bar.style.display = 'none'; }, 380);
    }, 2000);
  }

  function connect() {
    const ws = new WebSocket('ws://localhost:24363/preview/stream');
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      dot.className = 'ok';
      msg.textContent = 'Connected — streaming GDLQBot';
      retryMs = 1000;
      scheduleHideBar();
    };

    ws.onmessage = ({ data }) => {
      const blob = new Blob([data], { type: 'image/jpeg' });
      const url  = URL.createObjectURL(blob);
      frame.onload = () => {
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        prevUrl = url;
        frame.style.display = 'block';
        empty.style.display = 'none';
      };
      frame.src = url;
    };

    ws.onclose = () => {
      showBar();
      dot.className = 'err';
      msg.textContent = 'GDLQBot disconnected — retrying in ' + (retryMs / 1000).toFixed(0) + 's…';
      frame.style.display = 'none';
      empty.style.display = '';
      setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 1.5, 10000);
    };

    ws.onerror = () => {
      showBar();
      dot.className = 'err';
      msg.textContent = 'GDLQBot not running…';
    };
  }

  connect();

  // ── Mini-RDP input client: mouse/keyboard on the frame → app window ───────
  let inputWs = null;

  function connectInput() {
    const ws = new WebSocket('ws://localhost:24363/preview/input');
    ws.onopen  = () => { inputWs = ws; };
    ws.onclose = () => { inputWs = null; setTimeout(connectInput, 2000); };
    ws.onerror = () => {};
  }
  connectInput();

  function send(o) {
    if (inputWs && inputWs.readyState === 1) inputWs.send(JSON.stringify(o));
  }

  // Map a mouse event on the (letterboxed, object-fit: contain) img to
  // normalized frame coordinates (0..1) — resolution/DPI independent.
  // clampToFrame=true keeps drags alive when the cursor leaves the image
  // bounds (like a real RDP client).
  function mapPoint(e, clampToFrame) {
    const r  = frame.getBoundingClientRect();
    const nw = frame.naturalWidth, nh = frame.naturalHeight;
    if (!nw || !nh || !r.width || !r.height) return null;
    const scale = Math.min(r.width / nw, r.height / nh);
    const ox = (r.width - nw * scale) / 2; // object-position: center top → x centered, y at top
    let x = (e.clientX - r.left - ox) / (nw * scale);
    let y = (e.clientY - r.top) / (nh * scale);
    if (clampToFrame) {
      x = Math.max(0, Math.min(0.9999, x));
      y = Math.max(0, Math.min(0.9999, y));
    } else if (x < 0 || y < 0 || x >= 1 || y >= 1) {
      return null;
    }
    return { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
  }

  // Button state: JS button index → MK_* mask bit
  const MK = [0x01, 0x10, 0x02]; // left, middle, right
  let buttonMask = 0;

  // Coalesce high-frequency events: only the latest mousemove and the summed
  // wheel delta are sent, at most every 16ms (~60/s). Clicks flush pending
  // state first so ordering is preserved.
  let pendingMove = null;
  let pendingWheel = null;

  function flushPending() {
    if (pendingMove)  { send(pendingMove);  pendingMove = null; }
    if (pendingWheel) { send(pendingWheel); pendingWheel = null; }
  }
  setInterval(flushPending, 16);

  frame.draggable = false;
  frame.style.cursor = 'default';

  frame.addEventListener('mousedown', e => {
    e.preventDefault();
    const p = mapPoint(e, false);
    if (!p) return;
    flushPending();
    buttonMask |= MK[e.button] || 0;
    send({ t: 'md', ...p, b: e.button });
  });

  // Listen on window so drags keep tracking outside the image
  window.addEventListener('mousemove', e => {
    const dragging = buttonMask !== 0;
    const p = mapPoint(e, dragging);
    if (p) pendingMove = { t: 'mm', ...p, mk: buttonMask };
  });

  window.addEventListener('mouseup', e => {
    if (!(buttonMask & (MK[e.button] || 0))) return;
    flushPending();
    buttonMask &= ~(MK[e.button] || 0);
    const p = mapPoint(e, true);
    if (p) send({ t: 'mu', ...p, b: e.button });
  });

  frame.addEventListener('contextmenu', e => e.preventDefault());

  frame.addEventListener('wheel', e => {
    e.preventDefault();
    const p = mapPoint(e, false);
    if (!p) return;
    if (pendingWheel) pendingWheel.d += Math.round(e.deltaY);
    else pendingWheel = { t: 'wh', ...p, d: Math.round(e.deltaY) };
  }, { passive: false });

  // ── Keyboard: full VK mapping from e.code, real down/up pairs ─────────────
  // Modifiers are forwarded too; Chromium tracks its own modifier state from
  // the key events it receives, so Shift+arrows / typed symbols mostly work.
  const VK_BY_CODE = (() => {
    const m = {
      Enter: 13, Backspace: 8, Tab: 9, Escape: 27, Space: 32, Delete: 46,
      ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
      Home: 36, End: 35, PageUp: 33, PageDown: 34, Insert: 45,
      ShiftLeft: 16, ShiftRight: 16, ControlLeft: 17, ControlRight: 17,
      AltLeft: 18, AltRight: 18, CapsLock: 20,
      Minus: 189, Equal: 187, BracketLeft: 219, BracketRight: 221,
      Backslash: 220, Semicolon: 186, Quote: 222, Backquote: 192,
      Comma: 188, Period: 190, Slash: 191,
    };
    for (let i = 0; i < 26; i++) m['Key' + String.fromCharCode(65 + i)] = 65 + i;
    for (let i = 0; i < 10; i++) { m['Digit' + i] = 48 + i; m['Numpad' + i] = 96 + i; }
    for (let i = 1; i <= 12; i++) m['F' + i] = 111 + i;
    return m;
  })();

  window.addEventListener('keydown', e => {
    if (!inputWs) return;
    const vk = VK_BY_CODE[e.code];
    if (vk !== undefined) send({ t: 'kd', vk });
    // Printable characters also need WM_CHAR for text input
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      send({ t: 'ch', c: e.key.codePointAt(0) });
    }
    if (vk !== undefined || e.key.length === 1) e.preventDefault();
  });

  window.addEventListener('keyup', e => {
    if (!inputWs) return;
    const vk = VK_BY_CODE[e.code];
    if (vk !== undefined) { send({ t: 'ku', vk }); e.preventDefault(); }
  });
</script>
</body>
</html>
"##;
