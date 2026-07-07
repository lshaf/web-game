<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Takuzu (Binairo) — fill the grid with two colours so that no three of the same
// touch in a line, every row and column holds an equal count of each, and no two
// rows (or columns) are identical. Puzzles are dug from a full solution and
// checked to have exactly one answer, so pure logic always cracks them. Tap a
// cell to cycle empty → sun → aqua → empty. Timer + best time persist.

const SOLVED_KEY = 'dusk-takuzu-solved'
const BEST_KEY = 'dusk-takuzu-best'

const LEVELS = [
  { key: 'mudah', label: 'Mudah', N: 6, reveal: 2 },
  { key: 'sedang', label: 'Sedang', N: 8, reveal: 12 },
  { key: 'sulit', label: 'Sulit', N: 8, reveal: 0 },
]

// --- Solver / generator (all three Takuzu rules) ----------------------------

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

// Is the value just placed at (r,c) still consistent with every rule?
function ok(b, r, c, N) {
  const row = b[r]
  for (let s = Math.max(0, c - 2); s <= Math.min(N - 3, c); s++) {
    if (row[s] !== -1 && row[s] === row[s + 1] && row[s + 1] === row[s + 2]) return false
  }
  for (let s = Math.max(0, r - 2); s <= Math.min(N - 3, r); s++) {
    if (b[s][c] !== -1 && b[s][c] === b[s + 1][c] && b[s + 1][c] === b[s + 2][c]) return false
  }
  let c0 = 0
  let c1 = 0
  for (let j = 0; j < N; j++) {
    if (row[j] === 0) c0++
    else if (row[j] === 1) c1++
  }
  if (c0 > N / 2 || c1 > N / 2) return false
  let r0 = 0
  let r1 = 0
  for (let i = 0; i < N; i++) {
    if (b[i][c] === 0) r0++
    else if (b[i][c] === 1) r1++
  }
  if (r0 > N / 2 || r1 > N / 2) return false
  if (!row.includes(-1)) {
    for (let i = 0; i < N; i++) {
      if (i !== r && !b[i].includes(-1) && b[i].every((x, j) => x === row[j])) return false
    }
  }
  if (b.every((rr) => rr[c] !== -1)) {
    for (let j = 0; j < N; j++) {
      if (j !== c && b.every((rr) => rr[j] !== -1) && b.every((rr) => rr[c] === rr[j])) return false
    }
  }
  return true
}

function findEmpty(b, N) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c] === -1) return { r, c }
  return null
}

// Count solutions up to `limit` (for the uniqueness check).
function countSolutions(b, N, limit) {
  const e = findEmpty(b, N)
  if (!e) return 1
  let total = 0
  for (const v of [0, 1]) {
    b[e.r][e.c] = v
    if (ok(b, e.r, e.c, N)) {
      total += countSolutions(b, N, limit)
      if (total >= limit) {
        b[e.r][e.c] = -1
        return total
      }
    }
    b[e.r][e.c] = -1
  }
  return total
}

function fullSolution(N) {
  const b = Array.from({ length: N }, () => Array(N).fill(-1))
  const fill = () => {
    const e = findEmpty(b, N)
    if (!e) return true
    for (const v of shuffle([0, 1])) {
      b[e.r][e.c] = v
      if (ok(b, e.r, e.c, N) && fill()) return true
      b[e.r][e.c] = -1
    }
    return false
  }
  fill()
  return b
}

function generate(cfg) {
  const N = cfg.N
  const sol = fullSolution(N)
  const puzzle = sol.map((r) => r.slice())
  const coords = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) coords.push({ r, c })
  // Dig as many holes as keep the answer unique.
  for (const { r, c } of shuffle(coords)) {
    const saved = puzzle[r][c]
    puzzle[r][c] = -1
    if (countSolutions(puzzle.map((row) => row.slice()), N, 2) !== 1) puzzle[r][c] = saved
  }
  // Reveal a few extra givens to ease the lighter difficulties.
  const holes = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (puzzle[r][c] === -1) holes.push({ r, c })
  shuffle(holes)
  for (let i = 0; i < cfg.reveal && i < holes.length; i++) {
    const { r, c } = holes[i]
    puzzle[r][c] = sol[r][c]
  }
  return {
    N,
    sol,
    board: puzzle.map((r) => r.slice()),
    given: puzzle.map((row) => row.map((v) => v !== -1)),
  }
}

// --- Game state -------------------------------------------------------------

const phase = ref('setup') // setup | play | won
const sel = ref(LEVELS[0])
const level = ref(LEVELS[0])
const N = ref(6)
const board = ref([])
const given = ref([])
const sol = ref([])
const elapsed = ref(0)
const solvedCount = ref(0)
const bestTime = ref(0)

let timer = 0
let startAt = 0

const timeLabel = computed(() => fmt(elapsed.value))
function fmt(s) {
  const m = Math.floor(s / 60)
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

// Cells that sit inside a run of three equal colours — flagged as you play.
const errorCells = computed(() => {
  const set = new Set()
  const b = board.value
  const n = N.value
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = b[r][c]
      if (v === -1) continue
      if (c + 2 < n && b[r][c + 1] === v && b[r][c + 2] === v) {
        set.add(r + ',' + c).add(r + ',' + (c + 1)).add(r + ',' + (c + 2))
      }
      if (r + 2 < n && b[r + 1][c] === v && b[r + 2][c] === v) {
        set.add(r + ',' + c).add(r + 1 + ',' + c).add(r + 2 + ',' + c)
      }
    }
  }
  return set
})

