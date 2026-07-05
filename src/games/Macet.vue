<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Macet — Rush Hour (solo). A 6×6 lot is jammed with cars; slide them along
// their lane to open a path so the red car can drive out the exit on the right.
// Each car relocation counts as one move (any distance). Boards are generated on
// the fly and graded by a breadth-first search: it finds the shortest solution
// (the MINIMAL target) and guarantees every board is solvable. Pick a difficulty
// and the generator hunts — within a small time budget — for the hardest
// solvable board in that band, so the puzzles never run out.

const SIZE = 6
const EXIT_ROW = 2
const CELLS = Array.from({ length: SIZE * SIZE }, (_, i) => i)

// Non-red car colours, assigned in placement order.
const PALETTE = [
  'var(--aqua)',
  'var(--grape)',
  'var(--sun)',
  'var(--sun-core)',
  'var(--aqua-deep)',
  '#5b8def',
  '#e08bd0',
  '#8bd0a0',
  '#c9a24b',
]

// Difficulty bands. `floor` is the minimal-move target the generator aims for;
// `budget` caps how long it hunts (ms) before taking the hardest board it found.
// Denser boards tend to be harder, so the vehicle count (vl..vh) scales up.
const DIFFS = [
  { key: 'mudah', label: 'Mudah', hint: 'Pemanasan — cuma beberapa langkah.', floor: 4, budget: 150, vl: 3, vh: 5 },
  { key: 'sedang', label: 'Sedang', hint: 'Perlu sedikit memutar otak.', floor: 9, budget: 350, vl: 5, vh: 8 },
  { key: 'sulit', label: 'Sulit', hint: 'Kemacetan parah. Siap-siap.', floor: 16, budget: 600, vl: 8, vh: 11 },
]
const diffKey = 'dusk-macet-diff'

const diff = ref(1) // index into DIFFS
const source = ref([]) // the generated board's starting layout (for "Ulang papan")
const vehicles = ref([]) // working copy: { id, row, col, len, dir, red, color }
const selected = ref(null) // vehicle id (its index)
const moves = ref(0)
const phase = ref('menu') // menu | play | won
const solved = ref(0) // boards cleared at this difficulty (persisted)
const exiting = ref(false) // red drive-off animation in flight
const generating = ref(false) // hunting for a fresh board
const minMoves = ref(0)

const perfect = computed(() => phase.value === 'won' && moves.value === minMoves.value)

// ---- Shortest-solution search (also our solvability guarantee) ----
function solve(src) {
  const redIdx = src.findIndex((v) => v.red)
  const keyOf = (s) => s.map((v) => v.row * SIZE + v.col).join(',')
  const won = (s) => s[redIdx].col + s[redIdx].len - 1 === SIZE - 1
  const start = src.map((v) => ({ row: v.row, col: v.col, len: v.len, dir: v.dir }))
  if (won(start)) return 0
  const seen = new Set([keyOf(start)])
  let frontier = [start]
  let depth = 0
  while (frontier.length) {
    depth++
    const nextF = []
    for (const s of frontier) {
      const g = new Uint8Array(SIZE * SIZE)
      for (const v of s) {
        for (let k = 0; k < v.len; k++) {
          const r = v.row + (v.dir === 'v' ? k : 0)
          const c = v.col + (v.dir === 'h' ? k : 0)
          g[r * SIZE + c] = 1
        }
      }
      for (let i = 0; i < s.length; i++) {
        const v = s[i]
        const mk = (row, col) => {
          const ns = s.slice()
          ns[i] = { ...v, row, col }
          return ns
        }
        const consider = (ns) => {
          const kk = keyOf(ns)
          if (seen.has(kk)) return false
          seen.add(kk)
          nextF.push(ns)
          return i === redIdx && ns[redIdx].col + ns[redIdx].len - 1 === SIZE - 1
        }
        if (v.dir === 'h') {
          for (let c = v.col + 1; c + v.len - 1 < SIZE; c++) {
            if (g[v.row * SIZE + (c + v.len - 1)]) break
            if (consider(mk(v.row, c))) return depth
          }
          for (let c = v.col - 1; c >= 0; c--) {
            if (g[v.row * SIZE + c]) break
            if (consider(mk(v.row, c))) return depth
          }
        } else {
          for (let r = v.row + 1; r + v.len - 1 < SIZE; r++) {
            if (g[(r + v.len - 1) * SIZE + v.col]) break
            if (consider(mk(r, v.col))) return depth
          }
          for (let r = v.row - 1; r >= 0; r--) {
            if (g[r * SIZE + v.col]) break
            if (consider(mk(r, v.col))) return depth
          }
        }
      }
    }
    frontier = nextF
    if (depth > 80) break
  }
  return Infinity
}

