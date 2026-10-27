/* ============================================================
   SW.JS вЂ” Service Worker: РѕС„С„Р»Р°Р№РЅ-СЂРµР¶РёРј Рё РєСЌС€РёСЂРѕРІР°РЅРёРµ (PWA).
   РЎС‚СЂР°С‚РµРіРёСЏ: cache-first СЃ С„РѕРЅРѕРІС‹Рј РѕР±РЅРѕРІР»РµРЅРёРµРј (stale-while-revalidate).
   ============================================================ */

var CACHE = 'obsh11-v6';
var ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './data.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png'
];
/* Р’РђР–РќРћ: assets/*.glb Рё three.min.js РќР• РІ РїСЂРµРґРєСЌС€Рµ вЂ” РѕРЅРё РѕРїС†РёРѕРЅР°Р»СЊРЅС‹
   Рё РіСЂСѓР·СЏС‚СЃСЏ Р»РµРЅРёРІРѕ; РєСЌС€РёСЂСѓРµРј РёС… РїСЂРё РїРµСЂРІРѕРј СѓСЃРїРµС…Рµ (runtime, РЅРёР¶Рµ). */

/* РЈСЃС‚Р°РЅРѕРІРєР°: Р·Р°СЂР°РЅРµРµ РєСЌС€РёСЂСѓРµРј СЏРґСЂРѕ РїСЂРёР»РѕР¶РµРЅРёСЏ */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* РђРєС‚РёРІР°С†РёСЏ: С‡РёСЃС‚РёРј СЃС‚Р°СЂС‹Рµ РІРµСЂСЃРёРё РєСЌС€Р° */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* Fetch: СЃРЅР°С‡Р°Р»Р° РєСЌС€; СЃРµС‚СЊ вЂ” РІ С„РѕРЅРµ РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ (РґР»СЏ РЅР°РІРёРіР°С†РёРё вЂ” СЃРµС‚СЊ СЃ fallback РЅР° РєСЌС€) */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  // РќР°РІРёРіР°С†РёСЏ (РїРµСЂРµС…РѕРґС‹ РїРѕ СЃС‚СЂР°РЅРёС†Р°Рј): СЃРµС‚СЊ в†’ РїСЂРё РѕС€РёР±РєРµ РєСЌС€
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // РћСЃС‚Р°Р»СЊРЅРѕРµ: РєСЌС€ в†’ СЃРµС‚СЊ (Рё РѕР±РЅРѕРІР»СЏРµРј РєСЌС€)
  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, clone); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});

