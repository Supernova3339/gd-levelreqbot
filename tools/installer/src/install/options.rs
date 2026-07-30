//! User-facing choices for one install run and how they are resolved from
//! manifest defaults + command-line flags.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::manifest::Manifest;
use crate::sys;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallOptions {
    pub dir: PathBuf,
    pub desktop_shortcut: bool,
    pub start_menu: bool,
    pub install_cli: bool,
    pub enable_dev: bool,
    pub file_assoc: bool,
    pub launch_after: bool,
    /// Marketplace module ids accepted from the optional offers page.
    #[serde(default)] pub selected_offers: Vec<String>,
    /// Simulate only — never touch the filesystem, registry, or PATH.
    #[serde(default)] pub dry_run: bool,
}

impl InstallOptions {
    pub fn from_defaults(manifest: &Manifest) -> InstallOptions {
        let d = &manifest.defaults;
        InstallOptions {
            dir: sys::default_install_dir(manifest),
            desktop_shortcut: d.desktop_shortcut,
            start_menu: d.start_menu,
            install_cli: d.install_cli || d.enable_dev,
            enable_dev: d.enable_dev,
            file_assoc: d.file_assoc && !manifest.file_associations.is_empty(),
            launch_after: d.launch_after,
            selected_offers: manifest
                .offers
                .iter()
                .filter(|o| o.default)
                .map(|o| o.id.clone())
                .collect(),
            dry_run: false,
        }
    }

    pub fn apply_args(&mut self, args: &crate::args::Args) {
        if let Some(d) = &args.dir { self.dir = d.clone(); }
        if let Some(v) = args.desktop_shortcut { self.desktop_shortcut = v; }
        if let Some(v) = args.start_menu { self.start_menu = v; }
        if let Some(v) = args.install_cli { self.install_cli = v; }
        if let Some(v) = args.enable_dev { self.enable_dev = v; }
        if let Some(v) = args.file_assoc { self.file_assoc = v; }
        if let Some(v) = args.launch { self.launch_after = v; }
        if let Some(ids) = &args.offers { self.selected_offers = ids.clone(); }
        if args.no_offers { self.selected_offers.clear(); }
        if args.dry_run { self.dry_run = true; }
        if self.enable_dev { self.install_cli = true; }
    }
}
