use crate::modules::{ModuleManifest, ModuleState};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read as IoRead;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

// â"€â"€ Marketplace types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

fn default_module_type() -> String { "module".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceEntry {
    pub id: String,
    pub name: String,
    #[serde(default = "default_module_type")]
    pub package_type: String,
    pub author: String,
    pub version: String,
    /// Minimum GDLQBot app version required to install this module.
    pub min_app_version: String,
    pub description: String,
    pub icon: String,
    pub verified: bool,
    pub premium: bool,
    pub downloads: u32,
    pub tags: Vec<String>,
    /// URL to download the .gdmod package file.
    pub download_url: String,
    #[serde(default)]
    pub checksum: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<serde_json::Value>,
    /// For library packages with multiple components: list of component library names this package installs.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub components: Vec<String>,
    /// For .gdpck bundles: list of library IDs contained in the bundle.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub libraries: Vec<String>,
    /// For .gdpck bundles: list of module IDs contained in the bundle.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modules: Vec<String>,
}

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");


// â"€â"€ Version compatibility â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

fn check_version_compat(min_app_version: &str) -> Result<(), String> {
    let app = semver::Version::parse(APP_VERSION)
        .map_err(|e| format!("Invalid app version: {e}"))?;
    let required = semver::Version::parse(min_app_version)
        .map_err(|_| format!("Module has invalid min_app_version: '{min_app_version}'"))?;
    if app < required {
        return Err(format!(
            "This module requires GDLQBot v{min_app_version} or later (you have v{APP_VERSION}). \
             Please update the app first."
        ));
    }
    Ok(())
}



// â"€â"€ .gdmod extraction (for downloaded packages) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/// Extract a .gdmod (zip) package into `dest_dir`.
/// Returns the parsed manifest.
pub fn extract_gdmod(
    data: &[u8],
    dest_dir: &Path,
) -> Result<ModuleManifest, String> {
    let cursor = std::io::Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("Invalid .gdmod package: {e}"))?;

    let module_dir = dest_dir;
    std::fs::create_dir_all(&module_dir)
        .map_err(|e| format!("Could not create module directory: {e}"))?;

    let mut manifest_json: Option<String> = None;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();

        // Sanitise path â€" prevent zip-slip attacks
        if name.contains("..") || name.starts_with('/') {
            continue;
        }

        let dest = module_dir.join(&name);

        if name.ends_with('/') {
            std::fs::create_dir_all(&dest).ok();
        } else {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let mut buf = Vec::new();
            file.read_to_end(&mut buf).map_err(|e| e.to_string())?;

            if name == "manifest.json" {
                manifest_json = Some(String::from_utf8_lossy(&buf).into_owned());
            }

            std::fs::write(&dest, &buf).map_err(|e| format!("Failed to write {name}: {e}"))?;
        }
    }

    let json = manifest_json.ok_or_else(|| "Package is missing manifest.json".to_string())?;
    serde_json::from_str::<ModuleManifest>(&json)
        .map_err(|e| format!("Invalid manifest.json: {e}"))
}

// â"€â"€ Tauri commands â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const MARKETPLACE_CATALOG_URL: &str = "https://dl.supers0ft.us/gdlvlreqbot/marketplace/catalog";
const LICENSE_KV_KEY: &str = "sys:license_token";

