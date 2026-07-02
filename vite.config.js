import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

// Relative base so the build works on GitHub Pages project pages
// (https://<user>.github.io/<repo>/) without hardcoding the repo name.
export default defineConfig({
  base: './',
  plugins: [vue()],
  // Surface the package version to the app so the menu can print the build.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
