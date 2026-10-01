// core/format.js — 数値の読み取り・丸め・表示用の整形、ID の生成、HTML のエスケープ(DOM には触れない)。
import { MAX_G } from './constants.js';

// ---------- 数値まわり ----------
export function pad2(n) { return (n < 10 ? '0' : '') + n; }
// 全角数字・記号を半角に(iOS の日本語キーボード対策)
export function normalizeDigits(str) {
  return String(str).replace(/[０-９．，−ー]/g, (ch) => {
    if (ch === '．') return '.';
    if (ch === '，') return ',';
    if (ch === '−' || ch === 'ー') return '-';
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  });
}
// どんな値でも有限の数値にする(できなければ 0)
export function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = normalizeDigits(v).replace(/,/g, '').trim();
    if (s === '') return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
// 入力欄の文字列 → 数値。空は 0、不正なら null
export function parseNum(str) {
  if (str === null || str === undefined) return 0;
  const s = normalizeDigits(String(str)).replace(/,/g, '').trim();
  if (s === '') return 0;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
// 小数1桁に丸める。「|| 0」は -0 を 0 にするため(-0 は toLocaleString で "-0" と表示されてしまう)
export function round1(n) { return Math.round(toNum(n) * 10) / 10 || 0; }
// g の値として保存できる形に(0 以上、小数1桁、上限あり)
export function clampG(v) {
  const n = round1(v);
  if (n <= 0) return 0;
  if (n > MAX_G) return MAX_G;
  return n;
}
// 表示用: 整数を 3 桁区切り
export function fmtInt(n) { return (Math.round(toNum(n)) || 0).toLocaleString('ja-JP'); }
// 表示用: 個々の記録は小数があれば小数1桁
export function fmtG(n) {
  const v = round1(n);
  return Number.isInteger(v) ? v.toLocaleString('ja-JP') : v.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
// kcal = P×4 + F×9 + C×4(整数)
export function calcKcal(p, f, c) { return Math.round(toNum(p) * 4 + toNum(f) * 9 + toNum(c) * 4); }

// 画面に出す整数(合計・目標は整数に丸めて表示する。仕様 4 章)
export function roundG(n) { return Math.round(toNum(n)) || 0; }

// ---------- ID・入力値の判定・エスケープ ----------
// id は Date.now() + 乱数(重複しなければ何でもよい。仕様 4 章)
export function genId(prefix) {
  return (prefix || 'x') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}
// p/f/c として読める値か(数値、または "23.5" のような数字の文字列)
export function isNumeric(v) {
  if (typeof v === 'number') return Number.isFinite(v);
  return typeof v === 'string' && v.trim() !== '' && parseNum(v) !== null;
}
// innerHTML に入れる前のエスケープ
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