/// Returns the full marketplace catalog from the live API.
/// Returns an error if the marketplace is unreachable.
#[tauri::command]
pub async fn fetch_marketplace(
    modules: State<'_, Arc<ModuleState>>,
) -> Result<Vec<MarketplaceEntry>, String> {
    let installed_ids: std::collections::HashSet<String> = modules
        .list_modules().await
        .into_iter()
        .map(|m| m.id)
        .collect();

    let token: Option<String> = {
        let pool = modules.db.read().await;
        sqlx::query_scalar("SELECT value FROM kv_store WHERE key = ?")
            .bind(LICENSE_KV_KEY)
            .fetch_optional(&*pool)
            .await
            .ok()
            .flatten()
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(MARKETPLACE_CATALOG_URL);
    if let Some(tok) = &token {
        req = req.header("Authorization", format!("Bearer {tok}"));
    }
    let resp = req.send().await
        .map_err(|e| format!("Marketplace unavailable: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Marketplace returned status {}", resp.status()));
    }
    let mut catalog: Vec<MarketplaceEntry> = resp.json().await
        .map_err(|e| format!("Marketplace response invalid: {e}"))?;

    for entry in &mut catalog {
        if installed_ids.contains(&entry.id) {
            entry.tags.push("installed".into());
        }
    }
    Ok(catalog)
}

/// Install a module from the marketplace by catalog ID.
#[tauri::command]
pub async fn install_marketplace_module(
    id: String,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let token: Option<String> = {
        let pool = modules.db.read().await;
        sqlx::query_scalar("SELECT value FROM kv_store WHERE key = ?")
            .bind(LICENSE_KV_KEY)
            .fetch_optional(&*pool)
            .await
            .ok()
            .flatten()
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(MARKETPLACE_CATALOG_URL);
    if let Some(tok) = &token {
        req = req.header("Authorization", format!("Bearer {tok}"));
    }
    let catalog: Vec<MarketplaceEntry> = req.send().await
        .map_err(|e| format!("Marketplace fetch failed: {e}"))?
        .json().await
        .map_err(|e| format!("Marketplace response invalid: {e}"))?;
    let entry = catalog.into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| format!("Module '{id}' not found in marketplace"))?;

    // Version compatibility check
    check_version_compat(&entry.min_app_version)?;

    // â"€â"€ Library install path â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    // -- Library install path
    if entry.package_type == "library" {
        let components: HashMap<String, String> = {
            // Download the .gdlib package and read all component .rhai files
            let bytes = reqwest::get(&entry.download_url)
                .await
                .map_err(|e| format!("Download failed: {e}"))?
                .bytes()
                .await
                .map_err(|e| format!("Failed to read download: {e}"))?;

            let manifest_val: serde_json::Value = {
                let cursor = std::io::Cursor::new(&bytes);
                let mut archive = zip::ZipArchive::new(cursor)
                    .map_err(|e| format!("Invalid .gdlib package: {e}"))?;
                let mut f = archive.by_name("manifest.json")
                    .map_err(|_| "Library package missing manifest.json".to_string())?;
                let mut s = String::new();
                f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                serde_json::from_str(&s).map_err(|e| format!("Invalid manifest.json: {e}"))?
            };

            // Supports both single 'entry' and 'components: {name: file}' formats
            let mut name_file_pairs: Vec<(String, String)> = Vec::new();
            if let Some(comps) = manifest_val.get("components").and_then(|v| v.as_object()) {
                for (name, file) in comps {
                    if let Some(f) = file.as_str() {
                        name_file_pairs.push((name.clone(), f.to_string()));
                    }
                }
            } else if let Some(entry_file) = manifest_val.get("entry").and_then(|v| v.as_str()) {
                let lib_name = manifest_val.get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&entry.id)
                    .to_string();
                name_file_pairs.push((lib_name, entry_file.to_string()));
            }

            if name_file_pairs.is_empty() {
                return Err("Library manifest has no 'entry' or 'components' field".to_string());
            }

            let mut result = HashMap::new();
            for (name, filename) in name_file_pairs {
                let cursor = std::io::Cursor::new(&bytes);
                let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
                let mut file = archive.by_name(&filename)
                    .map_err(|_| format!("Library package missing '{filename}'"))?;
                let mut src = String::new();
                file.read_to_string(&mut src).map_err(|e| e.to_string())?;
                result.insert(name, src);
            }
            result
        };

        let pool = modules.db.read().await;
        for (lib_name, source) in &components {
            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM libraries WHERE name = ?")
                .bind(lib_name)
                .fetch_one(&*pool)
                .await
                .unwrap_or(0);

            if exists == 0 {
                sqlx::query(
                    "INSERT INTO libraries (name, description, code, enabled) VALUES (?, ?, ?, 1)"
                )
                .bind(lib_name)
                .bind(format!("Part of {} package", &entry.name))
                .bind(source)
                .execute(&*pool)
                .await
                .map_err(|e| format!("Failed to install library component '{lib_name}': {e}"))?;
            }
        }

        app_handle.emit("library-updated", &id).ok();
        return Ok(());
    }

    // -- Package (.gdpck) install path: multi-library bundle
    if entry.package_type == "package" {
        let bytes = reqwest::get(&entry.download_url)
            .await
            .map_err(|e| format!("Download failed: {e}"))?
            .bytes()
            .await
            .map_err(|e| format!("Failed to read download: {e}"))?;

        // Read bundle manifest to get library list
        let lib_ids: Vec<String> = {
            let cursor = std::io::Cursor::new(&bytes);
            let mut archive = zip::ZipArchive::new(cursor)
                .map_err(|e| format!("Invalid .gdpck package: {e}"))?;
            let mut f = archive.by_name("manifest.json")
                .map_err(|_| "Bundle missing manifest.json".to_string())?;
            let mut s = String::new();
            f.read_to_string(&mut s).map_err(|e| e.to_string())?;
            let v: serde_json::Value = serde_json::from_str(&s)
                .map_err(|e| format!("Invalid bundle manifest: {e}"))?;
            v.get("libraries")
                .and_then(|a| a.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default()
        };

        if lib_ids.is_empty() {
            return Err("Bundle manifest has no 'libraries' list".to_string());
        }

        install_gdpck_bytes_inner(&bytes, &modules, &app_handle).await?;
        return Ok(());
    }

    // â"€â"€ Module install path â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    let modules_dir = modules.modules_dir.clone();

    // Download and extract the .gdmod package
    let bytes = reqwest::get(&entry.download_url)
        .await
        .map_err(|e| format!("Download failed: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {e}"))?;

    let dest_dir = modules_dir
        .join(&entry.author)
        .join(&entry.package_type)
        .join(&entry.id);
    let manifest = extract_gdmod(&bytes, &dest_dir)?;
    let manifest_json = serde_json::to_string(&manifest)
        .map_err(|e| format!("Failed to serialise manifest: {e}"))?;

    modules.install_module(&manifest_json, &entry.author, &entry.package_type).await.map_err(|e| e.to_string())?;

    app_handle.emit("module-updated", &id).ok();
    Ok(())
}

