//! Fully headless install/uninstall for --silent. No window is ever created;
//! progress goes to %TEMP%/<product>-setup.log (and stdout when a console is
//! attached). Exit codes are documented in args.rs.

use crate::args::{Args, EXIT_ERROR, EXIT_LICENSE, EXIT_OK, EXIT_RUNNING};
use crate::install::{self, InstallOptions};
use crate::manifest::Manifest;
use crate::sys;

pub fn run(manifest: &Manifest, args: &Args, forced_dry: bool) -> i32 {
    let mut log = sys::Log::new(&sys::slug(&manifest.product_name));
    let mode = if args.uninstall { "uninstall" } else { "install" };
    log.line(&format!(
        "── {} v{} silent {mode} ──",
        manifest.product_name, manifest.version
    ));
    if forced_dry {
        log.line("Built without a payload — dry run is FORCED; nothing will be written.");
    }

    if !args.uninstall && !args.accept_license {
        log.line("Refusing to install: --silent requires --accept-license (terms of service).");
        return EXIT_LICENSE;
    }

    let dry = args.dry_run || forced_dry;
    if sys::app_is_running(manifest) {
        if dry {
            log.line("App is running — dry run: would require closing it; continuing simulation.");
        } else if args.kill_running {
            log.line("App is running; closing it (--kill-running)…");
            if let Err(e) = sys::close_running_app(manifest) {
                log.line(&e);
                return EXIT_RUNNING;
            }
        } else {
            log.line("App is running. Close it or pass --kill-running.");
            return EXIT_RUNNING;
        }
    }

    let existing = install::find_existing(manifest);

    let result = if args.uninstall {
        let dir = args
            .dir
            .clone()
            .or_else(|| existing.as_ref().map(|r| r.options.dir.clone()))
            .unwrap_or_else(|| sys::default_install_dir(manifest));
        log.line(&format!("Uninstalling from {}", dir.display()));
        let r = install::run_uninstall(manifest, &dir, args.purge, dry, &|_f, _m| {});
        // No GUI, no Finish button to wait on — finalize (self-delete) right
        // away, same as the removal work that just happened.
        if r.is_ok() && !dry {
            install::finalize_uninstall(manifest, &dir);
        }
        r
    } else {
        let mut opts = existing
            .as_ref()
            .map(|r| {
                log.line(&format!(
                    "Existing v{} found at {} — updating.",
                    r.version,
                    r.options.dir.display()
                ));
                r.options.clone()
            })
            .unwrap_or_else(|| InstallOptions::from_defaults(manifest));
        opts.apply_args(args);
        if forced_dry {
            opts.dry_run = true;
        }
        log.line(&format!(
            "Installing to {} (cli={}, dev={}, offers={:?}, dry_run={})",
            opts.dir.display(), opts.install_cli, opts.enable_dev, opts.selected_offers, opts.dry_run
        ));
        let r = install::run_install(manifest, &opts, &|_f, _m| {});
        if r.is_ok() && !opts.dry_run && args.launch == Some(true) {
            install::launch_app(manifest, &opts.dir);
        }
        r
    };

    match result {
        Ok(()) => {
            log.line("Completed successfully.");
            EXIT_OK
        }
        Err(e) => {
            log.line(&format!("FAILED: {e}"));
            EXIT_ERROR
        }
    }
}
