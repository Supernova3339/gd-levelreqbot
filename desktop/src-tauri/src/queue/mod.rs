pub mod db;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueEntry {
    pub id: i64,
    pub level_id: i64,
    pub username: String,
    pub is_subscriber: bool,
    pub position: i64,
    pub queue_type: String,
    pub platform: String,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuePage {
    pub data: Vec<QueueEntry>,
    pub page: u32,
    pub total_pages: u32,
    pub total_items: u32,
    pub items_per_page: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextLevel {
    pub level_id: i64,
    pub username: String,
    pub queue_type: String,
}

pub struct QueueState {
    pub db: Arc<RwLock<SqlitePool>>,
}

impl Clone for QueueState {
    fn clone(&self) -> Self {
        Self {
            db: Arc::clone(&self.db),
        }
    }
}

impl QueueState {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            db: Arc::new(RwLock::new(pool)),
        }
    }

    pub async fn add_level(
        &self,
        level_id: i64,
        username: &str,
        is_subscriber: bool,
        sub_mode: bool,
        viewer_limit: u32,
        subscriber_limit: u32,
    ) -> Result<String> {
        self.add_level_from(level_id, username, is_subscriber, sub_mode, viewer_limit, subscriber_limit, "twitch").await
    }

    pub async fn add_level_from(
        &self,
        level_id: i64,
        username: &str,
        is_subscriber: bool,
        sub_mode: bool,
        viewer_limit: u32,
        subscriber_limit: u32,
        platform: &str,
    ) -> Result<String> {
        let pool = self.db.read().await;

        // Check for duplicate
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM queue WHERE level_id = ?)"
        )
        .bind(level_id)
        .fetch_one(&*pool)
        .await?;

        if exists {
            return Ok(format!("Level {} is already in the queue.", level_id));
        }

        // Determine which queue to use
        let effective_subscriber = is_subscriber && sub_mode;
        let queue_type = if effective_subscriber { "subscriber" } else { "viewer" };
        let limit = if effective_subscriber { subscriber_limit } else { viewer_limit };

        // Check user's request limit
        let user_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM queue WHERE username = ? AND queue_type = ?"
        )
        .bind(username)
        .bind(queue_type)
        .fetch_one(&*pool)
        .await?;

        if user_count >= limit as i64 {
            return Ok(format!(
                "Sorry, you have reached your request limit of {} level(s).",
                limit
            ));
        }

        // Get next position
        let max_pos: Option<i64> = sqlx::query_scalar(
            "SELECT MAX(position) FROM queue WHERE queue_type = ?"
        )
        .bind(queue_type)
        .fetch_one(&*pool)
        .await?;

        let position = max_pos.unwrap_or(0) + 1;

        sqlx::query(
            "INSERT INTO queue (level_id, username, is_subscriber, position, queue_type, platform) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(level_id)
        .bind(username)
        .bind(effective_subscriber as i64)
        .bind(position)
        .bind(queue_type)
        .bind(platform)
        .execute(&*pool)
        .await?;

        Ok(format!("Level {} added to the queue for {}.", level_id, username))
    }

    pub async fn remove_level(&self, level_id: i64) -> Result<String> {
        let pool = self.db.read().await;
        let result = sqlx::query("DELETE FROM queue WHERE level_id = ?")
            .bind(level_id)
            .execute(&*pool)
            .await?;

        if result.rows_affected() == 0 {
            Ok(format!("Level {} was not found in the queue.", level_id))
        } else {
            Ok(format!("Level {} has been removed from the queue.", level_id))
        }
    }

    pub async fn clear(&self) -> Result<String> {
        let pool = self.db.read().await;
        sqlx::query("DELETE FROM queue").execute(&*pool).await?;
        Ok("The level queue has been cleared.".to_string())
    }

    pub async fn next_level(&self, sub_mode: bool) -> Result<Option<NextLevel>> {
        let pool = self.db.read().await;

        // 60% chance to pick from subscriber queue if non-empty and sub mode on
        let pick_subscriber = sub_mode && {
            let sub_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM queue WHERE queue_type = 'subscriber'"
            )
            .fetch_one(&*pool)
            .await?;
            sub_count > 0 && rand_bool(0.6)
        };

        let queue_type = if pick_subscriber { "subscriber" } else { "viewer" };

        let entry: Option<(i64, i64, String)> = sqlx::query_as(
            "SELECT id, level_id, username FROM queue WHERE queue_type = ? ORDER BY position ASC LIMIT 1"
        )
        .bind(queue_type)
        .fetch_optional(&*pool)
        .await?;

        match entry {
            None => Ok(None),
            Some((id, level_id, username)) => {
                sqlx::query("DELETE FROM queue WHERE id = ?")
                    .bind(id)
                    .execute(&*pool)
                    .await?;

                Ok(Some(NextLevel {
                    level_id,
                    username,
                    queue_type: queue_type.to_string(),
                }))
            }
        }
    }

    pub async fn get_position(&self, level_id: i64, _sub_mode: bool) -> Result<Option<(i64, String)>> {
        let pool = self.db.read().await;

        let row: Option<(i64, String)> = sqlx::query_as(
            "SELECT position, queue_type FROM queue WHERE level_id = ?"
        )
        .bind(level_id)
        .fetch_optional(&*pool)
        .await?;

        Ok(row)
    }

    pub async fn get_page(&self, queue_type: &str, page: u32, per_page: u32) -> Result<QueuePage> {
        let pool = self.db.read().await;

        let total: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM queue WHERE queue_type = ?"
        )
        .bind(queue_type)
        .fetch_one(&*pool)
        .await?;

        let total_pages = ((total as u32) + per_page - 1) / per_page;
        let page = page.clamp(1, total_pages.max(1));
        let offset = (page - 1) * per_page;

        let rows: Vec<(i64, i64, String, i64, String, String, String)> = sqlx::query_as(
            "SELECT id, level_id, username, is_subscriber, queue_type, platform, added_at
             FROM queue WHERE queue_type = ?
             ORDER BY position ASC LIMIT ? OFFSET ?"
        )
        .bind(queue_type)
        .bind(per_page as i64)
        .bind(offset as i64)
        .fetch_all(&*pool)
        .await?;

        let data = rows
            .into_iter()
            .enumerate()
            .map(|(i, (id, level_id, username, is_sub, qt, platform, added_at))| QueueEntry {
                id,
                level_id,
                username,
                is_subscriber: is_sub != 0,
                position: offset as i64 + i as i64 + 1,
                queue_type: qt,
                platform,
                added_at,
            })
            .collect();

        Ok(QueuePage {
            data,
            page,
            total_pages,
            total_items: total as u32,
            items_per_page: per_page,
        })
    }
}

fn rand_bool(probability: f64) -> bool {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    (nanos as f64 / u32::MAX as f64) < probability
}
