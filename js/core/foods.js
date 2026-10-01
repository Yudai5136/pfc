// core/foods.js — マイ食品(分量の計算・並び・PFC未登録・値段の単位)、記録の量と基準(entryAmountFields。手で直したときは model.js の editedEntry)、
// セット(12 章)、まとめて記録(14 章)の計算。
import { MAX_G, MAX_NAME } from './constants.js';
import { toNum, parseNum, round1, clampG, fmtInt, fmtG, calcKcal, isNumeric } from './format.js';
import { sumEntries } from './nutrition.js';

// ---------- マイ食品 ----------
// マイ食品・セットの並び: usedAt の新しい順(未使用は末尾、名前順)
export function sortByUsed(list) {
  return (Array.isArray(list) ? list.slice() : []).filter((x) => x && typeof x === 'object').sort((a, b) => {
    const ua = a.usedAt || '', ub = b.usedAt || '';
    if (ua && ub && ua !== ub) return ua < ub ? 1 : -1;
    if (ua && !ub) return -1;
    if (!ua && ub) return 1;
    return String(a.name || '').localeCompare(String(b.name || ''), 'ja');
  });
}
export function sortFoods(foods) { return sortByUsed(foods); }
export function sortSets(sets) { return sortByUsed(sets); }
// マイ食品を分量でスケールし、記録の形にする。
// amount / basis(v2.0.0): その食品の単位での量(1食分基準なら個数、100g 基準ならグラム数。小数1桁)と、そのときの基準。
// 食費の見通し機能の準備として記録に残す(4 章。記録に付けるかは entryAmountFields で決める)。
// 量は先に小数1桁に丸めてから P/F/C を計算する(名前の「×1.3」・amount・P/F/C がいつも同じ量を指すように。セット・まとめて記録と同じ)
export function scaleFood(food, amount) {
  const amt = round1(Math.max(0, toNum(amount)));
  const factor = food && food.basis === 'per100g' ? amt / 100 : amt;
  const p = clampG(toNum(food && food.p) * factor);
  const f = clampG(toNum(food && food.f) * factor);
  const c = clampG(toNum(food && food.c) * factor);
  const base = String((food && food.name) || '').trim();
  let name;
  if (food && food.basis === 'per100g') name = base + ' ' + fmtG(amt) + 'g';
  else name = amt === 1 ? base : base + ' ×' + fmtG(amt);
  return { name: name.slice(0, MAX_NAME), p, f, c, kcal: calcKcal(p, f, c), foodId: food && food.id, amount: amt, basis: food && food.basis === 'per100g' ? 'per100g' : 'perServing' };
}
// 記録に残す「量と基準」(4 章。食費の見通し機能の準備 v2.0.0)。
// amount は 0 より大きい数(小数1桁、上限 MAX_G)、basis は 'perServing' | 'per100g'。どちらかが使えない値なら null(記録に付けない)
export const AMOUNT_BASES = ['perServing', 'per100g'];
export function entryAmountFields(src) {
  if (!src || typeof src !== 'object') return null;
  const a = src.amount, b = src.basis;
  if (typeof a !== 'number' || !Number.isFinite(a) || AMOUNT_BASES.indexOf(b) < 0) return null;
  const amount = Math.min(round1(a), MAX_G);
  return amount > 0 ? { amount, basis: b } : null;
}
// 分量シートの初期値・刻み・単位
export function amountDefaults(food) {
  if (food && food.basis === 'per100g') return { value: 100, step: 1, min: 0, unit: 'g' };
  const label = String((food && food.servingLabel) || '').trim() || '1食';
  return { value: 1, step: 0.5, min: 0, unit: label.replace(/^[0-9０-９.．]+/, '') || label };
}
// マイ食品の基準表示: 「100gあたり」「1杯あたり」
export function basisLabel(food) {
  if (food && food.basis === 'per100g') return '100gあたり';
  return (String((food && food.servingLabel) || '').trim() || '1食') + 'あたり';
}

