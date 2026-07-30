mod build;
mod online;

use clap::{Parser, Subcommand};

const APP_URL: &str = "http://localhost:24363";

#[derive(Parser)]
#[command(
    name = "gdlqbot",
    about = "GD Level Request Bot — developer CLI",
    version,
    propagate_version = true,
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Build one or all modules/packages into .gdmod/.gdpck files
    Build {
        /// Package ID to build (omit for all)
        target: Option<String>,
        /// Validate manifests only, produce no output files
        #[arg(long)]
        validate: bool,
        /// Bump version before building
        #[arg(long, value_name = "PART")]
        bump: Option<build::BumpPart>,
        /// Only build packages changed since this git tag
        #[arg(long, value_name = "TAG")]
        since: Option<String>,
        /// Publish to marketplace: URL and token
        #[arg(long, value_names = ["URL", "TOKEN"], num_args = 2)]
        publish: Option<Vec<String>>,
        /// Base CDN URL for download links when publishing
        #[arg(long, value_name = "URL")]
        download_base: Option<String>,
        /// Embed GitHub repo source info (owner/repo)
        #[arg(long, value_name = "OWNER/REPO")]
        github_repo: Option<String>,
    },

    /// Watch a package for source changes and rebuild automatically
    Watch {
        /// Package ID to watch (required)
        target: String,
    },

    /// Check app status (requires running app)
    Status,

    /// List installed modules (requires running app)
    Modules,

    /// List registered bot commands (requires running app)
    Commands,

    /// Run preflight checks on a module (requires running app)
    Preflight {
        /// Module ID to check
        id: String,
    },

    /// Install a module from a local source directory (requires running app)
    Install {
        /// Path to the module source directory (must contain manifest.json)
        dir: String,
    },

    /// Start hot-reloading a module from a local source directory (requires running app)
    DevWatch {
        /// Path to the module source directory
        dir: String,
    },

    /// Stop a dev watch for a module (requires running app)
    DevUnwatch {
        /// Module ID to stop watching
        id: String,
    },

    /// Evaluate a Rhai expression (requires running app)
    Eval {
        /// Rhai expression to evaluate
        code: String,
        /// Module ID for `ms` context
        #[arg(long, short)]
        module: Option<String>,
    },

    /// Stream the app console and open an interactive Rhai REPL (requires running app)
    Console {
        /// Module ID to load as context (enables library functions + ms proxy)
        #[arg(long, short)]
        module: Option<String>,
    },
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let result = match cli.command {
        Commands::Build { target, validate, bump, since, publish, download_base, github_repo } => {
            let pub_args = publish.map(|v| (v[0].clone(), v[1].clone()));
            build::run(build::BuildArgs {
                target,
                validate,
                bump,
                since,
                publish: pub_args,
                download_base: download_base.unwrap_or_default(),
                github_repo: github_repo.unwrap_or_default(),
                watch: false,
            }).await
        }
        Commands::Watch { target } => {
            build::run(build::BuildArgs {
                target: Some(target),
                validate: false,
                bump: None,
                since: None,
                publish: None,
                download_base: String::new(),
                github_repo: String::new(),
                watch: true,
            }).await
        }
        Commands::Status         => online::status(APP_URL).await,
        Commands::Modules        => online::modules(APP_URL).await,
        Commands::Commands       => online::commands(APP_URL).await,
        Commands::Preflight { id } => online::preflight(APP_URL, &id).await,
        Commands::Install { dir }  => online::install(APP_URL, &dir).await,
        Commands::DevWatch { dir } => online::dev_watch(APP_URL, &dir).await,
        Commands::DevUnwatch { id } => online::dev_unwatch(APP_URL, &id).await,
        Commands::Eval { code, module } => online::eval(APP_URL, &code, module.as_deref()).await,
        Commands::Console { module }    => online::console(APP_URL, module).await,
    };

    if let Err(e) = result {
        eprintln!("\x1b[91mError:\x1b[0m {e}");
        std::process::exit(1);
    }
}
