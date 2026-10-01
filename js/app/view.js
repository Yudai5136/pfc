// app/view.js — 画面全体の描き直し(render)と画面の切り替え(showView)、タブバーの表示。
// どのタブも小さいので、変更のたびに全タブを描き直す。下位のモジュールからは state.js の render / showView を通して呼ばれる。
import * as core from '../core/index.js';
import { $, state, today } from './state.js';
import { setBadge } from './ui.js';
import { renderHome } from './home.js';
import { renderRecord } from './record.js';
import { renderFoodsTab } from './foods.js';
import { renderShopping, shoppingBadgeCount } from './shopping.js';
import { renderPrices } from './prices.js';
import { renderSettingsInfo, fillSettingsForm } from './settings.js';
import { scheduleAutoUpdate } from './update.js';

// ---------- 描画 ----------
// 次の 0 時(ローカル時刻)に再描画を予約する。アプリを開いたまま日付が変わってもヘッダや一覧が追従する
function scheduleMidnightRender() {
  clearTimeout(state.dayTimer);
  const next = core.parseDateKey(core.addDays(today(), 1)).getTime() - Date.now();
  state.dayTimer = setTimeout(render, Math.max(1000, Math.min(next + 1000, 86400000 + 1000)));
}
const TABS = ['record', 'foods', 'home', 'shopping', 'prices'];
const VIEWS = TABS.concat('settings');
export function render() {
  const t = today();
  if (state.followToday) state.dateKey = t;
  if (state.dateKey > t) { state.dateKey = t; state.followToday = true; }
  state.renderedToday = t;
  scheduleMidnightRender();
  VIEWS.forEach((name) => { $('view-' + name).hidden = state.view !== name; });
  document.body.classList.toggle('no-tabbar', state.view === 'settings'); // 設定を開いている間はタブバーを隠す
  // タブの中身は小さいので毎回すべて描き直す(どのタブに切り替えても最新の状態にするため)
  state.recent = core.recentItems(state.data.days, t); // 「最近の記録」チップ(記録タブとホームで同じもの。index でタップ先を引く)
  renderHome(t);
  renderRecord(t);
  renderFoodsTab();
  renderShopping();
  renderPrices();
  renderTabbar();
  if (state.view === 'settings') renderSettingsInfo();
  // 記録シートを開いたまま日付が変わった場合、保存先の表示を正直に更新する(「今日」→「昨日」)
  if (!$('sheet-entry').hidden && state.sheetDateKey) $('entry-date').textContent = core.formatDateLabel(state.sheetDateKey, t) + ' に保存します';
  if (!$('sheet-set-add').hidden && state.sheetDateKey) $('set-add-date').textContent = core.formatDateLabel(state.sheetDateKey, t) + ' に追加します';
  if (!$('sheet-batch').hidden && state.sheetDateKey) $('batch-date').textContent = core.formatDateLabel(state.sheetDateKey, t) + ' に記録します';
}
// タブバー: 選択中のタブと件数バッジ(13.1)
function renderTabbar() {
  document.querySelectorAll('#tabbar .tab').forEach((b) => {
    if (b.dataset.tab === state.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const pending = core.countPending(state.data.foods);
  setBadge(document.querySelector('#tabbar .tab[data-tab="foods"] .badge'), pending);
  document.querySelector('#tabbar .tab[data-tab="foods"]').setAttribute('aria-label', pending ? 'マイ食品(PFC未登録 ' + pending + '件)' : 'マイ食品');
  const shop = shoppingBadgeCount();
  setBadge(document.querySelector('#tabbar .tab[data-tab="shopping"] .badge'), shop);
  document.querySelector('#tabbar .tab[data-tab="shopping"]').setAttribute('aria-label', shop ? '買い物(未チェック ' + shop + '件)' : '買い物');
}
// 画面の切り替え。name はタブ名か 'settings'。タブを開いたら「最後に開いていたタブ」として覚える(設定の「戻る」先)
export function showView(name) {
  if (VIEWS.indexOf(name) < 0) name = 'home';
  state.view = name;
  if (name !== 'settings') state.tab = name;
  if (name === 'settings') fillSettingsForm();
  render();
  window.scrollTo(0, 0);
  scheduleAutoUpdate(); // タブの切り替えは入力の切れ目。待っている新しい版があれば反映する
}
