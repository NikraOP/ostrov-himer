/* Сервис-воркер «Острова Химер»: игра работает без интернета.

   Страница игры (index.html) — «сперва сеть»: пока интернет есть, игрок
   всегда получает свежую версию, а если сети нет или она тянется дольше
   четырёх секунд — берётся последняя сохранённая. Браузер сам сверяет
   файл с сервером (ETag), поэтому неизменённые 16 МБ второй раз не качаются.

   Картинки из assets/ и icons/ — «сперва своё, потом обновить»: показываем
   то, что уже лежит в кэше, и тихо подтягиваем свежую копию на следующий
   запуск. Шрифты Google — так же.

   Меняешь сам этот файл — подними VERSION, иначе телефоны не заметят. */

const VERSION = "oh-1";
const PAGE = "oh-page";            // index.html, манифест
const ART = "oh-art";              // картинки и шрифты
const KEEP = [PAGE, ART];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(PAGE).then(c => c.addAll(["./", "./manifest.webmanifest"])).catch(() => {}));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

/** Сперва сеть, но не дольше ms; иначе — кэш. */
async function networkFirst(req, cacheKey, ms = 4000) {
  const cache = await caches.open(PAGE);
  const fromNet = fetch(req).then(res => {
    if (res && res.ok) cache.put(cacheKey, res.clone());
    return res;
  });
  fromNet.catch(() => {});        // если победил кэш, поздняя ошибка сети никого не волнует
  const timeout = new Promise(r => setTimeout(r, ms, null));
  try {
    const res = await Promise.race([fromNet, timeout]);
    if (res) return res;
    const cached = await cache.match(cacheKey);
    return cached || await fromNet;
  } catch (err) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

/** Сперва кэш, а в фоне — свежая копия на следующий раз. */
async function staleWhileRevalidate(e) {
  const cache = await caches.open(ART);
  const cached = await cache.match(e.request);
  const fresh = fetch(e.request).then(res => {
    if (res && (res.ok || res.type === "opaque")) cache.put(e.request, res.clone());
    return res;
  }).catch(() => null);
  if (cached) { e.waitUntil(fresh); return cached }
  return (await fresh) || Response.error();
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // сама игра
  if (req.mode === "navigate" || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith(networkFirst(req, "./"));
    return;
  }
  // картинки, значки, манифест и шрифты
  const own = url.origin === location.origin && /\/(assets|icons)\//.test(url.pathname);
  const fonts = url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
  if (own || fonts || url.pathname.endsWith("manifest.webmanifest")) e.respondWith(staleWhileRevalidate(e));
});
