// app/state.js — アプリの状態(state)と、どのモジュールからも使う小さな道具(要素の取得・今日の日付・日レコード)。
// 下の hooks は、上位のモジュール(view.js / update.js)の関数を下位のモジュールから呼ぶための受け口。
// 例: 保存(storage.js の commit)のあとに画面全体を描き直す render は view.js にあるが、storage.js は view.js を import しない
// (import が輪になるのを避ける)。main.js が起動時に hooks に本物の関数を入れる。
import * as core from '../core/index.js';

export const $ = (id) => document.getElementById(id);
export const esc = core.escapeHtml;

// ---------- 上位のモジュールの関数の受け口(main.js が起動時に入れる) ----------
export const hooks = {
  render: null,             // 画面全体の描き直し(view.js の render)
  showView: null,           // 画面の切り替え(view.js の showView)
  scheduleAutoUpdate: null  // 待っている新しい版の反映を試す(update.js の scheduleAutoUpdate)
};
export function render() { hooks.render(); }
export function showView(name) { hooks.showView(name); }
export function scheduleAutoUpdate() { hooks.scheduleAutoUpdate(); }
// マイ食品タブを、指定の切替(foods / sets / pending)で開く
export function showFoodsTab(seg) {
  state.foodsSeg = seg;
  showView('foods');
}

// ---------- 状態 ----------
export const state = {
  data: null,               // 保存データ(4章のモデル)
  dateKey: core.todayKey(), // 表示中の日
  followToday: true,        // 「今日」を表示中なら日付が変わったとき追従する
  renderedToday: null,      // 最後に描画したときの「今日」(日付が変わったかの判定用)
  dayTimer: null,           // 次の 0 時に再描画するタイマー
  view: 'home',             // 表示中の画面: タブ('record' | 'foods' | 'home' | 'shopping' | 'prices')か 'settings'
  tab: 'home',              // 最後に開いていたタブ(設定から戻る先)。起動時は必ずホーム(覚えない)
  foodsSeg: 'foods',        // マイ食品タブの切替: 'foods' | 'sets' | 'pending'
  chartMode: 'kcal',        // ホームの推移グラフ: 'kcal' | 'p' | 'f' | 'c'
  sheetDateKey: null,       // 記録シート/分量シートを開いたときの保存先の日(開いている間に日付が変わっても動かさない)
  sheetFromHome: false,     // いま開いているシートをホームの入力エリアから開いた(常に今日に入れる。記録タブの表示日は動かさない)
  priceBasisTouched: false, // マイ食品シートで「値段の単位」を自分で選んだ(選んでいなければ基準の切替に合わせて変える)
  sheetTime: null,          // 分量シートを開いたときの時刻(追加時の time に使う)
  editingEntryId: null,     // 編集中の記録 id(追加時は null)
  editingFoodId: null,      // 編集中のマイ食品 id
  amountFoodId: null,       // 分量シートの対象マイ食品 id
  editingSetId: null,       // 編集中のセット id(新規は null)
  setDraft: null,           // セット編集シートの中身 { items: [{ foodId, text }] }(text は量の入力欄の文字)
  batchDraft: null,         // まとめて記録シートの中身(セット編集シートと同じ形。閉じたら捨てる)
  batchResult: null,        // まとめて記録した直後、提案シートを出している間の結果 { count, items, undo }(閉じたらトーストを出す)
  pickerTarget: 'set',      // 食品の選択シートで選んだ食品の入れ先: 'set'(セット編集)| 'batch'(まとめて記録)
  setAddId: null,           // セット追加シートの対象セット id
  setAddFoodIds: [],        // セット追加シートの各行のマイ食品 id(開いたときの中身。行の data-index と対応)
  foodSheetForSet: false,   // マイ食品の登録シートを、食品選択シートから重ねて開いた(保存したら pickerTarget の下書きに入れる)
  foodSheetWasPending: false, // マイ食品シートで PFC未登録の食品を開いた(保存するとふつうのマイ食品になる)
  shopGrouped: false,       // 買い物リストの「安い店ごとに分ける」(初期はオフ。覚えない)
  shopNewKind: 'food',      // 候補に無い名前で追加するときの種類: 'food'(PFCはあとで)| 'goods'(食品ではない)
  boughtRowId: null,        // 買ったシートを開いている買い物リストの行 id
  shopItemRowId: null,      // 品のシート(数量メモなど)を開いている行 id
  priceQuery: '',           // 値段タブの検索欄
  priceMode: 'best',        // 値段タブの表示: 'best'(最安だけ)| 'all'(すべての店)
  priceOpen: new Set(),     // 値段タブで開いているカード('food:f_…' など)
  editingPriceId: null,     // 値段シートで編集中の値段 id(追加は null)
  priceNewKind: 'food',     // 値段シートで新しい品を作るときの種類
  recent: [],               // 「最近の記録」チップの内容(index でタップ先を引く)
  generation: 0,            // 読み込み/全削除のたびに増やす(元に戻すの安全確認用)
  toastTimer: null,
  undoAction: null,
  migrated: false           // 起動時にマイグレーションした(保存し直す必要あり)
};

// ---------- 日付ユーティリティ ----------
export function today() { return core.todayKey(new Date()); }
export function defaultTimeFor(key) { return key === today() ? core.formatTime(new Date()) : '12:00'; }
// 表示中の日のレコードを取得(なければ作成し、そのときの目標をスナップショット)
export function ensureDay(key) {
  const days = state.data.days;
  if (!days[key]) days[key] = { targets: Object.assign({}, state.data.settings.targets || { p: 0, f: 0, c: 0 }), entries: [] };
  if (!Array.isArray(days[key].entries)) days[key].entries = [];
  return days[key];
}
export function targetsFor(key) {
  const day = state.data.days[key];
  return (day && core.normTargets(day.targets)) || state.data.settings.targets || { p: 0, f: 0, c: 0 };
}

// 最後の描画から日付が変わっていたら先に再描画する(操作の直前に呼び、古い dateKey で保存しないようにする)
export function catchUpDay() { if (today() !== state.renderedToday) render(); }
// その日の集計(ホームの #stat-* と記録タブの #rec-stat-* で共用)
export function statsFor(key) {
  const day = state.data.days[key];
  return core.dayStats(day ? day.entries : [], targetsFor(key), state.data.settings.direction);
}
// クイック追加の追加先: ホームからなら今日、記録タブからなら表示中の日(どちらも 0 時を過ぎていたら先に追従させる)
export function quickTargetDay(fromHome) { catchUpDay(); return fromHome ? today() : state.dateKey; }
