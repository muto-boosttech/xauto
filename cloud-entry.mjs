/**
 * クラウド用: スケジューラ（cron）＋ 承認用 Web を同一プロセスで起動
 */
import "dotenv/config";
import { startSchedulerDaemon } from "./src/scheduler.js";
import { startWebServer } from "./src/web-server.js";

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