function deal() {
  const g = generate(level.value)
  N.value = g.N
  board.value = g.board
  given.value = g.given
  sol.value = g.sol
  elapsed.value = 0
  phase.value = 'play'
}
function start() {
  level.value = sel.value
  deal()
  startTimer()
}
function newGame() {
  deal()
  startTimer()
}
function toSetup() {
  stopTimer()
  phase.value = 'setup'
}

function tap(r, c) {
  if (phase.value !== 'play' || given.value[r][c]) return
  const cur = board.value[r][c]
  board.value[r][c] = cur === -1 ? 0 : cur === 0 ? 1 : -1
  sfx.tick()
  checkWin()
}

function checkWin() {
  const b = board.value
  const n = N.value
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (b[r][c] !== sol.value[r][c]) return
    }
  }
  win()
}

function win() {
  phase.value = 'won'
  stopTimer()
  sfx.win()
  solvedCount.value += 1
  persist(SOLVED_KEY, solvedCount.value)
  if (bestTime.value === 0 || elapsed.value < bestTime.value) {
    bestTime.value = elapsed.value
    persist(BEST_KEY, bestTime.value)
  }
}

function startTimer() {
  stopTimer()
  startAt = Date.now()
  elapsed.value = 0
  timer = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startAt) / 1000)
  }, 1000)
}
function stopTimer() {
  if (timer) clearInterval(timer)
  timer = 0
}
function persist(k, v) {
  try {
    localStorage.setItem(k, String(v))
  } catch (e) {
    /* storage may be blocked; keep in-memory */
  }
}

function cellClass(r, c) {
  const v = board.value[r][c]
  return {
    'cell--0': v === 0,
    'cell--1': v === 1,
    'is-given': given.value[r][c],
    'is-error': errorCells.value.has(r + ',' + c),
  }
}

onMounted(() => {
  try {
    solvedCount.value = Number(localStorage.getItem(SOLVED_KEY)) || 0
    bestTime.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch (e) {
    solvedCount.value = 0
    bestTime.value = 0
  }
})
onBeforeUnmount(stopTimer)
</script>

<template>
  <div class="takuzu">
    <div class="panel">
      <section class="screen">
        <template v-if="phase === 'setup'">
          <p class="brand">TAKU<span class="brand__accent">ZU</span></p>
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
          <p class="setup__info">{{ sel.N }}×{{ sel.N }} · SELESAI {{ solvedCount }}</p>
          <button class="cta" type="button" @click="start">Mulai ▸</button>
        </template>

        <template v-else>
          <div class="backbar">
            <button class="mini" type="button" @click="toSetup">← Tingkat</button>
          </div>
          <p class="brand brand--sm">TAKU<span class="brand__accent">ZU</span></p>

          <div class="solobar hud">
            <span>WAKTU <b>{{ timeLabel }}</b></span>
            <span>{{ level.N }}×{{ level.N }}</span>
            <span class="solobar__best">SELESAI {{ solvedCount }}</span>
          </div>

          <div class="board" :style="{ gridTemplateColumns: `repeat(${N}, 1fr)` }">
            <template v-for="(row, r) in board">
              <button
                v-for="(v, c) in row"
                :key="r + '-' + c"
                class="cell"
                type="button"
                :class="cellClass(r, c)"
                :disabled="phase !== 'play' || given[r][c]"
                @click="tap(r, c)"
              />
            </template>
          </div>
          <p class="tip">Tak boleh tiga warna sama berjajar · tiap baris & kolom seimbang.</p>

          <div v-if="phase === 'won'" class="result">
            <p class="result__title">Terpecahkan!</p>
            <p class="result__streak">WAKTU {{ timeLabel }} · SELESAI {{ solvedCount }}</p>
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
.takuzu {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 18px 26px;
}
.brand {
  font-size: 28px;
}
.brand--sm {
  font-size: 22px;
  margin-top: 2px;
}
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
  margin: 12px 0 14px;
}
.hud b {
  color: var(--aqua-deep);
}

/* ---- Board ---- */
.board {
  width: 100%;
  display: grid;
  gap: 5px;
  margin-bottom: 12px;
}
.cell {
  aspect-ratio: 1;
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 8px;
  box-shadow: var(--pop-sm);
  -webkit-tap-highlight-color: transparent;
  transition: background 0.1s ease, transform 0.06s ease;
}
.cell--0 {
  background: var(--sun);
}
.cell--1 {
  background: var(--aqua);
}
.cell.is-given {
  box-shadow: none;
  border-width: 3px;
}
.cell.is-given.cell--0 {
  background: var(--sun-core);
}
.cell.is-given.cell--1 {
  background: var(--aqua-deep);
}
.cell.is-error {
  outline: 3px solid var(--berry);
  outline-offset: -2px;
}
.cell:not(:disabled):active {
  transform: scale(0.92);
}

/* ---- Tip + result ---- */
.tip {
  margin: 0 0 8px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.02em;
  color: var(--muted);
  text-align: center;
  line-height: 1.5;
}
.result {
  width: 100%;
  text-align: center;
  padding-top: 6px;
}
.result__streak {
  margin: 6px 0 14px;
}
</style>
