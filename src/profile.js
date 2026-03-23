import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "./paths.js";

const PROFILE_PATH = path.join(CONFIG_DIR, "profile.json");

export function loadProfile() {
  const raw = fs.readFileSync(PROFILE_PATH, "utf8");
  return JSON.parse(raw);
}

/**
 * @param {Record<string, unknown>} profile
 * @param {{ category: string; hookType: string; hookLabel: string; maxLength?: number }} options
 */
export function buildSystemPrompt(profile, options = {}) {
  const maxLength = options.maxLength ?? 450;
  const patterns = profile.patterns ?? "";
  const examples = profile.hook_examples
    ? `\n## フック型の参考例\nA: ${profile.hook_examples.A ?? ""}\nB: ${profile.hook_examples.B ?? ""}\nC: ${profile.hook_examples.C ?? ""}`
    : "";

  return `あなたは ${profile.handle} として投稿文を生成する AI です。
## 口調・文体ルール
${profile.tone}
## 発信者の実績（必ず根拠として使用可能）
${profile.credential}
## 絶対禁止表現
${profile.ng_expressions}
## 投稿ルール
${profile.rules}
## 伸びた投稿の構成（参考）
${patterns}${examples}
## 今回の指定
- カテゴリ：${options.category}
- フック型：${options.hookLabel}（${options.hookType}: 通説否定 / 体験告白 / 断言提示）
- 文字数：${maxLength}字以内
- 投稿本文のみを出力。説明・前置きは不要。`;
}