// ---------- セット(12章) ----------
// id でマイ食品を探す(なければ null)
export function findFood(foods, id) {
  if (typeof id !== 'string' || !Array.isArray(foods)) return null;
  return foods.find((f) => f && f.id === id) || null;
}
// セットの量として使える値か(0 より大きい数)。小数1桁に丸めた値、使えなければ null
export function setAmount(v) {
  if (!isNumeric(v)) return null;
  const n = round1(typeof v === 'string' ? parseNum(v) : v);
  if (!(n > 0)) return null;
  return Math.min(n, MAX_G);
}
// セットの品ごとの値。マイ食品を参照して、いまの値と量から P/F/C を計算する。
// 削除されたマイ食品を指す品は available: false(画面では使えない品として薄く出す)
export function setItemValues(set, foods) {
  const items = set && Array.isArray(set.items) ? set.items : [];
  return items.map((it, index) => {
    const foodId = it && typeof it.foodId === 'string' ? it.foodId : '';
    const amount = setAmount(it && it.amount) || 0;
    const food = findFood(foods, foodId);
    if (!food) return { index, foodId, amount, food: null, available: false, name: '削除されたマイ食品', unit: '', entryName: '', p: 0, f: 0, c: 0, kcal: 0 };
    const s = scaleFood(food, amount); // 記録の名前も分量シートと同じ付け方(「プロテイン」「白米 150g」「バナナ ×2」)
    return { index, foodId, amount, food, available: true, name: food.name, unit: amountDefaults(food).unit, entryName: s.name, p: s.p, f: s.f, c: s.c, kcal: s.kcal };
  });
}
// セットの合計(使える品だけ)。count は使える品の数。kcal は合計 P/F/C から計算(メイン画面の合計と同じ式)
export function setTotals(set, foods) {
  const vals = setItemValues(set, foods).filter((v) => v.available);
  const sum = sumEntries(vals);
  return { p: sum.p, f: sum.f, c: sum.c, kcal: sum.kcal, count: vals.length };
}
// チップの小さい文字: 「3品 · 512kcal」
export function setSubLabel(set, foods) {
  const t = setTotals(set, foods);
  return t.count + '品 · ' + fmtInt(t.kcal) + 'kcal';
}
// そのマイ食品を使っているセットの数
export function countSetsUsingFood(sets, foodId) {
  return (Array.isArray(sets) ? sets : []).filter((s) => s && Array.isArray(s.items) && s.items.some((it) => it && it.foodId === foodId)).length;
}
// マイ食品を削除したとき、各セットから該当する品を取り除いた新しい配列を返す(空になったセットも残す)
export function removeFoodFromSets(sets, foodId) {
  return (Array.isArray(sets) ? sets : []).map((s) => {
    if (!s || !Array.isArray(s.items) || !s.items.some((it) => it && it.foodId === foodId)) return s;
    return Object.assign({}, s, { items: s.items.filter((it) => !(it && it.foodId === foodId)) });
  });
}
// マイ食品の基準(1食分 / 100g)を変えたとき、各セットでのその食品の量を新しい基準の初期値に戻した新しい配列を返す。
// 量の意味(個数 / グラム数)が変わるので、古い数字のままだと「白米 150g」が「150食分」になってしまう
export function resetFoodAmountInSets(sets, foodId, amount) {
  return (Array.isArray(sets) ? sets : []).map((s) => {
    if (!s || !Array.isArray(s.items) || !s.items.some((it) => it && it.foodId === foodId)) return s;
    return Object.assign({}, s, { items: s.items.map((it) => (it && it.foodId === foodId ? Object.assign({}, it, { amount }) : it)) });
  });
}

// ---------- まとめて記録(14章) ----------
export const BATCH_NAME_MAX = 20;    // 提案するセット名の長さ(超えたら「…」で切る)
// 食品 id の並びを「同じ組み合わせか」を比べるための鍵にする(順番は見ない。同じ食品が 2 回あれば 2 回数える)
export function foodIdsKey(foodIds) {
  return (Array.isArray(foodIds) ? foodIds : []).filter((id) => typeof id === 'string' && id).slice().sort().join('\n');
}
// 同じ食品の組み合わせ(foodId の多重集合。量は見ない)のセット。無ければ null。foodIds が空なら null
export function findSetByItems(sets, foodIds) {
  const key = foodIdsKey(foodIds);
  if (!key) return null;
  return (Array.isArray(sets) ? sets : []).find((s) => s && Array.isArray(s.items) && foodIdsKey(s.items.map((it) => it && it.foodId)) === key) || null;
}
// 提案するセット名: 品名を「・」でつなぐ(同じ食品は 1 回だけ。無い食品は飛ばす)。20 文字を超えたら「…」で切る
export function batchSetName(foods, foodIds) {
  const seen = new Set();
  const names = [];
  (Array.isArray(foodIds) ? foodIds : []).forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const food = findFood(foods, id);
    const name = food ? String(food.name || '').trim() : '';
    if (name) names.push(name);
  });
  const chars = Array.from(names.join('・'));
  return chars.length > BATCH_NAME_MAX ? chars.slice(0, BATCH_NAME_MAX - 1).join('') + '…' : chars.join('');
}

// ---------- マイ食品: PFC未登録・値段の単位(13.4 / 13.5) ----------
// 買い物から来て P/F/C がまだ無い食品
export function isPending(food) { return !!(food && food.pending === true); }
// マイ食品チップ・選択シート・マイ食品一覧に出す食品(PFC未登録を除く)
export function activeFoods(foods) { return (Array.isArray(foods) ? foods : []).filter((f) => f && typeof f === 'object' && !isPending(f)); }
// PFC未登録の食品(名前順)
export function pendingFoods(foods) {
  return (Array.isArray(foods) ? foods : []).filter(isPending).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
}
export function countPending(foods) { return (Array.isArray(foods) ? foods : []).filter(isPending).length; }
// 値段の単位の既定値: 100g 基準の食品は 100gあたり、1食分基準は 1個あたり
export function defaultPriceBasis(basis) { return basis === 'per100g' ? 'per100g' : 'perItem'; }
// 食品の値段の単位(無い・不正なら basis から決める)
export function priceBasisOf(food) {
  const v = food && food.priceBasis;
  return v === 'per100g' || v === 'perItem' ? v : defaultPriceBasis(food && food.basis);
}
