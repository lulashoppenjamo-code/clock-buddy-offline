// Service Worker — Reloj Checador offline-first (estable)
const VERSION = "v5";
const SHELL_CACHE = `checador-shell-${VERSION}`;
const ASSET_CACHE = `checador-assets-${VERSION}`;
const MISC_CACHE = `checador-misc-${VERSION}`;

// Rutas HTML críticas (se calientan en install + en runtime)
const SHELL_URLS = [
  "/",
  "/empleadas",
  "/admin",
  "/auth",
  "/ventas",
  "/limpieza",
  "/faltantes",
  "/insumos",
  "/vacaciones",
  "/descansos",
  "/pagos",
  "/clientes",
  "/ranking",
  "/meta-mensual",
  "/perfumes",
  "/manifest.json",
  "/icon-512.png",
  "/offline.html",
];

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
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, MISC_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const c of clients) c.postMessage({ type: "SW_ACTIVATED" });
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // No interceptar APIs externas (Supabase, etc.)
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navegaciones: network-first → caché de página → / → offline.html
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(req, fresh.clone()).catch(() => {});
            // También guardar por pathname limpio
            cache.put(url.pathname, fresh.clone()).catch(() => {});
          }
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached =
            (await cache.match(req)) ||
            (await cache.match(url.pathname)) ||
            (await cache.match("/")) ||
            (await cache.match("/offline.html"));
          if (cached) return cached;
          return new Response(
            "<!DOCTYPE html><html lang=es><body style='font-family:sans-serif;text-align:center;padding:2rem'><h1>Sin conexión</h1><p>Abrí la app una vez con internet.</p><button onclick='location.reload()'>Reintentar</button></body></html>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
    return;
  }

  // JS / CSS / fuentes / imágenes: cache-first
  if (
    url.pathname.startsWith("/assets/") ||
    /\.(js|css|mjs|woff2?|ttf|png|jpg|jpeg|svg|webp|ico|json|webmanifest)$/.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        if (cached) {
          // Actualizar en segundo plano si hay red
          fetch(req)
            .then((res) => {
              if (res.ok) cache.put(req, res.clone()).catch(() => {});
            })
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
    return;
  }

  // Resto GET mismo origen: stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(MISC_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        })
        .catch(() => null);
      if (cached) return cached;
      const res = await network;
      if (res) return res;
      return new Response("", { status: 504 });
    })(),
  );
});
