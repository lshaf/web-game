// PWA glue: service-worker registration + an update signal the UI can bind to.
//
// The service worker (public/sw.js) intentionally does NOT skipWaiting on its
// own, so a freshly deployed build sits in "waiting" until the player taps the
// Update button — no swapping the app out from under an in-progress game.
import { ref } from 'vue'

// Injected by Vite's `define` (see vite.config.js).
export const appVersion = __APP_VERSION__

// True once a new build has installed and is waiting to take over.
export const updateReady = ref(false)

let waitingWorker = null
let updating = false // set only when the player asked to update
let refreshing = false

// ---- Add-to-home-screen install prompt ----
// Chromium fires beforeinstallprompt when the PWA is installable; stash it so
// the menu can offer a real install button (iOS Safari has no such API, so the
// button simply never appears there).
export const canInstall = ref(false)
let deferredPrompt = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    canInstall.value = true
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    canInstall.value = false
  })
}

// Show the browser's install dialog on demand, then forget the one-shot prompt.
export async function installApp() {
  if (!deferredPrompt) return
  deferredPrompt.prompt()
  try {
    await deferredPrompt.userChoice
  } catch (e) {
    /* dismissed; ignore */
  }
  deferredPrompt = null
  canInstall.value = false
}

// Ask a worker which build it is (sw.js answers GET_VERSION). Resolves null if
// it never replies (e.g. an older worker that predates this handshake).
function workerVersion(worker) {
  return new Promise((resolve) => {
    const ch = new MessageChannel()
    const done = setTimeout(() => resolve(null), 2000)
    ch.port1.onmessage = (e) => {
      clearTimeout(done)
      resolve(e.data)
    }
    try {
      worker.postMessage({ type: 'GET_VERSION' }, [ch.port2])
    } catch {
      clearTimeout(done)
      resolve(null)
    }
  })
}

// A freshly installed worker only means "update available" when it is a
// DIFFERENT build than the one already running. Navigations are network-first,
// so an online reload pulls the newest files even under the old worker — which
// leaves the waiting worker on the SAME version the player already sees. In
// that case promote it quietly (it cleans old caches on activate, and `updating`
// stays false so there's no reload) instead of nagging them to "update" to what
// they're already running.
async function markReady(worker) {
  const ver = await workerVersion(worker)
  if (ver && ver === appVersion) {
    worker.postMessage({ type: 'SKIP_WAITING' })
    return
  }
  waitingWorker = worker
  updateReady.value = true
}

export function registerPwa() {
  if (!('serviceWorker' in navigator)) return

  // Reload only when the update was user-initiated — not on the first
  // controller claim of a first-ever visit.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating && !refreshing) {
      refreshing = true
      window.location.reload()
    }
  })

  // The runtime cache would fight Vite's dev server, so register in prod only.
  if (!import.meta.env.PROD) return

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)

      // A build that finished installing on a previous visit.
      if (reg.waiting && navigator.serviceWorker.controller) markReady(reg.waiting)

      reg.addEventListener('updatefound', () => {
        const next = reg.installing
        if (!next) return
        next.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) markReady(next)
        })
      })
    } catch {
      /* offline support is a progressive enhancement; ignore failures */
    }
  })
}

// Tapping Update: hand control to a waiting build if there is one, otherwise
// re-check and reload to pull the freshest files from the network.
export async function applyUpdate() {
  if (waitingWorker) {
    updating = true
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    return
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.()
    await reg?.update?.()
  } catch {
    /* ignore — the reload below still fetches fresh HTML */
  }
  window.location.reload()
}
