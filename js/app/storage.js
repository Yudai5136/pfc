// app/storage.js — 保存と読込(localStorage の pfc.v1)、保存失敗・読み込み警告のバー(仕様 4 章)。
import * as core from '../core/index.js';
import { $, state, render } from './state.js';

export const STORAGE_KEY = 'pfc.v1';
const CORRUPT_KEY = 'pfc.corrupt';

// ---------- 画面上部の警告バー ----------
// 警告バーは画面上部に固定表示。見えている分の高さを --alert-h に入れ、ヘッダや本文をその分だけ下げる
export function updateAlertLayout() {
  const h = $('alerts').offsetHeight;
  document.documentElement.style.setProperty('--alert-h', h + 'px');
  document.body.classList.toggle('has-alert', h > 0);
}
export function showAlert(id, on) { $(id).hidden = !on; updateAlertLayout(); }

// ---------- 保存 / 読込 ----------
function warn(msg) { $('load-warning-text').textContent = msg; showAlert('load-warning', true); }
export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    showAlert('save-error', false);
    return true;
  } catch (e) {
    showAlert('save-error', true);
    return false;
  }
}
export function load() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch (e) { warn('保存領域にアクセスできません。記録は保存されません。'); showAlert('save-error', true); return core.emptyState(); }
  if (raw === null || raw === undefined) return core.emptyState();
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { parsed = undefined; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Number.isInteger(parsed.version)) {
    // 壊れたデータは pfc.corrupt に退避して空データで起動
    try { localStorage.setItem(CORRUPT_KEY, raw); } catch (e) { /* 退避できなくても続行 */ }
    warn('保存データを読めなかったため、空の状態で起動しました(元データは pfc.corrupt に退避)。');
    return core.emptyState();
  }
  if (parsed.version > core.DATA_VERSION) {
    // 新しい形式のデータ: 元のまま pfc.backup.v{版} に退避してから、読める範囲で使う
    try { localStorage.setItem('pfc.backup.v' + parsed.version, raw); } catch (e) { /* 無視 */ }
    warn('保存データがこのアプリより新しい形式(version ' + parsed.version + ')です。アプリを更新してください。元データは pfc.backup.v' + parsed.version + ' に退避しました。');
    return core.normalize(parsed);
  }
  const { data, from } = core.migrate(parsed);
  if (core.structureError(data)) {
    // version はあるが days / foods の形が違う(読み込み時の検証と同じ基準)。黙って空にせず、元データを退避して警告する
    try { localStorage.setItem(CORRUPT_KEY, raw); } catch (e) { /* 退避できなくても続行 */ }
    warn('保存データの形式が正しくないため、空の状態で起動しました(元データは pfc.corrupt に退避)。');
    return core.emptyState();
  }
  if (from !== core.DATA_VERSION) {
    // マイグレーション前に旧データを退避
    try { localStorage.setItem('pfc.backup.v' + from, raw); } catch (e) { /* 無視 */ }
    state.migrated = true; // 起動時に新形式で保存し直す
  }
  return core.normalize(data);
}
// 変更を保存して再描画。保存できたかを返す(呼び出し側は、保存できたときだけ「〜しました」のトーストを出す。失敗時は警告バーが出ている)
export function commit() { const ok = save(); render(); return ok; }
