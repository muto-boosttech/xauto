import chalk from "chalk";
import { nextDaySlotsJstIso, addCalendarDays, tokyoYmd } from "./time-jst.js";
import { askLine } from "./prompt.js";
import { checkNg } from "./ng-check.js";
import { findLatestPendingBatchId, listPendingReviewByBatch } from "./posts-store.js";
import { approveAndSchedule, rejectPending, savePendingDraft } from "./review-actions.js";

/**
 * @param {{ editInEditor: (s: string) => string; batchId?: string | null }} opts
 */
export async function runReviewSession(opts) {
  const batchId =
    opts.batchId != null && String(opts.batchId).trim() !== ""
      ? String(opts.batchId).trim()
      : findLatestPendingBatchId();
  if (!batchId) {
    console.log(chalk.yellow("審査待ち（pending_review）のバッチがありません。`node cli.js daily` で生成できます。"));
    return;
  }
  const tomorrowYmd = addCalendarDays(tokyoYmd(), 1);
  const slots = nextDaySlotsJstIso([8, 9, 12, 17, 19]);
  const rows = listPendingReviewByBatch(batchId);

  console.log(chalk.cyan(`バッチ ${batchId} — 残り ${rows.length} 件`));
  console.log(
    chalk.gray("承認すると翌日（東京）の空き枠に順に割り当てます:"),
    slots.map((s) => s.slice(11, 16)).join(", "),
    chalk.gray(`（${tomorrowYmd}）`)
  );

  for (const row of rows) {
    console.log(chalk.cyan(`\n--- local_id=${row.local_id} [${row.category}] hook=${row.hook_type} ---`));
    console.log(row.content);
    const ng0 = checkNg(row.content);
    if (ng0.warnings.length) console.log(chalk.yellow("警告: " + ng0.warnings.join(" / ")));
    if (ng0.errors.length) console.log(chalk.red("NG: " + ng0.errors.join(" / ")));

    const ans = (await askLine("承認して翌日に予約？ [y/n/e=編集]: ")).toLowerCase();
    if (ans === "n") {
      const r = rejectPending(row.local_id);
      console.log(r.ok ? chalk.gray("却下（rejected）") : chalk.red(r.error));
      continue;
    }

    let text = row.content;
    if (ans === "e") {
      text = opts.editInEditor(row.content);
      const ng2 = checkNg(text);
      console.log(chalk.cyan("--- 編集後 ---"));
      console.log(text);
      if (ng2.warnings.length) console.log(chalk.yellow("警告: " + ng2.warnings.join(" / ")));
      if (ng2.errors.length) console.log(chalk.red("NG: " + ng2.errors.join(" / ")));
      const again = (await askLine("この内容で翌日に予約？ [y/n]: ")).toLowerCase();
      if (again !== "y") {
        const dr = savePendingDraft(row.local_id, text);
        console.log(
          dr.ok ? chalk.yellow("本文のみ更新しました（pending_review のまま・予約なし）") : chalk.red(dr.error)
        );
        continue;
      }
    } else if (ans !== "y") {
      console.log(chalk.gray("入力が y/n/e 以外のためスキップ（pending のまま）"));
      continue;
    }

    const res = approveAndSchedule(row.local_id, text);
    if (!res.ok) console.log(chalk.red(res.error ?? "失敗"));
    else console.log(chalk.green(`予約済み: ${res.scheduledAt}（${res.slotIndex}/5）`));
  }
}
