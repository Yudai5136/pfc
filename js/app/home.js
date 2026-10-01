// app/home.js — ホームタブ(13.2。常に今日): 今日の P/F/C と kcal、直近7日の達成率、1週間の平均、推移グラフ、入力エリアのチップ。
import * as core from '../core/index.js';
import { $, esc, state, statsFor } from './state.js';
import { fillStats, renderQuickRows } from './quick.js';

export function renderHome(t) {
  const data = state.data;
  $('home-date').textContent = core.formatDateLabel(t, t);
  $('backup-banner').hidden = !core.backupNeeded(data, new Date());
  fillStats('stat-', statsFor(t));

  // 直近 7 日(ふつうの <button> のまま。読み上げ名は「9/28(月) 記録なし」のように日付で)。タップで記録タブのその日へ
  $('week-strip').innerHTML = core.weekSummary(data, t).map((d) =>
    '<button type="button" class="day' + (d.hasEntries ? '' : ' empty') + (d.isToday ? ' today selected' : '') + '" data-date="' + d.key + '"' +
      (d.isToday ? ' aria-current="date"' : '') + ' aria-label="' + core.formatDateLabel(d.key, t) + (d.hasEntries ? '' : ' 記録なし') + '">' +
      '<span class="bars">' + d.bars.map((b) => '<span class="mini" data-n="' + b.n + '" data-status="' + b.status + '"><i style="height:' + Math.round(b.pct) + '%"></i></span>').join('') + '</span>' +
      '<span class="wd">' + d.weekday + '</span>' +
    '</button>').join('');

  renderWeekAverage(t);
  renderWeekChart(t);
  renderQuickRows($('home-set-chips'), $('home-food-chips'), $('home-recent-chips'), t);
}
// 1週間の平均: 「記録のある5日間の平均」と、P/F/C・kcal の「平均 132 / 目標 150 g」
function renderWeekAverage(t) {
  const avg = core.weekAverage(state.data, t);
  $('week-avg-title').textContent = avg.n ? avg.label + '(直近7日)' : '1週間の平均';
  $('week-avg-rows').hidden = !avg.n;
  $('week-avg-empty').hidden = !!avg.n;
  $('week-avg-empty').textContent = core.weekAvgLabel(0);
  ['p', 'f', 'c', 'kcal'].forEach((k) => {
    const row = $('week-avg').querySelector('.avg[data-n="' + k + '"]');
    row.dataset.status = avg[k].status;
    row.querySelector('.avg-val').textContent = core.fmtInt(avg[k].avg);
    row.querySelector('.avg-target').textContent = core.fmtInt(avg[k].target);
    const unit = k === 'kcal' ? 'kcal' : 'g';
    row.setAttribute('aria-label', (k === 'kcal' ? 'kcal' : core.NUTRIENT_LABEL[k]) + ' 平均 ' + core.fmtInt(avg[k].avg) + unit + ' / 目標 ' + core.fmtInt(avg[k].target) + unit);
  });
}
// 1週間の推移グラフ(インライン SVG)。棒 = その日の値(記録の無い日は棒なし)、破線 = その日の目標
export function renderWeekChart(t) {
  const chart = core.weekChartData(state.data, t, state.chartMode);
  const g = core.chartGeometry(chart);
  const r1 = (n) => Math.round(n * 10) / 10;
  let bars = '', vals = '', labels = '', target = '';
  chart.days.forEach((d, i) => {
    const sl = g.slots[i];
    const pad = Math.min(5, sl.w * 0.1);
    target += 'M' + r1(sl.x + pad) + ' ' + r1(sl.targetY) + 'H' + r1(sl.x + sl.w - pad);
    labels += '<text class="cwd' + (d.isToday ? ' today' : '') + '" x="' + r1(sl.cx) + '" y="' + (g.height - 6) + '">' + (d.isToday ? '今日' : d.weekday) + '</text>';
    if (!d.hasEntries) return;
    bars += '<rect class="cbar" data-date="' + d.key + '" data-status="' + d.status + '" data-value="' + d.value + '" x="' + r1(sl.barX) + '" y="' + r1(sl.barY) + '" width="' + sl.barW + '" height="' + r1(Math.max(sl.barH, 1)) + '" rx="3"></rect>';
    // 値ラベルは棒の上。目標の破線がすぐ上にあって重なるときは、破線のさらに上に出す
    const labelY = sl.targetY < sl.barY && sl.barY - sl.targetY < 16 ? sl.targetY - 5 : sl.barY - 5;
    vals += '<text class="cval num" x="' + r1(sl.cx) + '" y="' + r1(Math.max(12, labelY)) + '">' + core.fmtInt(d.value) + '</text>';
  });
  const slots = chart.days.map((d) => '<g class="slot" data-date="' + d.key + '" data-has="' + (d.hasEntries ? 1 : 0) + '" data-target="' + d.target + '"></g>').join('');
  const unit = chart.unit;
  const summary = chart.days.map((d) => core.formatDateLabel(d.key, t) + ' ' + (d.hasEntries ? core.fmtInt(d.value) + unit : '記録なし') + '(目標 ' + core.fmtInt(d.target) + unit + ')').join('、');
  $('week-chart-svg').innerHTML =
    '<svg viewBox="0 0 ' + g.width + ' ' + g.height + '" data-mode="' + chart.mode + '" role="img" aria-label="1週間の推移(' + (chart.mode === 'kcal' ? 'kcal' : core.NUTRIENT_LABEL[chart.mode]) + ')。' + esc(summary) + '">' +
      slots +
      '<line class="cbase" x1="0" x2="' + g.width + '" y1="' + g.baseY + '" y2="' + g.baseY + '"></line>' +
      bars +
      '<path class="ctarget" d="' + target + '"></path>' +
      vals + labels +
    '</svg>';
  $('week-chart').querySelectorAll('.chart-mode').forEach((b) => {
    const on = b.dataset.mode === chart.mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
