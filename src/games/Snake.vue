<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Ular Lapar — Nokia-style Snake (SOLO). A chain of cells crawls one cell per
// tick in the current direction; eat the berry to grow and speed up a touch.
// Game over on a wall or a self-bite (classic no-wrap). Driven by a rAF loop
// with a delta accumulator so the tick interval can shrink cleanly as you grow.

const SIZE = 17
const bestKey = 'dusk-snake-best'

const phase = ref('ready') // ready | play | over
const score = ref(0)
const best = ref(0)

// The snake as a chain of {r,c}; index 0 is the head. Food is one cell.
const snake = reactive([])
const food = reactive({ r: 0, c: 0 })

// Direction + a small input queue so two fast presses in one tick can't fold
// the snake back on itself. `dir` is the last applied step; the queue buffers
// up to two upcoming turns.
let dir = { r: 0, c: 1 }
const dirQueue = []

let rafId = 0
let lastT = 0
let acc = 0 // ms banked toward the next step

// Faster each berry, floored so it stays controllable on a phone.
const interval = computed(() => Math.max(75, 150 - score.value * 5))

// A flat SIZE×SIZE view for the template: '', 'body', 'head' or 'food'.
const cells = computed(() => {
  const out = new Array(SIZE * SIZE).fill('')
  for (let i = 0; i < snake.length; i++) {
    const s = snake[i]
    out[s.r * SIZE + s.c] = i === 0 ? 'head' : 'body'
  }
  if (phase.value !== 'ready') {
    const fi = food.r * SIZE + food.c
    if (!out[fi]) out[fi] = 'food'
  }
  return out
})

function placeFood() {
  const occ = new Set(snake.map((s) => s.r * SIZE + s.c))
  const empties = []
  for (let i = 0; i < SIZE * SIZE; i++) if (!occ.has(i)) empties.push(i)
  if (!empties.length) return // board full (essentially unreachable) — leave it
  const idx = empties[Math.floor(Math.random() * empties.length)]
  food.r = Math.floor(idx / SIZE)
  food.c = idx % SIZE
}

// Queue a turn if it isn't the same as, or a 180° reversal of, the last queued
// (or applied) direction.
function setDir(r, c) {
  const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir
  if (r === last.r && c === last.c) return
  if (r === -last.r && c === -last.c) return
  if (dirQueue.length < 2) dirQueue.push({ r, c })
}

// Advance one cell.
function step() {
  if (dirQueue.length) dir = dirQueue.shift()
  const head = snake[0]
  const nr = head.r + dir.r
  const nc = head.c + dir.c
  if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) return die()
  const grow = nr === food.r && nc === food.c
  // The tail cell frees up unless we're growing, so it isn't a collision.
  const limit = grow ? snake.length : snake.length - 1
  for (let i = 0; i < limit; i++) {
    if (snake[i].r === nr && snake[i].c === nc) return die()
  }
  snake.unshift({ r: nr, c: nc })
  if (grow) {
    score.value += 1
    sfx.tick()
    placeFood()
  } else {
    snake.pop()
  }
}

