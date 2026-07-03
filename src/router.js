import { createRouter, createWebHistory } from 'vue-router'
import MenuView from './views/MenuView.vue'
import PlayView from './views/PlayView.vue'

// Clean (history) URLs from root: /play/dino. GitHub Pages has no server-side
// rewrites, so the deploy also ships a 404.html copy of index.html and the
// service worker falls back to the cached shell — both send unknown paths back
// into the SPA, where the router resolves them.
const routes = [
  { path: '/', name: 'menu', component: MenuView },
  { path: '/play/:id', name: 'play', component: PlayView, props: true },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