// ---- Random board generation ----
const randInt = (n) => Math.floor(Math.random() * n)

// True if every vehicle sits in-bounds without overlapping another.
function fits(list) {
  const g = new Uint8Array(SIZE * SIZE)
  for (const v of list) {
    for (let k = 0; k < v.len; k++) {
      const r = v.row + (v.dir === 'v' ? k : 0)
      const c = v.col + (v.dir === 'h' ? k : 0)
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || g[r * SIZE + c]) return false
      g[r * SIZE + c] = 1
    }
  }
  return true
}

// A random board: the red car on the exit row plus k non-red vehicles. No other
// horizontal car shares the exit row, keeping that lane a clean duel.
function candidate(k) {
  const list = [{ row: EXIT_ROW, col: randInt(3), len: 2, dir: 'h', red: true }]
  let tries = 0
  while (list.length < k + 1 && tries < 200) {
    tries++
    const len = Math.random() < 0.68 ? 2 : 3
    const dir = Math.random() < 0.5 ? 'h' : 'v'
    let row, col
    if (dir === 'h') {
      row = randInt(SIZE)
      col = randInt(SIZE - len + 1)
    } else {
      col = randInt(SIZE)
      row = randInt(SIZE - len + 1)
    }
    if (dir === 'h' && row === EXIT_ROW) continue
    const v = { row, col, len, dir }
    if (fits([...list, v])) list.push(v)
  }
  return list
}

// Async, chunked generation state. Hunting for a hard board can take most of a
// second, so we time-slice the search across setTimeout ticks to keep the UI
// responsive. `genToken` invalidates an in-flight hunt when a newer one starts.
let genToken = 0
let genTimer = 0

// ---- Occupancy of the current board, ignoring one vehicle ----
function occupied(exceptId) {
  const g = new Uint8Array(SIZE * SIZE)
  for (const v of vehicles.value) {
    if (v.id === exceptId) continue
    for (let k = 0; k < v.len; k++) {
      const r = v.row + (v.dir === 'v' ? k : 0)
      const c = v.col + (v.dir === 'h' ? k : 0)
      g[r * SIZE + c] = 1
    }
  }
  return g
}

// The cells the selected car can slide to → each maps to the car's new top-left.
// The tappable cell is the car's new leading edge (tap where the nose should go).
const targets = computed(() => {
  const map = new Map()
  if (selected.value == null || phase.value !== 'play') return map
  const v = vehicles.value.find((x) => x.id === selected.value)
  if (!v) return map
  const g = occupied(v.id)
  if (v.dir === 'h') {
    for (let c = v.col + 1; c + v.len - 1 < SIZE; c++) {
      const lead = v.row * SIZE + (c + v.len - 1)
      if (g[lead]) break
      map.set(lead, { row: v.row, col: c })
    }
    for (let c = v.col - 1; c >= 0; c--) {
      const lead = v.row * SIZE + c
      if (g[lead]) break
      map.set(lead, { row: v.row, col: c })
    }
  } else {
    for (let r = v.row + 1; r + v.len - 1 < SIZE; r++) {
      const lead = (r + v.len - 1) * SIZE + v.col
      if (g[lead]) break
      map.set(lead, { row: r, col: v.col })
    }
    for (let r = v.row - 1; r >= 0; r--) {
      const lead = r * SIZE + v.col
      if (g[lead]) break
      map.set(lead, { row: r, col: v.col })
    }
  }
  return map
})