function die() {
  phase.value = 'over'
  sfx.lose()
  if (score.value > best.value) {
    best.value = score.value
    try {
      localStorage.setItem(bestKey, String(best.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory best */
    }
  }
}

function start() {
  const mid = Math.floor(SIZE / 2)
  snake.splice(0, snake.length, { r: mid, c: mid }, { r: mid, c: mid - 1 }, { r: mid, c: mid - 2 })
  dir = { r: 0, c: 1 }
  dirQueue.length = 0
  score.value = 0
  placeFood()
  acc = 0
  lastT = 0
  phase.value = 'play'
}

// rAF loop with a delta accumulator; only steps while playing.
function frame(t) {
  rafId = requestAnimationFrame(frame)
  if (phase.value !== 'play') {
    lastT = t
    acc = 0
    return
  }
  if (!lastT) lastT = t
  let dt = t - lastT
  lastT = t
  if (dt > 250) dt = 250 // clamp after a tab switch
  acc += dt
  const iv = interval.value
  while (acc >= iv) {
    acc -= iv
    step()
    if (phase.value !== 'play') break
  }
}

// On-screen d-pad.
function press(r, c) {
  if (phase.value === 'play') setDir(r, c)
}

function onKey(e) {
  const k = e.key
  let d = null
  if (k === 'ArrowUp' || k === 'w' || k === 'W') d = [-1, 0]
  else if (k === 'ArrowDown' || k === 's' || k === 'S') d = [1, 0]
  else if (k === 'ArrowLeft' || k === 'a' || k === 'A') d = [0, -1]
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') d = [0, 1]
  if (k.startsWith('Arrow')) e.preventDefault() // don't scroll the page
  if (d) {
    if (phase.value === 'ready') start()
    if (phase.value !== 'over') setDir(d[0], d[1])
    return
  }
  if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
    e.preventDefault()
    if (phase.value !== 'play') start()
  }
}

// Swipe / tap on the board.
let sx = 0
let sy = 0
function onDown(e) {
  sx = e.clientX
  sy = e.clientY
}
function onUp(e) {
  const dx = e.clientX - sx
  const dy = e.clientY - sy
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (adx < 18 && ady < 18) {
    if (phase.value !== 'play') start() // a tap starts / restarts
    return
  }
  const d = adx > ady ? [0, dx > 0 ? 1 : -1] : [dy > 0 ? 1 : -1, 0]
  if (phase.value === 'ready') start()
  if (phase.value !== 'over') setDir(d[0], d[1])
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    best.value = 0
  }
  window.addEventListener('keydown', onKey, { passive: false })
  rafId = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="snake">
    <div class="panel">
      <!-- Ready -->
      <section v-if="phase === 'ready'" class="screen">
        <p class="brand">ULAR<span class="brand__accent"> LAPAR</span></p>
        <p class="eyebrow">SANTAP &amp; TERUS TUMBUH</p>
        <div class="solobar snake__bar">
          <span>MODE SOLO</span>
          <span class="solobar__best">TERBAIK <b>{{ best }}</b></span>
        </div>
        <button class="cta" type="button" @click="start">Mulai ▸</button>
      </section>

      <!-- Play / Over -->
      <section v-else class="screen">
        <div class="solobar snake__bar">
          <span>SKOR <b>{{ score }}</b></span>
          <span class="solobar__best">TERBAIK <b>{{ best }}</b></span>
        </div>

        <div
          class="board"
          @pointerdown.prevent="onDown"
          @pointerup.prevent="onUp"
        >
          <span
            v-for="(t, i) in cells"
            :key="i"
            class="cell"
            :class="{ body: t === 'body', head: t === 'head', food: t === 'food' }"
          />
          <div v-if="phase === 'over'" class="board__over">
            <p class="over__title">GAME OVER</p>
          </div>
        </div>

        <!-- Touch d-pad -->
        <div v-if="phase === 'play'" class="pad">
          <button class="key key--up" type="button" aria-label="Atas" @pointerdown.prevent="press(-1, 0)">▲</button>
          <button class="key key--left" type="button" aria-label="Kiri" @pointerdown.prevent="press(0, -1)">◀</button>
          <button class="key key--down" type="button" aria-label="Bawah" @pointerdown.prevent="press(1, 0)">▼</button>
          <button class="key key--right" type="button" aria-label="Kanan" @pointerdown.prevent="press(0, 1)">▶</button>
        </div>
        <p v-if="phase === 'play'" class="hint">Geser papan atau pakai tombol untuk mengarahkan.</p>

        <!-- Over -->
        <template v-if="phase === 'over'">
          <div class="result screen">
            <p class="result__title is-lost">Tamat</p>
            <p class="result__sub">Ularmu sepanjang {{ snake.length }} — skor {{ score }}.</p>
            <p class="result__streak">TERBAIK {{ best }}</p>
          </div>
          <button class="cta" type="button" @click="start">Main lagi ▸</button>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.snake {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

.panel {
  padding: 20px 18px 24px;
}

.brand {
  font-size: 40px;
}

.snake__bar {
  margin-bottom: 14px;
}

/* ---- Board ---- */
.board {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  display: grid;
  grid-template-columns: repeat(17, 1fr);
  grid-template-rows: repeat(17, 1fr);
  gap: 1px;
  padding: 6px;
  background: rgba(44, 19, 56, 0.1); /* faint grid lines show through the gap */
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  box-shadow: var(--pop);
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}
.cell {
  background: var(--paper-lit);
  border-radius: 2px;
}
/* Chunky rounded ink-outlined segments (outline via inset shadow keeps size). */
.cell.body {
  background: var(--aqua);
  border-radius: 4px;
  box-shadow: inset 0 0 0 2px var(--ink), inset 0 -3px 0 rgba(44, 19, 56, 0.2);
}
.cell.head {
  border-radius: 5px;
  background:
    radial-gradient(circle at 34% 38%, var(--ink) 0 19%, transparent 21%),
    radial-gradient(circle at 66% 38%, var(--ink) 0 19%, transparent 21%),
    var(--aqua-deep);
  box-shadow: inset 0 0 0 2px var(--ink);
}
.cell.food {
  border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, var(--sun) 0 52%, var(--sun-core) 100%);
  box-shadow: inset 0 0 0 2px var(--ink);
  animation: snake-pulse 1s ease-in-out infinite;
}
@keyframes snake-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(0.82);
  }
}

.board__over {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(44, 19, 56, 0.5);
  border-radius: 14px;
}
.over__title {
  font-family: var(--font-display);
  font-size: 34px;
  margin: 0;
  color: var(--berry);
  -webkit-text-stroke: 3px var(--ink);
  paint-order: stroke fill;
  text-shadow: var(--pop-sm);
}

/* ---- Touch d-pad ---- */
.pad {
  display: grid;
  grid-template-columns: repeat(3, 52px);
  grid-template-rows: repeat(2, 52px);
  gap: 8px;
  justify-content: center;
  margin-top: 16px;
}
.key {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 20px;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  box-shadow: 0 4px 0 var(--ink);
  cursor: pointer;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  transition: transform 0.06s ease, box-shadow 0.06s ease;
}
.key:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--ink);
}
.key--up {
  grid-column: 2;
  grid-row: 1;
}
.key--left {
  grid-column: 1;
  grid-row: 2;
}
.key--down {
  grid-column: 2;
  grid-row: 2;
}
.key--right {
  grid-column: 3;
  grid-row: 2;
}

.hint {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--muted);
  text-align: center;
  margin: 12px 0 0;
}

.result {
  margin-top: 14px;
}
</style>
