<script setup>
import { ref, computed } from 'vue'
import GameSelect from './components/GameSelect.vue'
import DinoGame from './games/DinoGame.vue'

// Registry of playable games. Add a new entry here + its component to expand.
const games = [
  {
    id: 'dino',
    title: 'Dino Jump',
    tagline: 'Leap the cacti. Survive as long as you can.',
    component: DinoGame,
  },
]

const selectedId = ref(null)

const currentGame = computed(() =>
  games.find((g) => g.id === selectedId.value) || null,
)

function selectGame(id) {
  selectedId.value = id
}

function backToMenu() {
  selectedId.value = null
}
</script>

<template>
  <GameSelect v-if="!currentGame" :games="games" @select="selectGame" />
  <div v-else class="play-view">
    <header class="play-bar">
      <button class="back" @click="backToMenu">← Games</button>
      <span class="play-title">{{ currentGame.title }}</span>
      <span class="spacer" />
    </header>
    <component :is="currentGame.component" />
  </div>
</template>

<style scoped>
.play-view {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.play-bar {
  width: 100%;
  max-width: 900px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* Clear the status bar / notch in standalone mode and any side cutouts. */
  padding: calc(16px + env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) 16px
    max(20px, env(safe-area-inset-left));
}

.back {
  background: var(--bg-soft);
  color: var(--fg);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 8px 14px;
  transition: transform 0.12s ease, background 0.12s ease;
}

.back:hover {
  transform: translateX(-2px);
  background: #22264180;
}

.play-title {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.spacer {
  width: 78px;
}
</style>
