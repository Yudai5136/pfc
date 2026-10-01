// core/model.js — 保存データの形(仕様 4 章): 空データ・正規化(normalize。記録の量と基準も normEntry で確かめる)・マイグレーション・読み込みの検証、
// 記録を手で直したときの形(editedEntry。P/F/C が変わったら amount / basis を外す)、バックアップ案内と更新確認の間隔。
import { APP_VERSION, DATA_VERSION, NUTRIENTS, DEFAULT_DIRECTION, MAX_NAME, BACKUP_STALE_DAYS, BACKUP_MIN_ENTRIES, MAX_SET_ITEMS } from './constants.js';
import { toNum, clampG, genId, isNumeric } from './format.js';
import { localDateKey, parseDateKey, isValidDateKey, isValidTime, localIso, isValidIso } from './dates.js';
import { normTargets, normDirection } from './nutrition.js';
import { setAmount, priceBasisOf, entryAmountFields } from './foods.js';
import { ITEM_TYPES, MAX_STORE_NAME, MAX_QTY, normPriceBasis, isoTime, parsePrice, parseGrams } from './shopping.js';

// ---------- バックアップ案内・更新確認の間隔 ----------
// 起動時・前面に戻ったときの更新確認を、前回から ms 以上たっていれば行う(時計が戻った場合も行う)
export function updateCheckDue(lastAt, now, ms) { return !lastAt || now - lastAt >= ms || now < lastAt; }
// 記録の総数
export function countEntries(days) {
  if (!days || typeof days !== 'object') return 0;
  return Object.keys(days).reduce((n, k) => n + (days[k] && Array.isArray(days[k].entries) ? days[k].entries.length : 0), 0);
}
// バックアップ案内を出すか
export function backupNeeded(data, now) {
  const meta = (data && data.meta) || {};
  const last = isValidIso(meta.lastBackupAt) ? new Date(meta.lastBackupAt).getTime() : null;
  const t = (now || new Date()).getTime();
  if (last === null) return countEntries(data && data.days) >= BACKUP_MIN_ENTRIES;
  return t - last >= BACKUP_STALE_DAYS * 86400000;
}
// 「最終バックアップ: 2026-09-20(10日前)」
export function formatLastBackup(iso, now) {
  if (!isValidIso(iso)) return 'まだバックアップしていません';
  const d = new Date(iso);
  const n = now || new Date();
  const diffDays = Math.max(0, Math.floor((parseDateKey(localDateKey(n)).getTime() - parseDateKey(localDateKey(d)).getTime()) / 86400000));
  const ago = diffDays === 0 ? '今日' : diffDays + '日前';
  return '最終バックアップ: ' + localDateKey(d) + '(' + ago + ')';
}

