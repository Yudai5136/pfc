// app/shopping.js — 買い物タブ(13.6): 追加欄と候補・よく買うもの・リスト・片付け、「買った」シート(店と値段)、品のシート(数量メモなど)。
import * as core from '../core/index.js';
import { $, esc, state, render } from './state.js';
import { commit } from './storage.js';
import { setKindSeg, toast, openSheet, closeSheet, SHEET_CLOSED } from './ui.js';
import { itemObj, itemInfo, findShopRow, storeName, createItem, fillStoreSelect, setPriceFormBasis, readPriceForm, showPriceLive, confirmPriceBasisChange, dropItemPrices } from './pricing.js';

// ---------- 買い物タブの描画 ----------
// 買い物の行の「最安 業務スーパー ¥175/100g」(値段が無ければ '')。「最安 店 ¥値段」。店名が長いときは店名だけを詰め、値段は必ず見せる
function bestHtml(type, id, basis) {
  const best = core.bestPrice(state.data.prices, type, id);
  const name = best ? storeName(best.storeId) : '';
  if (!name) return '';
  return '<span class="best-label">最安</span> <span class="best-store">' + esc(name) + '</span> <span class="best-val">' + esc(core.priceLabel(best, basis)) + '</span>';
}
export function renderShopping() {
  renderShopSuggest();
  renderShopFrequent();
  renderShopList();
}
function shopInputValue() { return $('shop-input').value.trim().slice(0, core.MAX_NAME); }
// 入力中の文字に合う候補と、候補に無い名前のときの種類の切替
export function renderShopSuggest() {
  const d = state.data;
  const q = shopInputValue();
  const list = core.shopSuggestions(d.foods, d.goods, d.shopping, q);
  $('shop-suggest').innerHTML = list.map((it) =>
    '<button type="button" class="suggest" role="option" data-type="' + it.type + '" data-id="' + esc(it.id) + '" aria-label="' + esc(it.name) + ' をリストに追加">' +
      '<span class="name">' + esc(it.name) + '</span>' +
      '<span class="kind' + (it.inList ? ' in-list' : '') + '">' + (it.inList ? 'リストにあります' : esc(it.kind)) + '</span>' +
    '</button>').join('');
  $('shop-suggest').hidden = list.length === 0;
  $('shop-new').hidden = !q || !!core.exactItem(d.foods, d.goods, q);
  $('shop-new-name').textContent = q;
  setKindSeg($('shop-new-kind'), state.shopNewKind);
  $('btn-shop-add').disabled = !q;
}
function renderShopFrequent() {
  const d = state.data;
  const list = core.frequentShopping(d.foods, d.goods, d.shopping);
  $('shop-frequent').innerHTML = list.length ? list.map((it) =>
    '<button type="button" class="chip" data-type="' + it.type + '" data-id="' + esc(it.id) + '" aria-label="' + esc(it.name) + ' をリストに追加">' +
      '<span class="name">' + esc(it.name) + '</span><span class="sub num">' + it.count + '回</span>' +
    '</button>').join('') : '<span class="empty">リストに入れた品がここに並びます</span>';
}
// リストの 1 行: チェック / 品名(PFC未登録の印)と最安の店 / 数量メモ
function shopRowHtml(r) {
  const it = itemInfo(r.itemType, r.itemId);
  if (!it) return '';
  const checked = r.checked || r.id === state.boughtRowId; // 買ったシートを開いている間はチェックを付けたまま見せる
  const best = bestHtml(r.itemType, r.itemId, it.priceBasis);
  return '<div class="shop-item' + (r.checked ? ' done' : '') + '" data-id="' + esc(r.id) + '">' +
    '<label class="shop-check-wrap"><input class="shop-check" type="checkbox"' + (checked ? ' checked' : '') + ' aria-label="' + esc(it.name) + (r.checked ? '(買った。外すと未購入に戻す)' : ' を買った') + '"></label>' +
    '<button type="button" class="shop-body" aria-label="' + esc(it.name) + ' の詳細">' +
      '<span class="line1"><span class="name">' + esc(it.name) + '</span>' + (it.pending ? '<span class="tag tag-pending">PFC未登録</span>' : '') + '</span>' +
      '<span class="shop-best num"' + (best ? '' : ' hidden') + '>' + best + '</span>' +
    '</button>' +
    '<button type="button" class="shop-qty' + (r.qty ? '' : ' empty') + '" aria-label="' + esc(it.name) + ' の数量メモ' + (r.qty ? '(' + esc(r.qty) + ')' : 'を入れる') + '">' + (r.qty ? esc(r.qty) : '数量') + '</button>' +
  '</div>';
}
function shopHeadHtml(cls, name, n, storeId) {
  return '<div class="shop-list-head ' + cls + '"' + (storeId !== undefined ? ' data-store-id="' + esc(storeId || '') + '"' : '') + '>' + esc(name) + '<span class="count num">' + n + '品</span></div>';
}
// 未チェック(入れた順。「安い店ごとに分ける」なら最安の店ごとに見出し付き)→ 買ったもの(薄く、下に)
export function renderShopList() {
  const d = state.data;
  const rows = core.sortShopping(d.shopping);
  const open = rows.filter((r) => !r.checked), done = rows.filter((r) => r.checked);
  let html = '';
  if (state.shopGrouped) {
    core.groupByBestStore(open, d.prices, d.stores).forEach((g) => { html += shopHeadHtml('shop-group-head', g.name, g.rows.length, g.storeId) + g.rows.map(shopRowHtml).join(''); });
  } else {
    html += open.map(shopRowHtml).join('');
  }
  if (done.length) html += shopHeadHtml('shop-done-head', '買ったもの', done.length) + done.map(shopRowHtml).join('');
  $('shop-list').innerHTML = html;
  $('shop-empty').hidden = rows.length > 0;
  $('btn-shop-clear').disabled = done.length === 0;
  $('shop-group-toggle').setAttribute('aria-checked', state.shopGrouped ? 'true' : 'false');
}

