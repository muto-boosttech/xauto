/** @param {Date} [d] */
export function tokyoYmd(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = f.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(d).slice(0, 10);
  return `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * @param {string} ymd YYYY-MM-DD (カレンダー日として解釈)
 * @param {number} delta
 */
export function addCalendarDays(ymd, delta) {
  const [y, m, d] = ymd.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + delta));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 東京日付 YYYY-MM-DD の各時刻スロット（+09:00）
 * @param {string} ymd
 * @param {number[]} hours
 */
export function slotsForTokyoYmd(ymd, hours = [8, 9, 12, 17, 19]) {
  return hours.map((h) => `${ymd}T${String(h).padStart(2, "0")}:00:00+09:00`);
}

/**
 * 翌日（東京）の指定時刻スロットを ISO8601（+09:00）で返す
 * @param {number[]} hours 0–23
 */
export function nextDaySlotsJstIso(hours = [8, 9, 12, 17, 19]) {
  const tomorrow = addCalendarDays(tokyoYmd(), 1);
  return slotsForTokyoYmd(tomorrow, hours);
}
