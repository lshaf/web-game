// Dusk Arcade service worker — runtime caching so the arcade opens offline
// after the first visit. No build step involved: assets are cached as they are
// requested, so Vite's hashed filenames are handled without knowing them ahead
// of time. CACHE is stamped with the app version at build time (see the
// stamp-service-worker plugin in vite.config.js): every release names a fresh
// cache, so the old one is dropped on activate and the byte-changed worker
// lights up the in-app "Update" button — we never skipWaiting on our own.
const CACHE = 'dusk-arcade-v__SW_VERSION__'

// The minimum needed to cold-boot offline. Kept tiny on purpose — everything
// else is cached on demand below.
const APP_SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  // Note: no skipWaiting() here — a new worker waits until the player taps
  // "Update" (see the message handler), so we never swap builds mid-game.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)))
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  // Page loads: network-first so a fresh deploy is picked up, falling back to
  // the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    )
    return
  }

  // Assets and fonts (hashed JS/CSS, Google Fonts): stale-while-revalidate —
  // serve the cached copy instantly, refresh it in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
