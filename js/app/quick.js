// app/quick.js — ホームと記録タブで共通の部品: P/F/C のバーと kcal の要約、クイック追加のチップ列(セット・マイ食品・最近の記録)。
import * as core from '../core/index.js';
import { $, esc, state } from './state.js';

// ---------- P/F/C のバー ----------
// 1 栄養素分のバー(.meter)に集計を入れる。ホームの #stat-* と記録タブの #rec-stat-* で共用
function fillMeter(el, k, s) {
  el.dataset.status = s.status;
  el.querySelector('.consumed').textContent = core.fmtInt(s.consumed);
  el.querySelector('.target').textContent = core.fmtInt(s.target);
  el.querySelector('.remaining').textContent = s.remaining;
  el.querySelector('.bar-fill').style.width = s.fillPct + '%';
  el.querySelector('.bar-over').style.width = s.overPct + '%';
  el.setAttribute('aria-label', core.NUTRIENT_LABEL[k] + ' ' + core.fmtInt(s.consumed) + 'g / 目標 ' + core.fmtInt(s.target) + 'g ' + s.remaining);
}
// P/F/C 3 本と kcal をまとめて入れる(prefix は 'stat-' か 'rec-stat-')
export function fillStats(prefix, stats) {
  core.NUTRIENTS.forEach((k) => fillMeter($(prefix + k), k, stats[k]));
  $(prefix + 'kcal').querySelector('.consumed').textContent = core.fmtInt(stats.kcal.consumed);
  $(prefix + 'kcal').querySelector('.target').textContent = core.fmtInt(stats.kcal.target);
}

// ---------- クイック追加のチップ列 ----------
// チップ列の中身を差し替える。末尾の「＋ 〜を管理」チップ(.chip.manage)は HTML に固定で置いてあり、その前に差し込む
function fillChipRow(row, selector, html) {
  row.querySelectorAll(selector).forEach((el) => el.remove());
  row.querySelector('.chip.manage').insertAdjacentHTML('beforebegin', html);
}
function setChipsHtml(sets, foods) {
  return sets.map((st) =>
    '<button type="button" class="chip" data-set-id="' + esc(st.id) + '" aria-label="セット ' + esc(st.name) + ' を追加">' +
      '<span class="name">' + esc(st.name) + '</span>' +
      '<span class="sub num">' + esc(core.setSubLabel(st, foods)) + '</span>' +
    '</button>').join('');
}
function foodChipsHtml(foods) {
  return foods.map((f) =>
    '<button type="button" class="chip" data-food-id="' + esc(f.id) + '" aria-label="' + esc(f.name) + ' を追加">' +
      '<span class="name">' + esc(f.name) + '</span>' +
      '<span class="sub">' + esc(core.basisLabel(f)) + ' ' + core.fmtInt(core.calcKcal(f.p, f.f, f.c)) + 'kcal</span>' +
    '</button>').join('');
}
function recentChipsHtml(recent) {
  return recent.length ? recent.map((r, i) =>
    '<button type="button" class="chip" data-recent-index="' + i + '" aria-label="' + esc(r.label) + ' を追加">' +
      '<span class="name">' + esc(r.label) + '</span>' +
      '<span class="sub">' + (r.name ? 'P' + core.fmtG(r.p) + ' F' + core.fmtG(r.f) + ' C' + core.fmtG(r.c) + ' ' : '') + core.fmtInt(r.kcal) + 'kcal</span>' +
    '</button>').join('') : '<span class="empty">記録するとここに表示されます</span>';
}
// クイック追加の 3 列(セット・マイ食品・最近)。記録タブとホームの入力エリアで同じものを出す
export function renderQuickRows(setRow, foodRow, recentRow, t) {
  const data = state.data;
  const sets = core.sortSets(data.sets);
  fillChipRow(setRow, '.chip[data-set-id]', setChipsHtml(sets, data.foods));
  const manage = setRow.querySelector('.chip.manage');
  manage.querySelector('.name').textContent = sets.length ? '＋ セットを管理' : '＋ セットを作る';
  manage.setAttribute('aria-label', sets.length ? 'セットを管理' : 'セットを作る');
  fillChipRow(foodRow, '.chip[data-food-id]', foodChipsHtml(core.sortFoods(core.activeFoods(data.foods)))); // PFC未登録は出さない
  recentRow.innerHTML = recentChipsHtml(state.recent);
}
