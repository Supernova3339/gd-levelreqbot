fn main() {
    let target  = std::env::var("TARGET").unwrap_or_default();
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let ext     = if target.contains("windows") { ".exe" } else { "" };

    let src  = format!("target/{profile}/gdlqbcli{ext}");
    let dest = format!("binaries/gdlqbcli-{target}{ext}");

    std::fs::create_dir_all("binaries").ok();
    if std::path::Path::new(&src).exists() {
        // Real binary available (beforeDevCommand / beforeBuildCommand already ran).
        std::fs::copy(&src, &dest).ok();
    } else if !std::path::Path::new(&dest).exists() {
        // No binary yet (plain `cargo check` before any build commands).
        // Write a zero-byte stub so tauri_build's externalBin path check passes.
        // The stub is never bundled — release builds always overwrite it first.
        std::fs::write(&dest, b"").ok();
    }

    println!("cargo:rerun-if-changed={src}");
    tauri_build::build()
}
