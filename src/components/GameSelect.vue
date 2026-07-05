<script setup>
import { ref, computed } from 'vue'
import DinoSprite from './DinoSprite.vue'
import BirdSprite from './BirdSprite.vue'
import { appVersion, updateReady, applyUpdate, canInstall, installApp } from '../pwa.js'

const props = defineProps({
  games: { type: Array, required: true },
})
defineEmits(['select'])

// Filter chips: All / Favorites / the four categories / Duo. One active at a time.
const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'fav', label: '★ Favorit' },
  { key: 'aksi', label: 'Aksi' },
  { key: 'kata', label: 'Kata' },
  { key: 'strategi', label: 'Strategi' },
  { key: 'puzzle', label: 'Puzzle' },
  { key: 'duo', label: 'Duo' },
]
const filter = ref('all')

function matches(g, key) {
  if (key === 'all') return true
  if (key === 'fav') return favorites.value.has(g.id)
  if (key === 'duo') return !!g.duo
  return g.category === key
}
function count(key) {
  return props.games.reduce((n, g) => n + (matches(g, key) ? 1 : 0), 0)
}

// Favorites live in localStorage; in the "Semua" view they pin to the front.
const favKey = 'dusk-favorites'
function loadFavs() {
  try {
    return new Set(JSON.parse(localStorage.getItem(favKey) || '[]'))
  } catch (e) {
    return new Set()
  }
}
const favorites = ref(loadFavs())
function isFav(id) {
  return favorites.value.has(id)
}
function toggleFav(id) {
  const next = new Set(favorites.value)
  next.has(id) ? next.delete(id) : next.add(id)
  favorites.value = next
  try {
    localStorage.setItem(favKey, JSON.stringify([...next]))
  } catch (e) {
    /* storage blocked; keep the in-memory set */
  }
}

const shown = computed(() => {
  const list = props.games.filter((g) => matches(g, filter.value))
  if (filter.value !== 'all') return list
  // Pin favorites to the front; registry order is preserved otherwise
  // (Array.prototype.sort is stable).
  return [...list].sort((a, b) => Number(isFav(b.id)) - Number(isFav(a.id)))
})

// Share the arcade — Web Share where available, else copy the link.
const shared = ref(false)
async function share() {
  const data = { title: 'Dusk Arcade', text: 'Main mini-games seru di Dusk Arcade!', url: location.href }
  try {
    if (navigator.share) {
      await navigator.share(data)
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(location.href)
      shared.value = true
      setTimeout(() => (shared.value = false), 1500)
    }
  } catch (e) {
    /* user cancelled or blocked; ignore */
  }
}
</script>

