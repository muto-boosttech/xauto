import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, DATA_DIR } from "./paths.js";
import { openPostsDb } from "./db.js";
import { latestMetricsByPost } from "./analytics.js";
import { makeXClient, fetchRecentTweetsByUsername } from "./x-client.js";

function loadCompetitorsConfig() {
  const p = path.join(CONFIG_DIR, "competitors.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export async function refreshCompetitorSnapshot() {
  const cfg = loadCompetitorsConfig();
  const client = makeXClient();
  const out = { fetchedAt: new Date().toISOString(), accounts: [] };
  for (const h of cfg.handles || []) {
    try {
      const tweets = await fetchRecentTweetsByUsername(
        client,
        h,
        cfg.max_tweets_per_account ?? 6
      );
      out.accounts.push({ handle: h.replace(/^@/, ""), sample: tweets });
      await new Promise((r) => setTimeout(r, 900));
    } catch (e) {
      const msg = /** @type {Error} */ (e).message || String(e);
      out.accounts.push({ handle: String(h).replace(/^@/, ""), error: msg });
    }
  }
  const snapPath = resolveSnapshotPath(cfg);
  fs.mkdirSync(path.dirname(snapPath), { recursive: true });
  fs.writeFileSync(snapPath, JSON.stringify(out, null, 2), "utf8");
  return out;
}

function resolveSnapshotPath(cfg) {
  const rel = cfg.snapshot_path || "competitor_snapshot.json";
  if (path.isAbsolute(rel)) return rel;
  const clean = rel.replace(/^(\.\/)?data\//, "");
  return path.join(DATA_DIR, clean);
}

export function loadCompetitorSnapshot() {
  const cfg = loadCompetitorsConfig();
  const snapPath = resolveSnapshotPath(cfg);
  if (!fs.existsSync(snapPath)) return null;
  return JSON.parse(fs.readFileSync(snapPath, "utf8"));
}

export function summarizeOwnPerformance() {
  const db = openPostsDb();
  const metrics = latestMetricsByPost();
  const byId = Object.fromEntries(metrics.map((m) => [m.post_id, m]));
  const rows = db
    .prepare(
      `SELECT local_id, id, category, content, hook_type, posted_at FROM posts
       WHERE status = 'posted' AND id IS NOT NULL ORDER BY posted_at DESC LIMIT 100`
    )
    .all();
  const enriched = rows.map((r) => ({
    ...r,
    m: byId[r.id],
    eng: byId[r.id]?.engagement_total ?? 0,
    imp: byId[r.id]?.impressions ?? 0,
  }));
  const withM = enriched.filter((r) => r.m);
  withM.sort((a, b) => b.eng - a.eng);
  const top = withM.slice(0, 8);
  const weak = [...withM].sort((a, b) => a.eng - b.eng).slice(0, 4);

  const lines = [];
  lines.push("## 自アカウントの投稿パフォーマンス（ローカルDB・メトリクス取得済みのみ）");
  if (!top.length) {
    lines.push(
      "（メトリクスがまだ少ない。`node cli.js analytics refresh` を定期実行すると精度が上がる）"
    );
    const recent = enriched.slice(0, 5);
    if (recent.length) {
      lines.push("直近投稿（計測なし・冒頭のみ）:");
      for (const t of recent) {
        const prev = (t.content || "").replace(/\n/g, " ").slice(0, 70);
        lines.push(`- [${t.category}] ${prev}…`);
      }
    }
    return lines.join("\n");
  }
  lines.push("エンゲージメントが高めだった例（参考。コピー禁止・抽象パターンのみ取り込む）:");
  for (const t of top) {
    const prev = (t.content || "").replace(/\n/g, " ").slice(0, 70);
    lines.push(`- [${t.category}] eng=${t.eng} imp=${t.imp}: ${prev}…`);
  }
  lines.push("伸び悩み寄りの例（避ける論点・フックの参考）:");
  for (const t of weak) {
    const prev = (t.content || "").replace(/\n/g, " ").slice(0, 70);
    lines.push(`- [${t.category}] eng=${t.eng}: ${prev}…`);
  }
  return lines.join("\n");
}

/** @param {Record<string, unknown> | null | undefined} snap */
export function formatCompetitorSnapshot(snap) {
  if (!snap || !Array.isArray(snap.accounts) || snap.accounts.length === 0) {
    return "（競合スナップショットなし。`node cli.js insights refresh` またはデーモンの定期取得を待つ）";
  }
  const lines = ["## 競合アカウントの直近投稿（X API 取得・要約用）"];
  lines.push(`取得時刻: ${snap.fetchedAt || "?"}`);
  for (const a of snap.accounts) {
    lines.push(`\n### @${a.handle}`);
    if (a.error) {
      lines.push(`- 取得失敗: ${a.error}`);
      continue;
    }
    for (const tw of a.sample || []) {
      const m = tw.metrics || {};
      const prev = (tw.text || "").replace(/\n/g, " ").slice(0, 120);
      lines.push(
        `- likes ${m.like_count ?? "?"} RT ${m.retweet_count ?? "?"}: ${prev}${prev.length >= 120 ? "…" : ""}`
      );
    }
  }
  return lines.join("\n");
}

/**
 * @param {{ refreshCompetitors?: boolean }} opts refreshCompetitors true で競合タイムラインを API 再取得
 */
export async function buildInsightsContext(opts = {}) {
  let snap = loadCompetitorSnapshot();
  const force = opts.refreshCompetitors === true;
  if (force || !snap) {
    try {
      snap = await refreshCompetitorSnapshot();
    } catch (e) {
      const msg = /** @type {Error} */ (e).message || String(e);
      snap = snap ?? { fetchedAt: null, accounts: [], _error: msg };
    }
  }

  const own = summarizeOwnPerformance();
  const comp = formatCompetitorSnapshot(snap);
  return [
    "以下は投稿案を作るための外部インサイトである。トーン・禁止表現・人格ルールは絶対優先。",
    "競合の文体を真似しない。論点・フックの型・情報の密度だけを参考にせよ。",
    "",
    own,
    "",
    comp,
  ].join("\n");
}
