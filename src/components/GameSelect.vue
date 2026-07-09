<script setup>
import { ref, computed } from 'vue'
import DinoSprite from './DinoSprite.vue'
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
            <component :is="game.icon" v-if="game.icon" />
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
.cabinet__art--wordle {
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
.cabinet__art--blokkayu {
  background: #efdcbe;
}
.cabinet__art--pipa {
  background: #dbe9f0;
}
.cabinet__art--sandi {
  background: #ece1f5;
}
.cabinet__art--lompat {
  background: #d3ebff;
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
