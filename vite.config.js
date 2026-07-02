import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Relative base so the build works on GitHub Pages project pages
// (https://<user>.github.io/<repo>/) without hardcoding the repo name.
export default defineConfig({
  base: './',
  plugins: [vue()],
})
