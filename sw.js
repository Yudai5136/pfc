/* PFC管理 Service Worker
 * 役割: 圏外でもアプリを開けるように、必要ファイルをキャッシュしておく。
 * 更新の仕組み: CACHE 名を APP_VERSION(js/core/constants.js)と合わせて変える → 新しい SW が「待機」状態になる
 *   → アプリ側が SKIP_WAITING メッセージを送ってから切り替わる(v1.2.0 から: 入力中でなければ自動で送る。
 *     入力中ならシートを閉じたときに送る。「更新」ボタン・設定の「更新を確認」でも送る)。
 * v2.0.0 から: アプリは index.html・css/・js/ の複数ファイルに分かれている。そこで「この版のファイル一式」を CACHE に入れ、
 *   - install では、すべてのファイルを HTTP キャッシュを使わずに取り直して(cache: 'reload')precache する(一式そろわなければ版を替えない)
 *   - fetch では、CACHE にあるもの(PRECACHE の全部。アプリを開くページ遷移も)は CACHE から返す(キャッシュ優先)。
 *     → 起動にネットワークを待たない(電波が弱い所でも 1 ファイル版の v1.3.0 と同じくらい速く開く)/
 *       index.html と css・js が必ず同じ版の組になる(新しい index.html と古い js が混ざらない)
 *   - 新しい版のファイルは、SW の更新(sw.js が変わる → 新しい CACHE に precache → SKIP_WAITING → リロード)でだけ入れ替わる。
 *     ★ だからリリースでは必ず CACHE の名前を変える(変えないと、GitHub にファイルを上げても iPhone のアプリは古いまま)
 *   - 返す応答には Cache-Control: no-cache を付け直す(ブラウザのメモリキャッシュが、SW を通さずに古い版の css・js を使い回さないように)
 */
'use strict';

const CACHE = 'pfc-v2.0.0'; // リリースごとに js/core/constants.js の APP_VERSION と合わせて更新する

// 事前にキャッシュするファイル(すべて相対パス。GitHub Pages のサブパス配信に対応)。
// css/ と js/ にファイルを足したら、ここにも必ず足す(足し忘れるとテストが失敗する: tests/offline.js)
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/core/index.js',
  './js/core/constants.js',
  './js/core/format.js',
  './js/core/dates.js',
  './js/core/nutrition.js',
  './js/core/foods.js',
  './js/core/week.js',
  './js/core/shopping.js',
  './js/core/model.js',
  './js/app/state.js',
  './js/app/storage.js',
  './js/app/ui.js',
  './js/app/quick.js',
  './js/app/home.js',
  './js/app/record.js',
  './js/app/pricing.js',
  './js/app/drafts.js',
  './js/app/foods.js',
  './js/app/sets.js',
  './js/app/batch.js',
  './js/app/shopping.js',
  './js/app/prices.js',
  './js/app/settings.js',
  './js/app/update.js',
  './js/app/view.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// install: 必要ファイルを precache する。skipWaiting は呼ばない(更新はユーザー操作・入力の切れ目で反映)
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))));
});

// アプリ側から SKIP_WAITING を受け取ったら、待機中の新版を有効化する
self.addEventListener('message', (event) => {
  if (event && event.data === 'SKIP_WAITING') self.skipWaiting();
});

// activate: 古い pfc- キャッシュを削除し、開いているページの制御を引き継ぐ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('pfc-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// 返す応答のコピー。Cache-Control を no-cache にして、ブラウザが次に使うときも必ず SW に聞くようにする
// (GitHub Pages は 10 分キャッシュさせるので、そのままだと SW の版が替わっても古い css・js がメモリから使われることがある)。
// 作り直せない応答は、そのまま返す
function askEveryTime(res) {
  if (!res || !res.ok) return res;
  try {
    const h = new Headers(res.headers);
    h.set('Cache-Control', 'no-cache');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  } catch (e) { return res; }
}

// fetch: 同一オリジンの GET のみ扱う。
//  1) この版の CACHE にあれば、それを返す(キャッシュ優先。?utm= などのクエリは無視)
//  2) 無ければネットワークへ。成功したら CACHE に足す
//  3) ネットワークも失敗(圏外)なら、ページ遷移(アプリを開く)は index.html で代替する
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then((cache) => cache.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => {
      if (hit) return askEveryTime(hit);
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            cache.put(req, copy).catch(() => {});
          }
          return askEveryTime(res);
        })
        .catch(() => {
          if (req.mode === 'navigate') return cache.match('./index.html').then((page) => page ? askEveryTime(page) : Response.error());
          return Response.error();
        });
    }))
  );
});