// ---------- 空データ・正規化・マイグレーション ----------
export function emptyState(nowIso) {
  return {
    version: DATA_VERSION,
    settings: { targets: null, direction: Object.assign({}, DEFAULT_DIRECTION), updatedAt: null },
    days: {},
    foods: [],
    sets: [],
    stores: [],     // v1.2.0: 店
    goods: [],      // v1.2.0: 食品ではない品
    prices: [],     // v1.2.0: 品 × 店の値段
    shopping: [],   // v1.2.0: 買い物リスト
    meta: { createdAt: nowIso || localIso(new Date()), lastBackupAt: null, appVersion: APP_VERSION }
  };
}
// 記録 1 件を正規化。オブジェクトでないもの、p/f/c がひとつも数値でないもの、名前も値もないもの(記録シートでも保存できない形)は捨てる
export function normEntry(e, fallbackTime) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  if (!NUTRIENTS.some((k) => isNumeric(e[k]))) return null;
  const out = {
    id: typeof e.id === 'string' && e.id ? e.id.slice(0, 64) : genId('e'),
    name: typeof e.name === 'string' ? e.name.trim().slice(0, MAX_NAME) : '',
    p: clampG(e.p), f: clampG(e.f), c: clampG(e.c),
    time: isValidTime(e.time) ? e.time : (fallbackTime || '12:00'),
    createdAt: isValidIso(e.createdAt) ? e.createdAt : null
  };
  if (typeof e.foodId === 'string' && e.foodId) out.foodId = e.foodId.slice(0, 64);
  // v2.0.0: マイ食品から入れた記録の量と基準(食費の見通し機能の準備)。0 より大きい数と知っている基準のときだけ残し、それ以外は捨てる
  const am = entryAmountFields(e);
  if (am) { out.amount = am.amount; out.basis = am.basis; }
  if (!out.name && out.p === 0 && out.f === 0 && out.c === 0) return null;
  return out;
}
// 記録を手で直したときの新しい記録(元の記録は変えない)。v は { name, p, f, c, time }(保存できる形の値)。
// P/F/C が変わったら、マイ食品から入れたときの量と基準(amount / basis)は合わなくなるので外す(4 章)。名前・時刻だけの変更なら残す
export function editedEntry(entry, v) {
  const out = Object.assign({}, entry, { name: v.name, p: v.p, f: v.f, c: v.c, time: v.time });
  if (entry.p !== v.p || entry.f !== v.f || entry.c !== v.c) { delete out.amount; delete out.basis; }
  return out;
}
export function normFood(f) {
  if (!f || typeof f !== 'object') return null;
  const name = typeof f.name === 'string' ? f.name.trim().slice(0, MAX_NAME) : '';
  if (!name) return null;
  const basis = f.basis === 'per100g' ? 'per100g' : 'perServing';
  const out = {
    id: typeof f.id === 'string' && f.id ? f.id.slice(0, 64) : genId('f'),
    name, basis,
    servingLabel: basis === 'per100g' ? '' : (typeof f.servingLabel === 'string' && f.servingLabel.trim() ? f.servingLabel.trim().slice(0, 20) : '1食'),
    p: clampG(f.p), f: clampG(f.f), c: clampG(f.c),
    usedAt: isValidIso(f.usedAt) ? f.usedAt : null,
    useCount: Math.max(0, Math.round(toNum(f.useCount))),
    priceBasis: priceBasisOf(f)                 // v1.2.0: 値段の単位。無ければ basis から決める
  };
  if (f.pending === true) out.pending = true;   // v1.2.0: PFC未登録(true のときだけ持つ)
  const sc = normShopCount(f.shopCount);
  if (sc) out.shopCount = sc;                   // v1.2.0: 買い物リストに入れた回数(1 以上のときだけ持つ)
  return out;
}
// 買い物リストに入れた回数(「よく買うもの」の並び順)。0 以上の整数
export function normShopCount(v) { return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(999999, Math.round(v))) : 0; }
// --- 買い物・値段(13.5)。オブジェクトでない要素・型の合わない値・存在しない参照は捨てる ---
export function normName(v, max) { return typeof v === 'string' ? v.trim().slice(0, max || MAX_NAME) : ''; }
export function normId(v, prefix) { return typeof v === 'string' && v ? v.slice(0, 64) : genId(prefix); }
export function isPlainObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
export function normStore(s) {
  if (!isPlainObj(s)) return null;
  const name = normName(s.name, MAX_STORE_NAME);
  if (!name) return null;
  return { id: normId(s.id, 'st'), name, createdAt: isValidIso(s.createdAt) ? s.createdAt : null };
}
export function normGoods(g) {
  if (!isPlainObj(g)) return null;
  const name = normName(g.name);
  if (!name) return null;
  const out = { id: normId(g.id, 'g'), name, priceBasis: normPriceBasis(g.priceBasis), createdAt: isValidIso(g.createdAt) ? g.createdAt : null };
  const sc = normShopCount(g.shopCount);
  if (sc) out.shopCount = sc;
  return out;
}
// 値段 1 件。basisOf(itemType, itemId) は品の値段の単位(品が無ければ null)、hasStore(id) は店があるか。
// price は 0 以上の整数。100gあたりの品は grams(0 より大きい数)が必須、1個あたりの品は grams を持たない
export function normPrice(p, basisOf, hasStore) {
  if (!isPlainObj(p)) return null;
  if (ITEM_TYPES.indexOf(p.itemType) < 0 || typeof p.itemId !== 'string' || typeof p.storeId !== 'string') return null;
  const basis = basisOf(p.itemType, p.itemId);
  if (!basis || !hasStore(p.storeId)) return null;
  if (typeof p.price !== 'number' && typeof p.price !== 'string') return null;
  const price = parsePrice(p.price);
  if (price === null) return null;
  const out = { id: normId(p.id, 'pr'), itemType: p.itemType, itemId: p.itemId, storeId: p.storeId, price };
  if (basis === 'per100g') {
    if (typeof p.grams !== 'number' && typeof p.grams !== 'string') return null;
    const grams = parseGrams(p.grams);
    if (grams === null) return null;
    out.grams = grams;
  }
  out.updatedAt = isValidIso(p.updatedAt) ? p.updatedAt : null;
  return out;
}
// 買い物リストの 1 行。品が無い行は捨てる。checked は true のときだけ買った状態
export function normShopping(r, hasItem) {
  if (!isPlainObj(r)) return null;
  if (ITEM_TYPES.indexOf(r.itemType) < 0 || typeof r.itemId !== 'string' || !hasItem(r.itemType, r.itemId)) return null;
  const checked = r.checked === true;
  return {
    id: normId(r.id, 'sh'), itemType: r.itemType, itemId: r.itemId,
    qty: normName(r.qty, MAX_QTY), checked,
    addedAt: isValidIso(r.addedAt) ? r.addedAt : null,
    checkedAt: checked && isValidIso(r.checkedAt) ? r.checkedAt : null
  };
}
// id が重複していたら振り直しながら、正規化した要素を集める
export function normList(src, fn, prefix) {
  const ids = new Set();
  const out = [];
  (Array.isArray(src) ? src : []).forEach((x) => {
    const v = fn(x);
    if (!v) return;
    if (ids.has(v.id)) v.id = genId(prefix);
    ids.add(v.id); out.push(v);
  });
  return out;
}
// セットの品 1 つ。foodId が文字列でない、amount が数でない(0 以下も含む)ものは捨てる
export function normSetItem(it) {
  if (!it || typeof it !== 'object' || Array.isArray(it)) return null;
  if (typeof it.foodId !== 'string' || !it.foodId) return null;
  if (typeof it.amount !== 'number' && typeof it.amount !== 'string') return null;
  const amount = setAmount(it.amount);
  if (amount === null) return null;
  return { foodId: it.foodId.slice(0, 64), amount };
}
// セット 1 つ。オブジェクトでないもの、名前が空のものは捨てる。品が 0 個のセットは残す(マイ食品の削除で空になることがある)
export function normSet(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const name = typeof s.name === 'string' ? s.name.trim().slice(0, MAX_NAME) : '';
  if (!name) return null;
  return {
    id: typeof s.id === 'string' && s.id ? s.id.slice(0, 64) : genId('s'),
    name,
    items: (Array.isArray(s.items) ? s.items : []).map(normSetItem).filter(Boolean).slice(0, MAX_SET_ITEMS),
    usedAt: isValidIso(s.usedAt) ? s.usedAt : null,
    useCount: Math.max(0, Math.round(toNum(s.useCount))),
    createdAt: isValidIso(s.createdAt) ? s.createdAt : null
  };
}
// 保存データを安全な形に揃える(欠けた項目は補い、不正な項目は捨てる)
export function normalize(obj, nowIso) {
  const src = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  const base = emptyState(nowIso);
  const settings = src.settings && typeof src.settings === 'object' ? src.settings : {};
  const out = {
    version: DATA_VERSION,
    settings: {
      targets: normTargets(settings.targets),
      direction: normDirection(settings.direction),
      updatedAt: isValidIso(settings.updatedAt) ? settings.updatedAt : null
    },
    days: {},
    foods: [],
    sets: [],
    stores: [],
    goods: [],
    prices: [],
    shopping: [],
    meta: {
      createdAt: src.meta && isValidIso(src.meta.createdAt) ? src.meta.createdAt : base.meta.createdAt,
      lastBackupAt: src.meta && isValidIso(src.meta.lastBackupAt) ? src.meta.lastBackupAt : null,
      appVersion: APP_VERSION
    }
  };
  const days = src.days && typeof src.days === 'object' && !Array.isArray(src.days) ? src.days : {};
  Object.keys(days).sort().forEach((key) => {
    if (!isValidDateKey(key)) return;
    const d = days[key];
    if (!d || typeof d !== 'object') return;
    // id が重複していたら(手で編集・結合したファイルなど)、捨てずに新しい id を振り直す
    const ids = new Set();
    const entries = (Array.isArray(d.entries) ? d.entries : []).map((e) => normEntry(e)).filter(Boolean).map((e) => {
      if (ids.has(e.id)) e.id = genId('e');
      ids.add(e.id); return e;
    });
    out.days[key] = { targets: normTargets(d.targets) || out.settings.targets || { p: 0, f: 0, c: 0 }, entries };
  });
  const fids = new Set();
  (Array.isArray(src.foods) ? src.foods : []).forEach((f) => {
    const nf = normFood(f);
    if (!nf || fids.has(nf.id)) return;
    fids.add(nf.id); out.foods.push(nf);
  });
  // セット(v1.1.0 で追加)。無い・配列でないなら []。id が重複していたら振り直す
  const sids = new Set();
  (Array.isArray(src.sets) ? src.sets : []).forEach((st) => {
    const ns = normSet(st);
    if (!ns) return;
    if (sids.has(ns.id)) ns.id = genId('s');
    sids.add(ns.id); out.sets.push(ns);
  });
  // 店・食品ではない品・値段・買い物リスト(v1.2.0 で追加)。無い・配列でないなら []
  out.stores = normList(src.stores, normStore, 'st');
  out.goods = normList(src.goods, normGoods, 'g');
  const foodBasis = new Map(out.foods.map((f) => [f.id, f.priceBasis]));
  const goodsBasis = new Map(out.goods.map((g) => [g.id, g.priceBasis]));
  const basisOf = (type, id) => (type === 'food' ? foodBasis.get(id) : goodsBasis.get(id)) || null;
  const storeIds = new Set(out.stores.map((s) => s.id));
  // 値段は 1品 × 1店 = 1件。同じ組み合わせが複数あれば、新しく更新したほうを残す
  const byPair = new Map();
  normList(src.prices, (p) => normPrice(p, basisOf, (id) => storeIds.has(id)), 'pr').forEach((p) => {
    const k = p.itemType + '\n' + p.itemId + '\n' + p.storeId;
    const old = byPair.get(k);
    if (!old || isoTime(p.updatedAt) > isoTime(old.updatedAt)) byPair.set(k, p);
  });
  out.prices = Array.from(byPair.values());
  out.shopping = normList(src.shopping, (r) => normShopping(r, (type, id) => !!basisOf(type, id)), 'sh');
  return out;
}
// マイグレーション: 旧版 → 現行版。v1 では何もしない。戻り値 { data, from }
export function migrate(obj) {
  const src = obj && typeof obj === 'object' ? obj : {};
  const from = Number.isInteger(src.version) ? src.version : 0;
  let data = src;
  // 例: if (from < 2) { data = { ...data, ... }; }  ← 将来の版で追加する
  if (from < DATA_VERSION) data = Object.assign({}, data, { version: DATA_VERSION });
  return { data, from };
}
// 保存データの骨格が正しいか(days はオブジェクト、foods は配列)。読み込み(import)と起動時の load で同じ基準を使う。
// 不正なら理由の文字列、正しければ null
export function structureError(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 'JSON がオブジェクトではありません';
  if (!obj.days || typeof obj.days !== 'object' || Array.isArray(obj.days)) return 'days がありません';
  if (!Array.isArray(obj.foods)) return 'foods がありません';
  return null;
}
// 読み込むデータの検証。{ ok:true, data, stats } または { ok:false, reason }
export function validateImport(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'JSON がオブジェクトではありません' };
  if (!Number.isInteger(obj.version) || obj.version < 1) return { ok: false, reason: 'version がありません' };
  if (obj.version > DATA_VERSION) return { ok: false, reason: 'このアプリより新しい形式(version ' + obj.version + ')です。アプリを更新してください' };
  const structural = structureError(obj);
  if (structural) return { ok: false, reason: structural };
  // settings は必須にしない(仕様 6.4: version・days・foods の存在を検証)。欠けていれば normalize が既定値で補う
  const data = normalize(migrate(obj).data);
  return { ok: true, data, stats: { days: Object.keys(data.days).length, entries: countEntries(data.days), foods: data.foods.length, sets: data.sets.length } };
}