// 買い物タブのバッジ: 未チェックの品の数(13.1)
export function shoppingBadgeCount() { return core.countUnchecked(state.data.shopping); }

// ---------- リストの操作 ----------
// 品をリストに入れる。未チェックで入っていれば何もしない。買った行が残っていれば、それを未購入に戻す
export function addToShopping(type, id) {
  const obj = itemObj(type, id);
  if (!obj) { render(); return; }
  const list = state.data.shopping;
  const same = (r) => r.itemType === type && r.itemId === id;
  if (list.some((r) => same(r) && !r.checked)) { toast(obj.name + ' はもうリストにあります'); return; }
  const now = core.localIso(new Date());
  const done = list.find((r) => same(r) && r.checked);
  if (done) Object.assign(done, { checked: false, checkedAt: null, addedAt: now });
  else list.push({ id: core.genId('sh'), itemType: type, itemId: id, qty: '', checked: false, addedAt: now, checkedAt: null });
  obj.shopCount = (obj.shopCount || 0) + 1; // 「よく買うもの」の並び順
  if (commit()) toast(obj.name + ' をリストに入れました');
}
// 追加欄の「追加」: 同じ名前の品があればそれを、無ければ選んだ種類で新しく作って入れる
export function addFromShopInput() {
  const name = shopInputValue();
  if (!name) return;
  const d = state.data;
  const hit = core.exactItem(d.foods, d.goods, name);
  const it = hit || createItem(name, state.shopNewKind, 'perItem');
  $('shop-input').value = '';
  state.shopNewKind = 'food'; // 種類の初期値は毎回「食品」
  addToShopping(it.type, it.id);
}
// チェックを外す: 未購入に戻す(値段の記録は残す)
export function uncheckShopRow(row) {
  row.checked = false; row.checkedAt = null;
  commit();
}
function markBought(row) { row.checked = true; row.checkedAt = core.localIso(new Date()); }
// 買ったものを片付ける(確認なし)。トーストの「元に戻す」で元の位置に戻す
export function clearBought() {
  const { kept, removed } = core.clearChecked(state.data.shopping);
  if (!removed.length) return;
  state.data.shopping = kept;
  if (!commit()) return;
  const gen = state.generation;
  toast(removed.length + '品を片付けました', () => {
    if (gen !== state.generation) { toast('元に戻せませんでした'); return; }
    state.data.shopping = core.restoreRemoved(state.data.shopping, removed);
    if (commit()) toast('元に戻しました');
  });
}