<template>
  <div class="select">
    <!-- Hero: the arcade sign over a sunny cartoon sky. -->
    <header class="hero sky">
      <span class="cloud cloud--a" aria-hidden="true" />
      <span class="cloud cloud--b" aria-hidden="true" />

      <h1 class="hero__title">
        <span class="hero__title-a">DUSK</span><span class="hero__title-b">ARCADE</span>
      </h1>

      <svg class="sun-face" viewBox="0 0 120 120" aria-hidden="true">
        <g class="sun-face__rays">
          <polygon points="54,25 66,25 60,11" transform="rotate(0 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(45 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(90 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(135 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(180 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(225 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(270 60 60)" />
          <polygon points="54,25 66,25 60,11" transform="rotate(315 60 60)" />
        </g>
        <circle class="sun-face__disc" cx="60" cy="60" r="33" />
        <circle class="sun-face__cheek" cx="45" cy="67" r="4.5" />
        <circle class="sun-face__cheek" cx="75" cy="67" r="4.5" />
        <circle class="sun-face__eye" cx="51" cy="57" r="4" />
        <circle class="sun-face__eye" cx="69" cy="57" r="4" />
        <path class="sun-face__smile" d="M49 66 Q60 79 71 66" />
      </svg>

      <div class="hero__ground" aria-hidden="true" />
      <div class="hero__runner" aria-hidden="true"><DinoSprite run /></div>
    </header>

    <div class="filters" aria-label="Filter game">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        class="chip"
        :class="{ 'is-on': filter === f.key }"
        type="button"
        @click="filter = f.key"
      >
        {{ f.label }}<span class="chip__n">{{ count(f.key) }}</span>
      </button>
    </div>

    <ul class="cabinets">
      <li v-for="game in shown" :key="game.id">
        <button class="cabinet" @click="$emit('select', game.id)">
          <span class="cabinet__art" :class="'cabinet__art--' + game.id">
            <span v-if="game.id === 'wordlock'" class="cabinet__icon cabinet__tiles" aria-hidden="true">
              <i class="t-correct">W</i><i class="t-present">O</i><i class="t-plain">R</i><i class="t-correct">D</i>
            </span>
            <span v-else-if="game.id === 'flappy'" class="cabinet__icon cabinet__flappy" aria-hidden="true">
              <i class="cabinet__pipe cabinet__pipe--top" />
              <i class="cabinet__pipe cabinet__pipe--bot" />
              <span class="cabinet__bird"><BirdSprite /></span>
            </span>
            <span v-else-if="game.id === 'acakkata'" class="cabinet__icon cabinet__scramble" aria-hidden="true">
              <i>A</i><i>C</i><i>A</i><i>K</i>
            </span>
            <span v-else-if="game.id === 'hangman'" class="cabinet__icon cabinet__gallows" aria-hidden="true">
              <svg viewBox="0 0 48 46">
                <g fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round">
                  <line x1="6" y1="42" x2="26" y2="42" />
                  <line x1="12" y1="42" x2="12" y2="6" />
                  <line x1="10.5" y1="6" x2="34" y2="6" />
                  <line x1="34" y1="6" x2="34" y2="12" stroke-width="2.4" />
                </g>
                <circle cx="34" cy="18" r="5.5" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.6" />
                <line x1="34" y1="23.5" x2="34" y2="34" stroke="var(--ink)" stroke-width="2.6" stroke-linecap="round" />
              </svg>
            </span>
            <span v-else-if="game.id === 'tebakwarna'" class="cabinet__icon cabinet__warna" aria-hidden="true">
              <i style="background: #ff3b3b" />
              <i style="background: #ffd23f" />
              <i style="background: #43c96b" />
              <i style="background: #4aa3ff" />
              <i style="background: #7b5be6" />
            </span>
            <span v-else-if="game.id === 'armada'" class="cabinet__icon cabinet__armada" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="3" y="3" width="40" height="40" rx="7" fill="#3f78e0" stroke="var(--ink)" stroke-width="2.6" />
                <rect x="9" y="26" width="28" height="9" rx="3" fill="var(--grape)" stroke="var(--ink)" stroke-width="2" />
                <circle cx="15" cy="14" r="4.6" fill="var(--berry)" stroke="var(--ink)" stroke-width="1.8" />
                <circle cx="31" cy="14" r="2.4" fill="var(--cream)" />
              </svg>
            </span>
            <span v-else-if="game.id === 'ular'" class="cabinet__icon cabinet__ular" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="3" y="3" width="40" height="40" rx="7" fill="#ffe7b0" stroke="var(--ink)" stroke-width="2.6" />
                <g stroke="var(--ink)" stroke-width="3.4" stroke-linecap="round">
                  <line x1="12" y1="40" x2="18" y2="7" />
                  <line x1="19" y1="40" x2="25" y2="7" />
                </g>
                <g stroke="#d98a3d" stroke-width="1.9" stroke-linecap="round">
                  <line x1="12" y1="40" x2="18" y2="7" />
                  <line x1="19" y1="40" x2="25" y2="7" />
                </g>
                <g stroke="#e8a24e" stroke-width="1.5" stroke-linecap="round">
                  <line x1="14" y1="32" x2="20.5" y2="32" />
                  <line x1="15.3" y1="23" x2="21.8" y2="23" />
                  <line x1="16.6" y1="14" x2="23.1" y2="14" />
                </g>
                <path d="M34 8 q-8 6 0 12 q8 6 0 12" fill="none" stroke="var(--ink)" stroke-width="4.6" stroke-linecap="round" />
                <path d="M34 8 q-8 6 0 12 q8 6 0 12" fill="none" stroke="var(--berry)" stroke-width="3" stroke-linecap="round" />
                <circle cx="34" cy="8" r="3.2" fill="var(--berry)" stroke="var(--ink)" stroke-width="1.4" />
                <circle cx="32.8" cy="7.4" r="0.7" fill="var(--ink)" />
                <circle cx="35.2" cy="7.4" r="0.7" fill="var(--ink)" />
              </svg>
            </span>
            <span v-else-if="game.id === 'ingatan'" class="cabinet__icon cabinet__mem" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="3" y="3" width="18" height="18" rx="4" fill="var(--grape)" stroke="var(--ink)" stroke-width="2.4" />
                <rect x="25" y="3" width="18" height="18" rx="4" fill="var(--grape)" stroke="var(--ink)" stroke-width="2.4" />
                <rect x="3" y="25" width="18" height="18" rx="4" fill="var(--grape)" stroke="var(--ink)" stroke-width="2.4" />
                <rect x="25" y="25" width="18" height="18" rx="4" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.4" />
                <circle cx="34" cy="34" r="4.6" fill="var(--berry)" stroke="var(--ink)" stroke-width="1.8" />
              </svg>
            </span>
            <span v-else-if="game.id === 'connect4'" class="cabinet__icon cabinet__c4" aria-hidden="true">
              <svg viewBox="0 0 48 44">
                <rect x="4" y="6" width="40" height="34" rx="6" fill="#3f78e0" stroke="var(--ink)" stroke-width="2.6" />
                <circle cx="14" cy="16" r="4.2" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
                <circle cx="24" cy="16" r="4.2" fill="var(--berry)" stroke="var(--ink)" stroke-width="1.6" />
                <circle cx="34" cy="16" r="4.2" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
                <circle cx="14" cy="30" r="4.2" fill="var(--sun)" stroke="var(--ink)" stroke-width="1.6" />
                <circle cx="24" cy="30" r="4.2" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
                <circle cx="34" cy="30" r="4.2" fill="var(--berry)" stroke="var(--ink)" stroke-width="1.6" />
              </svg>
            </span>
            <span v-else-if="game.id === 'tictactoe'" class="cabinet__icon cabinet__ttt" aria-hidden="true">
              <svg viewBox="0 0 48 48">
                <g stroke="var(--ink)" stroke-width="2.6" stroke-linecap="round">
                  <line x1="17" y1="5" x2="17" y2="43" />
                  <line x1="31" y1="5" x2="31" y2="43" />
                  <line x1="5" y1="17" x2="43" y2="17" />
                  <line x1="5" y1="31" x2="43" y2="31" />
                </g>
                <g stroke="var(--berry)" stroke-width="3.4" stroke-linecap="round">
                  <line x1="7" y1="7" x2="15" y2="15" />
                  <line x1="15" y1="7" x2="7" y2="15" />
                </g>
                <circle cx="24" cy="24" r="5" fill="none" stroke="var(--aqua-deep)" stroke-width="3.4" />
                <g stroke="var(--berry)" stroke-width="3.4" stroke-linecap="round">
                  <line x1="33" y1="33" x2="41" y2="41" />
                  <line x1="41" y1="33" x2="33" y2="41" />
                </g>
              </svg>
            </span>
            <span v-else-if="game.id === 'tikus'" class="cabinet__icon cabinet__tikus" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <ellipse cx="23" cy="35" rx="18" ry="7.5" fill="var(--ink)" />
                <ellipse cx="23" cy="22" rx="13" ry="12" fill="#9b5b3a" stroke="var(--ink)" stroke-width="2.4" />
                <ellipse cx="23" cy="26" rx="7" ry="5" fill="#d9a679" stroke="var(--ink)" stroke-width="1.8" />
                <circle cx="18" cy="18" r="3.4" fill="#fff" stroke="var(--ink)" stroke-width="1.5" />
                <circle cx="28" cy="18" r="3.4" fill="#fff" stroke="var(--ink)" stroke-width="1.5" />
                <circle cx="18.4" cy="18.8" r="1.5" fill="var(--ink)" />
                <circle cx="27.6" cy="18.8" r="1.5" fill="var(--ink)" />
                <ellipse cx="23" cy="24" rx="2.2" ry="1.7" fill="var(--berry)" stroke="var(--ink)" stroke-width="1.1" />
              </svg>
            </span>
            <span v-else-if="game.id === 'sudoku'" class="cabinet__icon cabinet__sudoku" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="4" y="4" width="38" height="38" rx="5" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
                <g stroke="var(--ink)" stroke-width="2.2">
                  <line x1="17" y1="5" x2="17" y2="41" />
                  <line x1="29" y1="5" x2="29" y2="41" />
                  <line x1="5" y1="17" x2="41" y2="17" />
                  <line x1="5" y1="29" x2="41" y2="29" />
                </g>
                <text x="8.5" y="15" font-family="monospace" font-size="11" font-weight="700" fill="var(--aqua-deep)">5</text>
                <text x="20.5" y="27" font-family="monospace" font-size="11" font-weight="700" fill="var(--berry)">3</text>
                <text x="32.5" y="39" font-family="monospace" font-size="11" font-weight="700" fill="var(--aqua-deep)">7</text>
              </svg>
            </span>
            <span v-else-if="game.id === 'breaker'" class="cabinet__icon cabinet__breaker" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <g stroke="var(--ink)" stroke-width="1.8">
                  <rect x="5" y="6" width="10" height="6" rx="1.5" fill="var(--berry)" />
                  <rect x="17" y="6" width="10" height="6" rx="1.5" fill="var(--sun)" />
                  <rect x="29" y="6" width="10" height="6" rx="1.5" fill="var(--aqua)" />
                  <rect x="11" y="14" width="10" height="6" rx="1.5" fill="var(--grape)" />
                  <rect x="23" y="14" width="10" height="6" rx="1.5" fill="var(--sun-core)" />
                </g>
                <circle cx="24" cy="30" r="4" fill="var(--cream)" stroke="var(--ink)" stroke-width="2" />
                <rect x="14" y="37" width="18" height="5" rx="2.5" fill="var(--grape)" stroke="var(--ink)" stroke-width="2" />
              </svg>
            </span>
            <span v-else-if="game.id === 'ranjau'" class="cabinet__icon cabinet__ranjau" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="6" y="6" width="34" height="34" rx="6" fill="var(--paper-lit)" stroke="var(--ink)" stroke-width="2.6" />
                <g stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round">
                  <line x1="23" y1="12" x2="23" y2="34" />
                  <line x1="12" y1="23" x2="34" y2="23" />
                  <line x1="15.5" y1="15.5" x2="30.5" y2="30.5" />
                  <line x1="30.5" y1="15.5" x2="15.5" y2="30.5" />
                </g>
                <circle cx="23" cy="23" r="8" fill="var(--ink)" />
                <circle cx="20" cy="20" r="2" fill="var(--cream)" />
              </svg>
            </span>
            <span v-else-if="game.id === 'tetris'" class="cabinet__icon cabinet__tetris" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <g stroke="var(--ink)" stroke-width="2.2">
                  <rect x="8" y="13" width="10" height="10" rx="1.5" fill="var(--grape)" />
                  <rect x="18" y="13" width="10" height="10" rx="1.5" fill="var(--grape)" />
                  <rect x="28" y="13" width="10" height="10" rx="1.5" fill="var(--grape)" />
                  <rect x="18" y="23" width="10" height="10" rx="1.5" fill="var(--sun)" />
                </g>
              </svg>
            </span>
            <span v-else-if="game.id === 'carikata'" class="cabinet__icon cabinet__cari" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="4" y="4" width="38" height="38" rx="6" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
                <text x="9" y="17" font-family="monospace" font-size="9" font-weight="700" fill="var(--muted)">K A T</text>
                <text x="9" y="29" font-family="monospace" font-size="9" font-weight="700" fill="var(--aqua-deep)">C A R</text>
                <circle cx="30" cy="30" r="7" fill="none" stroke="var(--ink)" stroke-width="2.6" />
                <line x1="35" y1="35" x2="41" y2="41" stroke="var(--ink)" stroke-width="3.2" stroke-linecap="round" />
              </svg>
            </span>
            <span v-else-if="game.id === 'otello'" class="cabinet__icon cabinet__otello" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="4" y="4" width="38" height="38" rx="6" fill="#4f9d54" stroke="var(--ink)" stroke-width="2.6" />
                <circle cx="16" cy="16" r="6.5" fill="var(--ink)" />
                <circle cx="30" cy="16" r="6.5" fill="var(--cream)" stroke="var(--ink)" stroke-width="2" />
                <circle cx="16" cy="30" r="6.5" fill="var(--cream)" stroke="var(--ink)" stroke-width="2" />
                <circle cx="30" cy="30" r="6.5" fill="var(--ink)" />
              </svg>
            </span>
            <span v-else-if="game.id === 'dakon'" class="cabinet__icon cabinet__dakon" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="3" y="12" width="40" height="22" rx="11" fill="#c98a4e" stroke="var(--ink)" stroke-width="2.6" />
                <circle cx="15" cy="23" r="5.2" fill="#7c4e26" stroke="var(--ink)" stroke-width="1.8" />
                <circle cx="26" cy="23" r="5.2" fill="#7c4e26" stroke="var(--ink)" stroke-width="1.8" />
                <ellipse cx="37" cy="23" rx="4" ry="8" fill="#7c4e26" stroke="var(--ink)" stroke-width="1.8" />
                <circle cx="13.5" cy="22" r="1.5" fill="var(--sun)" />
                <circle cx="16.5" cy="24.5" r="1.5" fill="var(--berry)" />
                <circle cx="24.5" cy="22" r="1.5" fill="var(--aqua)" />
                <circle cx="27.5" cy="24.5" r="1.5" fill="var(--sun)" />
              </svg>
            </span>
            <span v-else-if="game.id === 'dam'" class="cabinet__icon cabinet__dam" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <defs>
                  <clipPath id="dam-board"><rect x="3" y="3" width="40" height="40" rx="7" /></clipPath>
                </defs>
                <g clip-path="url(#dam-board)">
                  <rect x="3" y="3" width="40" height="40" fill="#ffe9c9" />
                  <g fill="#c98a4e">
                    <rect x="3" y="3" width="10" height="10" />
                    <rect x="23" y="3" width="10" height="10" />
                    <rect x="13" y="13" width="10" height="10" />
                    <rect x="33" y="13" width="10" height="10" />
                    <rect x="3" y="23" width="10" height="10" />
                    <rect x="23" y="23" width="10" height="10" />
                    <rect x="13" y="33" width="10" height="10" />
                    <rect x="33" y="33" width="10" height="10" />
                  </g>
                </g>
                <rect x="3" y="3" width="40" height="40" rx="7" fill="none" stroke="var(--ink)" stroke-width="2.6" />
                <circle cx="14" cy="32" r="6.3" fill="var(--cream)" stroke="var(--ink)" stroke-width="2" />
                <circle cx="30" cy="16" r="6.3" fill="var(--berry)" stroke="var(--ink)" stroke-width="2" />
                <path d="M26 17 L26 13.4 L28.3 15 L30 11.8 L31.7 15 L34 13.4 L34 17 Z"
                  fill="var(--sun)" stroke="var(--ink)" stroke-width="1.3" stroke-linejoin="round" />
              </svg>
            </span>
            <span v-else-if="game.id === 'gomoku'" class="cabinet__icon cabinet__gomoku" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="3" y="3" width="40" height="40" rx="6" fill="#e3b579" stroke="var(--ink)" stroke-width="2.6" />
                <g stroke="var(--ink)" stroke-width="1.6" opacity="0.65">
                  <line x1="15" y1="6" x2="15" y2="40" />
                  <line x1="23" y1="6" x2="23" y2="40" />
                  <line x1="31" y1="6" x2="31" y2="40" />
                  <line x1="6" y1="15" x2="40" y2="15" />
                  <line x1="6" y1="23" x2="40" y2="23" />
                  <line x1="6" y1="31" x2="40" y2="31" />
                </g>
                <circle cx="15" cy="15" r="4.4" fill="#241030" stroke="var(--ink)" stroke-width="1.6" />
                <circle cx="23" cy="23" r="4.4" fill="#241030" stroke="var(--ink)" stroke-width="1.6" />
                <circle cx="31" cy="31" r="4.4" fill="#241030" stroke="var(--ink)" stroke-width="1.6" />
                <circle cx="31" cy="15" r="4.4" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
                <circle cx="15" cy="31" r="4.4" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
              </svg>
            </span>
            <span v-else-if="game.id === '2048'" class="cabinet__icon cabinet__2048" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="4" y="5" width="38" height="15" rx="4" fill="var(--berry)" stroke="var(--ink)" stroke-width="2.4" />
                <text x="23" y="16" text-anchor="middle" font-family="monospace" font-size="9.5" font-weight="700" fill="var(--cream)">2048</text>
                <rect x="5" y="25" width="11" height="16" rx="3" fill="var(--paper-lit)" stroke="var(--ink)" stroke-width="2.2" />
                <rect x="18" y="25" width="11" height="16" rx="3" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.2" />
                <rect x="31" y="25" width="11" height="16" rx="3" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2.2" />
                <text x="10.5" y="37" text-anchor="middle" font-family="monospace" font-size="9" font-weight="700" fill="var(--ink)">2</text>
                <text x="23.5" y="37" text-anchor="middle" font-family="monospace" font-size="9" font-weight="700" fill="var(--ink)">4</text>
                <text x="36.5" y="37" text-anchor="middle" font-family="monospace" font-size="9" font-weight="700" fill="var(--ink)">8</text>
              </svg>
            </span>
            <span v-else-if="game.id === 'geser'" class="cabinet__icon cabinet__geser" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="4" y="4" width="38" height="38" rx="6" fill="var(--paper-lit)" stroke="var(--ink)" stroke-width="2.6" />
                <rect x="25" y="25" width="14" height="14" rx="3" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="3 2.5" opacity="0.55" />
                <g font-family="monospace" font-weight="700" font-size="10" text-anchor="middle">
                  <rect x="7" y="7" width="14" height="14" rx="3" fill="var(--cream)" stroke="var(--ink)" stroke-width="2" />
                  <text x="14" y="18.5" fill="var(--ink)">1</text>
                  <rect x="25" y="7" width="14" height="14" rx="3" fill="var(--sun)" stroke="var(--ink)" stroke-width="2" />
                  <text x="32" y="18.5" fill="var(--ink)">2</text>
                  <rect x="7" y="25" width="14" height="14" rx="3" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2" />
                  <text x="14" y="36.5" fill="var(--ink)">3</text>
                </g>
              </svg>
            </span>
            <span v-else-if="game.id === 'gaple'" class="cabinet__icon cabinet__gaple" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <g transform="rotate(-16 21 16)">
                  <rect x="5" y="8" width="28" height="14" rx="3" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.6" />
                  <line x1="19" y1="8" x2="19" y2="22" stroke="var(--ink)" stroke-width="2" />
                  <circle cx="12" cy="15" r="1.7" fill="var(--ink)" />
                  <circle cx="24" cy="12" r="1.7" fill="var(--ink)" />
                  <circle cx="28" cy="18" r="1.7" fill="var(--ink)" />
                </g>
                <g transform="rotate(11 25 30)">
                  <rect x="11" y="23" width="31" height="15" rx="3" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
                  <line x1="26.5" y1="23" x2="26.5" y2="38" stroke="var(--ink)" stroke-width="2" />
                  <circle cx="15" cy="27" r="1.8" fill="var(--berry)" />
                  <circle cx="18.7" cy="30.5" r="1.8" fill="var(--berry)" />
                  <circle cx="22.4" cy="34" r="1.8" fill="var(--berry)" />
                  <circle cx="31" cy="27" r="1.8" fill="var(--aqua-deep)" />
                  <circle cx="37.5" cy="34" r="1.8" fill="var(--aqua-deep)" />
                </g>
              </svg>
            </span>
            <span v-else-if="game.id === 'lampu'" class="cabinet__icon cabinet__lampu" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="5" y="5" width="36" height="36" rx="6" fill="#241033" stroke="var(--ink)" stroke-width="2.6" />
                <g stroke="var(--ink)" stroke-width="1.8">
                  <rect x="9" y="9" width="12" height="12" rx="3" fill="var(--sun)" />
                  <rect x="25" y="9" width="12" height="12" rx="3" fill="#402457" />
                  <rect x="9" y="25" width="12" height="12" rx="3" fill="#402457" />
                  <rect x="25" y="25" width="12" height="12" rx="3" fill="var(--sun-core)" />
                </g>
                <circle cx="15" cy="15" r="2.6" fill="#fff5dc" />
                <circle cx="31" cy="31" r="2.6" fill="#fff5dc" />
              </svg>
            </span>
            <span v-else-if="game.id === 'tirukan'" class="cabinet__icon cabinet__tirukan" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <g stroke="var(--ink)" stroke-width="2.6">
                  <rect x="5" y="5" width="16.5" height="16.5" rx="4" fill="var(--aqua)" opacity="0.5" />
                  <rect x="24.5" y="5" width="16.5" height="16.5" rx="4" fill="var(--berry)" />
                  <rect x="5" y="24.5" width="16.5" height="16.5" rx="4" fill="var(--sun)" opacity="0.5" />
                  <rect x="24.5" y="24.5" width="16.5" height="16.5" rx="4" fill="var(--grape)" opacity="0.5" />
                </g>
                <circle cx="32.75" cy="13.25" r="3.4" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
              </svg>
            </span>
            <span v-else-if="game.id === 'flood'" class="cabinet__icon cabinet__flood" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="3" y="3" width="40" height="40" rx="7" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
                <g stroke="var(--ink)" stroke-width="1.1">
                  <rect x="9" y="9" width="6.5" height="6.5" rx="1.6" fill="var(--aqua)" />
                  <rect x="16.6" y="9" width="6.5" height="6.5" rx="1.6" fill="var(--aqua)" />
                  <rect x="24.2" y="9" width="6.5" height="6.5" rx="1.6" fill="var(--berry)" />
                  <rect x="31.8" y="9" width="6.5" height="6.5" rx="1.6" fill="var(--sun)" />
                  <rect x="9" y="16.6" width="6.5" height="6.5" rx="1.6" fill="var(--aqua)" />
                  <rect x="16.6" y="16.6" width="6.5" height="6.5" rx="1.6" fill="var(--aqua)" />
                  <rect x="24.2" y="16.6" width="6.5" height="6.5" rx="1.6" fill="var(--grape)" />
                  <rect x="31.8" y="16.6" width="6.5" height="6.5" rx="1.6" fill="var(--sun-core)" />
                  <rect x="9" y="24.2" width="6.5" height="6.5" rx="1.6" fill="var(--sun-core)" />
                  <rect x="16.6" y="24.2" width="6.5" height="6.5" rx="1.6" fill="var(--grape)" />
                  <rect x="24.2" y="24.2" width="6.5" height="6.5" rx="1.6" fill="var(--sun)" />
                  <rect x="31.8" y="24.2" width="6.5" height="6.5" rx="1.6" fill="var(--aqua-deep)" />
                  <rect x="9" y="31.8" width="6.5" height="6.5" rx="1.6" fill="var(--berry)" />
                  <rect x="16.6" y="31.8" width="6.5" height="6.5" rx="1.6" fill="var(--sun)" />
                  <rect x="24.2" y="31.8" width="6.5" height="6.5" rx="1.6" fill="var(--aqua-deep)" />
                  <rect x="31.8" y="31.8" width="6.5" height="6.5" rx="1.6" fill="var(--grape)" />
                </g>
              </svg>
            </span>
            <span v-else-if="game.id === 'snake'" class="cabinet__icon cabinet__snake" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <path d="M22 41 C8 41 7 21 23 21 C34 21 34 34 23 34 C16 34 16 26 22 26"
                  fill="none" stroke="var(--ink)" stroke-width="7.6" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M22 41 C8 41 7 21 23 21 C34 21 34 34 23 34 C16 34 16 26 22 26"
                  fill="none" stroke="var(--aqua)" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="22" cy="26" r="4.4" fill="var(--aqua-deep)" stroke="var(--ink)" stroke-width="2" />
                <circle cx="22.6" cy="25" r="1" fill="var(--ink)" />
                <circle cx="34" cy="11" r="3.6" fill="var(--sun)" stroke="var(--ink)" stroke-width="2" />
                <path d="M34 7.4 q2 -2 3.4 0" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round" />
              </svg>
            </span>
            <span v-else-if="game.id === 'permata'" class="cabinet__icon cabinet__permata" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="3" y="3" width="40" height="40" rx="7" fill="#efe4ff" stroke="var(--ink)" stroke-width="2.6" />
                <circle cx="14" cy="14" r="6" fill="var(--berry)" stroke="var(--ink)" stroke-width="2.2" />
                <rect x="24.5" y="8.5" width="11" height="11" rx="3" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.2" />
                <path d="M32 24 L38 30 L32 36 L26 30 Z" fill="var(--grape)" stroke="var(--ink)" stroke-width="2.2" stroke-linejoin="round" />
                <circle cx="11" cy="31" r="6" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2.2" />
                <rect x="5" y="38" width="10" height="4.5" rx="2.2" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2" />
                <rect x="17" y="38" width="10" height="4.5" rx="2.2" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2" />
                <rect x="29" y="38" width="10" height="4.5" rx="2.2" fill="var(--aqua)" stroke="var(--ink)" stroke-width="2" />
              </svg>
            </span>
            <span v-else-if="game.id === 'menara'" class="cabinet__icon cabinet__menara" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <g stroke="var(--ink)" stroke-width="2.2">
                  <rect x="9" y="30" width="28" height="9" rx="2.5" fill="var(--aqua)" />
                  <rect x="12" y="21" width="24" height="9" rx="2.5" fill="var(--berry)" />
                  <rect x="16" y="12" width="19" height="9" rx="2.5" fill="var(--sun)" />
                  <rect x="20" y="4" width="14" height="8" rx="2.5" fill="var(--grape)" />
                </g>
              </svg>
            </span>
            <span v-else-if="game.id === 'sokoban'" class="cabinet__icon cabinet__sokoban" aria-hidden="true">
              <svg viewBox="0 0 48 48">
                <circle cx="38" cy="24" r="7.5" fill="none" stroke="var(--aqua-deep)" stroke-width="3.5" />
                <rect x="5" y="14" width="19" height="19" rx="3" fill="var(--sun)" stroke="var(--ink)" stroke-width="3" />
                <rect x="10.5" y="19.5" width="8" height="8" rx="1.5" fill="none" stroke="var(--ink)" stroke-width="2" opacity="0.35" />
                <path d="M26 24 H31.5 M29 21.5 L31.8 24 L29 26.5" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span v-else-if="game.id === 'suit'" class="cabinet__icon cabinet__suit" aria-hidden="true">
              <i class="s-batu">B</i><i class="s-kertas">K</i><i class="s-gunting">G</i>
            </span>
            <span v-else-if="game.id === 'hanoi'" class="cabinet__icon cabinet__hanoi" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <g stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round">
                  <rect x="4" y="36" width="38" height="6" rx="2.6" fill="var(--aqua-deep)" />
                  <rect x="10" y="14" width="3" height="23" rx="1.5" fill="#b79a63" />
                  <rect x="21.5" y="14" width="3" height="23" rx="1.5" fill="#b79a63" />
                  <rect x="33" y="14" width="3" height="23" rx="1.5" fill="#b79a63" />
                  <rect x="2" y="30" width="19" height="6" rx="2.4" fill="var(--berry)" />
                  <rect x="4" y="24" width="15" height="6" rx="2.4" fill="var(--sun)" />
                  <rect x="6" y="18" width="11" height="6" rx="2.4" fill="var(--aqua)" />
                </g>
              </svg>
            </span>
            <span v-else-if="game.id === 'macet'" class="cabinet__icon cabinet__macet" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="4" y="4" width="34" height="38" rx="6" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.6" />
                <g stroke="var(--ink)" stroke-width="2">
                  <rect x="30" y="8" width="7" height="16" rx="2.6" fill="var(--aqua)" />
                  <rect x="9" y="27" width="7" height="12" rx="2.6" fill="var(--grape)" />
                  <rect x="20" y="27" width="12" height="7" rx="2.6" fill="var(--sun)" />
                  <rect x="8" y="19" width="16" height="7.5" rx="2.6" fill="var(--berry)" />
                </g>
                <path d="M39 22.7 L44 22.7 M41.6 20 L44 22.7 L41.6 25.4" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span v-else-if="game.id === 'kataharian'" class="cabinet__icon cabinet__kataharian" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <g stroke="var(--ink)" stroke-width="2.6">
                  <rect x="2" y="15" width="13.6" height="16" rx="3" fill="#43c96b" />
                  <rect x="16.2" y="15" width="13.6" height="16" rx="3" fill="var(--sun)" />
                  <rect x="30.4" y="15" width="13.6" height="16" rx="3" fill="var(--absent)" />
                </g>
                <g font-family="monospace" font-weight="700" font-size="12" text-anchor="middle" fill="var(--ink)">
                  <text x="8.8" y="27.5">K</text>
                  <text x="23" y="27.5">A</text>
                  <text x="37.2" y="27.5">T</text>
                </g>
              </svg>
            </span>
            <span v-else-if="game.id === 'piktogram'" class="cabinet__icon cabinet__piktogram" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="13" y="13" width="30" height="30" rx="2.5" fill="var(--cream)" stroke="var(--ink)" stroke-width="2.4" />
                <g fill="var(--berry)">
                  <rect x="19" y="13" width="6" height="6" />
                  <rect x="31" y="13" width="6" height="6" />
                  <rect x="13" y="19" width="30" height="6" />
                  <rect x="13" y="25" width="30" height="6" />
                  <rect x="19" y="31" width="18" height="6" />
                  <rect x="25" y="37" width="6" height="6" />
                </g>
                <g font-family="monospace" font-size="5.5" fill="var(--muted)" text-anchor="middle">
                  <text x="28" y="10.5">4</text>
                  <text x="8" y="23">5</text>
                  <text x="8" y="35">3</text>
                </g>
              </svg>
            </span>
            <span v-else-if="game.id === 'titikkotak'" class="cabinet__icon cabinet__titikkotak" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="9" y="9" width="14" height="14" rx="1.5" fill="var(--berry)" opacity="0.45" />
                <g stroke-width="3" stroke-linecap="round" fill="none">
                  <path d="M9 9 H23 M9 9 V23 M23 9 V23 M9 23 H23" stroke="var(--berry)" />
                  <path d="M23 37 H37 M37 23 V37" stroke="var(--aqua-deep)" />
                </g>
                <g fill="var(--ink)">
                  <circle cx="9" cy="9" r="2.6" /><circle cx="23" cy="9" r="2.6" /><circle cx="37" cy="9" r="2.6" />
                  <circle cx="9" cy="23" r="2.6" /><circle cx="23" cy="23" r="2.6" /><circle cx="37" cy="23" r="2.6" />
                  <circle cx="9" cy="37" r="2.6" /><circle cx="23" cy="37" r="2.6" /><circle cx="37" cy="37" r="2.6" />
                </g>
              </svg>
            </span>
            <span v-else-if="game.id === 'katak'" class="cabinet__icon cabinet__katak" aria-hidden="true">
              <svg viewBox="0 0 46 46">
                <rect x="2" y="4" width="42" height="8" rx="2" fill="#bfe3ff" stroke="var(--ink)" stroke-width="2.2" />
                <rect x="2" y="34" width="42" height="9" rx="2" fill="#7a6f86" stroke="var(--ink)" stroke-width="2.2" />
                <line x1="6" y1="38.5" x2="40" y2="38.5" stroke="var(--sun)" stroke-width="2" stroke-dasharray="4 3.5" />
                <g stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round">
                  <ellipse cx="23" cy="24" rx="11" ry="8.5" fill="var(--aqua)" />
                  <circle cx="17.5" cy="17" r="4" fill="var(--aqua)" />
                  <circle cx="28.5" cy="17" r="4" fill="var(--aqua)" />
                </g>
                <circle cx="17.5" cy="16.5" r="1.6" fill="var(--ink)" />
                <circle cx="28.5" cy="16.5" r="1.6" fill="var(--ink)" />
                <path d="M13 28 q-3 3 -1 6 M33 28 q3 3 1 6" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round" />
              </svg>
            </span>
            <span v-else class="cabinet__icon cabinet__dino"><DinoSprite run /></span>
          </span>
          <span class="cabinet__title">{{ game.title }}</span>
        </button>
        <button
          class="cabinet__fav"
          :class="{ 'is-on': isFav(game.id) }"
          type="button"
          :aria-label="isFav(game.id) ? 'Hapus dari favorit' : 'Tambah ke favorit'"
          @click="toggleFav(game.id)"
        >
          ★
        </button>
      </li>
    </ul>
    <p v-if="!shown.length" class="empty">Belum ada favorit — ketuk ★ pada game mana pun.</p>

    <footer class="foot">
      <div class="foot__actions">
        <button v-if="canInstall" class="foot__btn" type="button" @click="installApp">
          ⬇ Pasang aplikasi
        </button>
        <button class="foot__btn" type="button" @click="share">
          {{ shared ? '✓ Link disalin' : '↗ Bagikan' }}
        </button>
      </div>
      <span class="foot__soon">More games coming soon</span>
      <span class="foot__build">
        <span class="foot__ver">v{{ appVersion }}</span>
        <button
          class="foot__update"
          :class="{ 'is-ready': updateReady }"
          :title="updateReady ? 'A new build is ready — tap to reload' : 'Reload for the latest build'"
          @click="applyUpdate"
        >
          <span v-if="updateReady" class="foot__dot" aria-hidden="true" />
          {{ updateReady ? 'Update ready' : 'Update' }}
        </button>
      </span>
    </footer>
  </div>
