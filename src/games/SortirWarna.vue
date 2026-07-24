<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Sortir Warna — a liquid-sort puzzle. Each bottle holds 8 pours; tap a bottle
// to lift its top liquid run, tap another to pour it onto a matching colour or
// into an empty bottle. Sort every colour into its own bottle to clear the
// round. It never ends: every clear ramps one more colour (and bottle) up to a
// cap, and the difficulty just picks how far ahead you start. Boards are built
// by scrambling a solved layout with the exact inverse of a legal pour, so every
// one is solvable by construction.

const CAP = 8 // pours per full bottle
const EMPTIES = 2 // spare bottles every board keeps
const MIN_COLORS = 3
const MAX_COLORS = 22 // top of the endless ramp — 24 bottles with the 2 empties
const SOLVED_KEY = 'dusk-sortir-solved'

// Distinct liquids; the first `colors` are used, most-distinct first.
const COLORS = [
  '#e6483d',
  '#f6921e',
  '#ffd23f',
  '#43c96b',
  '#4a90e2',
  '#8b5cf6',
  '#23c9ad',
  '#ec4899',
  '#a5673f',
  '#b6d94a',
  '#34c3e0',
  '#f07a9a',
  '#7f8c3f',
  '#6c5ce7',
  '#d24dc0',
  '#2f8f5b',
  '#d9a86c',
  '#2b5f8f',
  '#8a94a6',
  '#c94a6b',
  '#0e7c86',
  '#c46210',
  '#5b8c00',
  '#b03060',
]

// Difficulty is a head start: how many colours the endless run opens with.
const LEVELS = [
  { key: 'mudah', label: 'Mudah', start: 3 },
  { key: 'sedang', label: 'Sedang', start: 7 },
  { key: 'sulit', label: 'Sulit', start: 10 },
]

const phase = ref('setup') // setup | play | won
const sel = ref(LEVELS[0]) // difficulty chosen on the setup screen
const colors = ref(MIN_COLORS) // colours in the current board
const round = ref(1) // rounds cleared this run + 1
const tubes = ref([]) // array of arrays, bottom -> top, holding colour indices
const picked = ref(-1) // the bottle whose top run is lifted, or -1
const moves = ref(0)
const history = ref([]) // snapshots for Undo
const solvedCount = ref(0)

let advanceTimer = 0

const bottleCount = computed(() => colors.value + EMPTIES)
const nextColors = computed(() => Math.min(colors.value + 1, MAX_COLORS))
const atMax = computed(() => colors.value >= MAX_COLORS)

// Liquid shrinks as the board grows so a full 24-bottle set still fits a phone.
const dims = computed(() => {
  const n = bottleCount.value
  if (n <= 7) return { seg: 19, tw: 36 }
  if (n <= 9) return { seg: 16, tw: 31 }
  if (n <= 12) return { seg: 14, tw: 27 }
  if (n <= 16) return { seg: 13, tw: 24 }
  if (n <= 20) return { seg: 12, tw: 21 }
  return { seg: 11, tw: 19 }
})

// --- Pour rules -------------------------------------------------------------

function topRun(t) {
  if (!t.length) return null
  const c = t[t.length - 1]
  let n = 1
  for (let i = t.length - 2; i >= 0 && t[i] === c; i--) n++
  return { c, n }
}

function pourCount(a, b) {
  if (a === b || !a.length || b.length >= CAP) return 0
  const { c, n } = topRun(a)
  const bt = b.length ? b[b.length - 1] : null
  if (bt !== null && bt !== c) return 0
  if (b.length === 0 && n === a.length) return 0 // relocating a whole bottle: no progress
  return Math.min(n, CAP - b.length)
}

function isSolved(ts) {
  return ts.every((t) => t.length === 0 || (t.length === CAP && t.every((x) => x === t[0])))
}

// --- Level generation (constructive: solvable by construction) --------------

