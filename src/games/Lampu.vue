<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Lampu — Lights Out (solo, no mode picker). A 5×5 grid of lamps; tapping a
// cell toggles it and its orthogonal neighbours. Turn every lamp off to win.
// Puzzles are built by applying random taps to an all-off board, so every
// generated board is guaranteed solvable. Best = fewest moves.

const SIZE = 5
const N = SIZE * SIZE
const INDICES = Array.from({ length: N }, (_, i) => i)
const bestKey = 'dusk-lampu-best'

const phase = ref('play') // play | won
const lights = ref(Array(N).fill(false)) // true = lit
const moves = ref(0)
const seconds = ref(0)
const pressed = ref(-1)
const best = ref(null)
const record = ref(false)
let timer = 0
let pressTimer = 0
let started = false

// The cell itself plus its in-bounds up/down/left/right neighbours.
function cellsFor(i) {
  const r = Math.floor(i / SIZE)
  const c = i % SIZE
  const out = [i]
  if (r > 0) out.push(i - SIZE)
  if (r < SIZE - 1) out.push(i + SIZE)
  if (c > 0) out.push(i - 1)
  if (c < SIZE - 1) out.push(i + 1)
  return out
}

function applyTap(grid, i) {
  for (const j of cellsFor(i)) grid[j] = !grid[j]
}

function newGame() {
  const grid = Array(N).fill(false)
  const taps = 6 + Math.floor(Math.random() * 7) // 6..12
  for (let k = 0; k < taps; k++) applyTap(grid, Math.floor(Math.random() * N))
  // Random taps can cancel back to all-off; nudge so there's a puzzle to solve.
  if (grid.every((v) => !v)) applyTap(grid, Math.floor(Math.random() * N))
  lights.value = grid
  moves.value = 0
  seconds.value = 0
  record.value = false
  pressed.value = -1
  started = false
  stopTimer()
  phase.value = 'play'
}

function tapCell(i) {
  if (phase.value !== 'play') return
  if (!started) {
    started = true
    startTimer()
  }
  const grid = lights.value
  for (const j of cellsFor(i)) grid[j] = !grid[j]
  moves.value++
  sfx.tick()
  pressed.value = i
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    if (pressed.value === i) pressed.value = -1
  }, 220)
  if (grid.every((v) => !v)) win()
}

function win() {
  stopTimer()
  phase.value = 'won'
  sfx.win()
  const beat = best.value == null || moves.value < best.value
  record.value = beat
  if (beat) {
    best.value = moves.value
    try {
      localStorage.setItem(bestKey, String(moves.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory best */
    }
  }
}

function startTimer() {
  stopTimer()
  timer = setInterval(() => {
    seconds.value++
  }, 1000)
}
function stopTimer() {
  clearInterval(timer)
  timer = 0
}

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

onMounted(() => {
  try {
    const v = localStorage.getItem(bestKey)
    best.value = v == null ? null : Number(v)
  } catch (e) {
    best.value = null
  }
  newGame()
})
onBeforeUnmount(() => {
  stopTimer()
  clearTimeout(pressTimer)
})
</script>

<template>
  <div class="lampu">
    <div class="panel">
      <!-- ===== Play ===== -->
      <section v-if="phase === 'play'" class="screen">
        <p class="brand">LAMP<span class="brand__accent">U</span></p>
        <p class="eyebrow">MATIKAN SEMUA LAMPU</p>

        <div class="solobar meta">
          <span>LANGKAH <b>{{ moves }}</b></span>
          <span>WAKTU <b>{{ fmt(seconds) }}</b></span>
          <span class="solobar__best">TERBAIK {{ best == null ? '—' : best }}</span>
        </div>

        <div class="board">
          <button
            v-for="i in INDICES"
            :key="i"
            class="lamp"
            :class="{ 'is-on': lights[i], 'is-press': pressed === i }"
            type="button"
            :aria-label="'Lampu ' + (i + 1) + (lights[i] ? ' menyala' : ' padam')"
            @click="tapCell(i)"
          />
        </div>

        <button class="cta" type="button" @click="newGame">Acak lagi ▸</button>
      </section>

      <!-- ===== Result ===== -->
      <section v-else class="screen result">
        <p class="brand">LAMP<span class="brand__accent">U</span></p>
        <p class="result__title">Semua Padam!</p>
        <p class="result__sub">{{ moves }} langkah · {{ fmt(seconds) }}</p>
        <p class="result__streak">
          <template v-if="record">REKOR BARU · </template>TERBAIK {{ best }} LANGKAH
        </p>
        <button class="cta" type="button" @click="newGame">Main lagi ▸</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/solobar/result come from
   src/styles.css (see docs/STYLE.md). */
.lampu {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 18px 26px;
}
.brand {
  font-size: 34px;
}

/* ---- Moves / time / best bar ---- */
.meta {
  margin-bottom: 14px;
}
.meta b {
  color: var(--aqua-deep);
  font-size: 14px;
}

/* ---- The lamp board — lights sit in a deep plum well so they pop ---- */
.board {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 9px;
  padding: 11px;
  background: #241033;
  border: var(--line) solid var(--ink);
  border-radius: 16px;
  box-shadow: var(--pop);
  margin: 4px 0 18px;
}

/* Off lamps read as dim, recessed plum tiles. */
.lamp {
  position: relative;
  aspect-ratio: 1;
  border: var(--line) solid var(--ink);
  border-radius: 13px;
  background: #402457;
  box-shadow: inset 0 4px 7px rgba(0, 0, 0, 0.5), inset 0 -2px 4px rgba(255, 255, 255, 0.05);
  transition: background 0.14s ease, box-shadow 0.18s ease, transform 0.08s ease;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}
/* The bulb glint at the centre of each lamp. */
.lamp::before {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 34%;
  height: 34%;
  border-radius: 50%;
  background: rgba(255, 243, 223, 0.08);
  transition: background 0.14s ease, box-shadow 0.18s ease;
}
.lamp:active {
  transform: translateY(2px) scale(0.97);
}

/* Lit lamps glow warm with an ink outline and a soft halo. */
.lamp.is-on {
  background: radial-gradient(circle at 50% 38%, var(--sun) 0 46%, var(--sun-core) 100%);
  box-shadow: var(--pop-sm), 0 0 16px rgba(255, 138, 61, 0.7);
  animation: lampu-glow 2.4s ease-in-out infinite;
}
.lamp.is-on::before {
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 11px rgba(255, 245, 220, 0.85);
}
/* Press feedback — the glint pops out on the tapped cell. */
.lamp.is-press::before {
  animation: lampu-press 0.24s ease;
}

.result .brand {
  margin-bottom: 12px;
}

@keyframes lampu-glow {
  0%,
  100% {
    box-shadow: var(--pop-sm), 0 0 13px rgba(255, 138, 61, 0.55);
  }
  50% {
    box-shadow: var(--pop-sm), 0 0 21px rgba(255, 138, 61, 0.95);
  }
}
@keyframes lampu-press {
  0% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.85);
  }
  100% {
    transform: scale(1);
  }
}
</style>
