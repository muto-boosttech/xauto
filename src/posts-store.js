import { openPostsDb } from "./db.js";

/**
 * @param {{ content: string; category: string; hook_type: string; char_count: number; status?: string; scheduled_at?: string | null; batch_id?: string | null }} row
 */
export function insertPost(row) {
  const db = openPostsDb();
  const info = db
    .prepare(
      `INSERT INTO posts (content, category, hook_type, char_count, status, scheduled_at, batch_id)
       VALUES (@content, @category, @hook_type, @char_count, @status, @scheduled_at, @batch_id)`
    )
    .run({
      content: row.content,
      category: row.category,
      hook_type: row.hook_type,
      char_count: row.char_count,
      status: row.status ?? "draft",
      scheduled_at: row.scheduled_at ?? null,
      batch_id: row.batch_id ?? null,
    });
  return info.lastInsertRowid;
}

/**
 * @param {number} localId
 * @param {string} tweetId
 */
export function markPosted(localId, tweetId) {
  const db = openPostsDb();
  db.prepare(
    `UPDATE posts SET id = ?, status = 'posted', posted_at = datetime('now'), scheduled_at = NULL WHERE local_id = ?`
  ).run(tweetId, localId);
}

/**
 * @param {number} localId
 * @param {string} whenIso
 */
export function markScheduled(localId, whenIso) {
  const db = openPostsDb();
  db.prepare(
    `UPDATE posts SET status = 'scheduled', scheduled_at = ? WHERE local_id = ?`
  ).run(whenIso, localId);
}

/**
 * @param {string} tweetId
 */
export function findByTweetId(tweetId) {
  const db = openPostsDb();
  return db.prepare(`SELECT * FROM posts WHERE id = ?`).get(tweetId);
}

/** @param {number} localId */
export function getPostByLocalId(localId) {
  const db = openPostsDb();
  return db.prepare(`SELECT * FROM posts WHERE local_id = ?`).get(localId);
}

export function listPostedTweetIds(limit = 500) {
  const db = openPostsDb();
  const rows = db
    .prepare(`SELECT id FROM posts WHERE status = 'posted' AND id IS NOT NULL ORDER BY posted_at DESC LIMIT ?`)
    .all(limit);
  return rows.map((r) => r.id);
}

/**
 * @param {number} localId
 * @param {string} content
 */
export function updatePostContent(localId, content) {
  const db = openPostsDb();
  db.prepare(`UPDATE posts SET content = ?, char_count = ? WHERE local_id = ?`).run(
    content,
    [...content].length,
    localId
  );
}

/** @param {number} localId */
export function markRejected(localId) {
  const db = openPostsDb();
  db.prepare(`UPDATE posts SET status = 'rejected' WHERE local_id = ?`).run(localId);
}

export function findLatestPendingBatchId() {
  const db = openPostsDb();
  const row = db
    .prepare(
      `SELECT batch_id FROM posts WHERE status = 'pending_review' AND batch_id IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .get();
  return row?.batch_id ?? null;
}

/** @returns {{ id: string; count: number; latest: string }[]} */
export function listPendingBatches() {
  const db = openPostsDb();
  return db
    .prepare(
      `SELECT batch_id AS id, COUNT(*) AS count, MAX(created_at) AS latest
       FROM posts WHERE status = 'pending_review' AND batch_id IS NOT NULL
       GROUP BY batch_id ORDER BY latest DESC`
    )
    .all();
}

/** @param {string} batchId */
export function listPendingReviewByBatch(batchId) {
  const db = openPostsDb();
  return db
    .prepare(
      `SELECT * FROM posts WHERE batch_id = ? AND status = 'pending_review' ORDER BY local_id ASC`
    )
    .all(batchId);
}

/**
 * 同バッチで「翌日」にすでに予約済みの件数（レビュー再開時のスロットずらし用）
 * @param {string} batchId
 * @param {string} tomorrowYmd Tokyo YYYY-MM-DD
 */
export function countScheduledForBatchOnDate(batchId, tomorrowYmd) {
  const db = openPostsDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM posts WHERE batch_id = ? AND status = 'scheduled'
       AND scheduled_at IS NOT NULL AND scheduled_at LIKE ?`
    )
    .get(batchId, `${tomorrowYmd}%`);
  return row?.c ?? 0;
}

/** @param {number} [limit] */
export function listScheduledPosts(limit = 30) {
  const db = openPostsDb();
  return db
    .prepare(
      `SELECT local_id, scheduled_at, category, char_count,
       substr(content, 1, 120) AS preview, status
       FROM posts WHERE status = 'scheduled' AND scheduled_at IS NOT NULL
       ORDER BY scheduled_at ASC LIMIT ?`
    )
    .all(limit);
}
