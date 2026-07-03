<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Connect 4 — drop discs into columns, line up four. Two modes: vs a simple
// 1-ply heuristic CPU, or pass-and-play. Red (R) always moves first; in CPU
// mode the human is Red and the computer is Yellow (Y).

const ROWS = 6
const COLS = 7
const cols = Array.from({ length: COLS }, (_, i) => i)
const rows = Array.from({ length: ROWS }, (_, i) => i)
const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]
const CENTER_FIRST = [3, 2, 4, 1, 5, 0, 6]

const mode = ref(null) // null (picker) | 'cpu' | 'duo'
const grid = ref(rows.map(() => Array(COLS).fill(''))) // grid[row][col], row 0 = top
const turn = ref('R')
const winner = ref(null) // null | 'R' | 'Y' | 'draw'
const winCells = ref([])
let cpuTimer = 0

const isOver = computed(() => winner.value !== null)
const locked = computed(() => isOver.value || (mode.value === 'cpu' && turn.value === 'Y'))

// The color's own name, in its disc color (see the .cname span in the template).
const colorName = (p) => (p === 'R' ? 'Merah' : 'Kuning')

function landingRow(col) {
  for (let r = ROWS - 1; r >= 0; r--) if (grid.value[r][col] === '') return r
  return -1
}
function isFull() {
  return grid.value[0].every((c) => c !== '')
}

function findWin() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = grid.value[r][c]
      if (!v) continue
      for (const [dr, dc] of DIRS) {
        const cells = [[r, c]]
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k
          const nc = c + dc * k
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid.value[nr][nc] !== v) break
          cells.push([nr, nc])
        }
        if (cells.length === 4) return { who: v, cells }
      }
    }
  }
  return null
}

function place(col, who) {
  const r = landingRow(col)
  if (r < 0) return
  grid.value[r][col] = who
  sfx.tick()
  const w = findWin()
  if (w) {
    winner.value = w.who
    winCells.value = w.cells
    sfx.win()
    return
  }
  if (isFull()) {
    winner.value = 'draw'
    sfx.lose()
    return
  }
  turn.value = who === 'R' ? 'Y' : 'R'
  if (mode.value === 'cpu' && turn.value === 'Y') cpuTimer = setTimeout(cpuMove, 380)
}

function play(col) {
  if (isOver.value || landingRow(col) < 0) return
  if (mode.value === 'cpu' && turn.value !== 'R') return
  place(col, turn.value)
}

// Does dropping `who` into `col` win immediately? (simulate + undo)
function wouldWin(col, who) {
  const r = landingRow(col)
  if (r < 0) return false
  grid.value[r][col] = who
  const w = findWin()
  grid.value[r][col] = ''
  return !!(w && w.who === who)
}

function cpuMove() {
  if (isOver.value || turn.value !== 'Y') return
  const valid = cols.filter((c) => landingRow(c) >= 0)
  let pick = valid.find((c) => wouldWin(c, 'Y')) // take a win
  if (pick === undefined) pick = valid.find((c) => wouldWin(c, 'R')) // block a loss
  if (pick === undefined) pick = CENTER_FIRST.find((c) => valid.includes(c)) // prefer center
  if (pick !== undefined) place(pick, 'Y')
}

function chooseMode(m) {
  mode.value = m
  reset()
}
function reset() {
  clearTimeout(cpuTimer)
  grid.value = rows.map(() => Array(COLS).fill(''))
  turn.value = 'R'
  winner.value = null
  winCells.value = []
}
function backToModes() {
  clearTimeout(cpuTimer)
  mode.value = null
}
function inWin(r, c) {
  return winCells.value.some(([wr, wc]) => wr === r && wc === c)
}

function onKeydown(e) {
  if (e.key === 'Enter' && isOver.value) {
    e.preventDefault()
    reset()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(cpuTimer)
})
</script>

