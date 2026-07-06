<script setup>
import { ref, computed, onMounted } from 'vue'
import { sfx } from '../sound.js'

// Sortir Warna — a ball-sort puzzle. Pick a difficulty (7 / 14 / 21 tubes), then
// tap a tube to lift its top run and tap another to pour it onto a matching
// colour or into an empty tube. Sort every colour into its own tube to win.
// Levels are built by scrambling a solved board with moves that are the exact
// inverse of a legal pour, so every board is solvable by construction — no
// solver, and it scales to the big boards. Undo never traps you.

const H = 4 // balls per full tube
const EMPTIES = 2 // spare tubes every board keeps
const SOLVED_KEY = 'dusk-sortir-solved'

// Twenty distinct balls; the first (tubes − 2) are used, most-distinct first.
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
]

const LEVELS = [
  { key: 'mudah', label: 'Mudah', tubes: 7 },
  { key: 'sedang', label: 'Sedang', tubes: 14 },
  { key: 'sulit', label: 'Sulit', tubes: 21 },
]

const phase = ref('setup') // setup | play | won
const sel = ref(LEVELS[0]) // difficulty chosen on the setup screen
const level = ref(LEVELS[0]) // the difficulty in play
const tubes = ref([]) // array of arrays, bottom -> top, holding colour indices
const picked = ref(-1) // the tube whose top run is lifted, or -1
const moves = ref(0)
const history = ref([]) // snapshots for Undo
const solvedCount = ref(0)

// --- Pour rules -------------------------------------------------------------

// The maximal same-colour run at the top of a tube: { c, n } or null if empty.
function topRun(t) {
  if (!t.length) return null
  const c = t[t.length - 1]
  let n = 1
  for (let i = t.length - 2; i >= 0 && t[i] === c; i--) n++
  return { c, n }
}

// How many balls a pour from a->b would move (0 = illegal / pointless).
function pourCount(a, b) {
  if (a === b || !a.length || b.length >= H) return 0
  const { c, n } = topRun(a)
  const bt = b.length ? b[b.length - 1] : null
  if (bt !== null && bt !== c) return 0
  if (b.length === 0 && n === a.length) return 0 // relocating a whole tube: no progress
  return Math.min(n, H - b.length)
}

function isSolved(ts) {
  return ts.every((t) => t.length === 0 || (t.length === H && t.every((x) => x === t[0])))
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

// One scramble step is the exact inverse of a legal pour: move k balls of the
// top-run colour c from B to A, where A is empty or its top ≠ c (so the added
// run is exactly k), and removing k from B leaves it empty or still c-topped.
// Then the forward pour A→B is legal and undoes it — so the whole scramble
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
      if (A.length + k > H) continue
      if (A.length && A[A.length - 1] === c) continue
      for (let i = 0; i < k; i++) A.push(B.pop())
      return true
    }
  }
  return false
}

function generate(cfg) {
  const colors = cfg.tubes - EMPTIES
  const ts = []
  for (let c = 0; c < colors; c++) ts.push(Array(H).fill(c))
  for (let e = 0; e < EMPTIES; e++) ts.push([])
  const target = colors * 10
  let done = 0
  let guard = 0
  while (done < target && guard < target * 30) {
    guard++
    if (scrambleStep(ts)) done++
  }
  if (isSolved(ts)) return generate(cfg) // scramble somehow undid itself
  return ts
}

// --- Game actions -----------------------------------------------------------

function deal() {
  tubes.value = generate(level.value)
  picked.value = -1
  moves.value = 0
  history.value = []
  phase.value = 'play'
}
function start() {
  level.value = sel.value
  deal()
}
function newGame() {
  deal() // re-deal the same difficulty
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
    picked.value = -1 // tap the lifted tube again to set it down
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
}

function toSetup() {
  phase.value = 'setup'
  picked.value = -1
}

// --- Presentation -----------------------------------------------------------

// Balls shrink as the board grows, so 21 tubes still fit a phone.
const ballPx = computed(() => (level.value.tubes <= 7 ? 34 : level.value.tubes <= 14 ? 27 : 21))

function ballsOf(i) {
  const t = tubes.value[i]
  const run = picked.value === i ? topRun(t) : null
  const liftFrom = run ? t.length - run.n : Infinity
  return t.map((c, idx) => ({ color: COLORS[c], lifted: idx >= liftFrom }))
}
function tubeDone(i) {
  const t = tubes.value[i]
  return t.length === H && t.every((x) => x === t[0])
}

onMounted(() => {
  try {
    solvedCount.value = Number(localStorage.getItem(SOLVED_KEY)) || 0
  } catch (e) {
    solvedCount.value = 0
  }
})
</script>

<template>
  <div class="sortir">
    <div class="panel">
      <section class="screen">
        <!-- Setup: pick a difficulty before playing. -->
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
            {{ sel.tubes }} tabung · {{ sel.tubes - EMPTIES }} warna · SELESAI {{ solvedCount }}
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
            <span>LANGKAH <b>{{ moves }}</b></span>
            <span>TINGKAT <b>{{ level.label }}</b></span>
            <span class="solobar__best">SELESAI {{ solvedCount }}</span>
          </div>

          <div class="rack" :style="{ '--ball': ballPx + 'px' }">
            <button
              v-for="(t, i) in tubes"
              :key="i"
              class="tube"
              type="button"
              :class="{ 'is-picked': picked === i, 'is-done': tubeDone(i) }"
              @click="tapTube(i)"
            >
              <span
                v-for="(ball, bi) in ballsOf(i)"
                :key="bi"
                class="ball"
                :class="{ 'is-lifted': ball.lifted }"
                :style="{ background: ball.color }"
              />
            </button>
          </div>

          <template v-if="phase === 'play'">
            <p class="tip">Ketuk tabung untuk angkat, ketuk lagi untuk menuang.</p>
            <div class="tools">
              <button class="mini" type="button" :disabled="!history.length" @click="undo">
                ↶ Undo
              </button>
              <button class="mini" type="button" @click="newGame">Acak ulang</button>
            </div>
          </template>

          <div v-else class="result">
            <p class="result__title">Tersortir!</p>
            <p class="result__streak">{{ moves }} LANGKAH · SELESAI {{ solvedCount }}</p>
            <button class="cta" type="button" @click="newGame">Main lagi ▸</button>
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

/* ---- Tube rack ---- */
.rack {
  --ball: 34px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-end;
  gap: 12px 12px;
  min-height: 140px;
  margin: 30px 0 16px;
}
.tube {
  position: relative;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 3px;
  width: calc(var(--ball) + 10px);
  height: calc(var(--ball) * 4 + 18px);
  padding: 5px;
  background: var(--paper-lit);
  border: 3px solid var(--ink);
  border-top: none;
  border-radius: 6px 6px 16px 16px / 6px 6px 22px 22px;
  box-shadow: var(--pop-sm);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.tube.is-picked {
  transform: translateY(-10px);
  box-shadow: 4px 8px 0 var(--ink);
}
.tube.is-done {
  border-color: var(--aqua-deep);
}
.ball {
  width: var(--ball);
  height: var(--ball);
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.28);
  box-shadow: inset 3px 3px 0 rgba(255, 255, 255, 0.35);
  transition: transform 0.12s ease;
}
/* The lifted top run of the picked tube rises above the rim. */
.ball.is-lifted {
  transform: translateY(calc(var(--ball) * -0.9 - 4px));
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
