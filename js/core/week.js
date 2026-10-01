// core/week.js — 記録の一覧から作る集計: 最近の記録(チップ)、直近7日の達成率、1週間の平均と推移グラフ(13.2)。
import { NUTRIENTS, RECENT_LIMIT, RECENT_WINDOW_DAYS } from './constants.js';
import { round1, clampG, calcKcal, roundG } from './format.js';
import { isValidDateKey, addDays, weekdayOf, isValidTime, isValidIso } from './dates.js';
import { sumEntries, judge, dayStats, entryLabel, normTargets, normDirection } from './nutrition.js';
import { entryAmountFields } from './foods.js';

// ---------- 最近の記録・直近7日 ----------
// 最近の記録: 直近 30 日から名前+P/F/C が同じものを1つにまとめ、新しい順に最大 8 件。
// 元の記録に量と基準(amount / basis。v2.0.0)があれば引き継ぐ(チップから追加した記録にも付く)
export function recentItems(days, today, limit) {
  const max = limit || RECENT_LIMIT;
  if (!days || typeof days !== 'object' || !isValidDateKey(today)) return [];
  const from = addDays(today, -(RECENT_WINDOW_DAYS - 1));
  const all = [];
  Object.keys(days).forEach((key) => {
    if (!isValidDateKey(key) || key < from || key > today) return;
    const day = days[key];
    if (!day || !Array.isArray(day.entries)) return;
    day.entries.forEach((e) => {
      if (!e || typeof e !== 'object') return;
      const sortKey = isValidIso(e.createdAt) ? new Date(e.createdAt).getTime() : new Date(key + 'T' + (isValidTime(e.time) ? e.time : '00:00')).getTime();
      all.push({ e, sortKey, key });
    });
  });
  all.sort((a, b) => b.sortKey - a.sortKey || (b.key > a.key ? 1 : b.key < a.key ? -1 : 0));
  const seen = new Set();
  const out = [];
  for (const { e } of all) {
    const p = clampG(e.p), f = clampG(e.f), c = clampG(e.c);
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    const dedupe = name + '|' + p + '|' + f + '|' + c;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const item = { name, p, f, c, kcal: calcKcal(p, f, c) };
    if (typeof e.foodId === 'string') item.foodId = e.foodId;
    const am = entryAmountFields(e);
    if (am) Object.assign(item, am);
    item.label = entryLabel(item);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}
// 直近 7 日(6日前〜今日)の達成率
export function weekSummary(data, today) {
  const dir = normDirection(data && data.settings && data.settings.direction);
  return weekKeys(today).map((key) => {
    const d = dayData(data, key);
    const stats = dayStats(d.entries, d.targets, dir);
    return {
      key, weekday: weekdayOf(key), isToday: key === today, hasEntries: d.hasEntries,
      bars: NUTRIENTS.map((k) => ({ n: k, pct: Math.max(0, Math.min(100, stats[k].pct)), status: stats[k].status }))
    };
  });
}

// ---------- ホーム: 1週間の平均・推移グラフ(13.2) ----------
export const CHART_MODES = ['kcal', 'p', 'f', 'c'];
// 直近 7 日(6日前〜今日)の日付キー(古い順)
export function weekKeys(today) {
  const out = [];
  for (let i = 6; i >= 0; i--) out.push(addDays(today, -i));
  return out;
}
// その日の記録と目標。日レコードが無い・目標が壊れている日は settings の目標を使う(仕様 4 章)
export function dayData(data, key) {
  const day = data && data.days ? data.days[key] : null;
  const entries = day && Array.isArray(day.entries) ? day.entries : [];
  const settingsTargets = data && data.settings ? normTargets(data.settings.targets) : null;
  const targets = (day && normTargets(day.targets)) || settingsTargets || { p: 0, f: 0, c: 0 };
  return { entries, targets, hasEntries: entries.length > 0 };
}
// kcal の判定の向き。kcal 専用の向きは持たないので、P/F/C の向きの多数決で決める(初期値 P 以上・F/C 以下 → 以下でOK)
export function kcalDirection(direction) {
  const d = normDirection(direction);
  return NUTRIENTS.filter((k) => d[k] === 'atMost').length >= 2 ? 'atMost' : 'atLeast';
}
// 平均の見出し: 「記録のある5日間の平均」/ 記録が無ければ「まだ記録がありません」
export function weekAvgLabel(n) { return n > 0 ? '記録のある' + n + '日間の平均' : 'まだ記録がありません'; }
// 1週間の平均。直近 7 日のうち記録がある日だけで割る。比べる目標は、それぞれの日のスナップショットの平均。
// 戻り値 { n, label, p: { avg, target, status }, f, c, kcal }(avg / target は小数1桁。kcal は整数)
export function weekAverage(data, today) {
  const dir = normDirection(data && data.settings && data.settings.direction);
  const sum = { p: 0, f: 0, c: 0 }, tsum = { p: 0, f: 0, c: 0 };
  let n = 0;
  weekKeys(today).forEach((key) => {
    const d = dayData(data, key);
    if (!d.hasEntries) return;
    const s = sumEntries(d.entries);
    n++;
    NUTRIENTS.forEach((k) => { sum[k] += s[k]; tsum[k] += d.targets[k]; });
  });
  const div = n || 1;
  const out = { n, label: weekAvgLabel(n) };
  NUTRIENTS.forEach((k) => {
    const avg = round1(sum[k] / div), target = round1(tsum[k] / div);
    out[k] = { avg, target, status: n ? judge(avg, target, dir[k]) : 'progress' };
  });
  // kcal は P/F/C から計算する式が線形なので、平均の P/F/C から出した値 = 日ごとの kcal の平均
  const avgK = calcKcal(sum.p / div, sum.f / div, sum.c / div), tgtK = calcKcal(tsum.p / div, tsum.f / div, tsum.c / div);
  out.kcal = { avg: avgK, target: tgtK, status: n ? judge(avgK, tgtK, kcalDirection(dir)) : 'progress' };
  return out;
}
// 推移グラフの値。mode は 'kcal' | 'p' | 'f' | 'c'(それ以外は kcal)。値と目標は表示と同じ整数。
// 記録の無い日は value 0・status 'none'(棒を出さない)。max はグラフの縦の最大値(値と目標の大きい方、最低 1)
export function weekChartData(data, today, mode) {
  const m = CHART_MODES.indexOf(mode) >= 0 ? mode : 'kcal';
  const dir = normDirection(data && data.settings && data.settings.direction);
  const days = weekKeys(today).map((key) => {
    const d = dayData(data, key);
    const s = sumEntries(d.entries);
    const value = m === 'kcal' ? s.kcal : roundG(s[m]);
    const target = m === 'kcal' ? calcKcal(d.targets.p, d.targets.f, d.targets.c) : roundG(d.targets[m]);
    const status = d.hasEntries ? judge(value, target, m === 'kcal' ? kcalDirection(dir) : dir[m]) : 'none';
    return { key, weekday: weekdayOf(key), isToday: key === today, hasEntries: d.hasEntries, value: d.hasEntries ? value : 0, target, status };
  });
  const max = Math.max(1, ...days.map((d) => Math.max(d.value, d.target)));
  return { mode: m, unit: m === 'kcal' ? 'kcal' : 'g', days, max };
}
// グラフの座標(SVG の viewBox 内)。width/height は全体、top/bottom は値ラベル・曜日ラベルのための余白。
// 各日: x(列の左端)、w(列の幅)、cx(中央)、barX/barW/barY/barH(棒。記録が無ければ barH 0)、targetY(目標の破線の高さ)
export function chartGeometry(chart, opt) {
  const o = Object.assign({ width: 320, height: 168, top: 20, bottom: 24, barRatio: 0.52 }, opt || {});
  const plotH = o.height - o.top - o.bottom;
  const baseY = o.top + plotH;
  const w = o.width / chart.days.length;
  const top = chart.max * 1.08; // 一番高い棒・目標の上に値ラベルの隙間を取る
  const yOf = (v) => baseY - Math.max(0, Math.min(1, v / top)) * plotH;
  const slots = chart.days.map((d, i) => {
    const x = i * w, barW = Math.round(w * o.barRatio * 10) / 10;
    const barY = d.hasEntries ? yOf(d.value) : baseY;
    return { key: d.key, x, w, cx: x + w / 2, barX: x + (w - barW) / 2, barW, barY, barH: baseY - barY, targetY: yOf(d.target) };
  });
  return { width: o.width, height: o.height, baseY, slots };
}
