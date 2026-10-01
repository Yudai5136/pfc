// app/pricing.js — 買い物タブと値段タブで共用する部品: 品(マイ食品 / 食品ではない品)の取得と作成、
// 店と値段の入力欄(買ったシート・値段シート)、値段の単位を変えたときの値段の削除。
import * as core from '../core/index.js';
import { $, esc, state } from './state.js';
import { commit } from './storage.js';
import { toast } from './ui.js';

// ---------- 品・店・値段を探す ----------
// 品のオブジェクト(マイ食品か、食品ではない品)。無ければ null
export function itemObj(type, id) {
  if (type === 'food') return state.data.foods.find((f) => f.id === id) || null;
  if (type === 'goods') return state.data.goods.find((g) => g.id === id) || null;
  return null;
}
export function itemInfo(type, id) { return core.itemOf(state.data.foods, state.data.goods, type, id); }
export function findShopRow(id) { return state.data.shopping.find((r) => r.id === id) || null; }
export function storeName(id) { const s = core.findStore(state.data.stores, id); return s ? s.name : ''; }
export function findPriceById(id) { return state.data.prices.find((p) => p.id === id) || null; }

// ---------- 品を作る(買い物リストの追加欄・値段シートの「新しい品」) ----------
// 品を作る。食品なら PFC未登録のマイ食品(1食分基準・「1個」。P/F/C はあとで)、食品ではないなら goods
export function createItem(name, kind, priceBasis) {
  const now = core.localIso(new Date());
  if (kind === 'goods') {
    const g = { id: core.genId('g'), name, priceBasis: core.normPriceBasis(priceBasis), createdAt: now };
    state.data.goods.push(g);
    return { type: 'goods', id: g.id };
  }
  const f = { id: core.genId('f'), name, basis: 'perServing', servingLabel: '1個', p: 0, f: 0, c: 0, usedAt: null, useCount: 0, priceBasis: core.normPriceBasis(priceBasis), pending: true };
  state.data.foods.push(f);
  return { type: 'food', id: f.id };
}

// ---------- 店と値段の入力(買ったシートと値段シートで共用) ----------
const PRICE_FORMS = {
  bought: { store: 'bought-store', amount: 'bought-price', amountLabel: 'bought-price-label', grams: 'bought-grams', gramsField: 'bought-grams-field', live: 'bought-per100', newBtn: 'btn-bought-new-store', newBox: 'bought-new-store', newName: 'bought-new-store-name' },
  price: { store: 'price-store', amount: 'price-amount', amountLabel: 'price-amount-label', grams: 'price-grams', gramsField: 'price-grams-field', live: 'price-per100', newBtn: 'btn-price-new-store', newBox: 'price-new-store', newName: 'price-new-store-name' }
};
// 店の選択欄を作り直す(名前順)。selectedId が無ければ「前回選んだ店」。店が 1 つも無ければ新しい店の欄を開く
export function fillStoreSelect(form, selectedId) {
  const ids = PRICE_FORMS[form];
  const stores = core.sortStores(state.data.stores);
  const pick = selectedId && core.findStore(stores, selectedId) ? selectedId : core.lastUsedStoreId(state.data.prices, state.data.stores);
  $(ids.store).innerHTML = stores.length
    ? stores.map((st) => '<option value="' + esc(st.id) + '"' + (st.id === pick ? ' selected' : '') + '>' + esc(st.name) + '</option>').join('')
    : '<option value="">(店がありません)</option>';
  $(ids.store).disabled = !stores.length;
  showNewStoreBox(form, !stores.length);
}
export function showNewStoreBox(form, on) {
  const ids = PRICE_FORMS[form];
  $(ids.newBox).hidden = !on;
  if (on) $(ids.newName).value = '';
}
// 同じ名前の店があればそれを、無ければ作って返す(作ったら保存)
function ensureStore(name) {
  const old = core.findStoreByName(state.data.stores, name);
  if (old) return old;
  const st = { id: core.genId('st'), name, createdAt: core.localIso(new Date()) };
  state.data.stores.push(st);
  commit();
  return st;
}
// 「＋ 新しい店」の欄の「作る」: その場で店を作って選ぶ
export function createStoreInline(form, update) {
  const ids = PRICE_FORMS[form];
  const name = $(ids.newName).value.trim().slice(0, core.MAX_STORE_NAME);
  // 名前が空なら名前の欄へ。「作る」のタップの中で直接フォーカスする(iOS ではタップの処理の中でないとキーボードが出ない)
  if (!name) { toast('店の名前を入れてください'); $(ids.newName).focus(); return; }
  const st = ensureStore(name);
  fillStoreSelect(form, st.id);
  update();
}
// 金額・グラムの入力欄を値段の単位に合わせる(100gあたり → 金額とグラム、1個あたり → 1個あたりの金額だけ)
export function setPriceFormBasis(form, basis) {
  const ids = PRICE_FORMS[form];
  const per100 = basis === 'per100g';
  $(ids.gramsField).hidden = !per100;
  $(ids.gramsField).parentElement.classList.toggle('single', !per100);
  $(ids.amountLabel).textContent = per100 ? '金額(円)' : '1個あたりの金額(円)';
}
// 入力欄を読む。ok は保存できるか(店があり、金額が 0 以上の整数、100gあたりならグラムが 0 より大きい)
export function readPriceForm(form, basis) {
  const ids = PRICE_FORMS[form];
  const a = $(ids.amount), g = $(ids.grams);
  const price = a.validity && a.validity.badInput ? null : core.parsePrice(a.value);
  const grams = basis === 'per100g' ? (g.validity && g.validity.badInput ? null : core.parseGrams(g.value)) : null;
  const storeId = $(ids.store).disabled && !$(ids.store).value ? '' : $(ids.store).value;
  const ok = !!core.findStore(state.data.stores, storeId) && price !== null && (basis !== 'per100g' || grams !== null);
  return { storeId, price, grams, ok };
}
// 100gあたりのライブ表示(「¥350 / 200g → 100gあたり ¥175」)
export function showPriceLive(form, basis, v) {
  const ids = PRICE_FORMS[form];
  const filled = (id) => { const el = $(id); return !!(el.value.trim() || (el.validity && el.validity.badInput)); };
  // 入れてあるのに使えない値(上限超え・マイナスなど)は、何が悪いかを出す(保存は押せないので)
  let text = '';
  if (v.price === null && filled(ids.amount)) text = '金額は 0〜' + core.fmtInt(core.MAX_PRICE) + ' 円の整数で入れてください';
  else if (basis === 'per100g' && v.grams === null && filled(ids.grams)) text = 'グラムは 0 より大きい数で入れてください';
  else text = core.priceInputText(v.price, v.grams, basis);
  $(ids.live).textContent = text || (basis === 'per100g' ? '金額とグラムを入れると、100gあたりの値段を出します' : '');
}

// ---------- 値段の単位の変更 ----------
// 値段の単位を変えると、その品の登録済みの値段は比べられなくなるので消す(確認する)。やめたら false
export function confirmPriceBasisChange(type, id, from, to) {
  if (from === to) return true;
  const n = core.pricesFor(state.data.prices, type, id).length;
  if (!n) return true;
  return window.confirm('値段の単位を変えると、この品の値段 ' + n + ' 件は比べられなくなるため消えます。よろしいですか？');
}
export function dropItemPrices(type, id) { state.data.prices = core.removeItemRefs(state.data.prices, [], type, id).prices; }
