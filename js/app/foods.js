// app/foods.js — マイ食品タブ(13.4)の一覧(マイ食品 / セット / PFC未登録)と、マイ食品の追加・編集シート。
import * as core from '../core/index.js';
import { $, esc, state, render } from './state.js';
import { commit } from './storage.js';
import { pfcColsHtml, toast, openSheet, closeSheet, readNum } from './ui.js';
import { confirmPriceBasisChange, dropItemPrices } from './pricing.js';
import { DRAFTS, addFoodToDraft } from './drafts.js';

// ---------- マイ食品タブ(マイ食品 / セット / PFC未登録) ----------
export function renderFoodsTab() {
  const seg = state.foodsSeg;
  $('foods-seg').querySelectorAll('.seg').forEach((b) => {
    const on = b.dataset.seg === seg;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('view-foods').querySelectorAll('.foods-pane').forEach((p) => { p.hidden = p.dataset.pane !== seg; });
  const n = core.countPending(state.data.foods);
  const badge = $('foods-seg').querySelector('.seg[data-seg="pending"] .badge');
  badge.textContent = String(n);
  badge.hidden = n === 0;
  renderFoods();
  renderSets();
  renderPending();
}
function renderFoods() {
  const foods = core.sortFoods(core.activeFoods(state.data.foods)); // PFC未登録は「PFC未登録」の切替に出す
  $('food-list').innerHTML = foods.map((f) =>
    '<button type="button" class="food" data-id="' + esc(f.id) + '" aria-label="' + esc(f.name) + ' を編集">' +
      '<span class="body"><span class="name-line"><span class="name">' + esc(f.name) + '</span><span class="pfc-note">' + esc(core.basisLabel(f)) + '</span></span>' +
      '<span class="pfc num">' + pfcColsHtml(f) + '</span></span>' +
      '<span class="kcal num">' + core.fmtInt(core.calcKcal(f.p, f.f, f.c)) + '<small>kcal</small></span>' +
    '</button>').join('');
  $('food-empty').hidden = foods.length > 0;
}
// セット一覧: 名前、品数と中身の名前、kcal 合計
function renderSets() {
  const foods = state.data.foods;
  const sets = core.sortSets(state.data.sets);
  $('set-list').innerHTML = sets.map((st) => {
    const t = core.setTotals(st, foods);
    const names = core.setItemValues(st, foods).filter((v) => v.available).map((v) => v.name).join('、');
    return '<button type="button" class="set" data-id="' + esc(st.id) + '" aria-label="セット ' + esc(st.name) + ' を編集">' +
      '<span class="body"><span class="name">' + esc(st.name) + '</span>' +
      '<span class="pfc">' + t.count + '品' + (names ? ' · ' + esc(names) : '(中身なし)') + '</span></span>' +
      '<span class="kcal num">' + core.fmtInt(t.kcal) + '<small>kcal</small></span>' +
    '</button>';
  }).join('');
  $('set-empty').hidden = sets.length > 0;
}
// PFC未登録の一覧。各行の「PFCを入れる」でマイ食品の編集シートを開く
function renderPending() {
  const list = core.pendingFoods(state.data.foods);
  $('pending-list').innerHTML = list.map((f) =>
    '<div class="pending" data-id="' + esc(f.id) + '">' +
      '<span class="body"><span class="name">' + esc(f.name) + '</span><span class="sub">P/F/C がまだ入っていません</span></span>' +
      '<button type="button" class="btn-fill-pfc" aria-label="' + esc(f.name) + ' の PFC を入れる">PFCを入れる</button>' +
    '</div>').join('');
  $('pending-empty').hidden = list.length > 0;
}

// ---------- マイ食品シート ----------
function foodFormValues() {
  const p = readNum('food-p'), f = readNum('food-f'), c = readNum('food-c');
  const invalid = p === null || f === null || c === null || p < 0 || f < 0 || c < 0;
  const basis = $('food-basis-per100g').checked ? 'per100g' : 'perServing';
  return {
    name: $('food-name').value.trim().slice(0, core.MAX_NAME), basis,
    servingLabel: basis === 'per100g' ? '' : ($('food-serving-label').value.trim().slice(0, 20) || '1食'),
    priceBasis: $('food-price-basis-100g').checked ? 'per100g' : 'perItem',
    p: core.clampG(p || 0), f: core.clampG(f || 0), c: core.clampG(c || 0), invalid
  };
}
// 値段の単位のラジオを選ぶ
function setPriceBasisRadio(v) {
  $('food-price-basis-100g').checked = v === 'per100g';
  $('food-price-basis-item').checked = v !== 'per100g';
}
// 基準(100g / 1食分)を切り替えたとき、値段の単位をまだ自分で選んでいなければ既定値(100g → 100gあたり、1食分 → 1個あたり)に合わせる
export function onFoodBasisChange() {
  if (!state.priceBasisTouched) setPriceBasisRadio(core.defaultPriceBasis($('food-basis-per100g').checked ? 'per100g' : 'perServing'));
  updateFoodForm();
}
// PFC未登録の食品を開いたときは、P/F/C のどれかを入れるまで保存できない(空のまま保存すると 0kcal のふつうの食品になってしまう)
function pendingPfcBlank() {
  return state.foodSheetWasPending && !['food-p', 'food-f', 'food-c'].some((id) => $(id).value.trim() !== '');
}
export function updateFoodForm() {
  const v = foodFormValues();
  $('food-kcal').textContent = core.fmtInt(core.calcKcal(v.p, v.f, v.c));
  $('food-serving-label-field').hidden = v.basis === 'per100g';
  $('btn-food-save').disabled = v.invalid || !v.name || pendingPfcBlank();
}
// food: 編集対象(null なら追加)。prefill: 記録シートから引き継ぐ値。opts.forSet: セットの食品選択シートから開いた(保存したらセットに入れる)
export function openFoodSheet(food, prefill, opts) {
  state.editingFoodId = food ? food.id : null;
  state.foodSheetForSet = !food && !!(opts && opts.forSet);
  const src = food || prefill || {};
  const pending = core.isPending(food);
  state.foodSheetWasPending = pending;
  $('sheet-food-title').textContent = pending ? 'PFCを入れる' : food ? 'マイ食品を編集' : 'マイ食品を追加';
  $('food-name').value = src.name || '';
  $('food-basis-per100g').checked = src.basis === 'per100g';
  $('food-basis-serving').checked = src.basis !== 'per100g';
  $('food-serving-label').value = food ? (food.servingLabel || '') : '1食';
  // PFC未登録の食品は 0 のままなので、欄を空にして入れやすくする
  $('food-p').value = src.p !== undefined && !pending ? String(src.p) : '';
  $('food-f').value = src.f !== undefined && !pending ? String(src.f) : '';
  $('food-c').value = src.c !== undefined && !pending ? String(src.c) : '';
  // 値段がもう入っている品は、基準を切り替えても値段の単位は勝手に変えない(変えると値段を消す確認が出てしまう)
  state.priceBasisTouched = !!(food && (((food.priceBasis === 'per100g' || food.priceBasis === 'perItem') && food.priceBasis !== core.defaultPriceBasis(food.basis)) ||
    core.pricesFor(state.data.prices, 'food', food.id).length > 0));
  setPriceBasisRadio(food ? core.priceBasisOf(food) : core.defaultPriceBasis(src.basis));
  $('btn-food-delete').hidden = !food;
  updateFoodForm();
  openSheet('sheet-food');
  // 名前の欄に自動でフォーカスはしない(v2.0.0。iOS ではキーボードが出ずに枠だけ光るため)
}
export function saveFood() {
  const v = foodFormValues();
  if (v.invalid) { toast('数値の入力を確認してください'); return; }
  if (!v.name || pendingPfcBlank()) return;
  const foods = state.data.foods;
  const isNew = !state.editingFoodId;
  let newId = null;
  let resetMsg = '';
  if (!isNew) {
    const f = foods.find((x) => x.id === state.editingFoodId);
    if (!f) { closeSheet('sheet-food'); toast('マイ食品が見つかりませんでした'); render(); return; }
    const basisChanged = f.basis !== v.basis;
    // 値段の単位を変えるときは、比べられなくなる値段を消してよいか確かめる(やめたら保存しない)
    const priceBasisChanged = core.priceBasisOf(f) !== v.priceBasis;
    if (!confirmPriceBasisChange('food', f.id, core.priceBasisOf(f), v.priceBasis)) return;
    if (priceBasisChanged) dropItemPrices('food', f.id);
    Object.assign(f, { name: v.name, basis: v.basis, servingLabel: v.servingLabel, p: v.p, f: v.f, c: v.c, priceBasis: v.priceBasis });
    delete f.pending; // PFC未登録の食品は、保存した時点でふつうのマイ食品になる(13.4)
    // 基準を変えたら、セットでの量(個数 / グラム数)を新しい基準の初期値(1食分なら 1、100g 基準なら 100)に戻す
    const used = basisChanged ? core.countSetsUsingFood(state.data.sets, f.id) : 0;
    if (used) {
      const d = core.amountDefaults(f);
      state.data.sets = core.resetFoodAmountInSets(state.data.sets, f.id, d.value);
      resetMsg = used + '個のセットでの量を ' + d.value + d.unit + ' に戻しました';
    }
  } else {
    newId = core.genId('f');
    foods.push({ id: newId, name: v.name, basis: v.basis, servingLabel: v.servingLabel, p: v.p, f: v.f, c: v.c, usedAt: null, useCount: 0, priceBasis: v.priceBasis });
  }
  const wasPending = state.foodSheetWasPending;
  state.foodSheetWasPending = false;
  closeSheet('sheet-food');
  const saved = commit();
  if (wasPending && saved) toast(v.name + ' をマイ食品に登録しました');
  // 食品選択シートから登録した → そのまま下書き(セット編集 / まとめて記録)に入れる(選択シートは閉じて元のシートに戻る)
  if (isNew && state.foodSheetForSet && !$(DRAFTS[state.pickerTarget].sheet).hidden) addFoodToDraft(state.pickerTarget, newId);
  state.foodSheetForSet = false;
  if (resetMsg && saved) toast(resetMsg);
  if (isNew && saved) toast('マイ食品に登録しました'); // 記録シートから登録したときは、そのシートを隠さない位置(画面上部)に出る
}
export function deleteFood() {
  const id = state.editingFoodId;
  if (!id) return;
  // セットで使っていれば、そのセットからも外れることを確認文に出す(12.1)。値段・買い物リストの行も消える(13.5)
  const used = core.countSetsUsingFood(state.data.sets, id);
  const refs = core.itemRefsNote(core.countItemRefs(state.data.prices, state.data.shopping, 'food', id));
  if (!window.confirm('このマイ食品を削除しますか？(過去の記録には影響しません)' + (used ? '\n' + used + '個のセットからも外れます。' : '') + (refs ? '\n' + refs : ''))) return;
  const i = state.data.foods.findIndex((x) => x.id === id);
  if (i >= 0) state.data.foods.splice(i, 1);
  if (used) state.data.sets = core.removeFoodFromSets(state.data.sets, id); // 空になったセットも残す
  const r = core.removeItemRefs(state.data.prices, state.data.shopping, 'food', id);
  state.data.prices = r.prices; state.data.shopping = r.shopping;
  closeSheet('sheet-food');
  commit();
}
