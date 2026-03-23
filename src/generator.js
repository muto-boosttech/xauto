import Anthropic from "@anthropic-ai/sdk";
import { suggestNextCategory } from "./balancer.js";
import { checkNg } from "./ng-check.js";
import { buildSystemPrompt, loadProfile } from "./profile.js";
import { resolveHookType } from "./hooks.js";

const MODEL = "claude-sonnet-4-20250514";
const MAX_REGEN = 3;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function backoffAttempt(attempt) {
  await sleep(2 ** attempt * 1000);
}

/**
 * @param {{ category?: string; hook?: string; maxLength?: number; userHint?: string }} opts
 */
export async function generatePost(opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY が .env にありません");

  const profile = loadProfile();
  const category =
    opts.category != null && String(opts.category).trim() !== ""
      ? String(opts.category).trim()
      : suggestNextCategory(undefined);
  const { code: hookType, label: hookLabel } = resolveHookType(opts.hook);
  const maxLength = opts.maxLength ?? 450;

  const system = buildSystemPrompt(profile, {
    category,
    hookType,
    hookLabel,
    maxLength,
  });

  const userParts = [
    `上記ルールで、X向けの投稿本文を1本書いてください。`,
    `カテゴリは「${category}」、フック型は「${hookLabel}」です。`,
  ];
  if (opts.userHint) userParts.push(`追加指示: ${opts.userHint}`);
  if (opts.contextBlock) {
    userParts.push(
      "\n--- インサイト（自アカウント計測・競合の直近投稿など。ルールと人格は最優先で守ること） ---\n" +
        String(opts.contextBlock)
    );
  }

  const client = new Anthropic({ apiKey });
  let text = "";
  let lastNg = /** @type {{ ok: boolean; warnings: string[]; errors: string[] }} */ ({
    ok: true,
    warnings: [],
    errors: [],
  });

  for (let attempt = 0; attempt < MAX_REGEN; attempt++) {
    let message;
    for (let apiTry = 0; apiTry < 3; apiTry++) {
      try {
        message = await client.messages.create({
          model: MODEL,
          max_tokens: 600,
          temperature: 0.85,
          system,
          messages: [
            {
              role: "user",
              content:
                userParts.join("\n") +
                (attempt > 0
                  ? `\n\n前回は次の理由で不合格でした。必ず修正してください:\n${lastNg.errors.join("\n")}`
                  : ""),
            },
          ],
        });
        break;
      } catch (e) {
        if (apiTry === 2) throw e;
        await backoffAttempt(apiTry);
      }
    }

    const block = message.content.find((b) => b.type === "text");
    text = block && block.type === "text" ? block.text.trim() : "";
    lastNg = checkNg(text);
    if (lastNg.ok) break;
  }

  const score = scorePost(text, { hookType, category, ng: lastNg });

  return {
    text,
    category,
    hookType,
    hookLabel,
    charCount: [...text].length,
    ng: lastNg,
    score,
  };
}

/**
 * @param {string} text
 * @param {{ hookType: string; category: string; ng: ReturnType<typeof checkNg> }} meta
 */
export function scorePost(text, meta) {
  let s = 70;
  if (meta.ng.ok) s += 15;
  else s -= 20;
  const len = [...text].length;
  if (len >= 140 && len <= 500) s += 10;
  if (len > 600 || len < 100) s -= 10;
  return {
    total: Math.max(0, Math.min(100, s)),
    hook: meta.hookType,
    category: meta.category,
    char_count: len,
    ng_ok: meta.ng.ok,
    warnings: meta.ng.warnings,
    errors: meta.ng.errors,
  };
}

/**
 * @param {number} n
 * @param {{ category?: string; hook?: string; maxLength?: number }} opts
 */
export async function generateBatch(n, opts = {}) {
  const out = [];
  const fixedCat =
    opts.category != null && String(opts.category).trim() !== ""
      ? String(opts.category).trim()
      : null;
  for (let i = 0; i < n; i++) {
    const category = fixedCat ?? suggestNextCategory(undefined);
    const one = await generatePost({ ...opts, category });
    out.push(one);
    if (i < n - 1) await sleep(2000);
  }
  return out;
}
