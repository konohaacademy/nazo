// 怪盗からの挑戦状 — まず取りに行き、つながらないときだけ しまったものを出す。
// ⚠ しまったものを先に出すと、直した app.js や scenario.json が子どもの端末に届かなくなる（もじかずクイズと同じ）。
var CACHE = 'nazo-v1';
var SHELL = ['./', 'index.html', 'style.css?v=5', 'logic.js?v=5', 'app.js?v=5', 'scenario.json', 'presets.json', 'icon-192.png'];
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).catch(function () { /* 次に開いたとき */ }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // ?t=（タグで開いたURL）も同じ index.html。しまうときは ? を落とした形で引けるようにする
  var key = e.request.mode === 'navigate' ? './' : e.request;
  e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
    if (r && r.ok) { var c = r.clone(); caches.open(CACHE).then(function (ca) { ca.put(key, c); }); }
    return r;
  }).catch(function () { return caches.match(key); }));
});
