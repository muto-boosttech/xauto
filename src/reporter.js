import fs from "node:fs";
import path from "node:path";
import { openPostsDb } from "./db.js";
import { latestMetricsByPost } from "./analytics.js";
import { REPORTS_DIR } from "./paths.js";

function ensureReports() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function weekRangeLabel() {
  const now = new Date();
  const d = new Date(now);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const start = d.toISOString().slice(0, 10);
  d.setDate(d.getDate() + 6);
  const end = d.toISOString().slice(0, 10);
  return { start, end };
}

/**
 * @returns {string} path to markdown file
 */
export function writeWeeklyReport() {
  ensureReports();
  const db = openPostsDb();
  const { start, end } = weekRangeLabel();
  const posts = db
    .prepare(
      `SELECT * FROM posts WHERE status = 'posted' AND date(posted_at) >= date(?) AND date(posted_at) <= date(?)`
    )
    .all(start, end);

  const metrics = latestMetricsByPost();
  const byId = Object.fromEntries(metrics.map((m) => [m.post_id, m]));

  const enriched = posts
    .map((p) => ({
      ...p,
      m: p.id ? byId[p.id] : null,
      eng: p.id && byId[p.id] ? byId[p.id].engagement_total : 0,
      imp: p.id && byId[p.id] ? byId[p.id].impressions : 0,
    }))
    .sort((a, b) => b.eng - a.eng);

  const top5 = enriched.slice(0, 5);
  const catCount = {};
  for (const p of posts) {
    const c = p.category ?? "未分類";
    catCount[c] = (catCount[c] ?? 0) + 1;
  }

  const lines = [
    `# 週次サマリー (${start} — ${end})`,
    "",
    "## カテゴリ配分（件数）",
    ...Object.entries(catCount).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## 週間 TOP5（エンゲージメント合計）",
    ...top5.map((p, i) => {
      const prev = p.content.replace(/\n/g, " ").slice(0, 80);
      return `${i + 1}. [${p.category}] eng=${p.eng} imp=${p.imp}\n   ${prev}…`;
    }),
    "",
  ];

  const name = `weekly_${start}_${end}.md`;
  const mdPath = path.join(REPORTS_DIR, name);
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");

  const csvPath = path.join(REPORTS_DIR, `weekly_${start}_${end}.csv`);
  const hdr = "tweet_id,category,hook,char_count,impressions,likes,retweets,replies,bookmarks,engagement,preview\n";
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = enriched.map((p) =>
    [
      p.id ?? "",
      p.category,
      p.hook_type,
      p.char_count,
      p.m?.impressions ?? "",
      p.m?.likes ?? "",
      p.m?.retweets ?? "",
      p.m?.replies ?? "",
      p.m?.bookmarks ?? "",
      p.m?.engagement_total ?? "",
      esc((p.content ?? "").slice(0, 200)),
    ].join(",")
  );
  fs.writeFileSync(csvPath, hdr + rows.join("\n") + "\n", "utf8");

  return mdPath;
}

/**
 * @returns {string}
 */
export function writeMonthlyReport() {
  ensureReports();
  const db = openPostsDb();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const monthStr = `${y}-${String(m).padStart(2, "0")}`;

  const posts = db
    .prepare(
      `SELECT * FROM posts WHERE status = 'posted' AND strftime('%Y-%m', posted_at) = ?`
    )
    .all(monthStr);

  const metrics = latestMetricsByPost();
  const byId = Object.fromEntries(metrics.map((x) => [x.post_id, x]));
  let sumImp = 0;
  let sumEng = 0;
  let n = 0;
  for (const p of posts) {
    const mm = p.id ? byId[p.id] : null;
    if (mm) {
      sumImp += mm.impressions;
      sumEng += mm.engagement_total;
      n++;
    }
  }
  const avgImp = n ? Math.round(sumImp / n) : 0;
  const avgEng = n ? Math.round(sumEng / n) : 0;

  const lines = [
    `# 月次分析 ${monthStr}`,
    "",
    "## KPI スナップショット",
    `- 投稿数: ${posts.length}`,
    `- メトリクス取得済み平均インプレッション/投稿: ${avgImp}`,
    `- メトリクス取得済み平均エンゲージメント合計/投稿: ${avgEng}`,
    "",
    "## カテゴリ別件数",
  ];
  const catCount = {};
  for (const p of posts) {
    const c = p.category ?? "未分類";
    catCount[c] = (catCount[c] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(catCount)) lines.push(`- ${k}: ${v}`);

  const name = `monthly_${monthStr}.md`;
  const mdPath = path.join(REPORTS_DIR, name);
  fs.writeFileSync(mdPath, lines.join("\n") + "\n", "utf8");
  return mdPath;
}