</template>

<style scoped>
.select {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 20px max(20px, env(safe-area-inset-right)) calc(56px + env(safe-area-inset-bottom))
    max(20px, env(safe-area-inset-left));
}

/* ---- Hero ---- */
.hero {
  height: 300px;
  border: var(--line) solid var(--ink);
  border-radius: 26px;
  box-shadow: var(--pop);
}

/* The arcade sign, sitting in the sky above the sun. */
.hero__title {
  position: absolute;
  top: 20px;
  left: 0;
  right: 0;
  z-index: 3;
  margin: 0;
  text-align: center;
  font-family: var(--font-display);
  font-size: clamp(38px, 10vw, 62px);
  line-height: 0.85;
  letter-spacing: 0.01em;
}
.hero__title span {
  display: block;
  -webkit-text-stroke: 3px var(--ink);
  paint-order: stroke fill;
  text-shadow: var(--pop);
}
.hero__title-a {
  color: var(--sun);
}
.hero__title-b {
  color: var(--aqua);
}

.cloud {
  position: absolute;
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 999px;
  box-shadow: inset 0 -6px 0 rgba(44, 19, 56, 0.06);
}
.cloud--a {
  top: 150px;
  left: 26px;
  width: 70px;
  height: 28px;
  animation: drift 14s ease-in-out infinite;
}
.cloud--b {
  top: 122px;
  right: 30px;
  width: 52px;
  height: 22px;
  animation: drift 18s ease-in-out infinite reverse;
}

