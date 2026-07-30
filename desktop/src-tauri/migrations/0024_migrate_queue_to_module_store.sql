-- Migrate queue and queue_history data into user_data module collections.
-- After this migration the 'queue' and 'queue_history' tables are dropped.

-- 1. Migrate viewer queue entries → module:level-queue:viewer collection
INSERT INTO user_data (collection, doc_id, data)
SELECT 'module:level-queue:viewer',
       lower(hex(randomblob(16))),
       json_object(
               'level_id', level_id,
               'username', username,
               'platform', platform,
               'is_subscriber', is_subscriber,
               'position', position,
               'added_at', added_at
       )
FROM queue
WHERE queue_type = 'viewer'
ORDER BY position;

-- 2. Migrate subscriber queue entries → module:level-queue:subscriber collection
INSERT INTO user_data (collection, doc_id, data)
SELECT 'module:level-queue:subscriber',
       lower(hex(randomblob(16))),
       json_object(
               'level_id', level_id,
               'username', username,
               'platform', platform,
               'is_subscriber', is_subscriber,
               'position', position,
               'added_at', added_at
       )
FROM queue
WHERE queue_type = 'subscriber'
ORDER BY position;

-- 3. Migrate history → module:level-queue:history collection
INSERT INTO user_data (collection, doc_id, data)
SELECT 'module:level-queue:history',
       lower(hex(randomblob(16))),
       json_object(
               'level_id', level_id,
               'username', username,
               'queue_type', queue_type,
               'platform', platform,
               'nexted_at', nexted_at
       )
FROM queue_history
ORDER BY nexted_at;

-- 4. Copy queue_open and queue_max_size config values to kv_store
INSERT
OR REPLACE INTO kv_store (key, value, updated_at)
SELECT 'module:level-queue:kv:open', CAST(queue_open AS TEXT), unixepoch()
FROM config LIMIT 1;

INSERT
OR REPLACE INTO kv_store (key, value, updated_at)
SELECT 'module:level-queue:kv:max_size', CAST(queue_max_size AS TEXT), unixepoch()
FROM config LIMIT 1;

-- 5. Drop old tables
DROP TABLE IF EXISTS queue;
DROP TABLE IF EXISTS queue_history;
