use anyhow::{bail, Context, Result};
use clap::ValueEnum;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    io::Write,
    path::{Path, PathBuf},
    time::SystemTime,
};
use zip::{write::FileOptions, CompressionMethod, ZipWriter};

// ── Terminal colours ──────────────────────────────────────────────────────────

const GREEN:  &str = "\x1b[92m";
const YELLOW: &str = "\x1b[93m";
const RED:    &str = "\x1b[91m";
const CYAN:   &str = "\x1b[96m";
const BOLD:   &str = "\x1b[1m";
const RESET:  &str = "\x1b[0m";

fn ok(msg: &str)   { println!("  {GREEN}ok{RESET}   {msg}"); }
fn warn(msg: &str)  { println!("  {YELLOW}warn{RESET} {msg}"); }
fn err(msg: &str)   { println!("  {RED}ERR{RESET}  {msg}"); }
fn head(msg: &str)  { println!("\n{BOLD}{CYAN}{msg}{RESET}"); }

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Clone, Debug, ValueEnum)]
pub enum BumpPart { Patch, Minor, Major }

pub struct BuildArgs {
    pub target:        Option<String>,
    pub validate:      bool,
    pub bump:          Option<BumpPart>,
    pub since:         Option<String>,
    pub publish:       Option<(String, String)>,   // (url, token)
    pub download_base: String,
    pub github_repo:   String,
    pub watch:         bool,
}

// ── Entry point ───────────────────────────────────────────────────────────────

pub async fn run(args: BuildArgs) -> Result<()> {
    let root    = find_repo_root()?;
    let modules = root.join("modules");
    let packages = root.join("packages");
    let dist    = root.join("dist");

    let changed_since: Option<HashSet<String>> = args.since.as_deref()
        .map(|tag| git_changed_since(&root, tag));

    let mut all_packages = discover_packages(&modules, &packages);

    if let Some(ref target) = args.target {
        all_packages.retain(|(d, _)| d.file_name().and_then(|n| n.to_str()) == Some(target.as_str()));
        if all_packages.is_empty() {
            bail!("Package '{}' not found", target);
        }
    }

    if let Some(ref changed) = changed_since {
        let before = all_packages.len();
        all_packages.retain(|(d, _)| {
            d.file_name().and_then(|n| n.to_str())
                .map(|n| changed.contains(n))
                .unwrap_or(false)
        });
        let skipped = before - all_packages.len();
        if all_packages.is_empty() {
            println!("{YELLOW}No packages changed since {} — nothing to build.{RESET}",
                args.since.as_deref().unwrap_or(""));
            return Ok(());
        }
        if skipped > 0 {
            println!("{YELLOW}Skipping {skipped} unchanged package(s){RESET}");
        }
    }

    let result = build_packages(&all_packages, &dist, &args);
    if let Some((ref url, ref token)) = args.publish {
        if !result.built.is_empty() {
            head("Publishing");
            for (entry, _) in &result.built {
                if let Err(e) = publish_entry(entry, url, token).await {
                    err(&format!("{}: {e}", entry["id"].as_str().unwrap_or("?")));
                }
            }
        }
    }

    println!();
    if result.any_error {
        println!("{RED}{BOLD}Build finished with errors.{RESET}");
        if !args.watch { std::process::exit(1); }
    } else {
        println!("{GREEN}{BOLD}Done.{RESET}");
    }

    if args.watch {
        let target = args.target.as_deref()
            .context("--watch requires a target package ID")?;
        let watch_root = if modules.join(target).is_dir() {
            modules.join(target)
        } else if packages.join(target).is_dir() {
            packages.join(target)
        } else {
            bail!("Package '{}' not found", target);
        };

        println!("\n{CYAN}Watching {} for changes…  (Ctrl+C to stop){RESET}\n",
            watch_root.strip_prefix(&root).unwrap_or(&watch_root).display());

        let mut prev = snapshot(&watch_root);
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let curr = snapshot(&watch_root);
            let changed_files: Vec<_> = curr.iter()
                .filter(|(f, mt)| prev.get(*f) != Some(mt))
                .map(|(f, _)| f.clone())
                .chain(prev.keys().filter(|f| !curr.contains_key(*f)).cloned())
                .collect();

            if !changed_files.is_empty() {
                let labels: Vec<_> = changed_files.iter().take(3)
                    .filter_map(|f| f.file_name()?.to_str().map(String::from))
                    .collect();
                let extra = changed_files.len().saturating_sub(3);
                let mut label = labels.join(", ");
                if extra > 0 { label.push_str(&format!(" (+{extra} more)")); }
                println!("  {CYAN}changed{RESET} {label} — rebuilding…");
                build_packages(&all_packages, &dist, &args);
                println!("  {GREEN}ok{RESET}   rebuild complete\n");
                prev = snapshot(&watch_root);
            }
        }
    }

    Ok(())
}

