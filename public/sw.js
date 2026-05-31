// Service Worker — habilita uso offline del reloj checador.
const VERSION = "v3";
const SHELL_CACHE = `checador-shell-${VERSION}`;
const ASSET_CACHE = `checador-assets-${VERSION}`;
const SHELL_URLS = ["/", "/empleadas", "/admin", "/auth", "/manifest.json", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_URLS.map((url) =>
          fetch(url, { cache: "reload" })
            .then((res) => (res.ok ? cache.put(url, res.clone()) : null))
            .catch(() => null),
        ),
      );
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // No interceptar llamadas a Supabase u otras APIs externas.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navegaciones: network-first con fallback al shell cacheado.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached =
            (await cache.match(req)) ||
            (await cache.match("/")) ||
            (await cache.match("/index.html"));
          if (cached) return cached;
          return new Response("Sin conexión", { status: 503, statusText: "Offline" });
        }
      })(),
    );
    return;
  }

  // Assets estáticos: cache-first.
  if (
    url.pathname.startsWith("/assets/") ||
    /\.(js|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico|json)$/.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        if (cached) {
          fetch(req)
            .then((res) => res.ok && cache.put(req, res.clone()))
            .catch(() => {});
          return cached;
        }
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        } catch {
          return new Response("", { status: 504 });
        }
      })(),
    );
  }
});
