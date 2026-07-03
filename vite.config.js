import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

// Served from the domain root (custom domain / user page), so the base is "/".
// History-mode routing and deep-link asset URLs (/assets/...) resolve from root.
export default defineConfig({
  base: '/',
  plugins: [vue()],
  // Surface the package version to the app so the menu can print the build.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