// ── Build loop ────────────────────────────────────────────────────────────────

struct BuildResult {
    any_error: bool,
    built: Vec<(Value, PathBuf)>,
}

fn build_packages(
    packages: &[(PathBuf, String)],
    dist: &Path,
    args: &BuildArgs,
) -> BuildResult {
    let mut any_error = false;
    let mut built     = Vec::new();
    let mut catalog: HashMap<String, Value> = {
        let cp = dist.join("catalog.json");
        if cp.exists() {
            serde_json::from_str::<Vec<Value>>(&std::fs::read_to_string(&cp).unwrap_or_default())
                .unwrap_or_default()
                .into_iter()
                .filter_map(|e| {
                    let id = e["id"].as_str()?.to_string();
                    Some((id, e))
                })
                .collect()
        } else { HashMap::new() }
    };

    for (pkg_dir, kind) in packages {
        let pkg_name = pkg_dir.file_name().and_then(|n| n.to_str()).unwrap_or("?");
        head(&format!("{pkg_name}  ({kind})"));

        // Version bump
        if let Some(ref part) = args.bump {
            match bump_version(&pkg_dir.join("manifest.json"), part) {
                Ok(v) => ok(&format!("Bumped version -> {v}")),
                Err(e) => { err(&e.to_string()); any_error = true; continue; }
            }
        }

        // Validate
        let (manifest, errors) = if kind == "module" {
            validate_module(pkg_dir)
        } else {
            validate_bundle(pkg_dir)
        };
        if !errors.is_empty() {
            for e in &errors { err(e); }
            any_error = true;
            continue;
        }
        ok(&format!("v{}  min_app={}", manifest["version"].as_str().unwrap_or("?"),
            manifest.get("min_app_version").and_then(|v| v.as_str()).unwrap_or("n/a")));

        if args.validate { continue; }

        // Package
        let out_file = match if kind == "module" {
            package_module(pkg_dir, &manifest, dist)
        } else {
            package_bundle(pkg_dir, &manifest, dist)
        } {
            Ok(f) => f,
            Err(e) => { err(&format!("Packaging failed: {e}")); any_error = true; continue; }
        };

        // Checksum
        let checksum = match sha256_file(&out_file) {
            Ok(h) => h,
            Err(e) => { err(&e.to_string()); any_error = true; continue; }
        };
        let sha_path = out_file.with_extension(format!(
            "{}.sha256", out_file.extension().and_then(|e| e.to_str()).unwrap_or("")
        ));
        let _ = std::fs::write(&sha_path, format!("{checksum}  {}\n", out_file.file_name().and_then(|n| n.to_str()).unwrap_or("")));
        let size_kb = out_file.metadata().map(|m| m.len() / 1024).unwrap_or(0);
        ok(&format!("-> {}  ({size_kb} KB)  sha256:{}…", out_file.display(), &checksum[..12]));

        // Dist manifest
        write_dist_manifest(&out_file, &manifest, kind, &checksum);
        ok(&format!("-> dist/{}/{}/manifest.json",
            manifest["id"].as_str().unwrap_or("?"),
            manifest["version"].as_str().unwrap_or("?")));

        // Catalog entry
        let entry = make_catalog_entry(&manifest, &checksum, &args.download_base, kind, &args.github_repo);
        catalog.insert(entry["id"].as_str().unwrap_or("").to_string(), entry.clone());
        built.push((entry, out_file));
    }

    if !args.validate && !catalog.is_empty() {
        let cp = dist.join("catalog.json");
        let all: Vec<_> = catalog.values().cloned().collect();
        if let Ok(json) = serde_json::to_string_pretty(&all) {
            std::fs::create_dir_all(dist).ok();
            std::fs::write(&cp, json).ok();
            head("Output");
            ok(&format!("dist/catalog.json  ({} total, {} updated)", catalog.len(), built.len()));
        }
    }

    BuildResult { any_error, built }
}