.sun-face {
  position: absolute;
  left: 50%;
  bottom: 12px;
  width: 150px;
  height: 150px;
  transform: translateX(-50%);
  transform-origin: 50% 80%;
  animation: sun-bob 4s ease-in-out infinite;
}
.sun-face__rays {
  transform-origin: 60px 60px;
  animation: spin 26s linear infinite;
}
.sun-face__rays polygon {
  fill: var(--sun);
  stroke: var(--ink);
  stroke-width: 2.4;
  stroke-linejoin: round;
}
.sun-face__disc {
  fill: var(--sun);
  stroke: var(--ink);
  stroke-width: 4;
}
.sun-face__eye {
  fill: var(--ink);
  transform-origin: center;
  animation: blink 5.5s ease-in-out infinite;
}
.sun-face__cheek {
  fill: var(--berry);
  opacity: 0.5;
}
.sun-face__smile {
  fill: none;
  stroke: var(--ink);
  stroke-width: 4;
  stroke-linecap: round;
}

.hero__ground {
  position: absolute;
  inset: auto 0 0 0;
  height: 46px;
  background: var(--aqua);
  border-top: var(--line) solid var(--ink);
}
.hero__runner {
  position: absolute;
  bottom: 40px;
  height: 52px;
  left: -60px;
  color: #43c96b;
  animation: run-across 7.5s linear infinite;
}
.hero__runner .dino {
  animation: hop 0.75s ease-in-out infinite;
}

