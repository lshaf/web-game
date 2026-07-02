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

function markReady(worker) {
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
