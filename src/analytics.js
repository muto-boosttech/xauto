import { openAnalyticsDb } from "./db.js";
import { makeXClient, fetchTweetMetrics } from "./x-client.js";

/**
 * @param {string} postId
 */
export function queueInitialFetches(postId) {
  const db = openAnalyticsDb();
  const now = Date.now();
  const delays = [60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];
  const ins = db.prepare(
    `INSERT INTO analytics_queue (post_id, run_at, done) VALUES (?, ?, 0)`
  );
  for (const ms of delays) {
    const runAt = new Date(now + ms).toISOString();
    ins.run(postId, runAt);
  }
}

/**
 * @param {import('twitter-api-v2').TwitterApi} [client]
 */
export async function processAnalyticsQueue(client) {
  const c = client ?? makeXClient();
  const db = openAnalyticsDb();
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT id, post_id FROM analytics_queue WHERE done = 0 AND run_at <= ? ORDER BY run_at LIMIT 50`
    )
    .all(now);

  for (const row of rows) {
    try {
      const m = await fetchTweetMetrics(c, row.post_id);
      if (m) saveMetricsRow(m);
      db.prepare(`UPDATE analytics_queue SET done = 1 WHERE id = ?`).run(row.id);
    } catch {
      /* keep in queue for retry */
    }
  }
}

/**
 * @param {ReturnType<typeof fetchTweetMetrics> extends Promise<infer R> ? NonNullable<R> : never} m
 */
export function saveMetricsRow(m) {
  const db = openAnalyticsDb();
  db.prepare(
    `INSERT INTO analytics (post_id, fetched_at, impressions, likes, retweets, replies, bookmarks, profile_clicks, engagement_total)
     VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    m.post_id,
    m.impressions,
    m.likes,
    m.retweets,
    m.replies,
    m.bookmarks,
    m.profile_clicks,
    m.engagement_total
  );
}

/**
 * Refresh latest metrics for many tweet ids (weekly job)
 * @param {string[]} ids
 */
export async function refreshMetricsForTweets(ids) {
  const c = makeXClient();
  for (const id of ids) {
    try {
      const m = await fetchTweetMetrics(c, id);
      if (m) saveMetricsRow(m);
      await new Promise((r) => setTimeout(r, 300));
    } catch {
      /* skip */
    }
  }
}

export function latestMetricsByPost() {
  const db = openAnalyticsDb();
  return db
    .prepare(
      `SELECT a.* FROM analytics a
       INNER JOIN (
         SELECT post_id, MAX(fetched_at) AS mx FROM analytics GROUP BY post_id
       ) t ON a.post_id = t.post_id AND a.fetched_at = t.mx`
    )
    .all();
}
