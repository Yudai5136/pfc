// app/drafts.js — セット編集シートとまとめて記録シートで共用する「品の一覧(下書き)」の行と、マイ食品の選択シート。
import * as core from '../core/index.js';
import { $, esc, state } from './state.js';
import { pfcColsHtml, toast, openSheet, closeSheet, pfcKcalHtml, fillTotals, readAmountInput, amountInputHtml } from './ui.js';

// ---------- 下書き(セット編集シート / まとめて記録シート)の品の行。どちらも { items: [{ foodId, text }] } を同じ作りの行で出す ---
// kind は 'set' か 'batch'。行・入力欄・「外す」のクラスと、入れ先の要素 id をここにまとめる。
// update(各行と合計の更新・ボタンの有効/無効)は、sets.js が updateSetForm を、batch.js が updateBatchForm を入れる
export const DRAFTS = {
  set:   { sheet: 'sheet-set',   draft: () => state.setDraft,   items: 'set-items',   empty: 'set-items-empty', row: 'set-item',             amount: 'set-item-amount', remove: 'set-item-remove',              total: 'set-total',   kcal: 'set-total-kcal', update: null,                     maxMsg: '1つのセットに入れられるのは ' + core.MAX_SET_ITEMS + ' 品までです' },
  batch: { sheet: 'sheet-batch', draft: () => state.batchDraft, items: 'batch-items', empty: 'batch-empty',     row: 'set-item batch-item', amount: 'batch-amount',    remove: 'set-item-remove batch-remove', total: 'batch-total', kcal: 'batch-kcal',     update: null,                     maxMsg: '一度に記録できるのは ' + core.MAX_SET_ITEMS + ' 品までです' }
};
// 品の一覧を描き直す(追加・外すのとき)。量の入力中は描き直さず update だけ呼ぶ(フォーカスを保つため)
export function renderDraftItems(kind) {
  const cfg = DRAFTS[kind];
  const draft = cfg.draft();
  if (!draft) return;
  const foods = state.data.foods;
  $(cfg.items).innerHTML = draft.items.map((it, i) => {
    const food = core.findFood(foods, it.foodId);
    if (!food) {
      return '<div class="' + cfg.row + ' missing" data-index="' + i + '"><span class="body"><span class="name">削除されたマイ食品</span><span class="pfc">記録には使えません</span></span>' +
        '<button type="button" class="' + cfg.remove + '" aria-label="削除されたマイ食品を外す">外す</button></div>';
    }
    return '<div class="' + cfg.row + '" data-index="' + i + '">' +
      '<span class="body"><span class="name">' + esc(food.name) + '</span></span>' +
      amountInputHtml(cfg.amount, food, it.text, food.name) +
      '<button type="button" class="' + cfg.remove + '" aria-label="' + esc(food.name) + ' を外す">外す</button>' +
      '<span class="pfc num"></span>' + // P/F/C は行の幅いっぱいの2行目に出す(量の入力欄の横は狭いため)
    '</div>';
  }).join('');
  $(cfg.empty).hidden = draft.items.length > 0;
  cfg.update();
}
// 入力欄の値を下書きに控え、各行の P/F/C と合計欄を更新する。戻り値 { vals: 使える品の値, bad: 量が不正な行がある }
export function readDraftRows(kind) {
  const cfg = DRAFTS[kind];
  const draft = cfg.draft();
  const foods = state.data.foods;
  const vals = [];
  let bad = false;
  if (!draft) return { vals, bad };
  $(cfg.items).querySelectorAll('[data-index]').forEach((row) => {
    const it = draft.items[Number(row.dataset.index)];
    const input = row.querySelector('input[type="number"]');
    const food = it && core.findFood(foods, it.foodId);
    if (!input || !food) return;
    const amt = readAmountInput(input);
    it.text = input.value;
    input.classList.toggle('bad', amt === null);
    if (amt === null) bad = true;
    const sc = core.scaleFood(food, amt || 0);
    row.querySelector('.pfc').innerHTML = pfcKcalHtml(sc);
    vals.push(sc);
  });
  fillTotals(cfg.total, cfg.kcal, core.sumEntries(vals));
  return { vals, bad };
}
// 「外す」: 入力中の量を先に控えてから、その行を下書きから除いて描き直す
export function removeDraftItem(kind, row) {
  const draft = DRAFTS[kind].draft();
  if (!draft) return;
  DRAFTS[kind].update();
  draft.items.splice(Number(row.dataset.index), 1);
  renderDraftItems(kind);
}

// ---------- マイ食品の選択シート(セット編集シート / まとめて記録シートの上に重ねる) ----------
// target: 選んだ食品の入れ先 'set' | 'batch'(省略時は 'set')
export function openFoodPicker(target) {
  state.pickerTarget = target === 'batch' ? 'batch' : 'set';
  const forBatch = state.pickerTarget === 'batch';
  const foods = core.sortFoods(core.activeFoods(state.data.foods)); // PFC未登録はセットにも記録にも入れられない
  const draft = DRAFTS[state.pickerTarget].draft();
  const inDraft = new Set(draft ? draft.items.map((it) => it.foodId) : []);
  const where = forBatch ? '記録' : 'セット';
  $('sheet-picker-title').textContent = forBatch ? '記録する食品' : 'セットに入れる食品';
  $('food-picker-list').innerHTML = foods.map((f) =>
    '<button type="button" class="pick" data-food-id="' + esc(f.id) + '" aria-label="' + esc(f.name) + ' を' + where + 'に入れる">' +
      '<span class="body"><span class="name-line"><span class="name">' + esc(f.name) + '</span><span class="pfc-note">' + esc(core.basisLabel(f)) + (inDraft.has(f.id) ? ' · <span class="in-set">入っています</span>' : '') + '</span></span>' +
      '<span class="pfc num">' + pfcColsHtml(f) + '</span></span>' +
      '<span class="kcal num">' + core.fmtInt(core.calcKcal(f.p, f.f, f.c)) + '<small>kcal</small></span>' +
    '</button>').join('');
  $('food-picker-empty').textContent = 'マイ食品がまだありません。上の「＋ 新しいマイ食品を登録」から登録すると、そのまま' + where + 'に入ります。';
  $('food-picker-empty').hidden = foods.length > 0;
  openSheet('sheet-food-picker');
}
// 選んだマイ食品を、分量シートの初期値(1食分なら 1、100g 基準なら 100)で下書き(kind: 'set' | 'batch')に入れる
export function addFoodToDraft(kind, foodId) {
  const cfg = DRAFTS[kind];
  const draft = cfg.draft();
  const food = core.findFood(state.data.foods, foodId);
  if (!food || !draft) return;
  if (draft.items.length >= core.MAX_SET_ITEMS) { toast(cfg.maxMsg); return; }
  draft.items.push({ foodId: food.id, text: String(core.amountDefaults(food).value) });
  closeSheet('sheet-food-picker');
  renderDraftItems(kind);
}
