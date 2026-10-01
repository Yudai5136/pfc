// main.js — アプリの入口(index.html が <script type="module"> で読み込む)。
// 起動(init)と、すべてのボタン・入力欄へのイベント登録(bindEvents。すべて一度だけ。動的に作る要素は親への委譲で扱う)。
// 各画面の処理は js/app/ の各ファイル、計算は js/core/ にある(仕様書 9 章)。
import * as core from './core/index.js';
import { $, state, hooks, today, catchUpDay, quickTargetDay, showFoodsTab } from './app/state.js';
import { updateAlertLayout, showAlert, save, load } from './app/storage.js';
import { setKindSeg, toast, hideToast, closeSheet, syncViewport, bindTypingState } from './app/ui.js';
import { renderWeekChart } from './app/home.js';
import { entryFormValues, updateEntryForm, openEntrySheet, saveEntry, deleteEntry, addQuickEntry, updateAmountForm, openAmountSheet, stepAmount, addFromAmountSheet } from './app/record.js';
import { findShopRow, showNewStoreBox, createStoreInline, findPriceById } from './app/pricing.js';
import { removeDraftItem, openFoodPicker, addFoodToDraft } from './app/drafts.js';
import { renderFoodsTab, onFoodBasisChange, updateFoodForm, openFoodSheet, saveFood, deleteFood } from './app/foods.js';
import { findSet, openSetsManage, openSetSheet, updateSetForm, saveSet, deleteSet, openSetAddSheet, updateSetAddForm, addFromSetSheet } from './app/sets.js';
import { openBatchSheet, updateBatchForm, confirmBatch, updateBatchSaveForm, saveBatchAsSet } from './app/batch.js';
import { renderShopSuggest, renderShopList, addToShopping, addFromShopInput, uncheckShopRow, clearBought, openBoughtSheet, updateBoughtForm, saveBought, skipBought, openShopItemSheet, updateShopItemForm, saveShopItem, removeShopRow, deleteGoods } from './app/shopping.js';
import { priceKey, renderPrices, openPriceSheet, updatePriceSheet, savePriceSheet, deletePriceSheet, openStoresSheet, updateStoreAdd, addStore, renameStore, deleteStore } from './app/prices.js';
import { updateTargetKcal, saveTargets, exportBackup, importFromText, importFile, copyBackup, wipeAll } from './app/settings.js';
import { scheduleAutoUpdate, checkForUpdateQuietly, showUpdatedToast, registerSW, checkUpdate, updateNow } from './app/update.js';
import { render, showView } from './app/view.js';

// テスト・デバッグ用に core を公開する(v1 から同じ window.PFC.core)。PFC.ready は init が最後まで済んだ印
window.PFC = { core };
// 下位のモジュールが state.js の render / showView / scheduleAutoUpdate から呼ぶ本体(import が輪にならないよう、ここでつなぐ)
hooks.render = render;
hooks.showView = showView;
hooks.scheduleAutoUpdate = scheduleAutoUpdate;

