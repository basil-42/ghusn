/*
 * عامل خدمة غصن — نقطة البيع دون اتصال (D-82).
 * - ملفات Next الثابتة (_next/static) مخزّنة دائماً: أسماؤها تتغير مع كل نشر.
 * - صفحات /pos: الشبكة أولاً، وعند الانقطاع آخر نسخة محفوظة (أو /pos).
 * - الشعار والخطوط: المخزّن ثم التحديث في الخلفية.
 * - كل ما عدا ذلك (الإدارة، API، عمليات الخادم): الشبكة فقط — لا نخزّن بيانات حساسة.
 */
const VERSION = "ghusn-pos-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit ?? network;
}

async function posPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    // لا نخزّن تحويلاً لصفحة الدخول (جلسة منتهية)
    if (res.ok && !res.redirected) cache.put(request, res.clone());
    return res;
  } catch {
    const url = new URL(request.url);
    return (
      (await cache.match(request, { ignoreSearch: false })) ??
      (await cache.match(new URL("/pos", url.origin).toString())) ??
      new Response("<h1 dir='rtl'>غير متصل — افتحي نقطة البيع مرة واحدة مع الاتصال أولاً</h1>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
        status: 503,
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  if (url.pathname.startsWith("/brand/") || url.pathname.startsWith("/_next/static/media/")) {
    event.respondWith(staleWhileRevalidate(request, ASSETS));
    return;
  }
  // صفحة نقطة البيع (HTML فقط؛ طلبات RSC للتنقل تمر للشبكة)
  const isHtml = request.mode === "navigate" || (request.headers.get("accept") ?? "").includes("text/html");
  if ((url.pathname === "/pos" || url.pathname.startsWith("/pos/")) && isHtml && !request.headers.get("RSC")) {
    event.respondWith(posPage(request));
  }
});