@keyframes run-across {
  0% {
    left: -60px;
  }
  100% {
    left: 100%;
  }
}
@keyframes hop {
  0%,
  70%,
  100% {
    transform: translateY(0);
  }
  35% {
    transform: translateY(-24px);
  }
}
@keyframes sun-bob {
  0%,
  100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(-6px);
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes blink {
  0%,
  92%,
  100% {
    transform: scaleY(1);
  }
  96% {
    transform: scaleY(0.15);
  }
}
@keyframes drift {
  0%,
  100% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(14px);
  }
}

/* ---- Cabinets ---- */
/* ---- Filter chips (All / Favorites / categories / Duo) ---- */
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  margin: 22px 0 0;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink);
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 999px;
  padding: 6px 12px;
  box-shadow: var(--pop-sm);
  transition: transform 0.1s ease, box-shadow 0.1s ease, background 0.1s ease;
}
.chip:hover,
.chip:focus-visible {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--ink);
}
.chip.is-on {
  background: var(--sun);
}
.chip__n {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--muted);
}
.chip.is-on .chip__n {
  color: var(--ink);
}
.empty {
  margin: 28px 0 0;
  text-align: center;
  font-weight: 600;
  color: var(--muted);
}

/* A responsive grid of square icon tiles; each column is at least 96px, so the
   menu is 2-up on the narrowest phones and up to 5-up on a wide screen. */