function shuffledIdx(n) {
  const a = [...Array(n).keys()]
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

// One scramble step is the exact inverse of a legal pour, so the whole scramble
// reverses into a valid solution.
function scrambleStep(ts) {
  for (const b of shuffledIdx(ts.length)) {
    const B = ts[b]
    if (!B.length) continue
    const { c, n } = topRun(B)
    const maxK = n === B.length ? n : n - 1
    if (maxK < 1) continue
    const k = 1 + Math.floor(Math.random() * maxK)
    for (const a of shuffledIdx(ts.length)) {
      if (a === b) continue
      const A = ts[a]
      if (A.length + k > CAP) continue
      if (A.length && A[A.length - 1] === c) continue
      for (let i = 0; i < k; i++) A.push(B.pop())
      return true
    }
  }
  return false
}

function generate(nColors) {
  const ts = []
  for (let c = 0; c < nColors; c++) ts.push(Array(CAP).fill(c))
  for (let e = 0; e < EMPTIES; e++) ts.push([])
  const target = nColors * 12
  let done = 0
  let guard = 0
  while (done < target && guard < target * 30) {
    guard++
    if (scrambleStep(ts)) done++
  }
  if (isSolved(ts)) return generate(nColors) // scramble somehow undid itself
  return ts
}

// --- Game actions -----------------------------------------------------------

function deal() {
  tubes.value = generate(colors.value)
  picked.value = -1
  moves.value = 0
  history.value = []
  phase.value = 'play'
}

function start() {
  clearTimeout(advanceTimer)
  colors.value = sel.value.start
  round.value = 1
  deal()
}

function nextRound() {
  clearTimeout(advanceTimer)
  colors.value = nextColors.value
  round.value += 1
  deal()
}

function snapshot() {
  history.value.push(tubes.value.map((t) => t.slice()))
  if (history.value.length > 400) history.value.shift()
}

function tapTube(i) {
  if (phase.value !== 'play') return
  if (picked.value === -1) {
    if (tubes.value[i].length) {
      picked.value = i
      sfx.tick()
    }
    return
  }
  if (picked.value === i) {
    picked.value = -1
    return
  }
  const from = tubes.value[picked.value]
  const to = tubes.value[i]
  const k = pourCount(from, to)
  if (k) {
    snapshot()
    for (let m = 0; m < k; m++) to.push(from.pop())
    moves.value += 1
    picked.value = -1
    sfx.tick()
    if (isSolved(tubes.value)) win()
  } else {
    picked.value = tubes.value[i].length ? i : -1
    if (picked.value === i) sfx.tick()
  }
}

function undo() {
  if (phase.value !== 'play' || !history.value.length) return
  tubes.value = history.value.pop()
  moves.value = Math.max(0, moves.value - 1)
  picked.value = -1
}

function win() {
  phase.value = 'won'
  picked.value = -1
  sfx.win()
  solvedCount.value += 1
  try {
    localStorage.setItem(SOLVED_KEY, String(solvedCount.value))
  } catch (e) {
    /* storage may be blocked; keep in-memory */
  }
  clearTimeout(advanceTimer)
  advanceTimer = setTimeout(nextRound, 1300)
}

function toSetup() {
  clearTimeout(advanceTimer)
  phase.value = 'setup'
  picked.value = -1
}

// --- Presentation -----------------------------------------------------------

// Merge each run of one colour into a single band, so a multi-pour rises (and
// drains) as one continuous body of liquid rather than stacked blocks.
function bandsOf(i) {
  const t = tubes.value[i]
  const out = []
  for (let idx = 0; idx < t.length; idx++) {
    const c = t[idx]
    const last = out[out.length - 1]
    if (last && last.c === c) last.n++
    else out.push({ c, n: 1 })
  }
  return out.map((b, bi) => ({
    color: COLORS[b.c],
    n: b.n,
    surface: bi === out.length - 1,
    edge: bi > 0,
  }))
}
function tubeDone(i) {
  const t = tubes.value[i]
  return t.length === CAP && t.every((x) => x === t[0])
}

onMounted(() => {
  try {
    solvedCount.value = Number(localStorage.getItem(SOLVED_KEY)) || 0
  } catch (e) {
    solvedCount.value = 0
  }
})
onBeforeUnmount(() => clearTimeout(advanceTimer))
</script>

<template>
  <div class="sortir">
    <div class="panel">
      <section class="screen">
        <!-- Setup: pick a head start before playing. -->
        <template v-if="phase === 'setup'">
          <p class="brand">SORTIR<span class="brand__accent"> WARNA</span></p>
          <p class="eyebrow">PILIH TINGKAT</p>

          <div class="picker picker--3 setup__picker">
            <button
              v-for="lv in LEVELS"
              :key="lv.key"
              class="pick"
              type="button"
              :class="{ 'is-on': lv.key === sel.key }"
              @click="sel = lv"
            >
              {{ lv.label }}
            </button>
          </div>
          <p class="setup__info">
            MULAI {{ sel.start }} WARNA · TANPA BATAS s/d {{ MAX_COLORS }} · SELESAI {{ solvedCount }}
          </p>
          <button class="cta" type="button" @click="start">Mulai ▸</button>
        </template>

        <!-- Play / won. -->
        <template v-else>
          <div class="backbar">
            <button class="mini" type="button" @click="toSetup">← Tingkat</button>
          </div>
          <p class="brand brand--sm">SORTIR<span class="brand__accent"> WARNA</span></p>

          <div class="solobar hud">
            <span>BABAK <b>{{ round }}</b></span>
            <span>WARNA <b>{{ colors }}</b></span>
            <span class="solobar__best">SELESAI {{ solvedCount }}</span>
          </div>

          <div class="rack" :style="{ '--seg': dims.seg + 'px', '--tw': dims.tw + 'px' }">
            <button
              v-for="(t, i) in tubes"
              :key="i"
              class="tube"
              type="button"
              :class="{ 'is-picked': picked === i, 'is-done': tubeDone(i) }"
              @click="tapTube(i)"
            >
              <span class="glass">
                <span
                  v-for="(band, bi) in bandsOf(i)"
                  :key="bi"
                  class="liquid"
                  :class="{ 'is-surface': band.surface, 'is-edge': band.edge }"
                  :style="{ background: band.color, height: `calc(var(--seg) * ${band.n})` }"
                />
              </span>
            </button>
          </div>

          <template v-if="phase === 'play'">
            <p class="tip">Ketuk botol untuk mengangkat cairan, ketuk botol lain untuk menuang.</p>
            <div class="tools">
              <button class="mini" type="button" :disabled="!history.length" @click="undo">
                ↶ Undo
              </button>
              <button class="mini" type="button" @click="deal">Acak ulang</button>
            </div>
          </template>

          <div v-else class="result">
            <p class="result__title">Babak {{ round }} beres!</p>
            <p class="result__streak">
              {{ moves }} LANGKAH ·
              {{ atMax ? 'WARNA MAKS' : nextColors + ' WARNA BERIKUTNYA' }}
            </p>
            <button class="cta" type="button" @click="nextRound">Lanjut ▸</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/backbar/picker/pick/
   solobar/result come from src/styles.css. */
.sortir {
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
  font-size: 27px;
}
.brand--sm {
  font-size: 21px;
  margin-top: 2px;
}

/* ---- Setup ---- */
.picker--3 {
  grid-template-columns: repeat(3, 1fr);
  width: 100%;
}
.setup__picker {
  margin-bottom: 14px;
}
.setup__info {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--muted);
  text-align: center;
  margin-bottom: 20px;
}

