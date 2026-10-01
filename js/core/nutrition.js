// core/nutrition.js — P/F/C の合計・kcal・達成判定・残り表示・目標と判定の向きの正規化(仕様 5 章)。
import { NUTRIENTS, DEFAULT_DIRECTION } from './constants.js';
import { toNum, parseNum, clampG, fmtInt, fmtG, calcKcal, roundG } from './format.js';
import { isValidTime } from './dates.js';

// ---------- 集計・判定 ----------
// 合計(浮動小数の誤差を避けるため 0.1g 単位の整数で足す)
export function sumEntries(entries) {
  const acc = { p: 0, f: 0, c: 0 };
  (Array.isArray(entries) ? entries : []).forEach((e) => {
    if (!e || typeof e !== 'object') return;
    NUTRIENTS.forEach((k) => { acc[k] += Math.round(toNum(e[k]) * 10); });
  });
  const out = { p: acc.p / 10, f: acc.f / 10, c: acc.c / 10 };
  out.kcal = calcKcal(out.p, out.f, out.c);
  return out;
}
export function normDirection1(v) { return v === 'atMost' ? 'atMost' : 'atLeast'; }
// 達成判定: 'progress' | 'done' | 'over'
// 表示と同じ整数で判定する。「150 / 150 g」と見えているのに色が進行中、「60 / 60 g」なのに超過、という食い違いを起こさないため
export function judge(consumed, target, direction) {
  const c = roundG(consumed), t = roundG(target);
  if (direction === 'atMost') return c > t ? 'over' : 'progress';
  return c >= t ? 'done' : 'progress';
}
// 残り表示: 「あと 27g」「+12g 超過」「ぴったり」
// judge と同じ整数の差で作る。「24 / 150 g」なら「あと 126g」、差 0 なら「ぴったり」(判定も必ず done / progress になる)
export function remainingLabel(consumed, target) {
  const diff = roundG(target) - roundG(consumed);
  if (diff === 0) return 'ぴったり';
  return diff > 0 ? 'あと ' + fmtInt(diff) + 'g' : '+' + fmtInt(-diff) + 'g 超過';
}
// 1 栄養素分のバー情報。数値・残りラベル・判定・バーの長さをすべて同じ整数から作る
export function statFor(consumed, target, direction) {
  const c = roundG(consumed), t = roundG(target);
  const status = judge(c, t, direction);
  let fillPct, overPct;
  if (t <= 0) { fillPct = 0; overPct = c > 0 ? 100 : 0; }
  else if (c <= t) { fillPct = c / t * 100; overPct = 0; }
  else { fillPct = t / c * 100; overPct = 100 - fillPct; }
  const pct = t > 0 ? c / t * 100 : (c > 0 ? 100 : 0);
  return { consumed: c, target: t, status, pct, fillPct: Math.max(0, Math.min(100, fillPct)), overPct: Math.max(0, Math.min(100, overPct)), remaining: remainingLabel(c, t) };
}
// 1 日分の集計(表示用)
export function dayStats(entries, targets, direction) {
  const sum = sumEntries(entries);
  const tg = normTargets(targets) || { p: 0, f: 0, c: 0 };
  const dir = normDirection(direction);
  const out = {};
  NUTRIENTS.forEach((k) => { out[k] = statFor(sum[k], tg[k], dir[k]); });
  out.kcal = { consumed: sum.kcal, target: calcKcal(tg.p, tg.f, tg.c) };
  return out;
}
// 記録の表示名(名前がなければ値で)
export function entryLabel(entry) {
  const name = entry && typeof entry.name === 'string' ? entry.name.trim() : '';
  if (name) return name;
  return 'P' + fmtG(entry && entry.p) + ' F' + fmtG(entry && entry.f) + ' C' + fmtG(entry && entry.c);
}
// 記録の並び: 時刻順 → 作成順
export function sortEntries(entries) {
  return (Array.isArray(entries) ? entries.slice() : []).sort((a, b) => {
    const ta = isValidTime(a.time) ? a.time : '99:99', tb = isValidTime(b.time) ? b.time : '99:99';
    if (ta !== tb) return ta < tb ? -1 : 1;
    const ca = a.createdAt || '', cb = b.createdAt || '';
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
}
// 目標: 3 つとも 0 以上の数値でなければ null
export function normTargets(t) {
  if (!t || typeof t !== 'object') return null;
  const out = {};
  for (const k of NUTRIENTS) {
    const v = t[k];
    if (typeof v !== 'number' && typeof v !== 'string') return null;
    const n = parseNum(v);
    if (n === null || n < 0) return null;
    out[k] = clampG(n);
  }
  return out;
}
export function normDirection(d) {
  const src = d && typeof d === 'object' ? d : {};
  return { p: normDirection1(src.p ?? DEFAULT_DIRECTION.p), f: normDirection1(src.f ?? DEFAULT_DIRECTION.f), c: normDirection1(src.c ?? DEFAULT_DIRECTION.c) };
}
