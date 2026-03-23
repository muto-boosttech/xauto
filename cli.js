#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { Command } from "commander";
import chalk from "chalk";
import { generatePost, generateBatch, scorePost } from "./src/generator.js";
import { checkNg } from "./src/ng-check.js";
import { checkCategoryBalance, suggestNextCategory } from "./src/balancer.js";
import { insertPost, markPosted, markScheduled } from "./src/posts-store.js";
import { makeXClient, postTweet } from "./src/x-client.js";
import { queueInitialFetches, processAnalyticsQueue, refreshMetricsForTweets } from "./src/analytics.js";
import { listPostedTweetIds } from "./src/posts-store.js";
import { writeWeeklyReport, writeMonthlyReport } from "./src/reporter.js";
import { startSchedulerDaemon } from "./src/scheduler.js";
import { askLine } from "./src/prompt.js";
import { REPORTS_DIR } from "./src/paths.js";
import { runDailyIdeasBatch } from "./src/daily-workflow.js";
import { runReviewSession } from "./src/review-session.js";
import { processDueScheduledPosts } from "./src/scheduled-worker.js";
import { refreshCompetitorSnapshot, buildInsightsContext } from "./src/insights.js";
import { startWebServer } from "./src/web-server.js";

function editInEditor(initial) {
  const f = path.join(tmpdir(), `xauto-${randomUUID()}.txt`);
  fs.writeFileSync(f, initial, "utf8");
  const ed = process.env.EDITOR || "nano";
  spawnSync(ed, [f], { stdio: "inherit" });
  const out = fs.readFileSync(f, "utf8");
  fs.unlinkSync(f);
  return out.trim();
}

function printResult(result) {
  console.log(chalk.cyan("--- 本文 ---"));
  console.log(result.text);
  console.log(chalk.cyan("--- メタ ---"));
  console.log(
    `カテゴリ: ${result.category} | フック: ${result.hookLabel} (${result.hookType}) | 文字数: ${result.charCount}`
  );
  if (result.ng.warnings.length) console.log(chalk.yellow("警告: " + result.ng.warnings.join(" / ")));
  if (result.ng.errors.length) console.log(chalk.red("NG: " + result.ng.errors.join(" / ")));
  console.log(chalk.gray("採点 JSON:"), JSON.stringify(result.score, null, 0));
}

async function confirmAndAct(result, { auto, scheduleAt }) {
  if (auto) {
    const localId = insertPost({
      content: result.text,
      category: result.category,
      hook_type: result.hookType,
      char_count: result.charCount,
      status: "draft",
    });
    if (scheduleAt) {
      markScheduled(Number(localId), scheduleAt);
      console.log(chalk.green(`スケジュール登録 local_id=${localId} at ${scheduleAt}`));
      return;
    }
    const client = makeXClient();
    const data = await postTweet(client, result.text);
    markPosted(Number(localId), data.id);
    queueInitialFetches(data.id);
    console.log(chalk.green(`投稿済み tweet_id=${data.id}`));
    return;
  }

  const ans = await askLine("投稿する？ [y/n/e（編集）]: ");
  let text = result.text;
  if (ans.toLowerCase() === "e") {
    text = editInEditor(result.text);
    const ng = checkNg(text);
    console.log(chalk.cyan("--- 編集後 ---"));
    console.log(text);
    if (ng.errors.length) console.log(chalk.red("NG: " + ng.errors.join(" / ")));
    const again = await askLine("この内容で投稿する？ [y/n]: ");
    if (again.toLowerCase() !== "y") {
      const localId = insertPost({
        content: text,
        category: result.category,
        hook_type: result.hookType,
        char_count: [...text].length,
        status: "draft",
      });
      console.log(chalk.yellow(`draft 保存 local_id=${localId}`));
      return;
    }
  } else if (ans.toLowerCase() !== "y") {
    const localId = insertPost({
      content: result.text,
      category: result.category,
      hook_type: result.hookType,
      char_count: result.charCount,
      status: "draft",
    });
    console.log(chalk.yellow(`下書き保存 local_id=${localId}`));
    return;
  }

  const localId = insertPost({
    content: text,
    category: result.category,
    hook_type: result.hookType,
    char_count: [...text].length,
    status: "draft",
  });
  if (scheduleAt) {
    markScheduled(Number(localId), scheduleAt);
    console.log(chalk.green(`スケジュール登録 local_id=${localId}`));
    return;
  }
  const client = makeXClient();
  const data = await postTweet(client, text);
  markPosted(Number(localId), data.id);
  queueInitialFetches(data.id);
  console.log(chalk.green(`投稿済み tweet_id=${data.id}`));
}

