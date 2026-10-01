// app/sets.js — セット(12 章): セットの作成・編集シートと、セットのチップを押したときの追加シート(中身を確認して記録する)。
import * as core from '../core/index.js';
import { $, esc, state, today, defaultTimeFor, quickTargetDay, render, showFoodsTab } from './state.js';
import { commit } from './storage.js';
import { toast, openSheet, closeSheet, pfcKcalHtml, fillTotals, readAmountInput, amountInputHtml } from './ui.js';
import { addEntries } from './record.js';
import { DRAFTS, renderDraftItems, readDraftRows } from './drafts.js';

export function findSet(id) { return state.data.sets.find((x) => x.id === id) || null; }
// 「＋ セットを管理 / 作る」: セット一覧を開く。1 つも無ければそのまま作成シートも開く
export function openSetsManage() {
  showFoodsTab('sets');
  if (!state.data.sets.length) openSetSheet(null);
}

// ---------- セットの作成・編集シート ----------
export function openSetSheet(set) {
  state.editingSetId = set ? set.id : null;
  state.setDraft = { items: set ? set.items.map((it) => ({ foodId: it.foodId, text: String(it.amount) })) : [] };
  $('sheet-set-title').textContent = set ? 'セットを編集' : 'セットを作る';
  $('set-name').value = set ? set.name : '';
  $('btn-set-delete').hidden = !set;
  renderDraftItems('set');
  openSheet('sheet-set');
  // 名前の欄に自動でフォーカスはしない(v2.0.0。iOS ではキーボードが出ずに枠だけ光るため)
}
// 入力欄の値で各品の値と合計を更新し、保存できるかを決める(名前が空・品が 0 個・量が不正なら保存不可)
export function updateSetForm() {
  if (!state.setDraft) return;
  const r = readDraftRows('set');
  $('btn-set-save').disabled = !$('set-name').value.trim() || state.setDraft.items.length === 0 || r.bad;
}
DRAFTS.set.update = updateSetForm; // 下書きの行を描き直したとき・「外す」のときに呼ばれる(drafts.js)
export function saveSet() {
  updateSetForm();
  if ($('btn-set-save').disabled) return;
  const name = $('set-name').value.trim().slice(0, core.MAX_NAME);
  const items = state.setDraft.items.map((it) => ({ foodId: it.foodId, amount: core.setAmount(it.text) })).filter((it) => it.amount !== null);
  const isNew = !state.editingSetId;
  if (!isNew) {
    const st = findSet(state.editingSetId);
    if (!st) { closeSheet('sheet-set'); toast('セットが見つかりませんでした'); render(); return; }
    Object.assign(st, { name, items });
  } else {
    state.data.sets.push({ id: core.genId('s'), name, items, usedAt: null, useCount: 0, createdAt: core.localIso(new Date()) });
  }
  closeSheet('sheet-set');
  const saved = commit();
  if (isNew && saved) toast('セットを作りました');
}
export function deleteSet() {
  const id = state.editingSetId;
  if (!id) return;
  if (!window.confirm('このセットを削除しますか？(中のマイ食品と過去の記録はそのまま残ります)')) return;
  state.data.sets = state.data.sets.filter((x) => x.id !== id);
  closeSheet('sheet-set');
  commit();
}

