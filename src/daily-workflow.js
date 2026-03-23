import { randomUUID } from "node:crypto";
import { generateBatch } from "./generator.js";
import { insertPost } from "./posts-store.js";
import { buildInsightsContext } from "./insights.js";

/**
 * 18時バッチ: 分析コンテキスト付きで投稿案を5件生成し pending_review で保存
 * @param {{ refreshCompetitors?: boolean; category?: string; hook?: string; maxLength?: number }} options
 */
export async function runDailyIdeasBatch(options = {}) {
  const batchId = randomUUID();
  const contextBlock = await buildInsightsContext({
    refreshCompetitors: options.refreshCompetitors !== false,
  });
  const batch = await generateBatch(5, {
    contextBlock,
    category: options.category,
    hook: options.hook,
    maxLength: options.maxLength,
  });
  for (const r of batch) {
    insertPost({
      content: r.text,
      category: r.category,
      hook_type: r.hookType,
      char_count: r.charCount,
      status: "pending_review",
      batch_id: batchId,
    });
  }
  return { batchId, ideas: batch };
}