const program = new Command();

program.name("xauto").description("X 自動化ツール CLI（要件定義仕様）").version("1.0.0");

program
  .command("generate")
  .description("Claude で投稿案を生成")
  .option("--cat <category>", "カテゴリ指定")
  .option("--hook <type>", "フック型（A/B/C または 通説否定型 等）")
  .option("--len <n>", "最大文字数目安", (v) => parseInt(v, 10))
  .option("--count <n>", "一括生成（キューに draft 追加）", (v) => parseInt(v, 10))
  .option("--auto", "確認をスキップして投稿（--count 時は各件を即投稿）")
  .option("--schedule-at <iso>", "投稿予定日時（ISO8601）。--auto と併用可")
  .option("--json", "JSON のみ出力")
  .action(async (opts) => {
    const count = opts.count && opts.count > 0 ? opts.count : 1;
    if (count > 1) {
      const batch = await generateBatch(count, {
        category: opts.cat,
        hook: opts.hook,
        maxLength: opts.len,
      });
      for (const result of batch) {
        if (opts.json) console.log(JSON.stringify({ ...result, score: result.score }));
        else printResult(result);
        if (opts.auto) {
          await confirmAndAct(result, { auto: true, scheduleAt: opts.scheduleAt ?? null });
        } else {
          const localId = insertPost({
            content: result.text,
            category: result.category,
            hook_type: result.hookType,
            char_count: result.charCount,
            status: "draft",
          });
          console.log(chalk.green(`draft キュー local_id=${localId}`));
        }
        console.log("");
      }
      return;
    }
    const result = await generatePost({
      category: opts.cat,
      hook: opts.hook,
      maxLength: opts.len,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ...result, score: result.score }));
    } else {
      printResult(result);
    }
    if (!opts.json && count === 1) {
      await confirmAndAct(result, {
        auto: !!opts.auto,
        scheduleAt: opts.scheduleAt ?? null,
      });
    }
  });

program
  .command("post")
  .description("本文を指定して X に投稿（即時）")
  .argument("[text]", "投稿テキスト（--file 未指定時は必須）")
  .option("--file <path>", "本文ファイル（改行含む長文向け）")
  .option("--category <c>", "DB記録用カテゴリ", "未分類")
  .option("--hook <h>", "DB記録用フック", "A")
  .action(async (text, opts) => {
    let body = "";
    if (opts.file) body = fs.readFileSync(opts.file, "utf8").trim();
    else if (text && text.startsWith("@"))
      body = fs.readFileSync(text.slice(1), "utf8").trim();
    else if (text) body = text;
    else {
      console.error("--file か本文テキストを指定してください");
      process.exitCode = 1;
      return;
    }
    const client = makeXClient();
    const data = await postTweet(client, body);
    const localId = insertPost({
      content: body,
      category: opts.category,
      hook_type: opts.hook,
      char_count: [...body].length,
      status: "draft",
    });
    markPosted(Number(localId), data.id);
    queueInitialFetches(data.id);
    console.log(chalk.green(`投稿済み tweet_id=${data.id} local_id=${localId}`));
  });

program
  .command("daily")
  .description("投稿案を5件生成し pending_review で保存（18時ジョブと同じ・分析コンテキスト付き）")
  .option("--no-refresh", "競合タイムラインの再取得をスキップ（前回スナップショット利用）")
  .action(async (opts) => {
    console.log(chalk.cyan("生成中…（Claude + 自アカウント/競合インサイト）"));
    const { batchId } = await runDailyIdeasBatch({ refreshCompetitors: !opts.noRefresh });
    console.log(chalk.green(`batch_id=${batchId}`));
    console.log(chalk.gray("承認・編集・翌日予約は: node cli.js review"));
  });

