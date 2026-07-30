use std::path::PathBuf;

/// Parsed command-line options. Tri-state `Option<bool>` fields override the
/// manifest defaults only when the flag was given.
#[derive(Debug, Default, Clone)]
pub struct Args {
    pub silent: bool,
    pub unattended: bool,
    pub accept_license: bool,
    pub uninstall: bool,
    pub update: bool,
    pub purge: bool,
    pub kill_running: bool,
    pub dir: Option<PathBuf>,
    pub install_cli: Option<bool>,
    pub enable_dev: Option<bool>,
    pub desktop_shortcut: Option<bool>,
    pub start_menu: Option<bool>,
    pub file_assoc: Option<bool>,
    pub launch: Option<bool>,
    pub preset_file: Option<PathBuf>,
    /// Simulate every step without touching the system (also forced on when
    /// the binary was built without a payload, i.e. installer development).
    pub dry_run: bool,
    /// Marketplace module ids to accept from the offers list (silent mode).
    pub offers: Option<Vec<String>>,
    pub no_offers: bool,
    pub help: bool,
}

pub const EXIT_OK: i32 = 0;
pub const EXIT_ERROR: i32 = 1;
pub const EXIT_LICENSE: i32 = 2;
pub const EXIT_RUNNING: i32 = 3;
pub const EXIT_BAD_ARGS: i32 = 4;
pub const EXIT_ALREADY_RUNNING: i32 = 5;

impl Args {
    pub fn parse() -> Result<Args, String> {
        let mut a = Args::default();
        let mut it = std::env::args().skip(1);
        while let Some(arg) = it.next() {
            let mut value_of = |name: &str| {
                it.next().ok_or_else(|| format!("{name} requires a value"))
            };
            match arg.as_str() {
                "--silent" | "/S" | "/s" | "-s" => a.silent = true,
                "--unattended" => a.unattended = true,
                "--accept-license" | "--accept-tos" => a.accept_license = true,
                "--uninstall" => a.uninstall = true,
                "--update" => a.update = true,
                "--purge" => a.purge = true,
                "--kill-running" => a.kill_running = true,
                "--dir" | "/D" => a.dir = Some(PathBuf::from(value_of("--dir")?)),
                "--with-cli" | "--cli" => a.install_cli = Some(true),
                "--no-cli" => a.install_cli = Some(false),
                "--enable-dev" | "--dev" => a.enable_dev = Some(true),
                "--no-dev" => a.enable_dev = Some(false),
                "--desktop-shortcut" => a.desktop_shortcut = Some(true),
                "--no-desktop-shortcut" => a.desktop_shortcut = Some(false),
                "--start-menu" => a.start_menu = Some(true),
                "--no-start-menu" => a.start_menu = Some(false),
                "--file-assoc" => a.file_assoc = Some(true),
                "--no-file-assoc" => a.file_assoc = Some(false),
                "--launch" => a.launch = Some(true),
                "--no-launch" => a.launch = Some(false),
                "--preset" => a.preset_file = Some(PathBuf::from(value_of("--preset")?)),
                "--dry-run" => a.dry_run = true,
                "--offers" => {
                    a.offers = Some(
                        value_of("--offers")?
                            .split(',')
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect(),
                    )
                }
                "--no-offers" => a.no_offers = true,
                "--help" | "-h" | "/?" => a.help = true,
                other => return Err(format!("Unknown option: {other}")),
            }
        }
        // Developer options require the CLI to be present.
        if a.enable_dev == Some(true) && a.install_cli != Some(false) {
            a.install_cli = Some(true);
        }
        if a.enable_dev == Some(true) && a.install_cli == Some(false) {
            return Err("--enable-dev requires the CLI (remove --no-cli)".into());
        }
        Ok(a)
    }

}

pub const HELP: &str = "\
Usage: installer [options]

Modes:
  (default)              Interactive graphical setup wizard
  --silent, /S           No UI at all; requires --accept-license to install
  --unattended           Show progress UI only, no questions asked
  --uninstall            Remove the application
  --update               Force update of an existing install (auto-detected too)

Install options:
  --dir <path>           Install location (default: per-user programs dir)
  --accept-license       Accept the terms of service (mandatory for --silent)
  --with-cli / --no-cli  Install the command-line tool and add it to PATH
  --enable-dev           Enable the in-app Development tab (implies --with-cli)
  --desktop-shortcut / --no-desktop-shortcut
  --start-menu / --no-start-menu
  --file-assoc / --no-file-assoc
  --launch / --no-launch Launch the app when setup finishes
  --preset <file.json>   JSON file with app settings to pre-seed
  --offers <id,id,…>     Accept these optional marketplace module offers
  --no-offers            Decline all optional offers
  --kill-running         Close a running instance instead of aborting
  --dry-run              Simulate everything; write nothing (installer dev)

Uninstall options:
  --purge                Also delete app data (queue, settings, modules)

Exit codes: 0 ok, 1 error, 2 license not accepted, 3 app running,
            4 bad arguments, 5 setup already running
";