<template>
  <div class="c4">
    <div class="panel">
      <!-- Mode picker -->
      <section v-if="!mode" class="screen">
        <p class="brand">CONNECT<span class="brand__accent">4</span></p>
        <p class="eyebrow">PILIH MODE</p>
        <button class="cta" type="button" @click="chooseMode('cpu')">Lawan Komputer ▸</button>
        <button class="cta cta--alt" type="button" @click="chooseMode('duo')">2 Pemain ▸</button>
      </section>

      <!-- Game -->
      <section v-else class="screen">
        <div class="topbar">
          <button class="mini" type="button" @click="backToModes">← Mode</button>
          <span class="status" :class="{ 'is-over': isOver }">
            <template v-if="winner === 'draw'">Seri!</template>
            <template v-else-if="winner">
              <template v-if="mode === 'cpu'">{{ winner === 'R' ? 'Kamu menang!' : 'Komputer menang' }}</template>
              <template v-else><span class="cname" :class="'cname--' + winner">{{ colorName(winner) }}</span> menang!</template>
            </template>
            <template v-else-if="mode === 'cpu'">{{ turn === 'R' ? 'Giliranmu' : 'Komputer berpikir...' }}</template>
            <template v-else>Giliran <span class="cname" :class="'cname--' + turn">{{ colorName(turn) }}</span></template>
          </span>
          <span class="mini mini--ghost" aria-hidden="true" />
        </div>

        <div class="board" :class="{ 'is-locked': locked }">
          <button
            v-for="c in cols"
            :key="c"
            class="col"
            type="button"
            :disabled="landingRow(c) < 0 || isOver"
            :aria-label="`Kolom ${c + 1}`"
            @click="play(c)"
          >
            <span v-for="r in rows" :key="r" class="slot">
              <span
                v-if="grid[r][c]"
                class="disc"
                :class="[grid[r][c] === 'R' ? 'is-red' : 'is-yellow', { 'is-win': inWin(r, c) }]"
              />
            </span>
          </button>
        </div>

        <button class="cta" type="button" @click="reset">
          {{ isOver ? 'Main lagi ▸' : 'Ulang papan' }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — the panel, screen, brand, eyebrow, cta, topbar, and mini
   come from src/styles.css (see docs/STYLE.md). */
.c4 {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

/* The global .panel has no padding by design — each game sets its own. */
.panel {
  padding: 24px 20px 26px;
}

.brand {
  font-size: 34px;
}

/* The player's colour name, shown in its disc colour with an ink outline so
   the yellow stays legible on the cream panel. */
.cname {
  paint-order: stroke fill;
  -webkit-text-stroke: 0.7px var(--ink);
}
.cname--R {
  color: var(--berry);
}
.cname--Y {
  color: var(--sun);
}

/* ---- The blue board with cream holes ---- */
.board {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  padding: 8px;
  margin-bottom: 20px;
  background: #3f78e0;
  border: var(--line) solid var(--ink);
  border-radius: 16px;
  box-shadow: var(--pop);
  overflow: hidden; /* clip the dropping disc to the board frame */
}
.board.is-locked {
  pointer-events: none;
}

.col {
  display: grid;
  grid-template-rows: repeat(6, 1fr);
  gap: 6px;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 8px;
  transition: background 0.1s ease;
}
.col:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.14);
}

.slot {
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--cream);
  box-shadow: inset 0 3px 0 rgba(44, 19, 56, 0.14);
  display: grid;
  place-items: center;
}

.disc {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2.5px solid var(--ink);
  animation: c4-drop 0.3s ease-in;
}
.disc.is-red {
  background: var(--berry);
}
.disc.is-yellow {
  background: var(--sun);
}
.disc.is-win {
  box-shadow: 0 0 0 3px var(--ink), 0 0 12px rgba(255, 255, 255, 0.9);
}

@keyframes c4-drop {
  from {
    transform: translateY(-320px);
  }
}
</style>