/// Shared: install a .gdpck bundle from raw bytes.
/// Handles libraries/<id>/, modules/<id>/, and packages/<id>/ subfolders recursively.
async fn install_gdpck_bytes_inner(
    bytes: &[u8],
    modules: &Arc<ModuleState>,
    app_handle: &AppHandle,
) -> Result<(), String> {
    // Read root manifest
    let root_manifest: serde_json::Value = {
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| format!("Invalid .gdpck package: {e}"))?;
        let mut f = archive.by_name("manifest.json")
            .map_err(|_| "Bundle missing manifest.json".to_string())?;
        let mut s = String::new();
        f.read_to_string(&mut s).map_err(|e| e.to_string())?;
        serde_json::from_str(&s).map_err(|e| format!("Invalid bundle manifest: {e}"))?
    };

    fn str_list(v: &serde_json::Value, key: &str) -> Vec<String> {
        v.get(key).and_then(|a| a.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.as_str().map(String::from)).collect())
            .unwrap_or_default()
    }

    // Install libraries from libraries/<lib_id>/
    let lib_ids = str_list(&root_manifest, "libraries");
    if !lib_ids.is_empty() {
        let pool = modules.db.read().await;
        for lib_id in &lib_ids {
            let lib_manifest: serde_json::Value = {
                let cursor = std::io::Cursor::new(bytes);
                let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
                let path = format!("libraries/{lib_id}/manifest.json");
                let mut f = archive.by_name(&path).map_err(|_| format!("Bundle missing {path}"))?;
                let mut s = String::new();
                f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                serde_json::from_str(&s).map_err(|e| format!("Invalid manifest for '{lib_id}': {e}"))?
            };
            let entry_file = lib_manifest.get("entry").and_then(|v| v.as_str())
                .ok_or_else(|| format!("Library '{lib_id}' missing 'entry' field"))?.to_string();
            let description = lib_manifest.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();

            let source = {
                let cursor = std::io::Cursor::new(bytes);
                let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
                let path = format!("libraries/{lib_id}/{entry_file}");
                let mut f = archive.by_name(&path).map_err(|_| format!("Bundle missing {path}"))?;
                let mut s = String::new();
                f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                s
            };

            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM libraries WHERE name = ?")
                .bind(lib_id).fetch_one(&*pool).await.unwrap_or(0);
            if exists == 0 {
                sqlx::query("INSERT INTO libraries (name, description, code, enabled) VALUES (?, ?, ?, 1)")
                    .bind(lib_id).bind(&description).bind(&source)
                    .execute(&*pool).await
                    .map_err(|e| format!("Failed to install library '{lib_id}': {e}"))?;
            } else {
                sqlx::query("UPDATE libraries SET code = ?, description = ? WHERE name = ?")
                    .bind(&source).bind(&description).bind(lib_id)
                    .execute(&*pool).await
                    .map_err(|e| format!("Failed to update library '{lib_id}': {e}"))?;
            }
        }
        app_handle.emit("library-updated", ()).ok();
    }

    // Install modules from modules/<mod_id>/
    let mod_ids = str_list(&root_manifest, "modules");
    for mod_id in &mod_ids {
        let mod_manifest_str = {
            let cursor = std::io::Cursor::new(bytes);
            let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
            let path = format!("modules/{mod_id}/manifest.json");
            let mut f = archive.by_name(&path).map_err(|_| format!("Bundle missing {path}"))?;
            let mut s = String::new();
            f.read_to_string(&mut s).map_err(|e| e.to_string())?;
            s
        };
        let mod_manifest: ModuleManifest = serde_json::from_str(&mod_manifest_str)
            .map_err(|e| format!("Invalid module manifest for '{mod_id}': {e}"))?;

        // Extract module files to disk
        let dest_dir = modules.modules_dir.join("marketplace").join("module").join(mod_id);
        std::fs::create_dir_all(&dest_dir).map_err(|e| format!("Could not create dir: {e}"))?;
        std::fs::write(dest_dir.join("manifest.json"), &mod_manifest_str)
            .map_err(|e| format!("Failed to write manifest: {e}"))?;

        // Extract scripts/
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
        let scripts_prefix = format!("modules/{mod_id}/scripts/");
        let names: Vec<String> = (0..archive.len())
            .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
            .filter(|n| n.starts_with(&scripts_prefix) && !n.ends_with('/'))
            .collect();
        for name in names {
            let mut archive2 = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
            let mut f = archive2.by_name(&name).map_err(|e| e.to_string())?;
            let rel = name.trim_start_matches(&format!("modules/{mod_id}/"));
            let dest = dest_dir.join(rel);
            if let Some(p) = dest.parent() { std::fs::create_dir_all(p).ok(); }
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            std::fs::write(&dest, &buf).map_err(|e| format!("Failed to write {rel}: {e}"))?;
        }

        let final_json = serde_json::to_string(&mod_manifest).map_err(|e| e.to_string())?;
        modules.install_module(&final_json, "marketplace", "module").await.map_err(|e| e.to_string())?;
        app_handle.emit("module-updated", mod_id).ok();
    }

    // Nested packages — recurse by building sub-bytes from the zip entries
    // (simple: re-open parent archive and extract nested .gdpck on-the-fly isn't possible,
    //  so for now nested packages are flattened: their libraries/modules are installed directly)
    let pkg_ids = str_list(&root_manifest, "packages");
    for pkg_id in &pkg_ids {
        // Extract nested manifest
        let nested_manifest: serde_json::Value = {
            let cursor = std::io::Cursor::new(bytes);
            let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
            let path = format!("packages/{pkg_id}/manifest.json");
            let mut f = archive.by_name(&path).map_err(|_| format!("Bundle missing {path}"))?;
            let mut s = String::new();
            f.read_to_string(&mut s).map_err(|e| e.to_string())?;
            serde_json::from_str(&s).map_err(|e| format!("Invalid nested manifest '{pkg_id}': {e}"))?
        };
        // Install nested libraries (at packages/<pkg_id>/libraries/<lib_id>/)
        let nested_libs = str_list(&nested_manifest, "libraries");
        if !nested_libs.is_empty() {
            let pool = modules.db.read().await;
            for lib_id in &nested_libs {
                let lib_m: serde_json::Value = {
                    let cursor = std::io::Cursor::new(bytes);
                    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
                    let path = format!("packages/{pkg_id}/libraries/{lib_id}/manifest.json");
                    let mut f = archive.by_name(&path).map_err(|_| format!("Bundle missing {path}"))?;
                    let mut s = String::new();
                    f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                    serde_json::from_str(&s).map_err(|e| e.to_string())?
                };
                let entry_file = lib_m.get("entry").and_then(|v| v.as_str())
                    .ok_or_else(|| format!("Nested library '{lib_id}' missing 'entry'"))?.to_string();
                let description = lib_m.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let source = {
                    let cursor = std::io::Cursor::new(bytes);
                    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
                    let path = format!("packages/{pkg_id}/libraries/{lib_id}/{entry_file}");
                    let mut f = archive.by_name(&path).map_err(|_| format!("Bundle missing {path}"))?;
                    let mut s = String::new();
                    f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                    s
                };
                let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM libraries WHERE name = ?")
                    .bind(lib_id).fetch_one(&*pool).await.unwrap_or(0);
                if exists == 0 {
                    sqlx::query("INSERT INTO libraries (name, description, code, enabled) VALUES (?, ?, ?, 1)")
                        .bind(lib_id).bind(&description).bind(&source)
                        .execute(&*pool).await
                        .map_err(|e| format!("Failed to install nested library '{lib_id}': {e}"))?;
                } else {
                    sqlx::query("UPDATE libraries SET code = ?, description = ? WHERE name = ?")
                        .bind(&source).bind(&description).bind(lib_id)
                        .execute(&*pool).await
                        .map_err(|e| format!("Failed to update nested library '{lib_id}': {e}"))?;
                }
            }
            app_handle.emit("library-updated", ()).ok();
        }
    }

    Ok(())
}

