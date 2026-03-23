const NG_WORDS = [
  "と思います",
  "かもしれません",
  "でしょうか",
  "皆さん",
  "努力は必ず報われる",
];

const FIRST_PERSON_BAD = [/私は/g, /僕は/g, /自分は/g, /^私[、。]/, /^僕[、。]/];

/**
 * @param {string} text
 * @returns {{ ok: boolean; warnings: string[]; errors: string[] }}
 */
export function checkNg(text) {
  const warnings = [];
  const errors = [];

  for (const w of NG_WORDS) {
    if (text.includes(w)) errors.push(`NGワード検出: 「${w}」`);
  }

  for (const re of FIRST_PERSON_BAD) {
    if (re.test(text)) errors.push("NGパターン: 「俺」以外の一人称（私・僕・自分）の疑い");
  }

  const lines = text
    .trim()
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  if (last && !last.endsWith("。")) {
    errors.push("NGパターン: 最終行が「。」で終わっていない（断言なし締めの疑い）");
  }

  const len = [...text].length;
  if (len < 140) warnings.push(`文字数: ${len}字（140字未満は短すぎる可能性）`);
  if (len > 600) warnings.push(`文字数: ${len}字（600字超は長すぎる可能性）`);

  return { ok: errors.length === 0, warnings, errors };
}