.hud {
  margin: 12px 0;
}
.hud b {
  color: var(--aqua-deep);
}

/* ---- Bottle rack ---- */
.rack {
  --seg: 19px;
  --tw: 36px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-end;
  gap: 14px 12px;
  min-height: 150px;
  margin: 28px 0 16px;
}
.tube {
  position: relative;
  padding: 4px 4px 0;
  background: transparent;
  border: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.12s ease;
}
.tube.is-picked {
  transform: translateY(-14px);
}

/* The glass bottle: open mouth, rounded belly, liquid clipped inside. */
.glass {
  position: relative;
  display: flex;
  flex-direction: column-reverse;
  width: var(--tw);
  height: calc(var(--seg) * 8);
  background: var(--paper-lit);
  border: 3px solid var(--ink);
  border-top: 0;
  border-radius: 6px 6px 15px 15px / 5px 5px 22px 22px;
  overflow: hidden;
  box-shadow: var(--pop-sm);
}
.glass::before {
  content: '';
  position: absolute;
  top: 5px;
  bottom: 6px;
  left: 20%;
  width: 15%;
  background: linear-gradient(rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.1));
  border-radius: 999px;
  z-index: 2;
  pointer-events: none;
}
.tube.is-picked .glass {
  box-shadow: 4px 10px 0 var(--ink);
}
.tube.is-done .glass {
  border-color: var(--aqua-deep);
  box-shadow: 0 0 0 2px var(--aqua-deep), var(--pop-sm);
}

.liquid {
  width: 100%;
  transform-origin: bottom;
  transition: height 0.26s cubic-bezier(0.45, 0.05, 0.3, 1);
  animation: sortir-pour 0.26s ease-out;
}
.liquid.is-edge {
  box-shadow: inset 0 -2px 0 rgba(44, 19, 56, 0.16);
}
.liquid.is-surface {
  box-shadow: inset 0 4px 0 rgba(255, 255, 255, 0.28);
}
.liquid.is-surface.is-edge {
  box-shadow: inset 0 4px 0 rgba(255, 255, 255, 0.28), inset 0 -2px 0 rgba(44, 19, 56, 0.16);
}

@keyframes sortir-pour {
  from {
    transform: scaleY(0);
  }
  to {
    transform: scaleY(1);
  }
}

/* ---- Tip + tools ---- */
.tip {
  margin: 0 0 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--muted);
  text-align: center;
}
.tools {
  display: flex;
  justify-content: center;
  gap: 10px;
}

/* ---- Result ---- */
.result {
  width: 100%;
  text-align: center;
  padding-top: 4px;
}
.result__streak {
  margin: 6px 0 14px;
}
</style>