// ---------- イベント登録 ----------
function bindEvents() {
  bindTypingState();
  // ヘッダ
  $('btn-prev-day').addEventListener('click', () => { state.dateKey = core.addDays(state.dateKey, -1); state.followToday = false; render(); });
  $('btn-next-day').addEventListener('click', () => { const t = today(); if (state.dateKey >= t) return; state.dateKey = core.addDays(state.dateKey, 1); state.followToday = state.dateKey === t; render(); });
  $('date-label').addEventListener('click', () => { state.followToday = true; render(); });
  // 各タブのヘッダ右上の設定(歯車のボタン)
  document.querySelectorAll('.btn-gear').forEach((btn) => btn.addEventListener('click', () => showView('settings')));
  $('backup-banner').addEventListener('click', () => showView('settings'));
  $('btn-load-warning-close').addEventListener('click', () => showAlert('load-warning', false));

  // タブバー(もう一度押すと先頭へスクロール)
  $('tabbar').addEventListener('click', (ev) => {
    const el = ev.target.closest('.tab[data-tab]'); if (!el) return;
    showView(el.dataset.tab);
  });

  // 7 日ストリップ(ホーム): タップで記録タブのその日へ
  $('week-strip').addEventListener('click', (ev) => {
    const el = ev.target.closest('.day'); if (!el) return;
    const key = el.dataset.date; if (!core.isValidDateKey(key) || key > today()) return;
    state.dateKey = key; state.followToday = key === today();
    showView('record');
  });
  // 推移グラフの切替(kcal / P / F / C)
  $('week-chart').addEventListener('click', (ev) => {
    const el = ev.target.closest('.chart-mode[data-mode]'); if (!el) return;
    state.chartMode = el.dataset.mode;
    renderWeekChart(today());
  });

  // クイック追加のチップ列(委譲)。記録タブは表示中の日に、ホームの入力エリアは常に今日に入れる
  const bindQuickRows = (setRow, foodRow, recentRow, fromHome) => {
    setRow.addEventListener('click', (ev) => {
      if (ev.target.closest('.chip.chip-batch')) { openBatchSheet(fromHome); return; }
      if (ev.target.closest('.chip.manage')) { openSetsManage(); return; }
      const el = ev.target.closest('.chip[data-set-id]'); if (el) openSetAddSheet(el.dataset.setId, fromHome);
    });
    foodRow.addEventListener('click', (ev) => {
      if (ev.target.closest('.chip.manage')) { showFoodsTab('foods'); return; }
      const el = ev.target.closest('.chip[data-food-id]'); if (el) openAmountSheet(el.dataset.foodId, fromHome);
    });
    recentRow.addEventListener('click', (ev) => {
      const el = ev.target.closest('.chip[data-recent-index]'); if (!el) return;
      const item = (state.recent || [])[Number(el.dataset.recentIndex)];
      if (!item) return;
      // 0 時を過ぎていたら今日を追従させてから追加する(昨日に 12:00 で入ってしまうのを防ぐ)
      addQuickEntry(item, '追加しました', quickTargetDay(fromHome), undefined, fromHome);
    });
  };
  bindQuickRows($('set-chips'), $('food-chips'), $('recent-chips'), false);
  bindQuickRows($('home-set-chips'), $('home-food-chips'), $('home-recent-chips'), true);
  $('btn-home-add').addEventListener('click', () => openEntrySheet(null, null, true));
  $('entry-list').addEventListener('click', (ev) => {
    const el = ev.target.closest('.entry[data-id]'); if (!el) return;
    const key = state.dateKey;
    const day = state.data.days[key];
    const e = day && day.entries.find((x) => x.id === el.dataset.id);
    if (e) openEntrySheet(e, key); else render();
  });
  $('btn-add').addEventListener('click', () => openEntrySheet(null));

  // 記録シート
  ['entry-name', 'entry-p', 'entry-f', 'entry-c'].forEach((id) => $(id).addEventListener('input', updateEntryForm));
  $('btn-entry-save').addEventListener('click', saveEntry);
  $('btn-entry-cancel').addEventListener('click', () => closeSheet('sheet-entry'));
  $('btn-entry-delete').addEventListener('click', deleteEntry);
  $('btn-entry-to-food').addEventListener('click', () => {
    const v = entryFormValues();
    openFoodSheet(null, { name: v.name, basis: 'perServing', p: v.p, f: v.f, c: v.c });
  });

  // マイ食品タブ(切替・一覧・PFC未登録)・シート
  $('foods-seg').addEventListener('click', (ev) => {
    const el = ev.target.closest('.seg[data-seg]'); if (!el) return;
    state.foodsSeg = el.dataset.seg;
    renderFoodsTab();
  });
  $('pending-list').addEventListener('click', (ev) => {
    const el = ev.target.closest('.pending[data-id]'); if (!el || !ev.target.closest('.btn-fill-pfc')) return;
    const f = state.data.foods.find((x) => x.id === el.dataset.id);
    if (f) openFoodSheet(f); else render();
  });
  $('btn-food-new').addEventListener('click', () => openFoodSheet(null));
  $('food-list').addEventListener('click', (ev) => {
    const el = ev.target.closest('.food[data-id]'); if (!el) return;
    const f = state.data.foods.find((x) => x.id === el.dataset.id);
    if (f) openFoodSheet(f); else render();
  });
  ['food-name', 'food-serving-label', 'food-p', 'food-f', 'food-c'].forEach((id) => $(id).addEventListener('input', updateFoodForm));
  ['food-basis-per100g', 'food-basis-serving'].forEach((id) => $(id).addEventListener('change', onFoodBasisChange));
  ['food-price-basis-item', 'food-price-basis-100g'].forEach((id) => $(id).addEventListener('change', () => { state.priceBasisTouched = true; }));
  $('btn-food-save').addEventListener('click', saveFood);
  $('btn-food-cancel').addEventListener('click', () => closeSheet('sheet-food'));
  $('btn-food-delete').addEventListener('click', deleteFood);

  // セット(マイ食品タブの切替)・セット編集シート・食品の選択シート
  $('btn-set-new').addEventListener('click', () => openSetSheet(null));
  $('set-list').addEventListener('click', (ev) => {
    const el = ev.target.closest('.set[data-id]'); if (!el) return;
    const st = findSet(el.dataset.id);
    if (st) openSetSheet(st); else render();
  });
  $('set-name').addEventListener('input', updateSetForm);
  $('set-items').addEventListener('input', (ev) => { if (ev.target.classList.contains('set-item-amount')) updateSetForm(); });
  $('set-items').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.set-item-remove'); if (btn) removeDraftItem('set', btn.closest('[data-index]'));
  });
  $('btn-set-add-food').addEventListener('click', () => openFoodPicker('set'));
  $('btn-set-save').addEventListener('click', saveSet);
  $('btn-set-cancel').addEventListener('click', () => closeSheet('sheet-set'));
  $('btn-set-delete').addEventListener('click', deleteSet);
  $('food-picker-list').addEventListener('click', (ev) => {
    const el = ev.target.closest('.pick[data-food-id]'); if (el) addFoodToDraft(state.pickerTarget, el.dataset.foodId);
  });
  $('btn-picker-new-food').addEventListener('click', () => openFoodSheet(null, null, { forSet: true }));
  $('btn-picker-cancel').addEventListener('click', () => closeSheet('sheet-food-picker'));

  // セット追加シート
  ['input', 'change'].forEach((type) => $('set-add-items').addEventListener(type, updateSetAddForm));
  $('btn-set-add-confirm').addEventListener('click', addFromSetSheet);
  $('btn-set-add-cancel').addEventListener('click', () => closeSheet('sheet-set-add'));

  // まとめて記録シート(14章)と記録後の提案シート
  $('batch-items').addEventListener('input', (ev) => { if (ev.target.classList.contains('batch-amount')) updateBatchForm(); });
  $('batch-items').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.batch-remove'); if (btn) removeDraftItem('batch', btn.closest('[data-index]'));
  });
  $('btn-batch-add-food').addEventListener('click', () => openFoodPicker('batch'));
  $('btn-batch-confirm').addEventListener('click', confirmBatch);
  $('btn-batch-cancel').addEventListener('click', () => closeSheet('sheet-batch'));
  $('batch-set-name').addEventListener('input', updateBatchSaveForm);
  $('btn-batch-save-yes').addEventListener('click', saveBatchAsSet);
  $('btn-batch-save-no').addEventListener('click', () => closeSheet('sheet-batch-save'));

  // 分量シート
  $('amount-value').addEventListener('input', updateAmountForm);
  $('btn-amount-minus').addEventListener('click', () => stepAmount(-1));
  $('btn-amount-plus').addEventListener('click', () => stepAmount(1));
  $('btn-amount-add').addEventListener('click', addFromAmountSheet);
  $('btn-amount-cancel').addEventListener('click', () => closeSheet('sheet-amount'));

  // 買い物タブ: 追加欄・候補・種類の切替・よく買うもの・リスト・片付け
  $('shop-input').addEventListener('input', renderShopSuggest);
  $('shop-input').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); addFromShopInput(); } });
  $('btn-shop-add').addEventListener('click', addFromShopInput);
  $('shop-suggest').addEventListener('click', (ev) => {
    const el = ev.target.closest('.suggest[data-type][data-id]'); if (!el) return;
    $('shop-input').value = ''; state.shopNewKind = 'food';
    addToShopping(el.dataset.type, el.dataset.id);
  });
  $('shop-new-kind').addEventListener('click', (ev) => {
    const el = ev.target.closest('.seg[data-kind]'); if (!el) return;
    state.shopNewKind = el.dataset.kind === 'goods' ? 'goods' : 'food';
    setKindSeg($('shop-new-kind'), state.shopNewKind);
  });
  $('shop-frequent').addEventListener('click', (ev) => {
    const el = ev.target.closest('.chip[data-type][data-id]'); if (el) addToShopping(el.dataset.type, el.dataset.id);
  });
  $('shop-group-toggle').addEventListener('click', () => { state.shopGrouped = !state.shopGrouped; renderShopList(); });
  $('shop-list').addEventListener('change', (ev) => {
    const cb = ev.target.closest('.shop-check'); if (!cb) return;
    const row = findShopRow(cb.closest('.shop-item').dataset.id);
    if (!row) { render(); return; }
    if (cb.checked && !row.checked) openBoughtSheet(row);   // チェックしたら「買った」シート
    else if (!cb.checked && row.checked) uncheckShopRow(row); // 外したら未購入に戻す
  });
  $('shop-list').addEventListener('click', (ev) => {
    const el = ev.target.closest('.shop-body, .shop-qty'); if (!el) return;
    const row = findShopRow(el.closest('.shop-item').dataset.id);
    if (row) openShopItemSheet(row, el.classList.contains('shop-qty')); else render();
  });
  $('btn-shop-clear').addEventListener('click', clearBought);
  // 買ったシート
  $('bought-store').addEventListener('change', updateBoughtForm);
  ['bought-price', 'bought-grams'].forEach((id) => $(id).addEventListener('input', updateBoughtForm));
  // 「＋ 新しい店」: 名前の欄を出して、そのままタップの処理の中でフォーカスする(iOS でキーボードが出るように)
  $('btn-bought-new-store').addEventListener('click', () => { showNewStoreBox('bought', true); $('bought-new-store-name').focus(); });
  $('btn-bought-store-create').addEventListener('click', () => createStoreInline('bought', updateBoughtForm));
  $('btn-bought-save').addEventListener('click', saveBought);
  $('btn-bought-skip').addEventListener('click', skipBought);
  $('btn-bought-cancel').addEventListener('click', () => closeSheet('sheet-bought'));
  // 品のシート
  $('shop-item-name').addEventListener('input', updateShopItemForm);
  $('btn-shop-item-save').addEventListener('click', saveShopItem);
  $('btn-shop-item-cancel').addEventListener('click', () => closeSheet('sheet-shop-item'));
  $('btn-shop-item-remove').addEventListener('click', removeShopRow);
  $('btn-shop-item-delete').addEventListener('click', deleteGoods);

  // 値段タブ: 検索・最安だけ / すべての店・カードを開く・値段の行・店を管理・値段を追加
  $('price-search').addEventListener('input', () => { state.priceQuery = $('price-search').value; renderPrices(); });
  $('price-mode').addEventListener('click', (ev) => {
    const el = ev.target.closest('.seg[data-mode]'); if (!el) return;
    state.priceMode = el.dataset.mode === 'all' ? 'all' : 'best';
    renderPrices();
  });
  $('price-list').addEventListener('click', (ev) => {
    const row = ev.target.closest('.price-row[data-price-id]');
    if (row) { const pr = findPriceById(row.dataset.priceId); if (pr) openPriceSheet(pr); else render(); return; }
    const card = ev.target.closest('.price-card[data-type][data-id]');
    if (!card || state.priceMode === 'all') return; // 「すべての店」では常に開いている
    const k = priceKey(card.dataset.type, card.dataset.id);
    if (state.priceOpen.has(k)) state.priceOpen.delete(k); else state.priceOpen.add(k);
    renderPrices();
  });
  $('btn-stores').addEventListener('click', openStoresSheet);
  $('btn-price-add').addEventListener('click', () => openPriceSheet(null));
  // 値段シート
  $('price-item').addEventListener('change', () => { updatePriceSheet(); if ($('price-item').value === '__new') $('price-new-name').focus(); }); // 「＋ 新しい品を入れる」を選んだら名前の欄へ
  $('price-new-name').addEventListener('input', updatePriceSheet);
  $('price-new-kind').addEventListener('click', (ev) => {
    const el = ev.target.closest('.seg[data-kind]'); if (!el) return;
    state.priceNewKind = el.dataset.kind === 'goods' ? 'goods' : 'food';
    updatePriceSheet();
  });
  ['price-new-basis-item', 'price-new-basis-100g'].forEach((id) => $(id).addEventListener('change', updatePriceSheet));
  $('price-store').addEventListener('change', updatePriceSheet);
  ['price-amount', 'price-grams'].forEach((id) => $(id).addEventListener('input', updatePriceSheet));
  $('btn-price-new-store').addEventListener('click', () => { showNewStoreBox('price', true); $('price-new-store-name').focus(); });
  $('btn-price-store-create').addEventListener('click', () => createStoreInline('price', updatePriceSheet));
  $('btn-price-save').addEventListener('click', savePriceSheet);
  $('btn-price-delete').addEventListener('click', deletePriceSheet);
  $('btn-price-cancel').addEventListener('click', () => closeSheet('sheet-price'));
  // 店の管理シート(名前の欄は確定したときに変更)
  $('store-new-name').addEventListener('input', updateStoreAdd);
  $('btn-store-add').addEventListener('click', addStore);
  $('store-list').addEventListener('change', (ev) => {
    const input = ev.target.closest('.store-name'); if (input) renameStore(input.closest('.store').dataset.id, input);
  });
  $('store-list').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.store-delete'); if (btn) deleteStore(btn.closest('.store').dataset.id);
  });
  $('btn-stores-close').addEventListener('click', () => closeSheet('sheet-stores'));

  // 背景タップでシートを閉じる
  document.querySelectorAll('.sheet-backdrop').forEach((bd) => bd.addEventListener('click', () => closeSheet('sheet-' + bd.dataset.close)));
  // Enter で保存(テキスト欄)
  $('sheet-entry').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); if (!$('btn-entry-save').disabled) saveEntry(); } });
  $('sheet-food').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && ev.target.type !== 'radio') { ev.preventDefault(); if (!$('btn-food-save').disabled) saveFood(); } });
  $('sheet-amount').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); if (!$('btn-amount-add').disabled) addFromAmountSheet(); } });
  $('sheet-set').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); if (!$('btn-set-save').disabled) saveSet(); } });
  $('sheet-set-add').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && ev.target.type !== 'checkbox') { ev.preventDefault(); if (!$('btn-set-add-confirm').disabled) addFromSetSheet(); } });
  $('sheet-batch').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); if (!$('btn-batch-confirm').disabled) confirmBatch(); } });
  $('sheet-batch-save').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && !ev.isComposing) { ev.preventDefault(); if (!$('btn-batch-save-yes').disabled) saveBatchAsSet(); } });
  $('sheet-bought').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT' || ev.isComposing) return;
    ev.preventDefault();
    if (ev.target.id === 'bought-new-store-name') createStoreInline('bought', updateBoughtForm); else if (!$('btn-bought-save').disabled) saveBought();
  });
  $('sheet-price').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT' || ev.target.type === 'radio' || ev.isComposing) return;
    ev.preventDefault();
    if (ev.target.id === 'price-new-store-name') createStoreInline('price', updatePriceSheet); else if (!$('btn-price-save').disabled) savePriceSheet();
  });
  $('sheet-shop-item').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && ev.target.type !== 'radio' && !ev.isComposing) { ev.preventDefault(); if (!$('btn-shop-item-save').disabled) saveShopItem(); } });
  $('sheet-stores').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT' || ev.isComposing) return;
    ev.preventDefault();
    if (ev.target.id === 'store-new-name') addStore(); else ev.target.blur(); // 名前の欄は確定(change)させる
  });
  // 入力欄にフォーカスしたらキーボードの上に見えるようにスクロール
  document.querySelectorAll('.sheet-panel').forEach((panel) => panel.addEventListener('focusin', (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLElement)) return;
    setTimeout(() => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* 無視 */ } }, 300);
  }));

  // 設定
  $('btn-settings-back').addEventListener('click', () => { if (state.data.settings.targets) showView(state.tab); });
  ['target-p', 'target-f', 'target-c'].forEach((id) => { $(id).addEventListener('input', updateTargetKcal); $(id).addEventListener('change', updateTargetKcal); });
  $('btn-targets-save').addEventListener('click', saveTargets);
  $('btn-export').addEventListener('click', exportBackup);
  $('file-import').addEventListener('change', (ev) => importFile(ev.target));
  $('btn-copy').addEventListener('click', copyBackup);
  $('btn-paste-import').addEventListener('click', () => {
    const text = $('paste-area').value.trim();
    if (!text) { toast('テキストを貼り付けてください'); return; }
    if (importFromText(text, 'テキスト')) $('paste-area').value = '';
  });
  $('btn-check-update').addEventListener('click', checkUpdate);
  $('btn-wipe').addEventListener('click', wipeAll);
  $('btn-update').addEventListener('click', updateNow);

  // トースト
  $('toast-undo').addEventListener('click', () => { const fn = state.undoAction; hideToast(); if (fn) fn(); });

  // 日付が変わったあとに戻ってきたら再描画(0 時をまたぐ対策)。開いたままの場合は render() が予約する 0 時のタイマーと、念のための定期確認で追従する
  // 前面に戻ったときは新しい版も確認する(13.8。5 分以内の再確認はしない)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    render();
    checkForUpdateQuietly();
    scheduleAutoUpdate();
  });
  window.addEventListener('pageshow', () => render());
  window.addEventListener('focus', catchUpDay);
  setInterval(catchUpDay, 30000);

  // 警告バーの高さは文字の折り返しで変わるので、画面幅が変わったら測り直す
  window.addEventListener('resize', updateAlertLayout);
  window.addEventListener('orientationchange', updateAlertLayout);

  // visualViewport(キーボード)追従
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }
}

// ---------- 起動 ----------
function init() {
  state.data = load();
  $('app-version').textContent = core.APP_VERSION;
  bindEvents();
  if (state.migrated) { save(); state.migrated = false; }
  // 保存領域の確認(プライベートブラウズなどで書けない場合は最初から警告)
  try { localStorage.setItem('pfc.test', '1'); localStorage.removeItem('pfc.test'); } catch (e) { showAlert('save-error', true); }
  updateAlertLayout();
  // 起動時は必ずホーム(最後に開いていたタブは覚えない)。初回起動は目標の設定から
  if (!state.data.settings.targets) showView('settings');
  else showView('home');
  showUpdatedToast(); // 自動更新でリロードした直後なら 1 回だけ知らせる
  try { const p = navigator.storage && navigator.storage.persist && navigator.storage.persist(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 無視 */ }
  registerSW();
  window.PFC.ready = true; // 起動できた印(index.html の「起動の見張り」が見る。無ければ「起動できませんでした」を出す)
}
// type="module" のスクリプトは HTML を読み終えてから動くので、要素はもうそろっている
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