.cabinets {
  list-style: none;
  padding: 0;
  margin: 16px 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 14px;
}
.cabinets li {
  position: relative; /* anchor for the favorite star */
  display: flex; /* let the card stretch to the row height for even cards */
}
/* Favorite star, top-right of each tile — a sibling of the card so tapping it
   toggles the favorite without launching the game. */
.cabinet__fav {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  line-height: 1;
  font-size: 15px;
  color: var(--muted);
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 50%;
  box-shadow: var(--pop-sm);
  opacity: 0.55;
  transition: transform 0.1s ease, opacity 0.1s ease, color 0.1s ease, background 0.1s ease;
}
.cabinet__fav:hover,
.cabinet__fav:focus-visible {
  opacity: 1;
  transform: scale(1.08);
}
.cabinet__fav.is-on {
  opacity: 1;
  color: var(--sun-core);
  background: var(--sun);
}
.cabinet {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 16px;
  padding: 9px 7px 11px;
  box-shadow: var(--pop-sm);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.cabinet:hover,
.cabinet:focus-visible {
  transform: translate(-2px, -2px);
  box-shadow: 5px 5px 0 var(--ink);
}
.cabinet:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--ink);
}
/* Each game gets a flat, tinted square with its icon centered — no sky/sun.
   container-type lets the icon size itself as a fraction of the square (cqmin)
   so every icon reads at the same scale regardless of the column count. */