function loadSolved() {
  try {
    const val = localStorage.getItem(`dusk-macet-solved-${DIFFS[diff.value].key}`)
    solved.value = val ? Number(val) : 0
  } catch (e) {
    solved.value = 0
  }
}

// Turn a starting layout into the working car list (ids + colours) and reset.
function spawn(board) {
  let ci = 0
  vehicles.value = board.map((v, idx) => ({
    ...v,
    id: idx,
    red: !!v.red,
    color: v.red ? 'var(--berry)' : PALETTE[ci++ % PALETTE.length],
  }))
  selected.value = null
  moves.value = 0
  phase.value = 'play'
  exiting.value = false
}

// Generate a fresh board at difficulty i (defaults to the current one). The hunt
// runs in short time-sliced chunks so the UI stays responsive even when a hard
// board takes most of a second to find; a "Mengacak…" state covers the wait.
function newPuzzle(i = diff.value) {
  diff.value = i
  try {
    localStorage.setItem(diffKey, String(i))
  } catch (e) {
    /* storage may be blocked */
  }
  loadSolved()
  const d = DIFFS[i]
  const token = ++genToken
  clearTimeout(genTimer)
  generating.value = true
  selected.value = null
  moves.value = 0
  phase.value = 'play'
  vehicles.value = [] // clear the lot while we hunt
  const t0 = performance.now()
  let best = null
  let bestMin = 1

  const finish = () => {
    if (token !== genToken) return
    if (!best) {
      // Extreme fallback (never observed): a guaranteed two-move board.
      best = [
        { row: EXIT_ROW, col: 0, len: 2, dir: 'h', red: true },
        { row: EXIT_ROW, col: 3, len: 2, dir: 'v' },
      ]
      bestMin = solve(best)
    }
    source.value = best
    minMoves.value = bestMin
    spawn(best)
    generating.value = false
  }

  const step = () => {
    if (token !== genToken) return // superseded by a newer hunt
    const chunkEnd = performance.now() + 14 // ~one frame of work, then yield
    while (performance.now() < chunkEnd) {
      const board = candidate(d.vl + randInt(d.vh - d.vl + 1))
      const m = solve(board)
      if (m === Infinity || m < 2) continue
      if (m > bestMin) {
        bestMin = m
        best = board
        if (m >= d.floor) return finish() // hard enough — stop early
      }
    }
    if (performance.now() - t0 >= d.budget) return finish()
    genTimer = setTimeout(step, 0)
  }
  step()
}

// Replay the same board from the start.
function restart() {
  spawn(source.value)
}

// Start playing at the chosen difficulty (generates the first board).
function startGame() {
  newPuzzle(diff.value)
}

// Back to the difficulty picker; cancel any in-flight hunt.
function toMenu() {
  genToken++
  clearTimeout(genTimer)
  generating.value = false
  selected.value = null
  phase.value = 'menu'
}

function tapVehicle(id) {
  if (phase.value !== 'play' || exiting.value) return
  selected.value = selected.value === id ? null : id
}

function tapCell(idx) {
  if (phase.value !== 'play' || exiting.value) return
  const t = targets.value.get(idx)
  if (!t) {
    selected.value = null
    return
  }
  const id = selected.value
  vehicles.value = vehicles.value.map((v) => (v.id === id ? { ...v, row: t.row, col: t.col } : v))
  moves.value++
  selected.value = null
  const red = vehicles.value.find((v) => v.red)
  if (red.col + red.len - 1 === SIZE - 1) driveOut()
  else sfx.tick()
}

let exitTimer = 0
function driveOut() {
  exiting.value = true
  sfx.tick()
  clearTimeout(exitTimer)
  exitTimer = setTimeout(win, 430)
}

function win() {
  phase.value = 'won'
  sfx.win()
  solved.value += 1
  try {
    localStorage.setItem(`dusk-macet-solved-${DIFFS[diff.value].key}`, String(solved.value))
  } catch (e) {
    /* storage may be blocked; keep the in-memory tally */
  }
}

