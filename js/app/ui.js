// app/ui.js — 画面の共通部品: トースト(元に戻す)、更新バー、ボトムシートの開閉、キーボード(visualViewport)への追従、
// 入力中のタブバー隠し(body.typing)、数値欄の読み取り、P/F/C の表示部品など。どのタブ・シートからも使う。
import * as core from '../core/index.js';
import { $, esc, state, scheduleAutoUpdate } from './state.js';

// ---------- 更新バー ----------
// 更新バーの表示中は一覧の下余白を増やす(body.has-update)。表示の切り替えは必ずここを通す
export function setUpdateBar(on) { $('update-bar').hidden = !on; document.body.classList.toggle('has-update', !!on); }

// ---------- トースト(元に戻す) ----------
const TOAST_MS = 5000;
export function toast(msg, undoFn) {
  clearTimeout(state.toastTimer);
  state.undoAction = undoFn || null;
  $('toast-text').textContent = msg;
  $('toast-undo').hidden = !undoFn;
  $('toast').hidden = false;
  state.toastTimer = setTimeout(hideToast, TOAST_MS);
}
export function hideToast() {
  const hadUndo = !!state.undoAction;
  clearTimeout(state.toastTimer); state.toastTimer = null; state.undoAction = null; $('toast').hidden = true;
  if (hadUndo) scheduleAutoUpdate(); // 「元に戻す」を出している間は自動更新を待っていた
}

// ---------- シートの開閉 ----------
// すべてのシート。開いている間は自動更新を待たせる(13.8)。シートを足したらここにも足す
const SHEETS = ['sheet-entry', 'sheet-food', 'sheet-amount', 'sheet-set', 'sheet-food-picker', 'sheet-set-add', 'sheet-batch', 'sheet-batch-save', 'sheet-bought', 'sheet-shop-item', 'sheet-price', 'sheet-stores'];
// シートを閉じたときの後始末(閉じ方はボタン・背景のタップのどちらでも)。{ シートの id: 関数 }。
// 中身は各機能のモジュールが入れる(shopping.js: sheet-bought / sheet-shop-item、prices.js: sheet-price、batch.js: sheet-batch / sheet-batch-save)
export const SHEET_CLOSED = {};
export function anySheetOpen() { return SHEETS.some((id) => !$(id).hidden); }
// シートを開くときは表示中のトースト(「元に戻す」付きなど)を消す。開いている記録を「元に戻す」で消してしまう、といった食い違いを防ぐ。
// 開いても入力欄に自動でフォーカスはしない(v2.0.0。iOS ではタップ以外のフォーカスでキーボードが出ず、枠だけが光って見えるため)
export function openSheet(id) { hideToast(); $(id).hidden = false; document.body.classList.add('lock'); syncViewport(); }
export function closeSheet(id) {
  const sheet = $(id);
  // 閉じるシートの中の入力欄にフォーカスが残っていたら外す(自動更新の「入力中」判定に残らないように)
  if (document.activeElement && sheet.contains(document.activeElement)) { try { document.activeElement.blur(); } catch (e) { /* 無視 */ } }
  const wasOpen = !sheet.hidden;
  sheet.hidden = true;
  if (wasOpen && SHEET_CLOSED[id]) SHEET_CLOSED[id]();
  if (!anySheetOpen()) { document.body.classList.remove('lock'); scheduleAutoUpdate(); } // 入力中で待たせていた更新があれば、ここで反映する
}
// iOS のキーボード表示で visualViewport が縮む → シートの高さをそれに合わせる
export function syncViewport() {
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  if (!vv) return;
  root.setProperty('--vvh', Math.round(vv.height) + 'px');
  root.setProperty('--vvt', Math.round(vv.offsetTop) + 'px');
}

// ---------- 入力中はタブバーを隠す(8 章) ----------
// シートの外(画面そのもの)にある文字の入力欄か。買い物の「買うものを追加」と値段の「品名で検索」が当てはまる
function isPageTextInput(el) {
  return !!(el && el.matches && el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea') && !el.closest('.sheet'));
}
// 入力欄にフォーカスがある(キーボードが出ている)間は body.typing を付けて、タブバーを隠す
export function bindTypingState() {
  document.addEventListener('focusin', (ev) => { if (isPageTextInput(ev.target)) document.body.classList.add('typing'); });
  document.addEventListener('focusout', () => {
    // 入力欄から入力欄へ移るときは付けたままにする(focusout の直後はまだ移動先が決まっていないので少し待つ)
    setTimeout(() => {
      if (isPageTextInput(document.activeElement)) return;
      document.body.classList.remove('typing');
      window.scrollTo(window.scrollX, window.scrollY); // iOS でキーボードを閉じた後に画面がずれたまま残るのを戻す
    }, 0);
  });
}

// ---------- 入力欄の読み取り ----------
// 数値入力欄を読む。空は 0、解釈できない入力(badInput)や不正な文字列は null
export function readNum(id) {
  const el = $(id);
  if (el.validity && el.validity.badInput) return null;
  return core.parseNum(el.value);
}
// 量の入力欄を読む。0 より大きい数なら小数1桁の値、空・0・不正なら null
export function readAmountInput(el) {
  if (el.validity && el.validity.badInput) return null;
  return core.setAmount(el.value);
}

// ---------- 表示の部品 ----------
// P/F/C を等幅の3列で出す HTML(記録一覧・マイ食品一覧・セットの行で共通)
export function pfcColsHtml(v) {
  return '<span class="pfc-cols">' + core.NUTRIENTS.map((k) =>
    '<span class="m"><i>' + k.toUpperCase() + '</i><b class="v' + k + '">' + core.fmtG(v[k]) + '</b><u>g</u></span>').join('') + '</span>';
}
// セットの行用: 等幅3列の P/F/C と kcal(HTML)
export function pfcKcalHtml(v) { return pfcColsHtml(v) + '<span class="kc">' + core.fmtInt(v.kcal) + 'kcal</span>'; }
// 合計欄(.amount-preview の P/F/C と kcal)に値を入れる
export function fillTotals(boxId, kcalId, sum) {
  core.NUTRIENTS.forEach((k) => { $(boxId).querySelector('b[data-n="' + k + '"]').textContent = core.fmtG(sum[k]); });
  $(kcalId).textContent = core.fmtInt(sum.kcal);
}
// 品の量の入力欄(分量シートと同じ刻み。100g 基準は g、1食分基準は個数)
export function amountInputHtml(cls, food, value, label) {
  const d = core.amountDefaults(food);
  return '<span class="qty"><input class="' + cls + '" type="number" inputmode="decimal" min="0" step="' + d.step + '" value="' + esc(value) + '" aria-label="' + esc(label + ' の量(' + d.unit + ')') + '">' +
    '<span class="unit' + (d.unit.length > 3 ? ' long' : '') + '">' + esc(d.unit) + '</span></span>';
}
// 切替(.segmented の .seg[data-kind])の表示を kind に合わせる
export function setKindSeg(el, kind) {
  el.dataset.kind = kind;
  el.querySelectorAll('.seg[data-kind]').forEach((b) => { const on = b.dataset.kind === kind; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
}
// 件数バッジ(タブバー・切替)。0 件なら隠す
export function setBadge(el, n) { el.textContent = String(n); el.hidden = !(n > 0); }
