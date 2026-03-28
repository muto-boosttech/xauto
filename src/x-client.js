import { TwitterApi } from "twitter-api-v2";

export function makeXClient() {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET ?? process.env.X_ACCESS_TOKEN_SECRET;
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error(
      "X API 認証情報が不足しています: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET（または X_ACCESS_TOKEN_SECRET）"
    );
  }
  return new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  });
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {import('twitter-api-v2').TwitterApi} client
 * @param {string} text
 */
export async function postTweet(client, text) {
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      const rw = client.readWrite;
      const res = await rw.v2.tweet(text);
      return res.data;
    } catch (e) {
      lastErr = e;
      const any = /** @type {{ code?: number; data?: unknown; message?: string }} */ (e);
      if (any?.data != null) console.error("[x] tweet error detail", JSON.stringify(any.data));
      else if (any?.message) console.error("[x] tweet error", any.message);
      const code = /** @type {{ code?: number; rateLimit?: { reset?: number } }} */ (e).code;
      if (code === 429) {
        const reset = /** @type {{ rateLimit?: { reset?: number } }} */ (e).rateLimit?.reset;
        const wait = reset ? Math.max(0, reset * 1000 - Date.now()) + 500 : 60_000;
        await sleep(Math.min(wait, 15 * 60_000));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/**
 * @param {import('twitter-api-v2').TwitterApi} client
 * @param {string} tweetId
 */
/**
 * @param {import('twitter-api-v2').TwitterApi} client
 * @param {string} username @なし可
 * @param {number} maxResults
 */
export async function fetchRecentTweetsByUsername(client, username, maxResults = 6) {
  const uname = username.replace(/^@/, "");
  const rw = client.readWrite;
  const user = await rw.v2.userByUsername(uname);
  if (!user.data?.id) return [];
  const n = Math.min(10, Math.max(5, maxResults));
  const tl = await rw.v2.userTimeline(user.data.id, {
    max_results: n,
    exclude: ["replies", "retweets"],
    "tweet.fields": ["public_metrics", "created_at"],
  });
  const tweets = tl.tweets ?? [];
  return tweets.slice(0, maxResults).map((t) => ({
    id: t.id,
    text: t.text,
    metrics: t.public_metrics,
  }));
}

export async function fetchTweetMetrics(client, tweetId) {
  const rw = client.readWrite;
  const tweet = await rw.v2.singleTweet(tweetId, {
    "tweet.fields": ["non_public_metrics", "public_metrics"],
  });
  const t = tweet.data;
  if (!t) return null;
  const npm = t.non_public_metrics ?? {};
  const pm = t.public_metrics ?? {};
  const impressions = npm.impression_count ?? 0;
  const likes = pm.like_count ?? 0;
  const retweets = pm.retweet_count ?? 0;
  const replies = pm.reply_count ?? 0;
  const bookmarks = pm.bookmark_count ?? 0;
  const profile_clicks = npm.user_profile_clicks ?? 0;
  const engagement_total = likes + retweets + replies + bookmarks;
  return {
    post_id: tweetId,
    impressions: Number(impressions) || 0,
    likes,
    retweets,
    replies,
    bookmarks,
    profile_clicks,
    engagement_total,
  };
}
