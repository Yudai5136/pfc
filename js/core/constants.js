// core/constants.js — アプリ全体で使う定数(バージョン・栄養素・上限値など)。
// APP_VERSION はリリースごとに上げる(sw.js の CACHE 名も同じ番号にする。テストが一致を確かめる)。
export const APP_VERSION = '2.0.0';   // アプリのバージョン(sw.js の CACHE 名と合わせる)
export const DATA_VERSION = 1;        // 保存データの形式バージョン
export const NUTRIENTS = ['p', 'f', 'c'];
export const NUTRIENT_LABEL = { p: 'たんぱく質', f: '脂質', c: '炭水化物' };
export const DEFAULT_DIRECTION = { p: 'atLeast', f: 'atMost', c: 'atMost' };
export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_G = 99999;           // 入力できる上限(g)。異常値の混入防止
export const MAX_NAME = 100;
export const RECENT_LIMIT = 8;
export const RECENT_WINDOW_DAYS = 30;
export const BACKUP_STALE_DAYS = 14;
export const BACKUP_MIN_ENTRIES = 20;
export const MAX_SET_ITEMS = 50;     // 1 つのセットに入れられる品の上限(異常に大きいファイル対策)
