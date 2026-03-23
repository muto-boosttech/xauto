/**
 * クラウド用: スケジューラ（cron）＋ 承認用 Web を同一プロセスで起動
 */
import "dotenv/config";
import { startSchedulerDaemon } from "./src/scheduler.js";
import { startWebServer } from "./src/web-server.js";

const port = process.env.PORT ? Number(process.env.PORT) : 3847;
const host = process.env.HOST || "0.0.0.0";

startSchedulerDaemon({
  auto: process.env.CLOUD_AUTO_POST_LEGACY_SLOTS === "1",
});

startWebServer({ port, host, openBrowser: false });
