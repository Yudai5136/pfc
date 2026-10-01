// app/record.js — 記録タブ(13.3。表示中の日)の一覧、記録の追加・編集シート、分量シート、
// 記録をまとめて追加する共通の処理(pushEntries / addEntries。最近の記録・分量シート・セット・まとめて記録から使う)。
import * as core from '../core/index.js';
import { $, esc, state, today, defaultTimeFor, ensureDay, catchUpDay, statsFor, quickTargetDay, render } from './state.js';
import { commit } from './storage.js';
import { pfcColsHtml, toast, openSheet, closeSheet, readNum } from './ui.js';
import { fillStats, renderQuickRows } from './quick.js';

// ---------- 記録タブ(表示中の日) ----------
export function renderRecord(t) {
  const data = state.data;
  const key = state.dateKey;
  const day = data.days[key];
  const entries = core.sortEntries(day ? day.entries : []);

  // ヘッダ(読み上げ名には表示中の日付を含める)
  const dateLabel = core.formatDateLabel(key, t);
  $('date-label').textContent = dateLabel;
  $('date-label').setAttribute('aria-label', key === t ? dateLabel : dateLabel + '(タップで今日に戻る)');
  $('btn-next-day').disabled = key >= t;

  fillStats('rec-stat-', statsFor(key));
  renderQuickRows($('set-chips'), $('food-chips'), $('recent-chips'), t);

  // 記録一覧
  $('entries-title').textContent = key === t ? '今日の記録' : '記録(' + core.formatDateLabel(key, t) + ')';
  $('entry-list').innerHTML = entries.map((e) => {
    const name = e.name ? esc(e.name) : '無題';
    return '<button type="button" class="entry" data-id="' + esc(e.id) + '" aria-label="' + esc(e.name || '無題') + ' を編集">' +
      '<span class="time num">' + esc(e.time) + '</span>' +
      '<span class="body"><span class="name' + (e.name ? '' : ' untitled') + '">' + name + '</span>' +
      '<span class="pfc num">' + pfcColsHtml(e) + '</span></span>' +
      '<span class="kcal num">' + core.fmtInt(core.calcKcal(e.p, e.f, e.c)) + '<small>kcal</small></span>' +
    '</button>';
  }).join('');
  $('entry-empty').hidden = entries.length > 0;
}

