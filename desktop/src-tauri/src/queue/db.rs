use anyhow::Result;
use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use tauri::{AppHandle, Manager};
use tracing::warn;

pub async fn init(app: &AppHandle) -> Result<SqlitePool> {
    let db_path = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("data.db");

    if let Some(parent) = db_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    // A migration failure (most commonly sqlx's checksum check tripping on
    // an existing `data.db` whose applied-migrations history doesn't match
    // this build's `migrations/` — e.g. a file left over from an earlier
    // prototype build) used to `.expect()` straight into a panic here,
    // instantly killing the whole app on startup with no console to show it
    // in a release build. Quarantine the incompatible file, start over with a
    // fresh database, and best-effort copy back whatever rows still fit the
    // current schema instead of taking the whole app (and the user's queue
    // history) down with it.
    match connect_and_migrate(&db_path).await {
        Ok(pool) => Ok(pool),
        Err(e) => {
            warn!(
                "database init failed ({e}); quarantining {} and starting fresh",
                db_path.display()
            );
            let quarantined = quarantine(&db_path).await;
            let pool = connect_and_migrate(&db_path).await?;
            if let Some(old) = quarantined {
                recover_data(&pool, &old).await;
            }
            Ok(pool)
        }
    }
}

async fn connect_and_migrate(db_path: &Path) -> Result<SqlitePool> {
    let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", db_path.display()))?
        .create_if_missing(true);
    let pool = SqlitePool::connect_with(options).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

/// Renames the incompatible db file (and its `-wal`/`-shm` sidecars, if
/// SQLite left any behind) out of the way with a timestamp suffix instead of
/// deleting them outright — a support request can still ask for the
/// quarantined file to diagnose what actually went wrong. Returns the main
/// db file's new path (not the sidecars') for `recover_data` to attach.
async fn quarantine(db_path: &Path) -> Option<PathBuf> {
    let suffix = chrono::Local::now().format("%Y%m%d%H%M%S");
    let mut main_dest = None;
    for ext in ["", "-wal", "-shm"] {
        let src = PathBuf::from(format!("{}{ext}", db_path.display()));
        if tokio::fs::try_exists(&src).await.unwrap_or(false) {
            let dest = PathBuf::from(format!("{}{ext}.incompatible-{suffix}", db_path.display()));
            if tokio::fs::rename(&src, &dest).await.is_ok() && ext.is_empty() {
                main_dest = Some(dest);
            }
        }
    }
    main_dest
}

/// Best-effort recovery: attaches the quarantined db alongside the freshly
/// migrated one and, for every table that exists in both with at least one
/// column name in common, copies over whatever rows fit — skipping (not
/// failing on) tables that no longer exist, columns that were renamed, and
/// rows that violate a constraint in the new schema. This is deliberately
/// forgiving rather than exact: the alternative is the user's queue history
/// just vanishing into the quarantine file with no attempt made.
async fn recover_data(pool: &SqlitePool, quarantined_path: &Path) {
    let mut conn = match pool.acquire().await {
        Ok(c) => c,
        Err(e) => {
            warn!("data recovery: could not acquire a connection: {e}");
            return;
        }
    };

    let attach = format!(
        "ATTACH DATABASE '{}' AS old_db",
        quarantined_path.display().to_string().replace('\'', "''")
    );
    if let Err(e) = sqlx::query(&attach).execute(&mut *conn).await {
        warn!("data recovery: could not attach quarantined database: {e}");
        return;
    }

    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_sqlx_migrations'",
    )
    .fetch_all(&mut *conn)
    .await
    .unwrap_or_default();

    let mut recovered = Vec::new();
    for table in tables {
        let old_has_table: Option<String> = sqlx::query_scalar(
            "SELECT name FROM old_db.sqlite_master WHERE type = 'table' AND name = ?",
        )
        .bind(&table)
        .fetch_optional(&mut *conn)
        .await
        .unwrap_or(None);
        if old_has_table.is_none() {
            continue;
        }

        let new_cols = table_info_columns(&mut conn, "main", &table).await;
        let old_cols = table_info_columns(&mut conn, "old_db", &table).await;
        let common: Vec<&String> = new_cols.iter().filter(|c| old_cols.contains(c)).collect();
        if common.is_empty() {
            continue;
        }

        let col_list = common.iter().map(|c| format!("\"{c}\"")).collect::<Vec<_>>().join(", ");
        let insert = format!(
            "INSERT OR IGNORE INTO main.\"{table}\" ({col_list}) SELECT {col_list} FROM old_db.\"{table}\""
        );
        if let Ok(result) = sqlx::query(&insert).execute(&mut *conn).await {
            if result.rows_affected() > 0 {
                recovered.push(format!("{table} ({} rows)", result.rows_affected()));
            }
        }
    }

    let _ = sqlx::query("DETACH DATABASE old_db").execute(&mut *conn).await;

    if recovered.is_empty() {
        warn!("data recovery: no rows carried over from the quarantined database");
    } else {
        warn!("data recovery: restored {}", recovered.join(", "));
    }
}

async fn table_info_columns(
    conn: &mut sqlx::pool::PoolConnection<sqlx::Sqlite>,
    schema: &str,
    table: &str,
) -> Vec<String> {
    sqlx::query(&format!("PRAGMA {schema}.table_info(\"{table}\")"))
        .fetch_all(&mut **conn)
        .await
        .map(|rows| rows.iter().filter_map(|r| r.try_get::<String, _>("name").ok()).collect())
        .unwrap_or_default()
}
