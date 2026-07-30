use std::env;
use std::fs;
use std::path::{Path, PathBuf};

/// build.mjs sets these env vars to point at generated artifacts. When absent
/// (plain `cargo check` / `cargo run` while developing the installer), stubs
/// are written so the crate still compiles — the binary then runs in forced
/// dry-run mode with a stand-in manifest.
fn main() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    embed("GDLQB_PAYLOAD", &out_dir.join("payload.bin"), b"");
    embed("GDLQB_MANIFEST", &out_dir.join("manifest.json"), b"{}");
    // 1x1 transparent PNG stub so include_bytes! + decode never panic.
    const PNG_STUB: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
        0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
        0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78,
        0x9C, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    embed("GDLQB_ICON_PNG", &out_dir.join("icon.png"), PNG_STUB);

    println!("cargo:rerun-if-env-changed=GDLQB_PAYLOAD");
    println!("cargo:rerun-if-env-changed=GDLQB_MANIFEST");
    println!("cargo:rerun-if-env-changed=GDLQB_ICON_PNG");

    // tauri-build requires frontendDist to exist; drop a placeholder so plain
    // `cargo check` works before the UI has ever been built.
    let ui_dist = Path::new("ui/dist");
    if !ui_dist.join("index.html").exists() {
        let _ = fs::create_dir_all(ui_dist);
        let _ = fs::write(
            ui_dist.join("index.html"),
            "<!DOCTYPE html><html lang=\"en\"><body>UI not built — run npm run build in ui/</body></html>",
        );
    }

    // Tauri: embeds the ui/dist assets, capabilities, and the exe icon from
    // tauri.conf.json (bundle.icon) — bundling itself stays disabled.
    tauri_build::build();
}

fn embed(var: &str, dest: &Path, stub: &[u8]) {
    match env::var(var) {
        Ok(src) if Path::new(&src).exists() => {
            println!("cargo:rerun-if-changed={src}");
            fs::copy(&src, dest).unwrap_or_else(|e| panic!("copy {src} -> {dest:?}: {e}"));
        }
        _ => fs::write(dest, stub).unwrap(),
    }
}
