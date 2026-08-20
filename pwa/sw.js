/* sw.js - Service Worker：预缓存 App Shell，离线可用 */
var CACHE = "jp-pwa-v15";
var CORE = [
  "./",
  "./index.html",
  "./app.js",
  "./md5.js",
  "./aes.js",
  "./lib/mux.js",
  "./lib/hls.min.js",
  "./lib/ffmpeg/ffmpeg.min.js",
  "./lib/ffmpeg/814.ffmpeg.js",
  "./lib/ffmpeg-v11/ffmpeg.min.js",
  "./lib/ffmpeg-v11/046d0074eee1d99a674a.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // 跨域 API/视频走网络，不拦截

  // 同源请求网络优先：更新即时生效，离线时回退缓存
  e.respondWith(
    fetch(e.request).then(function (resp) {
      if (resp && resp.ok && e.request.method === "GET") {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return resp;
    }).catch(function () {
      return caches.match(e.request);
    })
  );
});