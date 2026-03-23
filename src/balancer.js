import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "./paths.js";
import { openPostsDb } from "./db.js";

function loadCategoriesConfig() {
  const p = path.join(CONFIG_DIR, "categories.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** ISO week start Monday 00:00:00 local — simple: use SQLite week boundaries in JST via app TZ */
function weekStartIso() {
  const now = new Date();
  const d = new Date(now);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Count posted/scheduled-this-week by category from posts.db
 * @returns {Record<string, number>}
 */
export function getWeeklyCategoryCounts() {
  const db = openPostsDb();
  const start = weekStartIso();
  const rows = db
    .prepare(
      `SELECT category, COUNT(*) AS c FROM posts
       WHERE category IS NOT NULL AND category != ''
       AND status = 'posted'
       AND datetime(posted_at) >= datetime(?)
       GROUP BY category`
    )
    .all(start);
  const counts = {};
  for (const r of rows) counts[r.category] = r.c;
  return counts;
}

/**
 * Pick category to prioritize (most under target share)
 * @param {string | undefined} forced
 */
export function suggestNextCategory(forced) {
  const cfg = loadCategoriesConfig();
  if (forced && cfg.categories.includes(forced)) return forced;

  const targets = cfg.targets;
  const counts = getWeeklyCategoryCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  let best = cfg.categories[0];
  let bestScore = -Infinity;
  for (const cat of cfg.categories) {
    const share = (counts[cat] ?? 0) / total;
    const target = targets[cat] ?? 0;
    const gap = target - share;
    if (gap > bestScore) {
      bestScore = gap;
      best = cat;
    }
  }
  return best;
}

/**
 * @returns {{ alerts: string[]; ok: boolean }}
 */
export function checkCategoryBalance() {
  const cfg = loadCategoriesConfig();
  const threshold = cfg.alert_deviation ?? 0.1;
  const counts = getWeeklyCategoryCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const alerts = [];
  if (total === 0) return { alerts: [], ok: true };

  for (const cat of cfg.categories) {
    const share = (counts[cat] ?? 0) / total;
    const target = cfg.targets[cat] ?? 0;
    if (Math.abs(share - target) > threshold) {
      alerts.push(
        `${cat}: 実績 ${(share * 100).toFixed(1)}% / 目標 ${(target * 100).toFixed(0)}%（乖離 > ${(threshold * 100).toFixed(0)}%）`
      );
    }
  }
  return { alerts, ok: alerts.length === 0 };
}
