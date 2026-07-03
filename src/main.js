import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import './styles.css'
import { registerPwa } from './pwa.js'

createApp(App).use(router).mount('#app')

// Offline play + the menu's Update button.
registerPwa()