// ---------- 記録シート ----------
export function entryFormValues() {
  const p = readNum('entry-p'), f = readNum('entry-f'), c = readNum('entry-c');
  const invalid = p === null || f === null || c === null || p < 0 || f < 0 || c < 0;
  return { name: $('entry-name').value.trim().slice(0, core.MAX_NAME), p: core.clampG(p || 0), f: core.clampG(f || 0), c: core.clampG(c || 0), invalid };
}
export function updateEntryForm() {
  const v = entryFormValues();
  $('entry-kcal').textContent = core.fmtInt(core.calcKcal(v.p, v.f, v.c));
  const empty = !v.name && v.p === 0 && v.f === 0 && v.c === 0;
  $('btn-entry-save').disabled = v.invalid || empty;
}
// entry: 編集対象(null なら追加)。dayKey: 編集時はその記録が入っている日、追加時は保存先の日(省略 → 記録タブで表示中の日)。
// fromHome: ホームの入力エリアから開いた(保存先は今日。保存しても記録タブの表示日は動かさない)
export function openEntrySheet(entry, dayKey, fromHome) {
  if (!entry) catchUpDay(); // 日付が変わっていれば「今日」を追従させてから保存先を決める
  state.sheetFromHome = !entry && !!fromHome;
  state.sheetDateKey = (state.sheetFromHome ? today() : dayKey) || state.dateKey;
  const key = state.sheetDateKey;
  state.editingEntryId = entry ? entry.id : null;
  $('sheet-entry-title').textContent = entry ? '記録を編集' : '記録を追加';
  $('entry-name').value = entry ? entry.name : '';
  $('entry-p').value = entry ? String(entry.p) : '';
  $('entry-f').value = entry ? String(entry.f) : '';
  $('entry-c').value = entry ? String(entry.c) : '';
  $('entry-time').value = entry ? entry.time : defaultTimeFor(key);
  $('entry-date').textContent = core.formatDateLabel(key, today()) + ' に保存します';
  $('btn-entry-delete').hidden = !entry;
  updateEntryForm();
  openSheet('sheet-entry');
  // 名前の欄に自動でフォーカスはしない(v2.0.0。iOS ではキーボードが出ずに枠だけ光るため。入れたい欄をタップする)
}
export function saveEntry() {
  const v = entryFormValues();
  if (v.invalid) { toast('数値の入力を確認してください'); return; }
  if (!v.name && v.p === 0 && v.f === 0 && v.c === 0) return;
  // 保存先はシートを開いたときの日。開いている間に 0 時を過ぎて表示が翌日に移っても、ここは動かさない
  const key = state.sheetDateKey || state.dateKey;
  const time = core.isValidTime($('entry-time').value) ? $('entry-time').value : defaultTimeFor(key);
  const day = ensureDay(key);
  if (state.editingEntryId) {
    const e = day.entries.find((x) => x.id === state.editingEntryId);
    if (!e) { closeSheet('sheet-entry'); toast('記録が見つかりませんでした'); render(); return; }
    // P/F/C を手で変えたら、マイ食品から入れたときの量と基準(amount / basis)は外す(core.editedEntry。4 章)
    day.entries[day.entries.indexOf(e)] = core.editedEntry(e, { name: v.name, p: v.p, f: v.f, c: v.c, time });
  } else {
    day.entries.push({ id: core.genId('e'), name: v.name, p: v.p, f: v.f, c: v.c, time, createdAt: core.localIso(new Date()) });
  }
  closeSheet('sheet-entry');
  // 表示中の日と違う日に保存した(開いている間に日付が変わった)ときは、保存した日を見せて消えたように見せない。
  // ホームから今日に入れたときは記録タブの表示日を動かさない
  if (key !== state.dateKey && !state.sheetFromHome) { state.dateKey = key; state.followToday = false; }
  commit();
}
export function deleteEntry() {
  const id = state.editingEntryId;
  if (!id) return;
  if (!window.confirm('この記録を削除しますか？')) return;
  const key = state.sheetDateKey || state.dateKey;
  const day = state.data.days[key];
  const idx = day ? day.entries.findIndex((x) => x.id === id) : -1;
  if (idx < 0) { closeSheet('sheet-entry'); render(); return; }
  const removed = day.entries.splice(idx, 1)[0];
  closeSheet('sheet-entry');
  if (!commit()) return; // 保存できなかった(警告バー表示中)ときは成功のトーストを出さない
  const gen = state.generation;
  toast('削除しました', () => {
    if (gen !== state.generation) { toast('元に戻せませんでした'); return; }
    const d = ensureDay(key);
    if (!d.entries.some((x) => x.id === removed.id)) d.entries.splice(Math.min(idx, d.entries.length), 0, removed); // 元の位置に戻す
    if (commit()) toast('元に戻しました');
  });
}

// ---------- 記録の追加(共通) ----------
// 記録をまとめて dayKey の日(省略時は表示中の日)に追加して保存する(最近の記録 / 分量シート / セット / まとめて記録から)。
// time 省略時はその日の既定時刻。1 品ごとに別の記録になる。fromHome: ホームの入力エリアから追加した(記録タブの表示日は動かさない)。
// 戻り値は「元に戻す」関数(今回追加した記録をまとめて取り消す)。保存できなかった(警告バー表示中)ときは null
export function pushEntries(items, dayKey, time, fromHome) {
  const key = dayKey || state.dateKey;
  const t = core.isValidTime(time) ? time : defaultTimeFor(key);
  const createdAt = core.localIso(new Date());
  const added = items.map((item) => {
    const entry = { id: core.genId('e'), name: item.name || '', p: core.clampG(item.p), f: core.clampG(item.f), c: core.clampG(item.c), time: t, createdAt };
    if (item.foodId) entry.foodId = item.foodId;
    // マイ食品から入れた記録には、その食品の単位での量と基準も残す(v2.0.0。食費の見通し機能の準備。4 章)
    const am = core.entryAmountFields(item);
    if (am) { entry.amount = am.amount; entry.basis = am.basis; }
    return entry;
  });
  const day = ensureDay(key);
  added.forEach((e) => day.entries.push(e));
  // 表示中の日と違う日に追加した(シートを開いている間に日付が変わった)ときは、追加した日を見せる
  if (key !== state.dateKey && !fromHome) { state.dateKey = key; state.followToday = false; }
  if (!commit()) return null;
  const gen = state.generation;
  const ids = new Set(added.map((e) => e.id));
  return () => {
    if (gen !== state.generation) { toast('元に戻せませんでした'); return; }
    const d = state.data.days[key];
    if (d) d.entries = d.entries.filter((x) => !ids.has(x.id));
    if (commit()) toast('元に戻しました');
  };
}
// 追加して、トースト「〜しました [元に戻す]」を出す(保存できなかったときは成功のトーストを出さない)
export function addEntries(items, label, dayKey, time, fromHome) {
  const undo = pushEntries(items, dayKey, time, fromHome);
  if (undo) toast(label || '追加しました', undo);
}
export function addQuickEntry(item, label, dayKey, time, fromHome) { addEntries([item], label, dayKey, time, fromHome); }

