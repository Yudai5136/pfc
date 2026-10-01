// app/batch.js — まとめて記録(14 章): セットを作らずに複数のマイ食品を一度に記録するシートと、記録後の「セットとして登録しますか？」。
import * as core from '../core/index.js';
import { $, state, today, defaultTimeFor, quickTargetDay } from './state.js';
import { commit } from './storage.js';
import { toast, openSheet, closeSheet, SHEET_CLOSED } from './ui.js';
import { pushEntries } from './record.js';
import { DRAFTS, renderDraftItems, readDraftRows } from './drafts.js';

// ---------- まとめて記録シート ----------
// fromHome: ホームの入力エリアから開いた(記録先は今日)。記録先の日と時刻はシートを開いた時点で確定(0 時をまたいでも動かさない)
export function openBatchSheet(fromHome) {
  state.sheetFromHome = !!fromHome;
  state.sheetDateKey = quickTargetDay(fromHome);
  state.batchDraft = { items: [] };
  $('batch-date').textContent = core.formatDateLabel(state.sheetDateKey, today()) + ' に記録します';
  $('batch-time').value = defaultTimeFor(state.sheetDateKey);
  renderDraftItems('batch');
  openSheet('sheet-batch');
  // 自動フォーカスはしない(入力欄が無いので「＋ 食品を追加」から始める)
}
// 各行の値と合計を更新し、「N品を記録」の文言と押せるかを決める(0 品、または量が不正な行があれば押せない)
export function updateBatchForm() {
  if (!state.batchDraft) return;
  const r = readDraftRows('batch');
  const btn = $('btn-batch-confirm');
  btn.disabled = r.vals.length === 0 || r.bad;
  btn.textContent = r.vals.length + '品を記録';
  $('batch-bad').hidden = !r.bad; // 赤枠の行がある理由を書く
  btn.setAttribute('aria-label', btn.textContent);
}
DRAFTS.batch.update = updateBatchForm; // 下書きの行を描き直したとき・「外す」のときに呼ばれる(drafts.js)
function batchToast(n) { return n + '品を記録しました'; }
// 「N品を記録」: セット追加シートと同じ処理(品ごとに別の記録・foodId 付き・名前は scaleFood・usedAt/useCount 更新)で記録し、
// 2 品以上で同じ組み合わせのセットがまだ無ければ「セットとして登録しますか？」を出す。それ以外はトーストへ
export function confirmBatch() {
  if (!state.batchDraft) { closeSheet('sheet-batch'); return; }
  updateBatchForm();
  if ($('btn-batch-confirm').disabled) return;
  const foods = state.data.foods;
  const picked = state.batchDraft.items
    .map((it) => ({ food: core.findFood(foods, it.foodId), amount: core.setAmount(it.text) }))
    .filter((x) => x.food && x.amount !== null);
  const key = state.sheetDateKey || state.dateKey;
  const time = core.isValidTime($('batch-time').value) ? $('batch-time').value : defaultTimeFor(key);
  const fromHome = state.sheetFromHome;
  const now = core.localIso(new Date());
  const items = picked.map((x) => {
    x.food.usedAt = now; x.food.useCount = (x.food.useCount || 0) + 1;
    return core.scaleFood(x.food, x.amount);
  });
  closeSheet('sheet-batch'); // 閉じると下書きは捨てる(SHEET_CLOSED)
  const undo = pushEntries(items, key, time, fromHome);
  if (!undo) return; // 保存できなかった(警告バー表示中)
  const result = { count: items.length, undo, items: picked.map((x) => ({ foodId: x.food.id, amount: x.amount })) };
  const foodIds = result.items.map((it) => it.foodId);
  if (result.count >= 2 && !core.findSetByItems(state.data.sets, foodIds)) openBatchSaveSheet(result, core.batchSetName(foods, foodIds));
  else toast(batchToast(result.count), undo);
}
// ---------- 記録後の提案シート(14.3) ----------
function openBatchSaveSheet(result, name) {
  state.batchResult = result;
  $('batch-save-text').textContent = batchToast(result.count);
  $('batch-set-name').value = name;
  updateBatchSaveForm();
  openSheet('sheet-batch-save');
}
export function updateBatchSaveForm() { $('btn-batch-save-yes').disabled = !$('batch-set-name').value.trim(); }
// 「登録しない」・背景タップで閉じたとき(SHEET_CLOSED から): 記録のトーストだけ出す
function finishBatchWithoutSet() {
  const r = state.batchResult;
  state.batchResult = null;
  if (r) toast(batchToast(r.count), r.undo);
}
// シートを閉じたときの後始末(ボタン・背景のタップのどちらでも。ui.js の closeSheet が呼ぶ)
SHEET_CLOSED['sheet-batch'] = () => { state.batchDraft = null; }; // キャンセル・背景タップで閉じたら中身は捨てる(14.2)
SHEET_CLOSED['sheet-batch-save'] = finishBatchWithoutSet;        // 「登録しない」・背景タップ: 記録のトーストだけ出す(14.3)
// 「セットとして登録」: 今回記録した食品と量をそのまま items に(同じ食品が 2 回あれば 2 行のまま)。usedAt は今、useCount は 1
export function saveBatchAsSet() {
  const r = state.batchResult;
  if (!r) { closeSheet('sheet-batch-save'); return; }
  updateBatchSaveForm();
  if ($('btn-batch-save-yes').disabled) return;
  const name = $('batch-set-name').value.trim().slice(0, core.MAX_NAME);
  const now = core.localIso(new Date());
  state.data.sets.push({ id: core.genId('s'), name, items: r.items, usedAt: now, useCount: 1, createdAt: now });
  state.batchResult = null; // 閉じたときの「記録しました」だけのトーストは出さない(下で出す)
  closeSheet('sheet-batch-save');
  const saved = commit();
  // 「元に戻す」は記録だけを取り消す(登録したセットは残す)
  toast(saved ? r.count + '品を記録し、セット「' + name + '」を登録しました' : batchToast(r.count), r.undo);
}