/// Install a local package file (.gdmod, .gdlib, or .gdpck) from bytes read by the frontend.
/// Auto-detects the package type from manifest.json inside the archive.
#[tauri::command]
pub async fn install_local_package(
    bytes: Vec<u8>,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let root_manifest: serde_json::Value = {
        let cursor = std::io::Cursor::new(&bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| format!("Not a valid package file: {e}"))?;
        let mut f = archive.by_name("manifest.json")
            .map_err(|_| "Package is missing manifest.json".to_string())?;
        let mut s = String::new();
        f.read_to_string(&mut s).map_err(|e| e.to_string())?;
        serde_json::from_str(&s).map_err(|e| format!("Invalid manifest.json: {e}"))?
    };

    let pkg_type = root_manifest.get("package_type").and_then(|v| v.as_str()).unwrap_or("module");
    let min_ver = root_manifest.get("min_app_version").and_then(|v| v.as_str()).unwrap_or("0.0.1");
    check_version_compat(min_ver)?;

    match pkg_type {
        "library" => {
            // Reuse library install logic from install_marketplace_module
            let manifest_str = serde_json::to_string(&root_manifest).unwrap();
            let manifest_val = &root_manifest;
            let lib_id = manifest_val.get("id").and_then(|v| v.as_str())
                .ok_or("Library manifest missing 'id'")?;
            let entry_file = manifest_val.get("entry").and_then(|v| v.as_str())
                .ok_or("Library manifest missing 'entry'")?;
            let description = manifest_val.get("description").and_then(|v| v.as_str()).unwrap_or("");

            let source = {
                let cursor = std::io::Cursor::new(&bytes);
                let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
                let mut f = archive.by_name(entry_file)
                    .map_err(|_| format!("Library missing entry file '{entry_file}'"))?;
                let mut s = String::new();
                f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                s
            };
            let _ = manifest_str;

            let pool = modules.db.read().await;
            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM libraries WHERE name = ?")
                .bind(lib_id).fetch_one(&*pool).await.unwrap_or(0);
            if exists == 0 {
                sqlx::query("INSERT INTO libraries (name, description, code, enabled) VALUES (?, ?, ?, 1)")
                    .bind(lib_id).bind(description).bind(&source)
                    .execute(&*pool).await
                    .map_err(|e| format!("Failed to install library: {e}"))?;
            } else {
                sqlx::query("UPDATE libraries SET code = ?, description = ? WHERE name = ?")
                    .bind(&source).bind(description).bind(lib_id)
                    .execute(&*pool).await
                    .map_err(|e| format!("Failed to update library: {e}"))?;
            }
            app_handle.emit("library-updated", lib_id).ok();
        }
        "package" => {
            install_gdpck_bytes_inner(&bytes, modules.inner(), &app_handle).await?;
        }
        _ => {
            // module
            let id = root_manifest.get("id").and_then(|v| v.as_str())
                .ok_or("Module manifest missing 'id'")?.to_string();
            let typed: ModuleManifest = serde_json::from_value(root_manifest)
                .map_err(|e| format!("Invalid module manifest: {e}"))?;
            let dest_dir = modules.modules_dir.join("local").join("module").join(&id);
            extract_gdmod(&bytes, &dest_dir)?;
            let final_json = serde_json::to_string(&typed).map_err(|e| e.to_string())?;
            modules.install_module(&final_json, "local", "module").await.map_err(|e| e.to_string())?;
            app_handle.emit("module-updated", &id).ok();
        }
    }
    Ok(())
}

