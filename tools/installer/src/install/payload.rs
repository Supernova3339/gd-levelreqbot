//! Reading and extracting the embedded tar.gz payload.

use std::io::Cursor;
use std::path::Path;

use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};

use super::{InstallOptions, Progress};
use crate::manifest::{Manifest, PAYLOAD};

fn archive() -> tar::Archive<GzDecoder<Cursor<&'static [u8]>>> {
    tar::Archive::new(GzDecoder::new(Cursor::new(PAYLOAD)))
}

/// Relative paths of all file entries in the payload (used by dry runs and
/// for progress estimation).
pub fn list_entries() -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for entry in archive().entries().map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.header().entry_type().is_file() {
            let rel = entry.path().map_err(|e| e.to_string())?;
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(out)
}

/// Validate the embedded payload before anything touches the disk: verify
/// the archive checksum against the build-time manifest, then stream every
/// entry through the decompressor (gzip CRC + tar structure check).
pub fn validate(manifest: &Manifest, progress: Progress) -> Result<(), String> {
    progress(0.0, "Verifying installer integrity…");
    if let Some(expected) = &manifest.payload_sha256 {
        let mut h = Sha256::new();
        h.update(PAYLOAD);
        let got: String = h.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if got != *expected {
            return Err(
                "Installation files failed validation (checksum mismatch). \
                 The installer is corrupt or incomplete — please re-download it.".into(),
            );
        }
    }

    let total = archive()
        .entries()
        .map_err(|e| e.to_string())?
        .count()
        .max(1);
    for (i, entry) in archive().entries().map_err(|e| e.to_string())?.enumerate() {
        let mut entry = entry.map_err(|e| format!("Payload entry unreadable: {e}"))?;
        let rel = entry.path().map_err(|e| e.to_string())?.into_owned();
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        // Fully drain the entry so decompression errors surface here, not
        // halfway through extraction.
        std::io::copy(&mut entry, &mut std::io::sink())
            .map_err(|e| format!("Validation failed for {rel_str}: {e}"))?;
        progress((i + 1) as f32 / total as f32, &format!("Validated {rel_str}"));
    }
    Ok(())
}

/// Extract the payload into `dir`. Skips `cli/` when the CLI component was
/// not selected. Returns the files written (relative to `dir`).
pub fn extract(dir: &Path, opts: &InstallOptions, progress: Progress) -> Result<Vec<String>, String> {
    let total = archive()
        .entries()
        .map_err(|e| e.to_string())?
        .count()
        .max(1);

    let mut written = Vec::new();
    for (i, entry) in archive().entries().map_err(|e| e.to_string())?.enumerate() {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let rel = entry.path().map_err(|e| e.to_string())?.into_owned();
        let rel_str = rel.to_string_lossy().replace('\\', "/");

        if !opts.install_cli && is_cli_entry(&rel_str) {
            continue;
        }
        progress(i as f32 / total as f32, &rel_str);
        entry
            .unpack_in(dir)
            .map_err(|e| format!("Failed to extract {rel_str}: {e}"))?;
        if entry.header().entry_type().is_file() {
            written.push(rel_str);
        }
    }
    Ok(written)
}

pub fn is_cli_entry(rel: &str) -> bool {
    rel.starts_with("cli/") || rel.starts_with("./cli/")
}
