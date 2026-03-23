import { openPostsDb } from "./db.js";
import { makeXClient, postTweet } from "./x-client.js";
import { markPosted } from "./posts-store.js";
import { queueInitialFetches } from "./analytics.js";

/** 予約時刻が来た投稿を X に投稿 */
export async function processDueScheduledPosts() {
  let client;
  try {
    client = makeXClient();
  } catch {
    return;
  }
  const db = openPostsDb();
  const rows = db
    .prepare(
      `SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at IS NOT NULL
       ORDER BY scheduled_at ASC LIMIT 15`
    )
    .all();
  const now = Date.now();
  const due = rows.filter((r) => {
    const t = Date.parse(r.scheduled_at);
    return Number.isFinite(t) && t <= now;
  });
  for (const row of due) {
    try {
      const data = await postTweet(client, row.content);
      markPosted(row.local_id, data.id);
      queueInitialFetches(data.id);
      console.log(`[scheduled] posted local_id=${row.local_id} tweet_id=${data.id}`);
    } catch (e) {
      console.error(`[scheduled] failed local_id=${row.local_id}`, e);
    }
  }
}
