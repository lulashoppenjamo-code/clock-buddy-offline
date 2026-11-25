
// Service Worker offline-first para Reloj Checador Lula Shop.
// Aumentar VERSION cuando se publique una nueva versión.
const VERSION = "v7";

const SHELL_CACHE = `checador-shell-${VERSION}`;
const ASSET_CACHE = `checador-assets-${VERSION}`;
const MISC_CACHE = `checador-misc-${VERSION}`;

const CORE_URLS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icon-512.png",
];

async function fetchWithTimeout(request, ms = 5000) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, ms);

  try {
    return await fetch(request, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Busca recursos en la caché actual y en versiones anteriores.
 * Así una actualización incompleta no deja al reloj sin archivos.
 */
async function matchFromCaches(
  prefix,
  request,
  fallbackPath,
) {
  const keys = await caches.keys();

  const matching = keys
    .filter((key) => key.startsWith(prefix))
    .reverse();

  for (const key of matching) {
    const cache = await caches.open(key);

    const cached =
      (await cache.match(request)) ||
      (fallbackPath ? await cache.match(fallbackPath) : null);

    if (cached) return cached;
  }

  return null;
}

/**
 * Guarda los archivos JS y CSS principales encontrados
 * en el HTML de inicio.
 */
async function cacheCoreAssets(htmlResponse) {
  try {
    const html = await htmlResponse.clone().text();

    const found = new Set();

    const pattern =
      /(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g;

    let match;

    while ((match = pattern.exec(html))) {
      try {
        const assetUrl = new URL(
          match[1],
          self.location.origin,
        );

        if (assetUrl.origin === self.location.origin) {
          found.add(assetUrl.href);
        }
      } catch {}
    }

    const cache = await caches.open(ASSET_CACHE);

    await Promise.all(
      [...found].map(async (url) => {
        try {
          const response = await fetchWithTimeout(
            url,
            7000,
          );

          if (response && response.ok) {
            await cache.put(url, response.clone());
          }
        } catch {
          // No cancelar toda la instalación por un recurso.
        }
      }),
    );
  } catch {
    // La precarga no debe bloquear la instalación.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);

      let homeResponse = null;

      await Promise.all(
        CORE_URLS.map(async (url) => {
          try {
            const response = await fetchWithTimeout(
              url,
              5000,
            );

            if (response && response.ok) {
              await shell.put(url, response.clone());

              if (url === "/") {
                homeResponse = response.clone();
              }
            }
          } catch {
            // La instalación continúa si falla una página.
          }
        }),
      );

      if (homeResponse) {
        await cacheCoreAssets(homeResponse);

        await self.skipWaiting();
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Conservamos cachés anteriores para evitar perder
      // recursos si la nueva instalación quedó incompleta.
      await self.clients.claim();

      const clients = await self.clients.matchAll({
        type: "window",
      });

      for (const client of clients) {
        client.postMessage({
          type: "SW_ACTIVATED",
        });
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) return;

  // NAVEGACIONES:
  // Primero caché local. Internet solo si no existe copia.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cached = await matchFromCaches(
          "checador-shell-",
          request,
          url.pathname,
        );

        if (cached) return cached;

        try {
          const fresh = await fetchWithTimeout(
            request,
            5000,
          );

          if (fresh && fresh.ok) {
            const cache = await caches.open(SHELL_CACHE);

            cache.put(request, fresh.clone()).catch(() => {});

            cache.put(
              url.pathname,
              fresh.clone(),
            ).catch(() => {});
          }

          return fresh;
        } catch {
          const home = await matchFromCaches(
            "checador-shell-",
            "/",
            "/",
          );

          if (home) return home;

          return new Response(
            "<!doctype html><html lang='es'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Reloj Checador</title><body style='font-family:sans-serif;text-align:center;padding:2rem'><h1>Reloj Checador</h1><p>Abre la aplicación una vez con Internet para guardar su instalación en este dispositivo.</p></body></html>",
            {
              status: 503,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
              },
            },
          );
        }
      })(),
    );

    return;
  }

  // ARCHIVOS JS, CSS, imágenes y recursos.
  // Si están guardados, no se vuelve a consultar Internet.
  const isAsset =
    url.pathname.startsWith("/assets/") ||
    /\.(js|css|mjs|woff2?|ttf|png|jpg|jpeg|svg|webp|ico|json|webmanifest)$/.test(
      url.pathname,
    );

  if (isAsset) {
    event.respondWith(
      (async () => {
        const cached = await matchFromCaches(
          "checador-assets-",
          request,
        );

        if (cached) return cached;

        try {
          const response = await fetchWithTimeout(
            request,
            7000,
          );

          if (response && response.ok) {
            const cache = await caches.open(ASSET_CACHE);

            cache.put(
              request,
              response.clone(),
            ).catch(() => {});
          }

          return response;
        } catch {
          return new Response("", {
            status: 504,
          });
        }
      })(),
    );

    return;
  }

  // OTROS RECURSOS:
  // Caché local primero.
  event.respondWith(
    (async () => {
      const cached = await matchFromCaches(
        "checador-misc-",
        request,
      );

      if (cached) return cached;

      try {
        const response = await fetchWithTimeout(
          request,
          5000,
        );

        if (response && response.ok) {
          const cache = await caches.open(MISC_CACHE);

          cache.put(
            request,
            response.clone(),
          ).catch(() => {});
        }

        return response;
      } catch {
        return new Response("", {
          status: 504,
        });
      }
    })(),
  );
});
