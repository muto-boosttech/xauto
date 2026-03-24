import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { CONFIG_DIR } from "./paths.js";
import { listPostedTweetIds } from "./posts-store.js";
import { processAnalyticsQueue, refreshMetricsForTweets } from "./analytics.js";
import { writeWeeklyReport, writeMonthlyReport } from "./reporter.js";
import { generatePost } from "./generator.js";
import { makeXClient, postTweet } from "./x-client.js";
import { insertPost, markPosted } from "./posts-store.js";
import { queueInitialFetches } from "./analytics.js";
import { runDailyIdeasBatch } from "./daily-workflow.js";
import { processDueScheduledPosts } from "./scheduled-worker.js";

function loadSchedule() {
  const p = path.join(CONFIG_DIR, "schedule.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * @param {{ auto: boolean }} opts
 */
export function startSchedulerDaemon(opts) {
  const cfg = loadSchedule();
  const tz = cfg.timezone || "Asia/Tokyo";

  for (const slot of cfg.slots || []) {
    cron.schedule(
      slot.cron,
      async () => {
        console.log(`[cron] ${slot.name} fired`);
        if (!opts.auto) {
          console.log("確認モード: レガシー自動投稿は無効（--auto で有効）");
          return;
        }
        try {
          const result = await generatePost({ category: slot.category_hint });
          const client = makeXClient();
          const localId = insertPost({
            content: result.text,
            category: result.category,
            hook_type: result.hookType,
            char_count: result.charCount,
            status: "draft",
          });
          const data = await postTweet(client, result.text);
          markPosted(Number(localId), data.id);
          queueInitialFetches(data.id);
        } catch (e) {
          console.error("[cron] error", e);
        }
      },
      { timezone: tz }
    );
  }

  if (cfg.pre_analytics_cron) {
    cron.schedule(
      cfg.pre_analytics_cron,
      async () => {
        console.log("[cron] pre-analytics: メトリクス更新");
        try {
          await refreshMetricsForTweets(listPostedTweetIds(250));
          await processAnalyticsQueue();
        } catch (e) {
          console.error(e);
        }
      },
      { timezone: tz }
    );
  }

  if (cfg.daily_ideas_cron) {
    cron.schedule(
      cfg.daily_ideas_cron,
      async () => {
        console.log("[cron] daily ideas: 5件生成（pending_review）");
        try {
          const { batchId } = await runDailyIdeasBatch({ refreshCompetitors: true });
          console.log(`[cron] batch_id=${batchId} — 確認は: node cli.js review`);
        } catch (e) {
          console.error("[cron] daily ideas failed", e);
        }
      },
      { timezone: tz }
    );
  }

  if (cfg.due_posts_cron) {
    cron.schedule(
      cfg.due_posts_cron,
      async () => {
        try {
          await processDueScheduledPosts();
        } catch (e) {
          console.error("[cron] due_posts error", e);
        }
      },
      { timezone: tz }
    );
  }

  cron.schedule(
    cfg.weekly_metrics_cron || "0 9 * * 1",
    async () => {
      console.log("[cron] weekly metrics refresh");
      try {
        await refreshMetricsForTweets(listPostedTweetIds(300));
        await processAnalyticsQueue();
      } catch (e) {
        console.error(e);
      }
    },
    { timezone: tz }
  );

  cron.schedule(
    cfg.weekly_report_cron || "0 10 * * 1",
    () => {
      try {
        const p = writeWeeklyReport();
        console.log("[cron] weekly report", p);
      } catch (e) {
        console.error(e);
      }
    },
    { timezone: tz }
  );

  cron.schedule(
    cfg.monthly_report_cron || "0 10 1 * *",
    () => {
      try {
        const p = writeMonthlyReport();
        console.log("[cron] monthly report", p);
      } catch (e) {
        console.error(e);
      }
    },
    { timezone: tz }
  );

  cron.schedule("*/5 * * * *", async () => {
    try {
      await processAnalyticsQueue();
    } catch {
      /* ignore */
    }
  });

  console.log("スケジューラ起動。Ctrl+C で終了。");
  console.log(
    "— 毎日 18:00 投稿案×5（pending_review） / 予約投稿は毎分チェック / 確認は `node cli.js review` —"
  );
}