// Absolute placement of a car over the 6×6 board, as percentages.
function vStyle(v) {
  const cell = 100 / SIZE
  return {
    left: v.col * cell + '%',
    top: v.row * cell + '%',
    width: (v.dir === 'h' ? v.len : 1) * cell + '%',
    height: (v.dir === 'v' ? v.len : 1) * cell + '%',
  }
}

onMounted(() => {
  try {
    const v = localStorage.getItem(diffKey)
    if (v != null && DIFFS[Number(v)]) diff.value = Number(v) // default: Sedang
  } catch (e) {
    /* ignore */
  }
  loadSolved()
})
onBeforeUnmount(() => {
  clearTimeout(exitTimer)
  clearTimeout(genTimer)
  genToken++ // stop any in-flight hunt
})
</script>

<template>
  <div class="macet">
    <div class="panel">
      <!-- ===== Menu (difficulty picker) ===== -->
      <section v-if="phase === 'menu'" class="screen">
        <p class="brand">MA<span class="brand__accent">CET</span></p>
        <p class="eyebrow">KELUARKAN MOBIL MERAH</p>

        <div class="field">
          <span class="field__label">Tingkat kesulitan</span>
          <div class="diffs" role="group" aria-label="Tingkat kesulitan">
            <button
              v-for="(d, i) in DIFFS"
              :key="d.key"
              class="pick"
              :class="{ 'is-on': diff === i }"
              type="button"
              @click="diff = i"
            >
              {{ d.label }}
            </button>
          </div>
        </div>

        <p class="menu-hint">{{ DIFFS[diff].hint }}</p>
        <button class="cta" type="button" @click="startGame">Mulai ▸</button>
      </section>

      <!-- ===== Play ===== -->
      <section v-else-if="phase === 'play'" class="screen">
        <div class="topbar">
          <button class="mini" type="button" @click="toMenu">← Ganti</button>
          <span class="status">{{ DIFFS[diff].label }}</span>
          <button class="mini" type="button" :disabled="generating" @click="newPuzzle()">Baru</button>
        </div>

        <div class="solobar stats">
          <span>LANGKAH <b>{{ moves }}</b></span>
          <span>MINIMAL <b>{{ generating ? '…' : minMoves }}</b></span>
          <span class="solobar__best">LOLOS {{ solved }}</span>
        </div>

        <div class="board" role="group" aria-label="Papan Macet 6 kali 6">
          <span class="lane" aria-hidden="true" />
          <div class="cellgrid">
            <button
              v-for="idx in CELLS"
              :key="idx"
              class="cell"
              :class="{ 'is-target': targets.has(idx) }"
              type="button"
              tabindex="-1"
              aria-hidden="true"
              @click="tapCell(idx)"
            />
          </div>
          <button
            v-for="v in vehicles"
            :key="v.id"
            class="car"
            :class="{ 'car--red': v.red, 'is-sel': selected === v.id, 'is-exit': exiting && v.red }"
            type="button"
            :style="vStyle(v)"
            :aria-label="v.red ? 'Mobil merah' : 'Mobil'"
            @click="tapVehicle(v.id)"
          >
            <span class="car__body" :style="{ background: v.color }" />
          </button>
          <span class="exit-gap" aria-hidden="true" />
          <span class="exit" aria-hidden="true" />
          <div v-if="generating" class="board__gen">
            <span class="board__genlabel">Mengacak papan…</span>
          </div>
        </div>

        <p class="tip">Ketuk mobil, lalu ketuk sel tujuan di jalurnya.</p>
        <button class="cta" type="button" :disabled="generating" @click="restart">Ulang papan ▸</button>
      </section>

      <!-- ===== Win ===== -->
      <section v-else class="screen result">
        <p class="brand">MA<span class="brand__accent">CET</span></p>
        <p class="result__title">Lolos!</p>
        <p class="result__sub">{{ DIFFS[diff].label }} · {{ moves }} langkah · minimal {{ minMoves }}</p>
        <p class="result__streak">
          <template v-if="perfect">SEMPURNA · </template>LOLOS {{ solved }} PAPAN
        </p>
        <button class="cta" type="button" @click="newPuzzle()">Papan baru ▸</button>
        <button class="cta cta--ghost replay" type="button" @click="toMenu">Ganti tingkat</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/picker/solobar/result come
   from src/styles.css. */
