// app/update.js — Service Worker の登録と自動更新(13.8): 新しい版の確認(5 分に 1 回まで)、入力中でなければ自動で切り替え、
// 更新バーの「更新」と設定の「更新を確認」。切り替えたら 1 回だけ「新しいバージョンになりました」。
import * as core from '../core/index.js';
import { $, state } from './state.js';
import { setUpdateBar, toast, anySheetOpen } from './ui.js';

const UPDATE_CHECK_MS = 5 * 60 * 1000; // 前回の確認から 5 分以内なら確認しない
const UPDATED_KEY = 'pfc.updated';     // 更新でリロードする直前に sessionStorage に付ける印(リロード後に 1 回だけトーストを出す)
let swRegistration = null;
let updateRequested = false; // 更新を反映すると決めた(=切り替わったらリロードしてよい)
let waitingReg = null;       // 新しい版が待機中の registration(入力中で反映を待たせている間も持っておく)
let lastUpdateCheck = 0;     // 最後に registration.update() を呼んだ時刻
let autoUpdateTimer = null;
function applyUpdate(reg) {
  if (!reg || !reg.waiting) return;
  updateRequested = true;
  try { sessionStorage.setItem(UPDATED_KEY, '1'); } catch (e) { /* 印を付けられなくても更新は続ける */ }
  setUpdateBar(false);
  reg.waiting.postMessage('SKIP_WAITING');
}
// 入力中か(シートが開いている / 入力欄にフォーカスがある / 「元に戻す」を出している / 読み込み用のテキストや買うものの打ちかけがある)。
// 入力中はリロードで入力や取り消しの機会を失わせないよう、自動更新を待つ
function isUserBusy() {
  if (anySheetOpen()) return true;
  const el = document.activeElement;
  if (el && el !== document.body && (el.matches('input, textarea, select') || el.isContentEditable)) return true;
  if (state.undoAction) return true;
  if ($('paste-area').value.trim()) return true;
  if ($('shop-input').value.trim()) return true; // 買い物の追加欄に打ちかけの文字がある
  return false;
}
// 新しい版が待機中になった: 更新バーを出し、入力中でなければそのまま反映する
function onUpdateWaiting(reg) {
  waitingReg = reg;
  setUpdateBar(true);
  scheduleAutoUpdate();
}
// 待機中の新しい版があり、入力中でなければ SKIP_WAITING → controllerchange でリロード
function tryAutoUpdate() {
  const reg = waitingReg;
  if (!reg || !reg.waiting || !navigator.serviceWorker || !navigator.serviceWorker.controller) return;
  if (isUserBusy()) return;
  applyUpdate(reg);
}
// 操作の直後(シートを閉じた・トーストが消えた・タブを切り替えた)に呼ぶ。フォーカスの移動などが落ち着いてから判定する
export function scheduleAutoUpdate() {
  if (!waitingReg) return;
  clearTimeout(autoUpdateTimer);
  autoUpdateTimer = setTimeout(tryAutoUpdate, 60);
}
// 起動時と前面に戻ったときに新しい版を確認する(5 分以内の再確認はしない)
export function checkForUpdateQuietly() {
  if (!swRegistration || !core.updateCheckDue(lastUpdateCheck, Date.now(), UPDATE_CHECK_MS)) return;
  lastUpdateCheck = Date.now();
  try { const p = swRegistration.update(); if (p && p.catch) p.catch(() => { /* 圏外などは無視 */ }); } catch (e) { /* 無視 */ }
}
// 更新でリロードした直後なら、1 回だけ「新しいバージョンになりました」を出す
export function showUpdatedToast() {
  let flag = null;
  try { flag = sessionStorage.getItem(UPDATED_KEY); sessionStorage.removeItem(UPDATED_KEY); } catch (e) { /* 無視 */ }
  if (flag) toast('新しいバージョン(' + core.APP_VERSION + ')になりました');
}
export function registerSW() {
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || local)) return;
  let refreshing = false;
  // 初回インストール時(clients.claim)にもこのイベントは来るので、更新を反映すると決めたときだけリロードする
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!updateRequested || refreshing) return; refreshing = true; location.reload(); });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    swRegistration = reg;
    if (reg.waiting && navigator.serviceWorker.controller) onUpdateWaiting(reg);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) onUpdateWaiting(reg);
      });
    });
    checkForUpdateQuietly(); // 起動時の確認
  }).catch(() => { /* 登録失敗は無視(オフラインでも動く) */ });
}
// 更新バーの「更新」: 待っている新しい版をすぐ反映する(登録が無ければ再読み込み)
export function updateNow() {
  setUpdateBar(false);
  if (swRegistration) applyUpdate(swRegistration); else location.reload();
}
// 設定の「更新を確認」
export async function checkUpdate() {
  if (!('serviceWorker' in navigator)) { toast('この環境では更新確認を使えません'); return; }
  try {
    const reg = swRegistration || await navigator.serviceWorker.getRegistration();
    if (!reg) { toast('最新です'); return; }
    lastUpdateCheck = Date.now();
    await reg.update();
    if (reg.waiting) { applyUpdate(reg); return; }
    if (reg.installing) {
      const nw = reg.installing;
      if (!nw.__pfcWatched) { // 何度押しても listener は 1 回だけ付ける
        nw.__pfcWatched = true;
        nw.addEventListener('statechange', () => { if (nw.state === 'installed' && reg.waiting) applyUpdate(reg); });
      }
      toast('更新を準備しています…');
      return;
    }
    toast('最新です');
  } catch (e) { toast('更新を確認できませんでした(オフラインの可能性)'); }
}
