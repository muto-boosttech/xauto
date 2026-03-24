/**
 * クラウド用: スケジューラ（cron）＋ 承認用 Web を同一プロセスで起動
 */
import "dotenv/config";
import { startSchedulerDaemon } from "./src/scheduler.js";
import { startWebServer } from "./src/web-server.js";
import { listScheduledPosts } from "./src/posts-store.js";

const portRaw = process.env.PORT;
const parsed = portRaw ? Number.parseInt(String(portRaw), 10) : Number.NaN;
const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 3847;
const host = process.env.HOST && process.env.HOST.trim() ? process.env.HOST.trim() : "0.0.0.0";

startSchedulerDaemon({
  auto: process.env.CLOUD_AUTO_POST_LEGACY_SLOTS === "1",
});

process.on("uncaughtException", (e) => {
  console.error("[xauto] uncaughtException", e);
});
process.on("unhandledRejection", (e) => {
  console.error("[xauto] unhandledRejection", e);
});

startWebServer({ port, host, openBrowser: false });

setTimeout(() => {
  try {
    const rows = listScheduledPosts(250);
    const now = Date.now();
    const overdue = rows.filter((r) => {
      const t = Date.parse(r.scheduled_at);
      return Number.isFinite(t) && t <= now;
    });
    console.log(
      `[xauto] 予約投稿: DB上 ${rows.length} 件、時刻到来済み ${overdue.length} 件（先頭3件の scheduled_at: ${rows
        .slice(0, 3)
        .map((r) => r.scheduled_at)
        .join(", ") || "なし"}）`
    );
  } catch (e) {
    console.error("[xauto] 予約件数ログ失敗", e);
  }
}, 4000);