// ── Validation ────────────────────────────────────────────────────────────────

fn read_manifest(path: &Path) -> (Value, Vec<String>) {
    if !path.exists() {
        return (Value::Null, vec![format!("manifest.json not found at {}", path.display())]);
    }
    match std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str::<Value>(&s).ok()) {
        Some(v) => (v, vec![]),
        None    => (Value::Null, vec!["manifest.json is invalid JSON".into()]),
    }
}

fn validate_semver(v: &str, field: &str) -> Vec<String> {
    let parts: Vec<_> = v.split('.').collect();
    if parts.len() != 3 || !parts.iter().all(|p| p.parse::<u64>().is_ok()) {
        vec![format!(r#"{field} "{v}" is not valid semver (expected x.y.z)"#)]
    } else { vec![] }
}

fn validate_module(pkg_dir: &Path) -> (Value, Vec<String>) {
    let (m, mut errors) = read_manifest(&pkg_dir.join("manifest.json"));
    if m.is_null() { return (m, errors); }

    for field in &["id", "name", "version", "min_app_version", "description", "scripts"] {
        if m.get(field).is_none() { errors.push(format!("Missing required field: {field}")); }
    }
    for field in &["version", "min_app_version"] {
        if let Some(v) = m[field].as_str() { errors.extend(validate_semver(v, field)); }
    }
    if let Some(scripts) = m["scripts"].as_object() {
        for (key, rel) in scripts {
            if let Some(p) = rel.as_str() {
                if !pkg_dir.join(p).exists() {
                    errors.push(format!(r#"Script "{key}" -> "{p}" not found"#));
                }
            }
        }
    }
    if let Some(pages) = m["pages"].as_array() {
        for page in pages {
            let id   = page["id"].as_str().unwrap_or("?");
            let file = page["file"].as_str().unwrap_or("");
            if file.is_empty() { errors.push(format!(r#"Page "{id}" missing "file" field"#)); }
            else if !pkg_dir.join(file).exists() { errors.push(format!(r#"Page "{id}" -> "{file}" not found"#)); }
        }
    }
    if let Some(sp) = m["settings_page"].as_str() {
        if !pkg_dir.join(sp).exists() { errors.push(format!(r#"settings_page "{sp}" not found"#)); }
    }
    if let Some(libs) = m["bundle"]["libraries"].as_array() {
        for lib in libs {
            let name = lib["name"].as_str().unwrap_or("?");
            let file = lib["file"].as_str().unwrap_or("");
            if file.is_empty() { errors.push(format!(r#"Bundled library "{name}" missing "file""#)); }
            else if !pkg_dir.join(file).exists() { errors.push(format!(r#"Bundled library "{name}" -> "{file}" not found"#)); }
        }
    }
    (m, errors)
}

fn validate_bundle(pkg_dir: &Path) -> (Value, Vec<String>) {
    let modules_dir  = pkg_dir.parent().and_then(|p| p.parent()).map(|r| r.join("modules"));
    let packages_dir = pkg_dir.parent().map(|p| p.to_path_buf());

    let (m, mut errors) = read_manifest(&pkg_dir.join("manifest.json"));
    if m.is_null() { return (m, errors); }

    for field in &["id", "name", "version", "author", "description", "package_type"] {
        if m.get(field).is_none() { errors.push(format!("Missing required field: {field}")); }
    }
    if m["package_type"].as_str() != Some("package") {
        errors.push(format!("package_type must be \"package\", got {:?}", m["package_type"]));
    }
    if let Some(v) = m["version"].as_str() { errors.extend(validate_semver(v, "version")); }

    let total = m["libraries"].as_array().map(|a| a.len()).unwrap_or(0)
        + m["modules"].as_array().map(|a| a.len()).unwrap_or(0)
        + m["packages"].as_array().map(|a| a.len()).unwrap_or(0);
    if total == 0 { errors.push("Bundle must contain at least one library, module, or nested package".into()); }

    if let Some(libs) = m["libraries"].as_array() {
        for lib in libs {
            if let Some(id) = lib.as_str() {
                let d = pkg_dir.join("libraries").join(id);
                if !d.join("manifest.json").exists() {
                    errors.push(format!("Library \"{id}\" not found at libraries/{id}"));
                }
            }
        }
    }
    if let (Some(mods), Some(ref md)) = (m["modules"].as_array(), modules_dir) {
        for mod_val in mods {
            if let Some(id) = mod_val.as_str() {
                if !md.join(id).join("manifest.json").exists() {
                    errors.push(format!("Module \"{id}\" not found in modules/"));
                }
            }
        }
    }
    if let (Some(pkgs), Some(ref pd)) = (m["packages"].as_array(), packages_dir) {
        for pkg_val in pkgs {
            if let Some(id) = pkg_val.as_str() {
                if !pd.join(id).join("manifest.json").exists() {
                    errors.push(format!("Nested package \"{id}\" not found in packages/"));
                }
            }
        }
    }
    (m, errors)
}

// ── Version bump ──────────────────────────────────────────────────────────────

fn bump_version(manifest_path: &Path, part: &BumpPart) -> Result<String> {
    let text = std::fs::read_to_string(manifest_path)?;
    let mut m: Value = serde_json::from_str(&text)?;
    let v = m["version"].as_str().context("No version field")?;
    let parts: Vec<u64> = v.split('.').map(|p| p.parse().unwrap_or(0)).collect();
    if parts.len() != 3 { bail!("Invalid semver: {v}"); }
    let (ma, mi, pa) = (parts[0], parts[1], parts[2]);
    let new_ver = match part {
        BumpPart::Major => format!("{}.0.0", ma + 1),
        BumpPart::Minor => format!("{}.{}.0", ma, mi + 1),
        BumpPart::Patch => format!("{}.{}.{}", ma, mi, pa + 1),
    };
    m["version"] = Value::String(new_ver.clone());
    std::fs::write(manifest_path, serde_json::to_string_pretty(&m)?)?;
    Ok(new_ver)
}

// ── Packaging ─────────────────────────────────────────────────────────────────

fn add_dir_to_zip(zw: &mut ZipWriter<std::fs::File>, src: &Path, prefix: &str) -> Result<()> {
    if !src.is_dir() { return Ok(()); }
    let opts: FileOptions<()> = FileOptions::default().compression_method(CompressionMethod::Deflated);
    for entry in walkdir::WalkDir::new(src).sort_by_file_name() {
        let entry = entry?;
        if !entry.file_type().is_file() { continue; }
        let rel = entry.path().strip_prefix(src)?;
        let arc = format!("{prefix}/{}", rel.to_string_lossy().replace('\\', "/"));
        zw.start_file(&arc, opts)?;
        zw.write_all(&std::fs::read(entry.path())?)?;
    }
    Ok(())
}

fn write_to_zip(zw: &mut ZipWriter<std::fs::File>, path: &Path, arc: &str) -> Result<()> {
    let opts: FileOptions<()> = FileOptions::default().compression_method(CompressionMethod::Deflated);
    zw.start_file(arc, opts)?;
    zw.write_all(&std::fs::read(path)?)?;
    Ok(())
}

// ── Hidden manifest ───────────────────────────────────────────────────────────
//
// Write-side counterpart of extract_gdmod's read logic in
// desktop/src-tauri/src/commands/marketplace.rs (see the doc comment there
// for the full rationale). manifest.json is not written as a normal, visible
// zip entry — instead a zero-byte placeholder entry (HIDDEN_MANIFEST_ENTRY)
// carries the manifest JSON in its zip "extra field", a metadata slot no
// mainstream archive tool surfaces to a user. These two constants must stay
// byte-for-byte identical to the ones in marketplace.rs.
const HIDDEN_MANIFEST_ENTRY: &str = ".gdlrb";
const HIDDEN_MANIFEST_EXTRA_ID: u16 = 0x9401;

/// Writes the hidden manifest at the archive root — used for a standalone
/// module (.gdmod). For a module nested inside a bundle, use
/// write_hidden_manifest_at with a "modules/<mod_id>/" prefix instead.
fn write_hidden_manifest(zw: &mut ZipWriter<std::fs::File>, manifest_path: &Path) -> Result<()> {
    write_hidden_manifest_at(zw, manifest_path, HIDDEN_MANIFEST_ENTRY)
}

fn write_hidden_manifest_at(zw: &mut ZipWriter<std::fs::File>, manifest_path: &Path, entry_name: &str) -> Result<()> {
    let manifest_bytes = std::fs::read(manifest_path)?;
    let mut opts: FileOptions<zip::write::ExtendedFileOptions> = FileOptions::default()
        .compression_method(CompressionMethod::Stored);
    // central_only=false — must land in the local file header too, since
    // that's what a reader iterating entries (not just parsing the central
    // directory) sees via ZipFile::extra_data().
    opts.add_extra_data(HIDDEN_MANIFEST_EXTRA_ID, manifest_bytes.into_boxed_slice(), false)?;
    zw.start_file(entry_name, opts)?;
    // Content is intentionally empty — the real data lives in the extra
    // field above, not the file body.
    Ok(())
}

fn build_meta(manifest: &Value, pkg_type: &str) -> String {
    let sha = git_sha_short();
    serde_json::json!({
        "built_at": chrono::Utc::now().to_rfc3339(),
        "git_sha": sha,
        "package_id": manifest["id"],
        "version": manifest["version"],
        "type": pkg_type,
    }).to_string()
}

fn out_dir(dist: &Path, id: &str, version: &str) -> Result<PathBuf> {
    let d = dist.join(id).join(version);
    std::fs::create_dir_all(&d)?;
    Ok(d)
}

fn package_module(pkg_dir: &Path, manifest: &Value, dist: &Path) -> Result<PathBuf> {
    let id  = manifest["id"].as_str().unwrap_or("unknown");
    let ver = manifest["version"].as_str().unwrap_or("0.0.0");
    let out = out_dir(dist, id, ver)?.join(format!("{id}-{ver}.gdmod"));
    let file = std::fs::File::create(&out)?;
    let mut zw = ZipWriter::new(file);
    let opts: FileOptions<()> = FileOptions::default().compression_method(CompressionMethod::Deflated);

    write_hidden_manifest(&mut zw, &pkg_dir.join("manifest.json"))?;
    add_dir_to_zip(&mut zw, &pkg_dir.join("scripts"),   "scripts")?;
    add_dir_to_zip(&mut zw, &pkg_dir.join("ui"),        "ui")?;
    add_dir_to_zip(&mut zw, &pkg_dir.join("resources"), "resources")?;
    add_dir_to_zip(&mut zw, &pkg_dir.join("libraries"), "libraries")?;

    zw.start_file("build-meta.json", opts)?;
    zw.write_all(build_meta(manifest, "module").as_bytes())?;
    zw.finish()?;
    Ok(out)
}

fn package_bundle(pkg_dir: &Path, manifest: &Value, dist: &Path) -> Result<PathBuf> {
    let root         = pkg_dir.parent().and_then(|p| p.parent()).unwrap_or(pkg_dir);
    let modules_dir  = root.join("modules");
    let packages_dir = pkg_dir.parent().unwrap_or(pkg_dir);

    let id  = manifest["id"].as_str().unwrap_or("unknown");
    let ver = manifest["version"].as_str().unwrap_or("0.0.0");
    let out = out_dir(dist, id, ver)?.join(format!("{id}-{ver}.gdpck"));
    let file = std::fs::File::create(&out)?;
    let mut zw = ZipWriter::new(file);
    let opts: FileOptions<()> = FileOptions::default().compression_method(CompressionMethod::Deflated);

    write_to_zip(&mut zw, &pkg_dir.join("manifest.json"), "manifest.json")?;
    zw.start_file("build-meta.json", opts)?;
    zw.write_all(build_meta(manifest, "package").as_bytes())?;

    if let Some(libs) = manifest["libraries"].as_array() {
        for lib in libs {
            if let Some(lib_id) = lib.as_str() {
                let lib_dir = pkg_dir.join("libraries").join(lib_id);
                add_library_to_zip(&mut zw, &lib_dir, lib_id, "libraries")?;
            }
        }
    }
    if let Some(mods) = manifest["modules"].as_array() {
        for m in mods {
            if let Some(mod_id) = m.as_str() {
                add_module_to_zip(&mut zw, &modules_dir.join(mod_id), mod_id, "modules")?;
            }
        }
    }
    if let Some(pkgs) = manifest["packages"].as_array() {
        for p in pkgs {
            if let Some(pkg_id) = p.as_str() {
                add_nested_package_to_zip(&mut zw, &packages_dir.join(pkg_id), pkg_id, "packages", &modules_dir, packages_dir)?;
            }
        }
    }
    zw.finish()?;
    Ok(out)
}

fn add_library_to_zip(zw: &mut ZipWriter<std::fs::File>, lib_dir: &Path, lib_id: &str, prefix: &str) -> Result<()> {
    let lib_m: Value = serde_json::from_str(&std::fs::read_to_string(lib_dir.join("manifest.json"))?)?;
    write_to_zip(zw, &lib_dir.join("manifest.json"), &format!("{prefix}/{lib_id}/manifest.json"))?;
    if let Some(entry) = lib_m["entry"].as_str() {
        let ep = lib_dir.join(entry);
        if ep.exists() { write_to_zip(zw, &ep, &format!("{prefix}/{lib_id}/{entry}"))?; }
    }
    for f in lib_dir.read_dir()?.flatten() {
        let p = f.path();
        if p.extension().and_then(|e| e.to_str()) == Some("rhai") {
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                write_to_zip(zw, &p, &format!("{prefix}/{lib_id}/{name}"))?;
            }
        }
    }
    Ok(())
}

fn add_module_to_zip(zw: &mut ZipWriter<std::fs::File>, mod_dir: &Path, mod_id: &str, prefix: &str) -> Result<()> {
    write_hidden_manifest_at(zw, &mod_dir.join("manifest.json"), &format!("{prefix}/{mod_id}/{HIDDEN_MANIFEST_ENTRY}"))?;
    for sub in &["scripts", "ui", "resources", "libraries"] {
        add_dir_to_zip(zw, &mod_dir.join(sub), &format!("{prefix}/{mod_id}/{sub}"))?;
    }
    Ok(())
}

fn add_nested_package_to_zip(
    zw: &mut ZipWriter<std::fs::File>,
    pkg_dir: &Path, pkg_id: &str, prefix: &str,
    modules_dir: &Path, packages_dir: &Path,
) -> Result<()> {
    let nested_m: Value = serde_json::from_str(&std::fs::read_to_string(pkg_dir.join("manifest.json"))?)?;
    write_to_zip(zw, &pkg_dir.join("manifest.json"), &format!("{prefix}/{pkg_id}/manifest.json"))?;
    if let Some(libs) = nested_m["libraries"].as_array() {
        for l in libs {
            if let Some(id) = l.as_str() {
                add_library_to_zip(zw, &pkg_dir.join("libraries").join(id), id, &format!("{prefix}/{pkg_id}/libraries"))?;
            }
        }
    }
    if let Some(mods) = nested_m["modules"].as_array() {
        for m in mods {
            if let Some(id) = m.as_str() {
                add_module_to_zip(zw, &modules_dir.join(id), id, &format!("{prefix}/{pkg_id}/modules"))?;
            }
        }
    }
    if let Some(pkgs) = nested_m["packages"].as_array() {
        for p in pkgs {
            if let Some(id) = p.as_str() {
                add_nested_package_to_zip(zw, &packages_dir.join(id), id, &format!("{prefix}/{pkg_id}/packages"), modules_dir, packages_dir)?;
            }
        }
    }
    Ok(())
}

// ── Catalog / dist manifest ───────────────────────────────────────────────────

fn make_catalog_entry(manifest: &Value, checksum: &str, download_base: &str, pkg_type: &str, github_repo: &str) -> Value {
    let id       = manifest["id"].as_str().unwrap_or("");
    let ver      = manifest["version"].as_str().unwrap_or("0.0.0");
    let ext      = if pkg_type == "package" { "gdpck" } else { "gdmod" };
    let filename = format!("{id}-{ver}.{ext}");
    let download_url = if download_base.is_empty() { String::new() }
        else { format!("{}/{filename}", download_base.trim_end_matches('/')) };

    let mut entry = serde_json::json!({
        "id":              id,
        "name":            manifest["name"],
        "version":         ver,
        "min_app_version": manifest.get("min_app_version").cloned().unwrap_or(Value::String("0.1.0".into())),
        "author":          manifest.get("author").cloned().unwrap_or(Value::String(String::new())),
        "description":     manifest["description"],
        "icon":            manifest.get("icon").cloned().unwrap_or(Value::String("custom".into())),
        "package_type":    pkg_type,
        "verified":        manifest.get("verified").and_then(|v| v.as_bool()).unwrap_or(false),
        "premium":         manifest.get("premium").and_then(|v| v.as_bool()).unwrap_or(false),
        "tags":            manifest.get("tags").cloned().unwrap_or(Value::Array(vec![])),
        "commands":        manifest.get("commands").cloned().unwrap_or(Value::Array(vec![])),
        "checksum":        checksum,
        "pub_date":        chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        "download_url":    download_url,
    });
    if !github_repo.is_empty() {
        entry["source_type"]  = Value::String("github".into());
        entry["github_repo"]  = Value::String(github_repo.into());
        entry["github_dir"]   = Value::String(format!("dist/{id}"));
        entry["github_tag"]   = Value::String(String::new());
    }
    entry
}

fn write_dist_manifest(out_file: &Path, manifest: &Value, pkg_type: &str, checksum: &str) {
    let dest = out_file.parent().map(|p| p.join("manifest.json"));
    if let Some(dest) = dest {
        let dm = serde_json::json!({
            "id":           manifest["id"],
            "version":      manifest["version"],
            "package_type": pkg_type,
            "file":         out_file.file_name().and_then(|n| n.to_str()).unwrap_or(""),
            "checksum":     checksum,
        });
        std::fs::write(dest, serde_json::to_string_pretty(&dm).unwrap_or_default()).ok();
    }
}

// ── Publish ───────────────────────────────────────────────────────────────────

async fn publish_entry(entry: &Value, url: &str, token: &str) -> Result<()> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;
    let base = url.trim_end_matches('/');
    let tq   = format!("?_token={}", urlencoding::encode(token));
    let auth = format!("Bearer {token}");

    let create_body = serde_json::json!({
        "id":              entry["id"],
        "name":            entry["name"],
        "author":          entry["author"],
        "description":     entry["description"],
        "package_type":    entry["package_type"],
        "icon":            entry["icon"],
        "min_app_version": entry["min_app_version"],
        "tags":            entry["tags"],
        "verified":        entry["verified"],
        "status":          "published",
    });

    let res = client.post(format!("{base}/admin/module{tq}"))
        .header("Authorization", &auth)
        .json(&create_body)
        .send().await?;

    if !res.status().is_success() && res.status().as_u16() != 409 {
        let code = res.status();
        let body = res.text().await.unwrap_or_default();
        bail!("Create failed ({code}): {body}");
    }
    let id = entry["id"].as_str().unwrap_or("?");
    if res.status().as_u16() == 409 { warn(&format!("{id} already exists — adding release only")); }
    else { ok(&format!("Created {id}")); }

    let release_body = serde_json::json!({
        "version":      entry["version"],
        "download_url": entry["download_url"],
        "checksum":     entry["checksum"],
        "changelog":    entry.get("changelog").cloned().unwrap_or(Value::String(String::new())),
        "pub_date":     entry["pub_date"],
        "source_type":  entry.get("source_type").cloned().unwrap_or(Value::String("direct".into())),
        "github_repo":  entry.get("github_repo").cloned().unwrap_or(Value::String(String::new())),
        "github_dir":   entry.get("github_dir").cloned().unwrap_or(Value::String(String::new())),
        "github_tag":   entry.get("github_tag").cloned().unwrap_or(Value::String(String::new())),
    });
    let res = client.post(format!("{base}/admin/module/{id}/release{tq}"))
        .header("Authorization", &auth)
        .json(&release_body)
        .send().await?;
    if !res.status().is_success() {
        let code = res.status();
        let body = res.text().await.unwrap_or_default();
        bail!("Release failed ({code}): {body}");
    }
    ok(&format!("Release v{} published for {id}", entry["version"].as_str().unwrap_or("?")));
    Ok(())
}

// ── Utilities ─────────────────────────────────────────────────────────────────

fn discover_packages(modules: &Path, packages: &Path) -> Vec<(PathBuf, String)> {
    let mut result = Vec::new();
    for (kind, base) in &[("module", modules), ("package", packages)] {
        if base.is_dir() {
            let mut entries: Vec<_> = base.read_dir()
                .into_iter().flatten()
                .flatten()
                .filter(|e| e.path().join("manifest.json").exists())
                .map(|e| e.path())
                .collect();
            entries.sort();
            result.extend(entries.into_iter().map(|p| (p, kind.to_string())));
        }
    }
    result
}

fn sha256_file(path: &Path) -> Result<String> {
    let mut h = Sha256::new();
    let data = std::fs::read(path)?;
    h.update(&data);
    Ok(format!("{:x}", h.finalize()))
}

fn git_sha_short() -> String {
    std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".into())
}

fn git_changed_since(root: &Path, tag: &str) -> HashSet<String> {
    let out = std::process::Command::new("git")
        .args(["diff", "--name-only", tag, "HEAD"])
        .current_dir(root)
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .unwrap_or_default();
    let mut changed = HashSet::new();
    for line in out.lines() {
        let parts: Vec<_> = line.splitn(3, '/').collect();
        if parts.len() >= 2 && matches!(parts[0], "modules" | "packages") {
            changed.insert(parts[1].to_string());
        }
    }
    changed
}

fn find_repo_root() -> Result<PathBuf> {
    let out = std::process::Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .context("git not found — run from inside the repository")?;
    Ok(PathBuf::from(String::from_utf8(out.stdout)?.trim()))
}

fn snapshot(root: &Path) -> HashMap<PathBuf, SystemTime> {
    walkdir::WalkDir::new(root)
        .into_iter().flatten()
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| {
            let mt = e.metadata().ok()?.modified().ok()?;
            Some((e.into_path(), mt))
        })
        .collect()
}
