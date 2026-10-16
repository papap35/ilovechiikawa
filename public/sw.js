/**
 * 極簡 service worker。
 *
 * 目標只有一個：沒有網路時，收藏庫仍然打得開。
 * 靜態資源用 cache-first，頁面用 network-first 並在失敗時回退到快取，
 * API 一律走網路（收藏資料要是最新的，寧可失敗也不給過期資料）。
 */

const CACHE = "ilovechiikawa-v2";
// 頁面不預先快取：service worker 可能在登入頁就被註冊，那時抓 "/" 只會拿到導向登入的回應。
// 頁面改在實際瀏覽時以 network-first 存進快取。
const PRECACHE = ["/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // 收藏資料永遠取最新的，不做離線快取
  if (url.pathname.startsWith("/api/")) return;

  const isPage = request.mode === "navigate";

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      if (isPage) {
        try {
          const response = await fetch(request);
          // 被導去登入頁的回應不能存成這一頁，否則離線時打開收藏庫只會看到登入畫面
          if (response.ok && !response.redirected) cache.put(request, response.clone());
          return response;
        } catch {
          return (await cache.match(request)) ?? (await cache.match("/")) ?? Response.error();
        }
      }

      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })(),
  );
});