// ---------- 買ったシート(チェックしたとき: 店と値段) ----------
export function openBoughtSheet(row) {
  const it = itemInfo(row.itemType, row.itemId);
  if (!it) { render(); return; }
  state.boughtRowId = row.id;
  $('bought-title').textContent = it.name + ' を買った';
  $('bought-unit').textContent = '値段は' + core.priceBasisLabel(it.priceBasis) + 'で比べます(値段タブ)';
  $('bought-pending-note').hidden = !it.pending;
  $('bought-price').value = ''; $('bought-grams').value = '';
  setPriceFormBasis('bought', it.priceBasis);
  fillStoreSelect('bought');
  updateBoughtForm();
  openSheet('sheet-bought');
}
function boughtItem() { const row = findShopRow(state.boughtRowId); return row ? { row, it: itemInfo(row.itemType, row.itemId) } : null; }
export function updateBoughtForm() {
  const b = boughtItem();
  if (!b || !b.it) return;
  const basis = b.it.priceBasis;
  const v = readPriceForm('bought', basis);
  showPriceLive('bought', basis, v);
  // 選んだ店の前回の値段を、入力欄の薄い文字で見せる(そのまま保存はしない)
  const old = v.storeId ? core.findPrice(state.data.prices, b.row.itemType, b.row.itemId, v.storeId) : null;
  $('bought-price').placeholder = old ? '前回 ' + core.fmtInt(old.price) : '例 350'; // グラムと同じく 3 桁区切り
  $('bought-grams').placeholder = old && old.grams ? '前回 ' + core.fmtG(old.grams) : '例 200';
  $('btn-bought-save').disabled = !v.ok;
}
// 「保存」: その品 × 店の値段を上書きして、行を買った状態にする
export function saveBought() {
  const b = boughtItem();
  if (!b || !b.it) { closeSheet('sheet-bought'); render(); return; }
  const v = readPriceForm('bought', b.it.priceBasis);
  if (!v.ok) return;
  const res = core.upsertPrice(state.data.prices, { itemType: b.row.itemType, itemId: b.row.itemId, storeId: v.storeId, price: v.price, grams: v.grams, basis: b.it.priceBasis }, core.localIso(new Date()));
  state.data.prices = res.prices;
  markBought(b.row);
  closeSheet('sheet-bought');
  if (commit()) toast(storeName(v.storeId) + ' ' + core.priceLabel(res.price, b.it.priceBasis) + ' を保存しました');
}
// 「値段は入れない」: チェックだけ付ける
export function skipBought() {
  const b = boughtItem();
  if (b) markBought(b.row);
  closeSheet('sheet-bought');
  commit();
}
// 買ったシートをキャンセルで閉じたら、行のチェックを元に戻して見せる(ボタン・背景のタップのどちらでも。ui.js の closeSheet が呼ぶ)
SHEET_CLOSED['sheet-bought'] = () => { state.boughtRowId = null; renderShopping(); };