.cabinet__art {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  border: var(--line) solid var(--ink);
  display: grid;
  place-items: center;
  overflow: hidden;
  container-type: size;
}
.cabinet__art--dino {
  background: #ffe1a8;
}
.cabinet__art--flappy {
  background: #bfe3ff;
}
.cabinet__art--wordlock {
  background: #e6ddff;
}
.cabinet__art--acakkata {
  background: #ffd6e3;
}
.cabinet__art--hangman {
  background: #cdd6ff;
}
.cabinet__art--tictactoe {
  background: #ffc9b9;
}
.cabinet__art--tebakwarna {
  background: #ece7f2;
}
.cabinet__art--connect4 {
  background: #d3edc4;
}
.cabinet__art--ingatan {
  background: #c7efe0;
}
.cabinet__art--armada {
  background: #cfe0ea;
}
.cabinet__art--tikus {
  background: #ecdcc0;
}
.cabinet__art--sudoku {
  background: #dfeaf0;
}
.cabinet__art--breaker {
  background: #ffe1b0;
}
.cabinet__art--ranjau {
  background: #d7dbe8;
}
.cabinet__art--tetris {
  background: #e4d9f2;
}
.cabinet__art--ular {
  background: #ffe1a8;
}
.cabinet__art--carikata {
  background: #d7ecec;
}
.cabinet__art--otello {
  background: #cfe8d2;
}
.cabinet__art--dakon {
  background: #ecd9b6;
}
.cabinet__art--dam {
  background: #ead9c2;
}
.cabinet__art--gomoku {
  background: #f0d6ab;
}
.cabinet__art--2048 {
  background: #ffe0c9;
}
.cabinet__art--geser {
  background: #efe6cf;
}
.cabinet__art--gaple {
  background: #ecdcc7;
}
.cabinet__art--lampu {
  background: #efdcc2;
}
.cabinet__art--tirukan {
  background: #f3d9e6;
}
.cabinet__art--flood {
  background: #ede3f2;
}
.cabinet__art--snake {
  background: #cfeee2;
}
.cabinet__art--permata {
  background: #ece0ff;
}
.cabinet__art--menara {
  background: #d9ece6;
}
.cabinet__art--sokoban {
  background: #ffe6bd;
}
.cabinet__art--suit {
  background: #ffdbe6;
}
.cabinet__art--hanoi {
  background: #d7e4f0;
}
.cabinet__art--macet {
  background: #f4ddd0;
}
.cabinet__art--kataharian {
  background: #d4efd9;
}
.cabinet__art--piktogram {
  background: #e9e1f4;
}
.cabinet__art--titikkotak {
  background: #f6dfe9;
}
.cabinet__art--katak {
  background: #cdeccb;
}