// ---------- セット追加シート(タップ後に中身を確認して記録する) ----------
// fromHome: ホームの入力エリアから開いた(追加先は今日)
export function openSetAddSheet(setId, fromHome) {
  const set = findSet(setId);
  if (!set) { render(); return; }
  state.sheetFromHome = !!fromHome;
  state.sheetDateKey = quickTargetDay(fromHome); // 0 時を過ぎていたら今日を追従させてから追加先を決める。開いた時点で確定(0 時をまたいでも動かさない)
  state.setAddId = set.id;
  const vals = core.setItemValues(set, state.data.foods);
  state.setAddFoodIds = vals.map((v) => v.foodId);
  $('set-add-name').textContent = set.name;
  $('set-add-date').textContent = core.formatDateLabel(state.sheetDateKey, today()) + ' に追加します';
  $('set-add-time').value = defaultTimeFor(state.sheetDateKey);
  $('set-add-items').innerHTML = vals.map((v) => {
    if (!v.available) {
      // 削除されたマイ食品は薄く出し、チェックできないようにする
      return '<div class="set-add-item missing" data-index="' + v.index + '"><label class="check"><input class="set-add-check" type="checkbox" disabled aria-label="削除されたマイ食品(使えません)">' +
        '<span class="body"><span class="name">削除されたマイ食品</span><span class="pfc">使えません</span></span></label></div>';
    }
    return '<div class="set-add-item" data-index="' + v.index + '">' +
      '<label class="check"><input class="set-add-check" type="checkbox" checked aria-label="' + esc(v.name) + ' を追加する">' +
        '<span class="body"><span class="name">' + esc(v.name) + '</span></span></label>' +
      amountInputHtml('set-add-amount', v.food, String(v.amount), v.name) +
      '<span class="pfc num"></span>' + // P/F/C は行の幅いっぱいの2行目に出す(量の入力欄の横は狭いため)
    '</div>';
  }).join('');
  $('set-add-empty').hidden = vals.some((v) => v.available);
  updateSetAddForm();
  openSheet('sheet-set-add');
  // 自動フォーカスはしない(分量シートと同じ。キーボードで「追加」が隠れないように)
}
// 追加シートの使える行: { row, food, check, input, checked, amount(不正なら null) }
function setAddRows() {
  const rows = [];
  $('set-add-items').querySelectorAll('.set-add-item[data-index]').forEach((row) => {
    const food = core.findFood(state.data.foods, state.setAddFoodIds[Number(row.dataset.index)]);
    const check = row.querySelector('.set-add-check');
    const input = row.querySelector('.set-add-amount');
    if (!food || !input) return;
    rows.push({ row, food, check, input, checked: check.checked, amount: readAmountInput(input) });
  });
  return rows;
}
// 各行の値と、チェックが入っている品の合計を更新。チェックが無い・チェックした品の量が不正なら「追加」を無効にする
export function updateSetAddForm() {
  const picked = [];
  let bad = false;
  setAddRows().forEach((r) => {
    r.row.classList.toggle('off', !r.checked);
    r.input.classList.toggle('bad', r.checked && r.amount === null);
    const sc = core.scaleFood(r.food, r.amount || 0);
    r.row.querySelector('.pfc').innerHTML = pfcKcalHtml(sc);
    if (!r.checked) return;
    if (r.amount === null) bad = true; else picked.push(sc);
  });
  fillTotals('set-add-total', 'set-add-kcal', core.sumEntries(picked));
  const btn = $('btn-set-add-confirm');
  btn.disabled = bad || picked.length === 0;
  btn.textContent = picked.length && !bad ? picked.length + '品を追加' : '追加';
  btn.setAttribute('aria-label', btn.textContent);
}
export function addFromSetSheet() {
  const set = findSet(state.setAddId);
  if (!set) { closeSheet('sheet-set-add'); render(); return; }
  updateSetAddForm();
  if ($('btn-set-add-confirm').disabled) return;
  const picked = setAddRows().filter((r) => r.checked && r.amount !== null);
  const key = state.sheetDateKey || state.dateKey;
  const time = core.isValidTime($('set-add-time').value) ? $('set-add-time').value : defaultTimeFor(key);
  const now = core.localIso(new Date());
  // 記録の名前は分量シートと同じ付け方(scaleFood)。シートで変えた量・チェックはこの回だけで、セット自体は変えない
  const items = picked.map((r) => {
    r.food.usedAt = now; r.food.useCount = (r.food.useCount || 0) + 1;
    return core.scaleFood(r.food, r.amount);
  });
  set.usedAt = now; set.useCount = (set.useCount || 0) + 1;
  closeSheet('sheet-set-add');
  addEntries(items, set.name + '(' + items.length + '品)を追加しました', key, time, state.sheetFromHome);
}