/// Install a module from a local .gdmod file (already read as bytes by the frontend).
#[tauri::command]
pub async fn install_gdmod_bytes(
    bytes: Vec<u8>,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    // Peek at manifest to get the id first
    let cursor = std::io::Cursor::new(&bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("Invalid .gdmod file: {e}"))?;

    let manifest_json = {
        let mut f = archive.by_name("manifest.json")
            .map_err(|_| "Package is missing manifest.json".to_string())?;
        let mut s = String::new();
        f.read_to_string(&mut s).map_err(|e| e.to_string())?;
        s
    };

    let manifest: serde_json::Value = serde_json::from_str(&manifest_json)
        .map_err(|e| format!("Invalid manifest.json: {e}"))?;

    let id = manifest.get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "manifest.json missing 'id' field".to_string())?
        .to_string();

    let min_ver = manifest.get("min_app_version")
        .and_then(|v| v.as_str())
        .unwrap_or("0.0.1");
    check_version_compat(min_ver)?;

    let typed: ModuleManifest = serde_json::from_str(&manifest_json)
        .map_err(|e| format!("Invalid manifest.json: {e}"))?;

    let dest_dir = modules.modules_dir.join("local").join("module").join(&id);
    extract_gdmod(&bytes, &dest_dir)?;

    let final_json = serde_json::to_string(&typed)
        .map_err(|e| format!("Failed to serialise manifest: {e}"))?;

    modules.install_module(&final_json, "local", "module").await.map_err(|e| e.to_string())?;
    app_handle.emit("module-updated", &id).ok();
    Ok(())
}