// ---------- 分量シート ----------
function currentAmountFood() { return state.data.foods.find((x) => x.id === state.amountFoodId) || null; }
export function updateAmountForm() {
  const food = currentAmountFood();
  if (!food) return;
  const amt = core.setAmount(readNum('amount-value')) || 0; // 小数1桁に丸めた量(追加されるのと同じ値で計算する)
  const s = core.scaleFood(food, amt);
  $('amount-p').textContent = core.fmtG(s.p);
  $('amount-f').textContent = core.fmtG(s.f);
  $('amount-c').textContent = core.fmtG(s.c);
  $('amount-kcal').textContent = core.fmtInt(s.kcal);
  $('btn-amount-add').disabled = !(amt > 0);
}
// fromHome: ホームの入力エリアから開いた(追加先は今日)
export function openAmountSheet(foodId, fromHome) {
  const food = state.data.foods.find((x) => x.id === foodId);
  if (!food) { render(); return; }
  state.sheetFromHome = !!fromHome;
  state.sheetDateKey = quickTargetDay(fromHome); // 追加先の日と時刻はシートを開いた時点で確定(0 時をまたいでも動かさない)
  state.sheetTime = defaultTimeFor(state.sheetDateKey);
  state.amountFoodId = food.id;
  const d = core.amountDefaults(food);
  $('amount-name').textContent = food.name;
  $('amount-basis').textContent = core.basisLabel(food) + ' P' + core.fmtG(food.p) + ' F' + core.fmtG(food.f) + ' C' + core.fmtG(food.c) + ' / ' + core.fmtInt(core.calcKcal(food.p, food.f, food.c)) + 'kcal';
  $('amount-value').step = String(d.step);
  $('amount-value').value = String(d.value);
  $('amount-unit').textContent = d.unit;
  updateAmountForm();
  openSheet('sheet-amount');
  // 自動フォーカスはしない(iOS でキーボードが出て「追加」ボタンを隠すため)。数値を変えたいときだけ欄をタップする
}
export function stepAmount(dir) {
  const food = currentAmountFood();
  if (!food) return;
  const step = core.amountDefaults(food).step === 1 ? 10 : 0.5; // 100g 基準は 10g 刻み、食分は 0.5 刻み
  const cur = core.parseNum($('amount-value').value) || 0;
  const next = Math.max(0, Math.round((cur + dir * step) * 10) / 10);
  $('amount-value').value = String(next);
  updateAmountForm();
}
export function addFromAmountSheet() {
  const food = currentAmountFood();
  if (!food) { closeSheet('sheet-amount'); return; }
  const n = core.setAmount(readNum('amount-value')); // 小数1桁に丸めた量。0 になる量(0.04 など)は追加しない(セット・まとめて記録と同じ)
  if (n === null) return;
  const s = core.scaleFood(food, n);
  food.usedAt = core.localIso(new Date());
  food.useCount = (food.useCount || 0) + 1;
  closeSheet('sheet-amount');
  addQuickEntry(s, '追加しました', state.sheetDateKey || state.dateKey, state.sheetTime, state.sheetFromHome);
}
