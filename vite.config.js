import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

// Stamp the service worker's cache name with the app version at build time.
// public/sw.js ships a __SW_VERSION__ placeholder; replacing it after the build
// means every release names a fresh cache, so returning installs see a
// byte-changed worker that waits (no skipWaiting) until the player taps the
// in-app Update button. Runs only on `vite build`; dev never registers the SW.
function stampServiceWorker(version) {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    closeBundle() {
      const swPath = new URL('./dist/sw.js', import.meta.url)
      const src = readFileSync(swPath, 'utf8').replace(/__SW_VERSION__/g, version)
      writeFileSync(swPath, src)
    },
  }
}

// Served from the domain root (custom domain / user page), so the base is "/".
// History-mode routing and deep-link asset URLs (/assets/...) resolve from root.
export default defineConfig({
  base: '/',
  plugins: [vue(), stampServiceWorker(pkg.version)],
  // Surface the package version to the app so the menu can print the build.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