// â"€â"€ Developer tools â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

/// Install a module from a local source directory (no zip required).
/// Reads manifest.json + scripts/ from the given directory and copies
/// them directly into the app's modules directory. Intended for module
/// development workflows where you edit files in your source tree.
#[tauri::command]
pub async fn install_module_from_dir(
    source_dir: String,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let src = PathBuf::from(&source_dir);
    let manifest_path = src.join("manifest.json");
    if !manifest_path.exists() {
        return Err(format!("No manifest.json found in {source_dir}"));
    }

    let manifest_json = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest.json: {e}"))?;

    let manifest: ModuleManifest = serde_json::from_str(&manifest_json)
        .map_err(|e| format!("Invalid manifest.json: {e}"))?;

    check_version_compat(&manifest.min_app_version)?;

    let dest_dir = modules.modules_dir.join("local").join("module").join(&manifest.id);
    let scripts_dest = dest_dir.join("scripts");
    std::fs::create_dir_all(&scripts_dest)
        .map_err(|e| format!("Failed to create module directory: {e}"))?;

    // Copy scripts
    let scripts_src = src.join("scripts");
    if scripts_src.is_dir() {
        for entry in std::fs::read_dir(&scripts_src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("rhai") {
                let dest = scripts_dest.join(entry.file_name());
                std::fs::copy(&path, &dest)
                    .map_err(|e| format!("Failed to copy {}: {e}", entry.file_name().to_string_lossy()))?;
            }
        }
    }

    // Copy manifest
    std::fs::copy(&manifest_path, dest_dir.join("manifest.json")).ok();

    modules.install_module(&manifest_json, "local", "module").await.map_err(|e| e.to_string())?;
    app_handle.emit("module-updated", &manifest.id).ok();
    Ok(())
}

