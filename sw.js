// Service worker Тендер-Печи. Сеть первой: свежая выкатка приходит сразу, кеш только запасной путь без связи.
// Не трогает: чужие адреса (API на hr-bot.online и api.kp-catalyst.ru, шрифты Google), не-GET, Range, видео, презентацию.
// Адреса с ?m=<токен> и ?a=<токен> в кеш не попадают: ключ кеша для страниц это путь без параметров.
const CACHE = 'tp-v1';
const NET_TIMEOUT_MS = 8000;
const OWN = [/^\/$/, /^\/index\.html$/, /^\/app\//, /^\/ustanovit\//, /^\/icons\//, /^\/manifest\.webmanifest$/];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!OWN.some((re) => re.test(url.pathname))) return;
  event.respondWith(networkFirst(req, url));
});

async function networkFirst(req, url) {
  const cache = await caches.open(CACHE);
  const key = req.mode === 'navigate' ? url.origin + url.pathname : req.url;
  const net = fetch(req, { cache: 'no-cache' });
  net.catch(() => {}); // позднюю ошибку после таймаута не считать необработанной
  let res;
  try {
    res = await Promise.race([net, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS))]);
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    return net; // в кеше пусто: ждём сеть дальше, ошибку отдаёт браузер как обычно
  }
  if (res.ok && res.type === 'basic') {
    cache.put(key, res.clone()).catch(() => {});
    return res;
  }
  // 404 и ошибки сервера: если есть копия, лучше она, чем белый экран (старый хэш-файл после выкатки)
  if (res.status >= 400) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  return res;
}
