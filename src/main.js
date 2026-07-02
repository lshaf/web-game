import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { registerPwa } from './pwa.js'

createApp(App).mount('#app')

// Offline play + the menu's Update button.
registerPwa()