/// Watch a local module source directory and copy changed scripts into
/// the installed module directory as you save them (live reload for development).
/// Emits `module-scripts-updated` events to the frontend on each change.
/// Call `stop_module_dev_watch` with the same module ID to stop watching.
#[tauri::command]
pub async fn start_module_dev_watch(
    module_id: String,
    source_dir: String,
    modules: State<'_, Arc<ModuleState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let src = PathBuf::from(&source_dir);
    if !src.is_dir() {
        return Err(format!("Source directory not found: {source_dir}"));
    }

    let dest_dir = modules.module_dir(&module_id).await;
    let scripts_dest = dest_dir.join("scripts");
    std::fs::create_dir_all(&scripts_dest).ok();

    let handle = app_handle.clone();
    let id = module_id.clone();

    tokio::spawn(async move {
        let mut last_mtimes: HashMap<PathBuf, std::time::SystemTime> = HashMap::new();
        let scripts_src = src.join("scripts");

        // Initial copy + mtime snapshot
        if let Ok(entries) = std::fs::read_dir(&scripts_src) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("rhai") {
                    if let Ok(meta) = path.metadata() {
                        if let Ok(mtime) = meta.modified() {
                            last_mtimes.insert(path.clone(), mtime);
                        }
                    }
                    let dest = scripts_dest.join(entry.file_name());
                    std::fs::copy(&path, &dest).ok();
                }
            }
        }

        loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;

            let mut changed = false;
            if let Ok(entries) = std::fs::read_dir(&scripts_src) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) != Some("rhai") {
                        continue;
                    }
                    if let Ok(meta) = path.metadata() {
                        if let Ok(mtime) = meta.modified() {
                            if last_mtimes.get(&path) != Some(&mtime) {
                                let dest = scripts_dest.join(entry.file_name());
                                if std::fs::copy(&path, &dest).is_ok() {
                                    last_mtimes.insert(path, mtime);
                                    changed = true;
                                }
                            }
                        }
                    }
                }
            }

            if changed {
                handle.emit("module-scripts-updated", &id).ok();
            }
        }
    });

    Ok(())
}