program
  .command("review")
  .description("最新バッチの pending_review を順に承認（編集可）→ 翌日 8/9/12/17/19 時（東京）に予約")
  .option("--batch <id>", "特定 batch_id を審査")
  .action(async (opts) => {
    await runReviewSession({
      editInEditor,
      batchId: opts.batch,
    });
  });

program
  .command("due")
  .description("予約時刻が来た投稿を今すぐ実行（デーモンなしの手動用）")
  .action(async () => {
    await processDueScheduledPosts();
  });

program
  .command("serve")
  .description("ブラウザで承認画面（localhost・ターミナル操作ほぼ不要）")
  .option("--port <n>", "ポート番号", "3847")
  .option("--open", "macOS でブラウザを自動で開く")
  .action((opts) => {
    const port = parseInt(opts.port, 10);
    const host = process.env.HOST || "127.0.0.1";
    startWebServer({ port, host, openBrowser: !!opts.open });
  });

program
  .command("balance")
  .description("カテゴリ配分アラートと次に推奨されるカテゴリ")
  .action(() => {
    const { alerts, ok } = checkCategoryBalance();
    const next = suggestNextCategory(undefined);
    console.log(chalk.cyan("次回 generate 推奨カテゴリ:"), next);
    if (ok) console.log(chalk.green("週次配分: 目標乖離アラートなし"));
    else {
      console.log(chalk.yellow("週次配分アラート:"));
      for (const a of alerts) console.log(" - " + a);
    }
  });

program
  .command("report")
  .description("レポート出力（reports/）")
  .argument("<kind>", "weekly | monthly")
  .action((kind) => {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    if (kind === "weekly") {
      const p = writeWeeklyReport();
      console.log(chalk.green(p));
    } else if (kind === "monthly") {
      const p = writeMonthlyReport();
      console.log(chalk.green(p));
    } else {
      console.error("weekly または monthly を指定してください");
      process.exitCode = 1;
    }
  });

program
  .command("analytics")
  .description("メトリクスキュー処理 / 一括更新")
  .argument("<action>", "process | refresh")
  .action(async (action) => {
    if (action === "process") {
      await processAnalyticsQueue();
      console.log(chalk.green("キュー処理完了"));
    } else if (action === "refresh") {
      const ids = listPostedTweetIds(400);
      await refreshMetricsForTweets(ids);
      console.log(chalk.green(`更新試行: ${ids.length} 件`));
    } else {
      console.error("process または refresh");
      process.exitCode = 1;
    }
  });

program
  .command("score")
  .description("本文の採点のみ（JSON）")
  .argument("<text>", "評価する本文")
  .option("--hook <h>", "フックコード", "A")
  .option("--cat <c>", "カテゴリ", "経営ノウハウ")
  .action((text, opts) => {
    const ng = checkNg(text);
    const s = scorePost(text, { hookType: opts.hook, category: opts.cat, ng });
    console.log(JSON.stringify(s, null, 2));
  });

const insightsCmd = program.command("insights").description("競合・分析データ");

insightsCmd
  .command("refresh")
  .description("競合アカウントの直近投稿を X API で取得し data/competitor_snapshot.json に保存")
  .action(async () => {
    const snap = await refreshCompetitorSnapshot();
    console.log(chalk.green(`取得 ${snap.accounts?.length ?? 0} アカウント`));
    const ctx = await buildInsightsContext({ refreshCompetitors: false });
    console.log(chalk.gray("--- 生成プロンプト用コンテキスト先頭 ---"));
    console.log(ctx.slice(0, 1200) + (ctx.length > 1200 ? "…" : ""));
  });

const schedulerCmd = program
  .command("scheduler")
  .description("cron デーモン（18時5案・予約投稿・レポート・キュー）");

schedulerCmd
  .command("start")
  .description("cron を起動（フォアグラウンド）")
  .option("--auto", "スロット時刻の自動投稿を有効化")
  .action((opts) => {
    startSchedulerDaemon({ auto: !!opts.auto });
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