// ---------- 品のシート(数量メモ・値段の単位・リストから外す・食品ではない品の名前と削除) ----------
export function openShopItemSheet(row, focusQty) {
  const it = itemInfo(row.itemType, row.itemId);
  if (!it) { render(); return; }
  state.shopItemRowId = row.id;
  const goods = it.type === 'goods';
  $('shop-item-title').textContent = it.name;
  $('shop-item-kind').textContent = goods ? '食品ではない品' : it.pending ? 'PFC未登録の食品。マイ食品タブの「PFC未登録」から P/F/C を入れられます' : 'マイ食品。名前や P/F/C はマイ食品タブで直せます';
  $('shop-item-name-field').hidden = !goods;
  $('shop-item-name').value = it.name;
  $('shop-item-qty').value = row.qty || '';
  $('shop-item-basis-100g').checked = it.priceBasis === 'per100g';
  $('shop-item-basis-item').checked = it.priceBasis !== 'per100g';
  $('btn-shop-item-delete').hidden = !goods;
  updateShopItemForm();
  openSheet('sheet-shop-item');
  // 「数量」をタップして開いたときは、すぐ打てるように数量メモの欄へ。タップの処理の中で直接フォーカスする
  // (iOS では setTimeout の中のフォーカスだとキーボードが出ず、枠だけが光る)
  if (focusQty) $('shop-item-qty').focus();
}
SHEET_CLOSED['sheet-shop-item'] = () => { state.shopItemRowId = null; };
export function updateShopItemForm() {
  const row = findShopRow(state.shopItemRowId);
  $('btn-shop-item-save').disabled = !row || (row.itemType === 'goods' && !$('shop-item-name').value.trim());
}
export function saveShopItem() {
  const row = findShopRow(state.shopItemRowId);
  const obj = row && itemObj(row.itemType, row.itemId);
  if (!row || !obj) { closeSheet('sheet-shop-item'); render(); return; }
  const basis = $('shop-item-basis-100g').checked ? 'per100g' : 'perItem';
  const from = row.itemType === 'food' ? core.priceBasisOf(obj) : core.normPriceBasis(obj.priceBasis);
  if (!confirmPriceBasisChange(row.itemType, row.itemId, from, basis)) return;
  if (row.itemType === 'goods') {
    const name = $('shop-item-name').value.trim().slice(0, core.MAX_NAME);
    if (!name) return;
    obj.name = name;
  }
  if (from !== basis) dropItemPrices(row.itemType, row.itemId);
  obj.priceBasis = basis;
  row.qty = $('shop-item-qty').value.trim().slice(0, core.MAX_QTY);
  closeSheet('sheet-shop-item');
  commit();
}
// リストから外す(品そのものと値段は残す)。トーストで元に戻せる
export function removeShopRow() {
  const row = findShopRow(state.shopItemRowId);
  closeSheet('sheet-shop-item');
  if (!row) { render(); return; }
  const idx = state.data.shopping.indexOf(row);
  state.data.shopping.splice(idx, 1);
  if (!commit()) return;
  const gen = state.generation;
  const it = itemInfo(row.itemType, row.itemId);
  toast((it ? it.name + ' を' : '') + 'リストから外しました', () => {
    if (gen !== state.generation) { toast('元に戻せませんでした'); return; }
    state.data.shopping = core.restoreRemoved(state.data.shopping, [{ index: idx, row }]);
    if (commit()) toast('元に戻しました');
  });
}
// 食品ではない品を削除: その品の値段と買い物リストの行も消す(13.5)
export function deleteGoods() {
  const row = findShopRow(state.shopItemRowId);
  const g = row && row.itemType === 'goods' ? itemObj('goods', row.itemId) : null;
  if (!g) return;
  const note = core.itemRefsNote(core.countItemRefs(state.data.prices, state.data.shopping, 'goods', g.id));
  if (!window.confirm('「' + g.name + '」を削除しますか？' + (note ? '\n' + note : ''))) return;
  state.data.goods = state.data.goods.filter((x) => x.id !== g.id);
  const r = core.removeItemRefs(state.data.prices, state.data.shopping, 'goods', g.id);
  state.data.prices = r.prices; state.data.shopping = r.shopping;
  closeSheet('sheet-shop-item');
  commit();
}
