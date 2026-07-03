<script setup>
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { findGame } from '../games.js'
import { muted, toggleMute } from '../sound.js'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const game = computed(() => findGame(props.id))

// An unknown /play/:id (bad bookmark, removed game) drops back to the menu.
watch(
  game,
  (g) => {
    if (!g) router.replace({ name: 'menu' })
  },
  { immediate: true },
)

function backToMenu() {
  router.push({ name: 'menu' })
}
</script>

<template>
  <div v-if="game" class="play-view">
    <header class="play-bar">
      <button class="back" @click="backToMenu">← Games</button>
      <span class="play-title">{{ game.title }}</span>
      <button
        class="sound"
        type="button"
        :aria-pressed="muted"
        :title="muted ? 'Sound off — tap to unmute' : 'Sound on — tap to mute'"
        @click="toggleMute"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 9v6h4l5 4V5L8 9H4z"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <g v-if="!muted" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M16 9.5a4 4 0 0 1 0 5" />
            <path d="M18.5 7a7 7 0 0 1 0 10" />
          </g>
          <line
            v-else
            x1="16"
            y1="8"
            x2="22"
            y2="16"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </header>
    <component :is="game.component" v-bind="game.props || {}" :key="game.id" />
  </div>
</template>

<style scoped>
.play-view {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* On mobile the play view is exactly one screen tall (a definite height), so a
   full-height game fills it and its overflow is clipped rather than growing the
   page. */
@media (max-width: 560px) {
  .play-view {
    height: 100vh;
    height: 100dvh;
  }
}

.play-bar {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  background: var(--grape);
  border-bottom: var(--line) solid var(--ink);
  margin-bottom: 22px;
  /* Clear the status bar / notch in standalone mode and any side cutouts. */
  padding: calc(14px + env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) 14px
    max(18px, env(safe-area-inset-left));
}

.back {
  justify-self: start;
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
  justify-self: center;
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--cream);
  letter-spacing: 0.02em;
}

.sound {
  justify-self: end;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 999px;
  box-shadow: var(--pop-sm);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.sound svg {
  width: 20px;
  height: 20px;
}
.sound:hover,
.sound:focus-visible {
  transform: translate(-2px, -2px);
  box-shadow: 5px 5px 0 var(--ink);
}
.sound:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--ink);
}
.sound[aria-pressed='true'] {
  color: var(--muted);
  background: #eadff5;
}
</style>
