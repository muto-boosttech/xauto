/** @param {Date} [d] */
export function tokyoYmd(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
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
 * 翌日（東京）の指定時刻スロットを ISO8601（+09:00）で返す
 * @param {number[]} hours 0–23
 */
export function nextDaySlotsJstIso(hours = [8, 9, 12, 17, 19]) {
  const tomorrow = addCalendarDays(tokyoYmd(), 1);
  return hours.map((h) => `${tomorrow}T${String(h).padStart(2, "0")}:00:00+09:00`);
}
