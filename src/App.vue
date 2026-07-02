<script setup>
import { ref, computed } from 'vue'
import GameSelect from './components/GameSelect.vue'
import DinoGame from './games/DinoGame.vue'
import WordLock from './games/WordLock.vue'

// Registry of playable games. Add a new entry here + its component to expand.
const games = [
  {
    id: 'dino',
    title: 'Dino Jump',
    tagline: 'Leap the cacti. Survive as long as you can.',
    component: DinoGame,
  },
  {
    id: 'wordlock',
    title: 'Word Lock',
    tagline: 'Set a secret word. Lock in letters to crack it.',
    component: WordLock,
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--grape);
  border-bottom: var(--line) solid var(--ink);
  margin-bottom: 22px;
  /* Clear the status bar / notch in standalone mode and any side cutouts. */
  padding: calc(14px + env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) 14px
    max(18px, env(safe-area-inset-left));
}

.back {
  font-family: var(--font-body);
  font-weight: 700;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 999px;
  padding: 8px 16px;
  box-shadow: var(--pop-sm);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.back:hover,
.back:focus-visible {
  transform: translate(-2px, -2px);
  box-shadow: 5px 5px 0 var(--ink);
}

.back:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--ink);
}

.play-title {
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--cream);
  letter-spacing: 0.02em;
}

.spacer {
  width: 96px;
}
</style>