.macet {
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
/* Difficulty segmented control — three word-label chips across the full width. */
.diffs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 4px 0 14px;
}
.diffs .pick {
  padding: 10px 0;
}

/* Menu hint under the difficulty picker. */
.menu-hint {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--muted);
  text-align: center;
  margin: 0 0 20px;
}
.stats {
  margin-bottom: 10px;
}
.stats b {
  color: var(--aqua-deep);
  font-size: 14px;
}

/* ---- The parking lot ---- */
.board {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: color-mix(in srgb, var(--ink) 7%, var(--cream));
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  box-shadow: var(--pop);
  margin: 2px 0 14px;
}
/* The exit lane, tinted so the goal row reads at a glance. */
.lane {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(2 * 100% / 6);
  height: calc(100% / 6);
  background: rgba(255, 77, 121, 0.12);
  pointer-events: none;
}
/* Tap-target grid sits under the cars. */
.cellgrid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-template-rows: repeat(6, 1fr);
}
.cell {
  position: relative;
  border: 0;
  background: transparent;
  padding: 0;
  z-index: 1;
  -webkit-tap-highlight-color: transparent;
}
.cell.is-target::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 36%;
  height: 36%;
  border-radius: 50%;
  background: rgba(35, 201, 173, 0.55);
  border: 2px solid var(--aqua-deep);
  animation: macet-target 1.1s ease-in-out infinite;
}

/* Cars are absolutely placed; the padded wrapper leaves a gutter so bodies read
   as separate blocks. */
.car {
  position: absolute;
  z-index: 2;
  border: 0;
  background: transparent;
  padding: 5px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: left 0.18s ease, top 0.18s ease, transform 0.42s ease-in;
}
.car__body {
  display: block;
  width: 100%;
  height: 100%;
  border: 2.6px solid var(--ink);
  border-radius: 9px;
  box-shadow: var(--pop-sm);
  transition: box-shadow 0.12s ease;
}
.car.is-sel {
  z-index: 3;
}
.car.is-sel .car__body {
  box-shadow: var(--pop-sm), inset 0 0 0 3px var(--sun);
}
.car--red .car__body {
  box-shadow: var(--pop-sm), inset 0 0 0 2px rgba(255, 255, 255, 0.5);
}
/* Drive off the right edge on a win. */
.car.is-exit {
  transform: translateX(180%);
  z-index: 4;
}

/* "Shuffling" veil while a fresh board is generated. */
.board__gen {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--cream) 74%, transparent);
}
.board__genlabel {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.22em;
  color: var(--muted);
  animation: macet-pulse 1s ease-in-out infinite;
}
@keyframes macet-pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

/* Break the right wall open on the goal row so the exit reads at a glance. */
.exit-gap {
  position: absolute;
  right: -3px;
  top: calc(2 * 100% / 6 + 5px);
  height: calc(100% / 6 - 10px);
  width: 5px;
  background: var(--cream);
  z-index: 3;
}

/* Exit arrow just outside the lot on the goal row. */
.exit {
  position: absolute;
  right: -13px;
  top: calc(2.5 * 100% / 6);
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 9px solid transparent;
  border-bottom: 9px solid transparent;
  border-left: 13px solid var(--sun-core);
  filter: drop-shadow(1.5px 1.5px 0 var(--ink));
}

.tip {
  font-size: 12px;
  color: var(--muted);
  text-align: center;
  line-height: 1.45;
  margin: 2px auto 14px;
  max-width: 300px;
}

.replay {
  margin-top: 10px;
}
.result .brand {
  margin-bottom: 12px;
}
.result__title {
  animation: geser-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes geser-pop {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
@keyframes macet-target {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.18);
    opacity: 1;
  }
}
</style>
