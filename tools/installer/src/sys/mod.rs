//! Small system helpers: process detection, well-known paths, file logging.

mod blessing;
mod lock;
mod log;
mod paths;
mod process;

pub use blessing::dev_blessing;
pub use lock::acquire_instance_lock;
pub use log::Log;
pub use paths::{
    all_app_data_dirs, app_data_dir, default_install_dir, installer_data_dirs,
    installer_state_dir, setup_log_path, slug,
};
pub use process::{app_is_running, close_running_app};
