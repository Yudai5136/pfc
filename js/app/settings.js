// app/settings.js — 設定画面(6.4): 目標の入力と保存、バックアップ(書き出し・読み込み・テキストのコピー)、全データの削除、アプリ情報。
import * as core from '../core/index.js';
import { $, state, today, render, showView } from './state.js';
import { STORAGE_KEY, save, commit } from './storage.js';
import { toast, hideToast, readNum } from './ui.js';

// ---------- 設定画面の表示・目標のフォーム ----------
export function renderSettingsInfo() {
  const onboarding = !state.data.settings.targets;
  $('onboarding').hidden = !onboarding;
  $('btn-settings-back').hidden = onboarding;
  $('last-backup').textContent = core.formatLastBackup(state.data.meta.lastBackupAt, new Date());
  $('app-version').textContent = core.APP_VERSION;
}
// 設定フォームに現在値を入れる(画面を開いたときだけ。入力中に上書きしない)
export function fillSettingsForm() {
  const s = state.data.settings;
  core.NUTRIENTS.forEach((k) => {
    $('target-' + k).value = s.targets ? String(s.targets[k]) : '';
    $('dir-' + k).value = s.direction[k];
  });
  updateTargetKcal();
}
function targetFormValues() {
  const p = readNum('target-p'), f = readNum('target-f'), c = readNum('target-c');
  const invalid = p === null || f === null || c === null || p < 0 || f < 0 || c < 0;
  return { p: core.clampG(p || 0), f: core.clampG(f || 0), c: core.clampG(c || 0), invalid };
}
// 合計 kcal のライブ表示。3 つとも 0(未入力)か不正な値なら保存ボタンを無効にする
export function updateTargetKcal() {
  const v = targetFormValues();
  $('target-kcal').textContent = core.fmtInt(core.calcKcal(v.p, v.f, v.c));
  $('btn-targets-save').disabled = v.invalid || (v.p + v.f + v.c <= 0);
}
// ---------- 設定: 目標の保存 ----------
export function saveTargets() {
  const vals = {};
  for (const k of core.NUTRIENTS) {
    const n = readNum('target-' + k);
    if (n === null || n < 0) { toast(core.NUTRIENT_LABEL[k] + 'の目標を 0 以上の数値で入力してください'); return; }
    vals[k] = core.clampG(n);
  }
  if (vals.p + vals.f + vals.c <= 0) { toast('目標をひとつ以上入力してください'); return; }
  const wasOnboarding = !state.data.settings.targets;
  state.data.settings.targets = vals;
  state.data.settings.direction = core.normDirection({ p: $('dir-p').value, f: $('dir-f').value, c: $('dir-c').value });
  state.data.settings.updatedAt = core.localIso(new Date());
  // 今日以降の日のスナップショットを更新(過去の日は触らない)
  const t = today();
  Object.keys(state.data.days).forEach((key) => { if (key >= t) state.data.days[key].targets = Object.assign({}, vals); });
  const saved = save(); // 失敗時は警告バーが出る(成功のトーストは出さない)
  if (saved) toast(wasOnboarding ? '目標を保存しました' : '目標を保存しました(今日以降に適用)');
  if (wasOnboarding) { state.followToday = true; showView('home'); } else render();
}

// ---------- 設定: バックアップ ----------
function exportJson() { return JSON.stringify(Object.assign({}, state.data, { exportedAt: core.localIso(new Date()) }), null, 2); }
// 書き出し成功を記録。日時を保存できなかった(警告バー表示中)ときは false
function markBackedUp() { state.data.meta.lastBackupAt = core.localIso(new Date()); return commit(); }
export async function exportBackup() {
  const json = exportJson();
  const name = 'pfc-backup-' + today() + '.json';
  let shared = false;
  try {
    if (navigator.canShare && typeof File === 'function') {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'PFC バックアップ' });
        shared = true;
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // ユーザーがキャンセル → lastBackupAt は更新しない
    shared = false; // 共有に失敗 → ダウンロードにフォールバック
  }
  if (!shared) {
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { toast('書き出しに失敗しました'); return; }
  }
  // ファイル自体は出せているので、日時を保存できなかったときはその旨だけ添える
  toast(markBackedUp() ? '書き出しました' : '書き出しました(バックアップ日時は保存できませんでした)');
}
// 検証 → 確認 → 置き換え(ファイル/テキスト共通)
export function importFromText(text, sourceLabel) {
  let obj;
  try { obj = JSON.parse(String(text)); } catch (e) { toast(sourceLabel + ': JSON として読めませんでした'); return false; }
  const v = core.validateImport(obj);
  if (!v.ok) { toast(sourceLabel + ': 読み込めません(' + v.reason + ')'); return false; }
  const d = v.data;
  const msg = '現在のデータを上書きします。\n読み込む内容: 記録 ' + v.stats.entries + ' 件 / マイ食品 ' + v.stats.foods + ' 件 / セット ' + v.stats.sets + ' 件\n' +
    '店 ' + d.stores.length + ' 件 / 値段 ' + d.prices.length + ' 件 / 買い物リスト ' + d.shopping.length + ' 件\nよろしいですか？';
  if (!window.confirm(msg)) return false;
  const prev = state.data;
  state.data = v.data;
  state.generation++;
  hideToast();
  if (!save()) {
    // 保存できなければ元のデータに戻す(画面だけ差し替わって再起動で戻る、という状態にしない)。警告バーは save() が出している
    state.data = prev;
    render();
    toast(sourceLabel + ': 保存領域に書き込めないため読み込めませんでした');
    return false;
  }
  state.followToday = true;
  state.dateKey = today();
  // 目標が入っていればメイン画面で復元結果を見せる。なければ初回案内へ
  showView(state.data.settings.targets ? 'home' : 'settings');
  toast('読み込みました');
  return true;
}
export function importFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const done = (text) => { importFromText(text, 'ファイル'); input.value = ''; };
  const fail = () => { toast('ファイルを読めませんでした'); input.value = ''; };
  if (file.size > 20 * 1024 * 1024) { toast('ファイルが大きすぎます'); input.value = ''; return; }
  try {
    const reader = new FileReader();
    reader.onload = () => done(reader.result);
    reader.onerror = fail;
    reader.readAsText(file);
  } catch (e) { fail(); }
}
export async function copyBackup() {
  const json = exportJson();
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard');
    await navigator.clipboard.writeText(json);
    $('copy-fallback').hidden = true;
    toast('コピーしました');
  } catch (e) {
    // クリップボードが使えない → textarea を出して手動コピー
    $('copy-area').value = json;
    $('copy-fallback').hidden = false;
    try { $('copy-area').focus(); $('copy-area').select(); } catch (e2) { /* 無視 */ }
  }
}
export function wipeAll() {
  if (!window.confirm('全データを削除します。よろしいですか？')) return;
  if (!window.confirm('本当に削除しますか？この操作は元に戻せません。')) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 無視 */ }
  state.data = core.emptyState();
  state.generation++;
  hideToast();
  state.followToday = true;
  state.dateKey = today();
  save();
  $('paste-area').value = '';
  $('copy-fallback').hidden = true;
  showView('settings');
  toast('全データを削除しました');
}
