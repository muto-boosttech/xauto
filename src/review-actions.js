import { checkNg } from "./ng-check.js";
import { addCalendarDays, nextDaySlotsJstIso, slotsForTokyoYmd, tokyoYmd } from "./time-jst.js";
import {
  findLatestPendingBatchId,
  listPendingReviewByBatch,
  listPendingBatches,
  countScheduledForBatchOnDate,
  updatePostContent,
  markScheduled,
  markRejected,
  getPostByLocalId,
} from "./posts-store.js";

const SLOT_HOURS = [8, 9, 12, 17, 19];

/**
 * @param {string | null | undefined} batchIdOpt
 */
export function getReviewState(batchIdOpt) {
  const batchId =
    batchIdOpt != null && String(batchIdOpt).trim() !== ""
      ? String(batchIdOpt).trim()
      : findLatestPendingBatchId();
  if (!batchId) {
    return {
      batchId: null,
      items: [],
      slots: [],
      nextSlotIndex: 0,
      tomorrowLabel: "",
    };
  }
  const tomorrowYmd = addCalendarDays(tokyoYmd(), 1);
  const slots = nextDaySlotsJstIso(SLOT_HOURS);
  const nextSlotIndex = countScheduledForBatchOnDate(batchId, tomorrowYmd);
  const rows = listPendingReviewByBatch(batchId);
  const items = rows.map((row) => ({
    local_id: row.local_id,
    content: row.content,
    category: row.category,
    hook_type: row.hook_type,
    char_count: row.char_count,
    created_at: row.created_at,
    ng: checkNg(row.content),
  }));
  return {
    batchId,
    items,
    slots,
    nextSlotIndex,
    tomorrowLabel: tomorrowYmd,
  };
}

/**
 * @param {number} localId
 * @param {string} content
 */
export function savePendingDraft(localId, content) {
  const row = getPostByLocalId(localId);
  if (!row || row.status !== "pending_review") {
    return { ok: false, error: "pending_review の投稿が見つかりません" };
  }
  updatePostContent(localId, content);
  return { ok: true, ng: checkNg(content) };
}

/**
 * @param {number} localId
 * @param {string} content
 */
export function approveAndSchedule(localId, content) {
  const row = getPostByLocalId(localId);
  if (!row || row.status !== "pending_review") {
    return { ok: false, error: "pending_review の投稿が見つかりません" };
  }
  const batchId = row.batch_id;
  if (!batchId) {
    return { ok: false, error: "batch_id がありません" };
  }
  if (String(content).trim() === "") {
    return { ok: false, error: "本文が空です" };
  }

  const tomorrowYmd = addCalendarDays(tokyoYmd(), 1);
  const slots = slotsForTokyoYmd(tomorrowYmd, SLOT_HOURS);
  let slotIdx = countScheduledForBatchOnDate(batchId, tomorrowYmd);

  if (content !== row.content) updatePostContent(localId, content);

  if (slotIdx >= slots.length) {
    return { ok: false, error: "翌日の予約枠（5枠）は埋まっています" };
  }
  const when = slots[slotIdx];
  markScheduled(localId, when);
  return { ok: true, scheduledAt: when, slotIndex: slotIdx + 1, ng: checkNg(content) };
}

/** @param {number} localId */
export function rejectPending(localId) {
  const row = getPostByLocalId(localId);
  if (!row || row.status !== "pending_review") {
    return { ok: false, error: "pending_review の投稿が見つかりません" };
  }
  markRejected(localId);
  return { ok: true };
}

export { listPendingBatches };
