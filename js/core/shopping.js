// core/shopping.js — 買い物リスト・店・値段の計算(13.5〜13.7): 単価・最安の店・候補・よく買うもの・並び・削除の連鎖。
import { MAX_G } from './constants.js';
import { toNum, parseNum, round1, fmtInt, fmtG, genId, isNumeric } from './format.js';
import { localIso, isValidIso } from './dates.js';
import { findFood, isPending, priceBasisOf } from './foods.js';

// ---------- 買い物・値段(13.5〜13.7) ----------
// 品 = マイ食品(itemType 'food'。PFC未登録を含む)か、食品ではない品(itemType 'goods')。
// 値段は「1品 × 1店 = 1件」で最新の値段だけを持つ。100gあたりで比べる品は grams 付き、1個あたりの品は grams なし
export const ITEM_TYPES = ['food', 'goods'];
export const MAX_STORE_NAME = 40;
export const MAX_QTY = 40;            // 数量メモの長さの上限
export const MAX_PRICE = 9999999;     // 金額の上限(円)。異常値の混入防止
export const FREQUENT_LIMIT = 10;     // 「よく買うもの」の数
export const SUGGEST_LIMIT = 8;       // 買うものの入力候補の数
export const NO_PRICE_GROUP = '値段未登録';
export function normPriceBasis(v) { return v === 'per100g' ? 'per100g' : 'perItem'; }
// 名前の比べ方(全角英数 → 半角、大文字 → 小文字、前後の空白なし)。部分一致の検索と同じ名前の判定に使う
export function nameKey(s) {
  let t = String(s ?? '');
  try { t = t.normalize('NFKC'); } catch (e) { /* 古い環境ではそのまま */ }
  return t.trim().toLowerCase();
}
export function cmpName(a, b) { return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'ja'); }
export function isoTime(s) { return isValidIso(s) ? new Date(s).getTime() : 0; }
// 金額の入力: 0 以上の整数(円)。小数は四捨五入。空・不正・上限超えは null
export function parsePrice(v) {
  if (!isNumeric(v)) return null;
  const n = typeof v === 'string' ? parseNum(v) : v;
  if (n === null || n < 0) return null;
  const r = Math.round(n);
  return r > MAX_PRICE ? null : r;
}
// グラムの入力: 0 より大きい数(小数1桁)。空・0・不正は null
export function parseGrams(v) {
  if (!isNumeric(v)) return null;
  const n = round1(typeof v === 'string' ? parseNum(v) : v);
  return n > 0 ? Math.min(n, MAX_G) : null;
}
// 比べるための値(丸めない)。grams があれば 100gあたり、なければ 1個あたり
export function unitValue(pr) {
  if (!pr) return Infinity;
  const g = toNum(pr.grams);
  return g > 0 ? toNum(pr.price) / g * 100 : toNum(pr.price);
}
// 表示用の単価: per100g → 100gあたりの円(price / grams × 100 を整数に丸める)、perItem → 金額そのまま。
// basis を省くと grams の有無で決める。100gあたりで grams が無いときは null
export function unitPrice(price, grams, basis) {
  const b = basis || (toNum(grams) > 0 ? 'per100g' : 'perItem');
  if (b === 'per100g') { const g = toNum(grams); return g > 0 ? Math.round(toNum(price) / g * 100) : null; }
  return Math.round(toNum(price));
}
export function yen(n) { return '¥' + fmtInt(n); }
export function priceUnitSuffix(basis) { return basis === 'per100g' ? '/100g' : '/個'; }
// 値段の単位の見出し: 「100gあたり」「1個あたり」
export function priceBasisLabel(basis) { return basis === 'per100g' ? '100gあたり' : '1個あたり'; }
// 「¥175/100g」「¥98/個」
export function priceLabel(pr, basis) {
  if (!pr) return '';
  const b = basis || (toNum(pr.grams) > 0 ? 'per100g' : 'perItem');
  const u = unitPrice(pr.price, pr.grams, b);
  return u === null ? '' : yen(u) + priceUnitSuffix(b);
}
// 買ったシート・値段シートのライブ表示。「¥350 / 200g → 100gあたり ¥175」「1個あたり ¥98」。入力が足りなければ ''
export function priceInputText(price, grams, basis) {
  if (price === null || price === undefined) return '';
  if (basis === 'per100g') {
    if (!(grams > 0)) return '';
    return yen(price) + ' / ' + fmtG(grams) + 'g → 100gあたり ' + yen(unitPrice(price, grams, 'per100g'));
  }
  return '1個あたり ' + yen(price);
}
// その品の値段(すべての店)
export function pricesFor(prices, itemType, itemId) {
  return (Array.isArray(prices) ? prices : []).filter((p) => p && p.itemType === itemType && p.itemId === itemId);
}
// 安い順。同じ値なら新しく更新した順
export function sortPrices(prices) {
  return (Array.isArray(prices) ? prices : []).filter((p) => p && typeof p === 'object').slice().sort((a, b) =>
    (unitValue(a) - unitValue(b)) || (isoTime(b.updatedAt) - isoTime(a.updatedAt)) || String(a.id).localeCompare(String(b.id)));
}
// その品の最安の値段(無ければ null)
export function bestPrice(prices, itemType, itemId) { return sortPrices(pricesFor(prices, itemType, itemId))[0] || null; }
export function findPrice(prices, itemType, itemId, storeId) {
  return (Array.isArray(prices) ? prices : []).find((p) => p && p.itemType === itemType && p.itemId === itemId && p.storeId === storeId) || null;
}
// 品 × 店の値段を上書き(無ければ追加)して、新しい配列と保存した 1 件を返す。basis が perItem なら grams は持たない
export function upsertPrice(prices, rec, nowIso) {
  const list = Array.isArray(prices) ? prices : [];
  const old = findPrice(list, rec.itemType, rec.itemId, rec.storeId);
  const pr = { id: old ? old.id : genId('pr'), itemType: rec.itemType, itemId: rec.itemId, storeId: rec.storeId, price: rec.price };
  if (rec.basis === 'per100g') pr.grams = rec.grams;
  pr.updatedAt = nowIso || localIso(new Date());
  return { prices: old ? list.map((p) => (p === old ? pr : p)) : list.concat(pr), price: pr };
}
export function findStore(stores, id) { return (Array.isArray(stores) ? stores : []).find((s) => s && s.id === id) || null; }
export function sortStores(stores) { return (Array.isArray(stores) ? stores : []).filter((s) => s && typeof s === 'object').slice().sort(cmpName); }
// 同じ名前(大文字小文字・全角半角を区別しない)の店
export function findStoreByName(stores, name) { const k = nameKey(name); return (Array.isArray(stores) ? stores : []).find((s) => s && nameKey(s.name) === k) || null; }
// 「前回選んだ店」: いちばん最近に値段を入れた店。無ければ名前順の最初の店。店が無ければ ''
export function lastUsedStoreId(prices, stores) {
  let best = null;
  (Array.isArray(prices) ? prices : []).forEach((p) => {
    if (!p || !findStore(stores, p.storeId)) return;
    if (!best || isoTime(p.updatedAt) > isoTime(best.updatedAt)) best = p;
  });
  if (best) return best.storeId;
  const first = sortStores(stores)[0];
  return first ? first.id : '';
}
// 品の情報 { type, id, name, priceBasis, pending, kind }(見つからなければ null)。kind は画面に出す種類名
export function itemOf(foods, goods, type, id) {
  if (type === 'food') {
    const f = findFood(foods, id);
    return f ? { type, id, name: f.name, priceBasis: priceBasisOf(f), pending: isPending(f), kind: isPending(f) ? 'PFC未登録' : 'マイ食品' } : null;
  }
  if (type === 'goods') {
    const g = (Array.isArray(goods) ? goods : []).find((x) => x && x.id === id);
    return g ? { type, id, name: g.name, priceBasis: normPriceBasis(g.priceBasis), pending: false, kind: '食品ではない' } : null;
  }
  return null;
}
// すべての品(マイ食品 → 食品ではない品)。名前順
export function allItems(foods, goods) {
  const out = [];
  (Array.isArray(foods) ? foods : []).forEach((f) => { if (f && f.id) out.push(itemOf(foods, goods, 'food', f.id)); });
  (Array.isArray(goods) ? goods : []).forEach((g) => { if (g && g.id) out.push(itemOf(foods, goods, 'goods', g.id)); });
  return out.filter(Boolean).sort(cmpName);
}
export function sameItem(a, type, id) { return !!a && a.itemType === type && a.itemId === id; }
// 買うものの入力候補: 名前の部分一致(前方一致を先に)。リストに未チェックで入っていれば inList
export function shopSuggestions(foods, goods, shopping, query, limit) {
  const q = nameKey(query);
  if (!q) return [];
  const list = Array.isArray(shopping) ? shopping : [];
  return allItems(foods, goods).filter((it) => nameKey(it.name).includes(q))
    .sort((a, b) => (nameKey(a.name).startsWith(q) ? 0 : 1) - (nameKey(b.name).startsWith(q) ? 0 : 1) || cmpName(a, b))
    .slice(0, limit || SUGGEST_LIMIT)
    .map((it) => Object.assign(it, { inList: list.some((r) => sameItem(r, it.type, it.id) && !r.checked) }));
}
// 入力した名前とまったく同じ名前の品(マイ食品を優先)。無ければ null
export function exactItem(foods, goods, name) {
  const k = nameKey(name);
  if (!k) return null;
  const items = allItems(foods, goods).filter((it) => nameKey(it.name) === k);
  return items.find((it) => it.type === 'food') || items[0] || null;
}
// よく買うもの: 買い物リストに入れた回数(shopCount)の多い順に最大 10 件。いま未チェックで入っている品は出さない
export function frequentShopping(foods, goods, shopping, limit) {
  const list = Array.isArray(shopping) ? shopping : [];
  const counted = [];
  (Array.isArray(foods) ? foods : []).forEach((f) => { if (f && f.shopCount > 0) counted.push({ type: 'food', id: f.id, name: f.name, count: f.shopCount }); });
  (Array.isArray(goods) ? goods : []).forEach((g) => { if (g && g.shopCount > 0) counted.push({ type: 'goods', id: g.id, name: g.name, count: g.shopCount }); });
  return counted.filter((it) => !list.some((r) => sameItem(r, it.type, it.id) && !r.checked))
    .sort((a, b) => b.count - a.count || cmpName(a, b)).slice(0, limit || FREQUENT_LIMIT);
}
// 買い物リストの並び: 未チェック(入れた順) → チェック済み(買った順。薄く表示して下に移る)
export function sortShopping(shopping) {
  const list = (Array.isArray(shopping) ? shopping : []).filter((r) => r && typeof r === 'object');
  const open = list.filter((r) => !r.checked).sort((a, b) => isoTime(a.addedAt) - isoTime(b.addedAt));
  const done = list.filter((r) => r.checked).sort((a, b) => isoTime(a.checkedAt) - isoTime(b.checkedAt));
  return open.concat(done);
}
export function countUnchecked(shopping) { return (Array.isArray(shopping) ? shopping : []).filter((r) => r && !r.checked).length; }
// 最安の店ごとに分ける。[{ storeId, name, rows }](店の名前順。値段の無い品は最後の「値段未登録」(storeId null)にまとめる)
export function groupByBestStore(rows, prices, stores) {
  const groups = new Map();
  const none = { storeId: null, name: NO_PRICE_GROUP, rows: [] };
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const best = bestPrice(prices, r.itemType, r.itemId);
    const store = best && findStore(stores, best.storeId);
    if (!store) { none.rows.push(r); return; }
    if (!groups.has(store.id)) groups.set(store.id, { storeId: store.id, name: store.name, rows: [] });
    groups.get(store.id).rows.push(r);
  });
  const out = Array.from(groups.values()).sort(cmpName);
  if (none.rows.length) out.push(none);
  return out;
}
// 値段タブのカード: 値段が 1 件以上ある品。名前の部分一致で絞り、カードどうしは品名順、カードの中は安い順
export function priceCards(data, query) {
  const d = data || {};
  const q = nameKey(query);
  const out = [];
  allItems(d.foods, d.goods).forEach((it) => {
    if (q && !nameKey(it.name).includes(q)) return;
    const list = sortPrices(pricesFor(d.prices, it.type, it.id));
    if (!list.length) return;
    out.push(Object.assign(it, { prices: list, best: list[0], unitLabel: priceBasisLabel(it.priceBasis) }));
  });
  return out;
}
// --- 削除の連鎖(13.5) ---
export function countStorePrices(prices, storeId) { return (Array.isArray(prices) ? prices : []).filter((p) => p && p.storeId === storeId).length; }
// 店を消す: その店の値段も消えた { stores, prices } を返す
export function removeStore(stores, prices, storeId) {
  return {
    stores: (Array.isArray(stores) ? stores : []).filter((s) => !(s && s.id === storeId)),
    prices: (Array.isArray(prices) ? prices : []).filter((p) => !(p && p.storeId === storeId))
  };
}
// その品の値段の数と、買い物リストの行の数
export function countItemRefs(prices, shopping, itemType, itemId) {
  return { prices: pricesFor(prices, itemType, itemId).length, shopping: (Array.isArray(shopping) ? shopping : []).filter((r) => sameItem(r, itemType, itemId)).length };
}
// 品(マイ食品・goods)を消すとき: その品の値段と買い物リストの行を除いた { prices, shopping } を返す
export function removeItemRefs(prices, shopping, itemType, itemId) {
  return {
    prices: (Array.isArray(prices) ? prices : []).filter((p) => !sameItem(p, itemType, itemId)),
    shopping: (Array.isArray(shopping) ? shopping : []).filter((r) => !sameItem(r, itemType, itemId))
  };
}
// 確認文に足す「値段 2 件と買い物リストの 1 行も消えます。」(どちらも無ければ '')
export function itemRefsNote(refs) {
  const parts = [];
  if (refs.prices) parts.push('値段 ' + refs.prices + ' 件');
  if (refs.shopping) parts.push('買い物リストの ' + refs.shopping + ' 行');
  return parts.length ? parts.join('と') + 'も消えます。' : '';
}
// 買ったものを片付ける: チェック済みを除いた kept と、除いた removed(元に戻す用に元の位置つき)
export function clearChecked(shopping) {
  const list = Array.isArray(shopping) ? shopping : [];
  const kept = [], removed = [];
  list.forEach((r, index) => { if (r && r.checked) removed.push({ index, row: r }); else kept.push(r); });
  return { kept, removed };
}
// 片付けを元に戻す: 除いた行を元の位置に差し戻す(その間に増えた行は後ろに残る)
export function restoreRemoved(shopping, removed) {
  const out = (Array.isArray(shopping) ? shopping : []).slice();
  removed.slice().sort((a, b) => a.index - b.index).forEach(({ index, row }) => {
    if (!out.some((r) => r && r.id === row.id)) out.splice(Math.min(index, out.length), 0, row);
  });
  return out;
}