/* The icon sits centered in the square. Every SVG icon is sized as one fraction
   of the tile via cqmin (the tile is a query container), so all icons read at
   the same scale whatever the column count. The dino is a sprite with its own
   aspect ratio and outline, so it opts out and sets its own height. */
.cabinet__icon {
  display: grid;
  place-items: center;
}
.cabinet__icon:not(.cabinet__dino) > svg {
  display: block;
  width: 62cqmin;
  height: 62cqmin;
  filter: drop-shadow(2px 2px 0 var(--ink));
}

/* Dino Jump icon (sprite keeps its own aspect + multi-side outline). */
.cabinet__dino {
  height: 58cqmin;
  color: #43c96b;
}

/* Word Lock icon: chunky tiles mid-solve. */
.cabinet__tiles {
  grid-auto-flow: column;
  gap: 2.5cqmin;
}
.cabinet__tiles i {
  width: 16cqmin;
  height: 16cqmin;
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-weight: 700;
  font-style: normal;
  font-size: 9cqmin;
  border-radius: 4px;
  border: 2px solid var(--ink);
  color: var(--ink);
}
.cabinet__tiles .t-correct {
  background: var(--aqua);
}
.cabinet__tiles .t-present {
  background: var(--sun);
}
.cabinet__tiles .t-plain {
  background: var(--cream);
}

/* Suit icon: Batu / Kertas / Gunting tiles. */
.cabinet__suit {
  grid-auto-flow: column;
  gap: 3cqmin;
}
.cabinet__suit i {
  width: 18cqmin;
  height: 18cqmin;
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-weight: 700;
  font-style: normal;
  font-size: 10cqmin;
  border-radius: 5px;
  border: 2px solid var(--ink);
  color: var(--ink);
}
.cabinet__suit .s-batu {
  background: #b6abcf;
}
.cabinet__suit .s-kertas {
  background: var(--cream);
}
.cabinet__suit .s-gunting {
  background: var(--sun);
}


/* Acak Kata icon: scrambled, tilted letter tiles. */
.cabinet__scramble {
  grid-auto-flow: column;
  gap: 2.5cqmin;
}
.cabinet__scramble i {
  width: 16cqmin;
  height: 16cqmin;
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-weight: 700;
  font-style: normal;
  font-size: 9cqmin;
  border-radius: 4px;
  border: 2px solid var(--ink);
  color: var(--ink);
  background: var(--cream);
}
.cabinet__scramble i:nth-child(1) {
  transform: rotate(-8deg);
  background: var(--sun);
}
.cabinet__scramble i:nth-child(2) {
  transform: rotate(7deg);
  background: var(--aqua);
}
.cabinet__scramble i:nth-child(3) {
  transform: rotate(-5deg);
}
.cabinet__scramble i:nth-child(4) {
  transform: rotate(9deg);
  background: var(--berry);
  color: var(--cream);
}

/* Tebak Warna icon: a fan of color swatches. */
.cabinet__warna {
  grid-auto-flow: column;
  gap: 2cqmin;
}
.cabinet__warna i {
  width: 9cqmin;
  height: 17cqmin;
  border: 2px solid var(--ink);
  border-radius: 3px;
}

/* Flappy icon: a bird threading a pipe gap, centered as one unit. */
.cabinet__flappy {
  position: relative;
  width: 62cqmin;
  height: 40cqmin;
}
.cabinet__bird {
  position: absolute;
  left: 3cqmin;
  top: 50%;
  transform: translateY(-50%);
  width: 30cqmin;
  height: 22cqmin;
}
.cabinet__pipe {
  position: absolute;
  right: 4cqmin;
  width: 15cqmin;
  background: #57cc5f;
  border: 2.4px solid var(--ink);
  border-radius: 4px;
}
.cabinet__pipe--top {
  top: 0;
  height: 13cqmin;
}
.cabinet__pipe--bot {
  bottom: 0;
  height: 17cqmin;
}

/* Game title, centered under the icon. */
.cabinet__title {
  font-family: var(--font-display);
  font-size: 13px;
  line-height: 1.1;
  letter-spacing: 0.01em;
  color: var(--ink);
}

/* ---- Footer ---- */
.foot {
  margin-top: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  font-family: var(--font-body);
  font-weight: 600;
  color: var(--muted);
}
.foot__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
.foot__btn {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink);
  background: var(--sun);
  border: var(--line) solid var(--ink);
  border-radius: 999px;
  padding: 8px 16px;
  box-shadow: var(--pop-sm);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.foot__btn:hover,
.foot__btn:focus-visible {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--ink);
}
.foot__btn:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--ink);
}
.foot__soon {
  font-size: 14px;
  letter-spacing: 0.02em;
}
.foot__build {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}
.foot__ver {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--muted);
}
.foot__update {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 999px;
  padding: 6px 15px;
  box-shadow: var(--pop-sm);
  transition: transform 0.1s ease, box-shadow 0.1s ease, background 0.1s ease;
}
.foot__update:hover,
.foot__update:focus-visible {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--ink);
}
.foot__update:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--ink);
}
.foot__update.is-ready {
  background: var(--sun);
}
.foot__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--berry);
  border: 1.5px solid var(--ink);
  animation: dot-pulse 1.2s ease-in-out infinite;
}

@keyframes dot-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.35);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero__runner,
  .hero__runner .dino,
  .sun-face,
  .sun-face__rays,
  .sun-face__eye,
  .cloud,
  .foot__dot {
    animation: none;
  }
  .hero__runner {
    left: 40px;
  }
}
</style>
