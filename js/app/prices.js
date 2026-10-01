// app/prices.js — 値段タブ(13.7): 品ごとのカード(最安だけ / すべての店)、値段の追加・編集シート、店の管理シート。
import * as core from '../core/index.js';
import { $, esc, state, today, render } from './state.js';
import { commit } from './storage.js';
import { setKindSeg, toast, openSheet, closeSheet, SHEET_CLOSED } from './ui.js';
import { itemInfo, storeName, createItem, fillStoreSelect, setPriceFormBasis, readPriceForm, showPriceLive, findPriceById } from './pricing.js';

// ---------- 値段タブ: 品ごとのカード ----------
export function priceKey(type, id) { return type + ':' + id; }
export function renderPrices() {
  const d = state.data;
  const all = state.priceMode === 'all';
  $('price-mode').dataset.mode = state.priceMode;
  $('price-mode').querySelectorAll('.seg[data-mode]').forEach((b) => { const on = b.dataset.mode === state.priceMode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  const cards = core.priceCards(d, state.priceQuery);
  $('price-list').innerHTML = cards.map((c) => priceCardHtml(c, all || state.priceOpen.has(priceKey(c.type, c.id)))).join('');
  $('price-empty').hidden = cards.length > 0;
  $('price-empty').textContent = d.prices.length
    ? '「' + state.priceQuery.trim() + '」に当てはまる品はありません。'
    : 'まだ値段がありません。買い物リストでチェックしたときや、下の「＋ 値段を追加」から入れられます。';
}
// カード: 見出し(品名と単位)、最安の店と値段を大きく。開くとすべての店を安い順に(1位に「最安」)
function priceCardHtml(c, open) {
  const t = today();
  const best = c.best;
  const u = core.unitPrice(best.price, best.grams, c.priceBasis);
  const suffix = core.priceUnitSuffix(c.priceBasis);
  const others = c.prices.length - 1;
  const rows = c.prices.map((p, i) => {
    const label = core.priceLabel(p, c.priceBasis);
    const raw = c.priceBasis === 'per100g' ? core.yen(p.price) + ' / ' + core.fmtG(p.grams) + 'g · ' : '';
    const upd = core.shortDate(p.updatedAt, t);
    return '<button type="button" class="price-row' + (i === 0 ? ' best' : '') + '" data-price-id="' + esc(p.id) + '" aria-label="' + esc(storeName(p.storeId) + ' ' + label + (i === 0 ? '(最安)' : '') + ' を編集') + '">' +
      '<span class="rank">' + (i === 0 ? '<span class="tag tag-best">最安</span>' : (i + 1) + '位') + '</span>' +
      '<span class="body"><span class="store-name">' + esc(storeName(p.storeId)) + '</span><span class="sub num">' + esc(raw + (upd ? upd + ' 更新' : '')) + '</span></span>' +
      '<span class="val num">' + esc(label) + '</span>' +
    '</button>';
  }).join('');
  const upd = core.shortDate(best.updatedAt, t);
  return '<section class="card price-card' + (open ? ' open' : '') + '" data-type="' + c.type + '" data-id="' + esc(c.id) + '">' +
    '<button type="button" class="price-toggle" aria-expanded="' + (open ? 'true' : 'false') + '" aria-label="' + esc(c.name + ' 最安 ' + storeName(best.storeId) + ' ' + core.priceLabel(best, c.priceBasis) + '(タップですべての店)') + '">' +
      '<span class="price-head"><span class="name">' + esc(c.name) + '</span><span class="unit-label">' + esc(c.unitLabel) + '</span><span class="chev" aria-hidden="true">›</span></span>' +
      '<span class="price-best"><span class="store-name">' + esc(storeName(best.storeId)) + '</span>' +
        '<b class="val num">' + (u === null ? '-' : core.yen(u)) + '<small>' + suffix + '</small></b>' +
        (others > 0 ? '<span class="count">ほか ' + others + '店</span>' : '') +
        (upd ? '<span class="updated num">' + esc(upd) + ' 更新</span>' : '') +
      '</span>' +
    '</button>' +
    '<div class="price-rows"' + (open ? '' : ' hidden') + '>' + rows + '</div>' +
  '</section>';
}
// ---------- 値段の追加・編集シート ----------
// 品の選択欄: マイ食品(PFC未登録を含む)/ 食品ではない品 / 新しい品
function priceItemOptionsHtml() {
  const d = state.data;
  const opt = (it) => '<option value="' + it.type + ':' + esc(it.id) + '">' + esc(it.name + (it.pending ? '(PFC未登録)' : '')) + '</option>';
  const foods = core.allItems(d.foods, []), goods = core.allItems([], d.goods);
  return '<option value="">品を選んでください</option>' +
    (foods.length ? '<optgroup label="マイ食品">' + foods.map(opt).join('') + '</optgroup>' : '') +
    (goods.length ? '<optgroup label="食品ではない">' + goods.map(opt).join('') + '</optgroup>' : '') +
    '<option value="__new">＋ 新しい品を入れる</option>';
}
// pr: 編集する値段(null なら追加)
export function openPriceSheet(pr) {
  state.editingPriceId = pr ? pr.id : null;
  state.priceNewKind = 'food';
  const it = pr ? itemInfo(pr.itemType, pr.itemId) : null;
  if (pr && !it) { render(); return; }
  $('sheet-price-title').textContent = pr ? '値段を直す' : '値段を追加';
  if (pr) {
    $('price-item').innerHTML = '<option value="' + pr.itemType + ':' + esc(pr.itemId) + '">' + esc(it.name) + '</option>';
  } else {
    $('price-item').innerHTML = priceItemOptionsHtml();
    $('price-item').value = '';
  }
  $('price-item').disabled = !!pr;
  fillStoreSelect('price', pr ? pr.storeId : null);
  $('price-store').disabled = !!pr || !state.data.stores.length; // 編集では品と店は変えない(値段だけ書き直す)
  $('btn-price-new-store').hidden = !!pr;
  $('price-new-name').value = '';
  $('price-new-basis-item').checked = true;
  setKindSeg($('price-new-kind'), 'food');
  $('price-amount').value = pr ? String(pr.price) : '';
  $('price-grams').value = pr && pr.grams ? String(pr.grams) : '';
  $('btn-price-delete').hidden = !pr;
  updatePriceSheet();
  openSheet('sheet-price');
}
SHEET_CLOSED['sheet-price'] = () => { state.editingPriceId = null; }; // 閉じたら編集中の値段を忘れる(ui.js の closeSheet が呼ぶ)
// 値段シートで選んでいる品。既存の品は { info }、新しい品は { isNew, name, type, basis, dup }、未選択は null
function priceSheetItem() {
  const v = $('price-item').value;
  if (v === '__new') {
    const name = $('price-new-name').value.trim().slice(0, core.MAX_NAME);
    return { isNew: true, name, type: state.priceNewKind, basis: $('price-new-basis-100g').checked ? 'per100g' : 'perItem', dup: core.exactItem(state.data.foods, state.data.goods, name) };
  }
  const i = v.indexOf(':');
  if (i < 0) return null;
  const info = itemInfo(v.slice(0, i), v.slice(i + 1));
  return info ? { info } : null;
}
export function updatePriceSheet() {
  const sel = priceSheetItem();
  const editing = !!state.editingPriceId;
  $('price-new').hidden = editing || !(sel && sel.isNew);
  setKindSeg($('price-new-kind'), state.priceNewKind);
  const basis = sel ? (sel.info ? sel.info.priceBasis : sel.basis) : 'perItem';
  setPriceFormBasis('price', basis);
  let unit = '';
  if (sel && sel.info) unit = 'この品は' + core.priceBasisLabel(basis) + 'で比べます' + (sel.info.type === 'food' ? '(単位はマイ食品の編集で変えられます)' : '(単位は買い物リストの品の詳細で変えられます)');
  if (sel && sel.isNew && sel.dup) unit = '同じ名前の品「' + sel.dup.name + '」があります。上の一覧から選んでください';
  $('price-item-unit').textContent = unit;
  $('price-item-unit').hidden = !unit;
  const v = readPriceForm('price', basis);
  showPriceLive('price', basis, v);
  $('price-overwrite-note').hidden = editing || !(sel && sel.info && v.storeId && core.findPrice(state.data.prices, sel.info.type, sel.info.id, v.storeId));
  $('btn-price-save').disabled = !v.ok || !sel || (sel.isNew && (!sel.name || !!sel.dup));
}
export function savePriceSheet() {
  updatePriceSheet();
  if ($('btn-price-save').disabled) return;
  const now = core.localIso(new Date());
  if (state.editingPriceId) {
    const pr = findPriceById(state.editingPriceId);
    const it = pr && itemInfo(pr.itemType, pr.itemId);
    if (!pr || !it) { closeSheet('sheet-price'); toast('値段が見つかりませんでした'); render(); return; }
    const v = readPriceForm('price', it.priceBasis);
    state.data.prices = core.upsertPrice(state.data.prices, { itemType: pr.itemType, itemId: pr.itemId, storeId: pr.storeId, price: v.price, grams: v.grams, basis: it.priceBasis }, now).prices;
    closeSheet('sheet-price');
    if (commit()) toast('値段を直しました');
    return;
  }
  const sel = priceSheetItem();
  const basis = sel.info ? sel.info.priceBasis : sel.basis;
  const v = readPriceForm('price', basis);
  const item = sel.info ? { type: sel.info.type, id: sel.info.id } : createItem(sel.name, sel.type, sel.basis);
  state.data.prices = core.upsertPrice(state.data.prices, { itemType: item.type, itemId: item.id, storeId: v.storeId, price: v.price, grams: v.grams, basis }, now).prices;
  // 追加した品のカードが見えるように、検索を消してそのカードを開く
  state.priceQuery = ''; $('price-search').value = '';
  state.priceOpen.add(priceKey(item.type, item.id));
  closeSheet('sheet-price');
  if (commit()) toast('値段を保存しました');
}
export function deletePriceSheet() {
  const pr = findPriceById(state.editingPriceId);
  if (!pr) return;
  if (!window.confirm('「' + storeName(pr.storeId) + '」の値段を削除しますか？')) return;
  state.data.prices = state.data.prices.filter((p) => p.id !== pr.id);
  closeSheet('sheet-price');
  commit();
}

// ---------- 店の管理シート(追加・名前の変更・削除) ----------
export function openStoresSheet() {
  $('store-new-name').value = '';
  renderStoreList();
  updateStoreAdd();
  openSheet('sheet-stores');
}
function renderStoreList() {
  const stores = core.sortStores(state.data.stores);
  $('store-list').innerHTML = stores.map((st) =>
    '<div class="store" data-id="' + esc(st.id) + '">' +
      '<input class="store-name" type="text" maxlength="' + core.MAX_STORE_NAME + '" autocomplete="off" value="' + esc(st.name) + '" aria-label="店の名前(' + esc(st.name) + ')">' +
      '<span class="store-count num">値段 ' + core.countStorePrices(state.data.prices, st.id) + '件</span>' +
      '<button type="button" class="store-delete" aria-label="' + esc(st.name) + ' を削除">削除</button>' +
    '</div>').join('');
  $('store-empty').hidden = stores.length > 0;
}
export function updateStoreAdd() { $('btn-store-add').disabled = !$('store-new-name').value.trim(); }
export function addStore() {
  const name = $('store-new-name').value.trim().slice(0, core.MAX_STORE_NAME);
  if (!name) return;
  if (core.findStoreByName(state.data.stores, name)) { toast('同じ名前の店があります'); return; }
  state.data.stores.push({ id: core.genId('st'), name, createdAt: core.localIso(new Date()) });
  $('store-new-name').value = '';
  commit();
  renderStoreList(); updateStoreAdd();
}
// 名前の変更(欄を直して確定したとき)。空や同じ名前の店があれば元に戻す
export function renameStore(id, input) {
  const st = core.findStore(state.data.stores, id);
  if (!st) { renderStoreList(); return; }
  const name = input.value.trim().slice(0, core.MAX_STORE_NAME);
  if (!name) { input.value = st.name; toast('店の名前を入れてください'); return; }
  const dup = core.findStoreByName(state.data.stores, name);
  if (dup && dup.id !== id) { input.value = st.name; toast('同じ名前の店があります'); return; }
  if (name === st.name) { input.value = name; return; }
  st.name = name;
  if (commit()) toast('店の名前を「' + name + '」にしました');
  renderStoreList();
}
// 店の削除: その店の値段も消える(確認する)
export function deleteStore(id) {
  const st = core.findStore(state.data.stores, id);
  if (!st) { renderStoreList(); return; }
  const n = core.countStorePrices(state.data.prices, id);
  if (!window.confirm('「' + st.name + '」を削除しますか？\nこの店の値段 ' + n + ' 件も消えます。')) return;
  const r = core.removeStore(state.data.stores, state.data.prices, id);
  state.data.stores = r.stores; state.data.prices = r.prices;
  commit();
  renderStoreList();
}
