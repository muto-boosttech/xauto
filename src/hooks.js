import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "./paths.js";

export function loadHooksConfig() {
  const p = path.join(CONFIG_DIR, "hooks.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * @param {string | undefined} input
 * @returns {{ code: string; label: string }}
 */
export function resolveHookType(input) {
  const cfg = loadHooksConfig();
  if (!input || input.trim() === "") {
    const codes = ["A", "B", "C"];
    const code = codes[Math.floor(Math.random() * codes.length)];
    return { code, label: cfg.types[code].label };
  }
  const t = input.trim();
  if (cfg.types[t]) return { code: t, label: cfg.types[t].label };
  const code = cfg.aliases[t];
  if (code) return { code, label: cfg.types[code].label };
  throw new Error(`不明なフック型: ${input}（A/B/C または hooks.json の別名を指定）`);
}
