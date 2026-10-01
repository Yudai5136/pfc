/* PFC管理 Service Worker
 * 役割: 圏外でもアプリを開けるように、必要ファイルをキャッシュしておく。
 * 更新の仕組み: CACHE 名を APP_VERSION と合わせて変える → 新しい SW が「待機」状態になる
 *   → アプリ側が SKIP_WAITING メッセージを送ってから切り替わる(v1.2.0 から: 入力中でなければ自動で送る。
 *     入力中ならシートを閉じたときに送る。「更新」ボタン・設定の「更新を確認」でも送る)。
 */
'use strict';

const CACHE = 'pfc-v1.2.1'; // リリースごとに index.html の APP_VERSION と合わせて更新する

// 事前にキャッシュするファイル(すべて相対パス。GitHub Pages のサブパス配信に対応)
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// install: 必要ファイルを precache する。skipWaiting は呼ばない(更新はユーザー操作で反映)
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
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

// fetch: 同一オリジンの GET のみ「ネットワーク優先」。成功したらキャッシュ更新、失敗(圏外)ならキャッシュから返す
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        // ページ遷移(アプリ起動)なら index.html で代替する
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});
