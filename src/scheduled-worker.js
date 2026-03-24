import { openPostsDb } from "./db.js";
import { makeXClient, postTweet } from "./x-client.js";
import { markPosted } from "./posts-store.js";
import { queueInitialFetches } from "./analytics.js";

export function hasXCredentialsForScheduledPosts() {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET ?? process.env.X_ACCESS_TOKEN_SECRET;
  return !!(appKey && appSecret && accessToken && accessSecret);
}

/**
 * 予約時刻が来た投稿を X に投稿
 * @returns {{ ok: boolean; posted: number; errors: string[]; skipReason?: string }}
 */
export async function processDueScheduledPosts() {
  const errors = [];
  if (!hasXCredentialsForScheduledPosts()) {
    const msg =
      "[scheduled] X API 環境変数が不足しています（X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET）。予約投稿はスキップされます。";
    console.error(msg);
    return { ok: false, posted: 0, errors: [msg], skipReason: "missing_x_credentials" };
  }

  let client;
  try {
    client = makeXClient();
  } catch (e) {
    const msg = `[scheduled] X クライアント初期化失敗: ${/** @type {Error} */ (e).message || e}`;
    console.error(msg);
    return { ok: false, posted: 0, errors: [msg], skipReason: "x_client_error" };
  }

  const db = openPostsDb();
  const rows = db
    .prepare(
      `SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at IS NOT NULL
       ORDER BY scheduled_at ASC LIMIT 200`
    )
    .all();
  const now = Date.now();
  const due = rows.filter((r) => {
    const t = Date.parse(r.scheduled_at);
    return Number.isFinite(t) && t <= now;
  });

  let posted = 0;
  for (const row of due) {
    try {
      const data = await postTweet(client, row.content);
      markPosted(row.local_id, data.id);
      queueInitialFetches(data.id);
      posted += 1;
      console.log(`[scheduled] posted local_id=${row.local_id} tweet_id=${data.id}`);
    } catch (e) {
      const m = `[scheduled] failed local_id=${row.local_id}: ${/** @type {Error} */ (e).message || e}`;
      console.error(m, e);
      errors.push(m);
    }
  }

  return { ok: errors.length === 0, posted, errors };
}
