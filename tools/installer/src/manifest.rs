use serde::{Deserialize, Serialize};

/// Payload archive (tar.gz of the staged install tree), embedded at build time.
pub static PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/payload.bin"));
/// Build-time manifest describing the product being installed.
pub static MANIFEST_JSON: &str = include_str!(concat!(env!("OUT_DIR"), "/manifest.json"));
/// Product icon (PNG) for the Linux desktop entry (unused elsewhere).
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub static ICON_PNG: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/icon.png"));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileAssoc {
    pub ext: String,
    pub prog_id: String,
    pub description: String,
}

/// An optional marketplace module recommended during setup. Never installed
/// without an explicit opt-in; selected ids are handed to the app, which
/// installs them from the marketplace on first launch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Offer {
    pub id: String,
    pub name: String,
    #[serde(default)] pub description: String,
    /// Pre-checked in the wizard (still requires the user to click through).
    #[serde(default)] pub default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Defaults {
    #[serde(default = "yes")] pub desktop_shortcut: bool,
    #[serde(default = "yes")] pub start_menu: bool,
    #[serde(default)]         pub install_cli: bool,
    #[serde(default)]         pub enable_dev: bool,
    #[serde(default = "yes")] pub file_assoc: bool,
    #[serde(default = "yes")] pub launch_after: bool,
}

impl Default for Defaults {
    fn default() -> Self {
        Self {
            desktop_shortcut: true,
            start_menu: true,
            install_cli: false,
            enable_dev: false,
            file_assoc: true,
            launch_after: true,
        }
    }
}

fn yes() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub product_name: String,
    pub identifier: String,
    pub version: String,
    #[serde(default)] pub publisher: String,
    #[serde(default)] pub homepage: String,
    /// App executable file name inside the payload's `app/` dir
    /// (macOS: name of the `.app` bundle inside `app/`).
    pub exe_name: String,
    /// CLI executable file name inside the payload's `cli/` dir, if bundled.
    #[serde(default)] pub cli_name: Option<String>,
    /// Full license / terms-of-service text shown by the installer.
    #[serde(default)] pub license: String,
    #[serde(default)] pub file_associations: Vec<FileAssoc>,
    #[serde(default)] pub defaults: Defaults,
    /// Optional marketplace modules offered (not pushed) during setup.
    #[serde(default)] pub offers: Vec<Offer>,
    /// Arbitrary preset app settings, delivered to the app via install.json.
    #[serde(default)] pub preset: serde_json::Value,
    /// SHA-256 of the embedded payload archive, written by build.mjs and
    /// verified before extraction.
    #[serde(default)] pub payload_sha256: Option<String>,
}

impl Manifest {
    /// Load the embedded manifest. Fails when the binary was compiled without
    /// a payload (plain `cargo build` instead of build.mjs).
    pub fn load() -> Result<Manifest, String> {
        if PAYLOAD.is_empty() {
            return Err(
                "This installer binary was built without a payload.\n\
                 Build it with: node tools/installer/build.mjs".into(),
            );
        }
        serde_json::from_str(MANIFEST_JSON).map_err(|e| format!("Corrupt embedded manifest: {e}"))
    }

    /// Stand-in manifest for working on the installer itself (`cargo run`
    /// without a payload). Callers must force dry-run when using this.
    pub fn dev_stub() -> Manifest {
        Manifest {
            product_name: "GD Level Request Bot (installer dev)".into(),
            identifier: "com.supersoft.gdlqb".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            publisher: "Supernova Software, LLC".into(),
            homepage: "https://supersoft.us".into(),
            exe_name: if cfg!(windows) { "gdlqbot.exe" } else { "gdlqbot" }.into(),
            cli_name: Some(if cfg!(windows) { "gdlqbcli.exe" } else { "gdlqbcli" }.into()),
            license: include_str!("../assets/TERMS.md").into(),
            file_associations: vec![
                FileAssoc {
                    ext: "gdlqs".into(),
                    prog_id: "GDLQScript".into(),
                    description: "GD Level Queue Bot command script".into(),
                },
                FileAssoc {
                    ext: "gdui".into(),
                    prog_id: "GDUIModule".into(),
                    description: "GDUI module bundle".into(),
                },
                FileAssoc {
                    ext: "rhai".into(),
                    prog_id: "RhaiScript".into(),
                    description: "Rhai script".into(),
                },
            ],
            defaults: Defaults::default(),
            offers: vec![
                Offer {
                    id: "sample-module".into(),
                    name: "Sample Module".into(),
                    description: "A pretend marketplace module for testing the offers page.".into(),
                    default: true,
                },
                Offer {
                    id: "another-module".into(),
                    name: "Another Module".into(),
                    description: "Second pretend offer, unchecked by default.".into(),
                    default: false,
                },
            ],
            preset: serde_json::json!({}),
            payload_sha256: None,
        }
    }
}
