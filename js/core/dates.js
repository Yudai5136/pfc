// core/dates.js — 日付と時刻(すべて端末のローカル時刻。UTC に変換しない。仕様 4 章)。
import { WEEKDAYS, DATE_RE, TIME_RE } from './constants.js';
import { pad2, toNum } from './format.js';

// ---------- 日付まわり(すべて端末のローカル時刻。UTC 変換はしない) ----------
export function localDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error('invalid date');
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
// "YYYY-MM-DD" → ローカル 0 時の Date。不正なら null
export function parseDateKey(key) {
  if (typeof key !== 'string' || !DATE_RE.test(key)) return null;
  const y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)), d = Number(key.slice(8, 10));
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null; // 2月30日など
  return dt;
}
export function isValidDateKey(key) { return parseDateKey(key) !== null; }
// 日付キーに n 日足す(DST の影響を受けないよう年月日で計算)
export function addDays(key, n) {
  const dt = parseDateKey(key);
  if (!dt) throw new Error('invalid date key: ' + key);
  return localDateKey(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + Math.trunc(toNum(n))));
}
export function todayKey(now) { return localDateKey(now || new Date()); }
// ヘッダの日付表示: 「今日 9/30(水)」「昨日 9/29(火)」「9/28(月)」「2025/12/31(水)」
export function formatDateLabel(key, today) {
  const dt = parseDateKey(key);
  if (!dt) return key;
  const t = parseDateKey(today);
  const base = (dt.getMonth() + 1) + '/' + dt.getDate() + '(' + WEEKDAYS[dt.getDay()] + ')';
  if (t) {
    if (key === today) return '今日 ' + base;
    if (key === addDays(today, -1)) return '昨日 ' + base;
    if (dt.getFullYear() !== t.getFullYear()) return dt.getFullYear() + '/' + base;
  }
  return base;
}
export function weekdayOf(key) { const dt = parseDateKey(key); return dt ? WEEKDAYS[dt.getDay()] : ''; }
export function formatTime(date) { const d = date || new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
export function isValidTime(t) { return typeof t === 'string' && TIME_RE.test(t); }
// タイムゾーン付きの ISO 文字列(例 2026-09-30T12:00:00+09:00)
export function localIso(date) {
  const d = date || new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' +
    pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + sign + pad2(Math.floor(a / 60)) + ':' + pad2(a % 60);
}
export function isValidIso(s) { return typeof s === 'string' && s.length >= 10 && !Number.isNaN(new Date(s).getTime()); }

// 更新日の表示: 「10/1」(今年でなければ「2025/10/1」)
export function shortDate(iso, today) {
  if (!isValidIso(iso)) return '';
  const d = new Date(iso);
  const t = parseDateKey(today);
  const md = (d.getMonth() + 1) + '/' + d.getDate();
  return t && t.getFullYear() !== d.getFullYear() ? d.getFullYear() + '/' + md : md;
}
