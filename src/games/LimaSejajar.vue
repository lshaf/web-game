<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Lima Sejajar — Gomoku / five-in-a-row on an 11×11 board. Two modes: vs a
// cheap 1-ply pattern-scoring CPU, or pass-and-play. Hitam (B) always moves
// first; in CPU mode the human is Hitam and the computer is Putih (W).

const SIZE = 11
const CELLS = SIZE * SIZE
const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]
const MID = (SIZE - 1) / 2 // 5 — center index

const mode = ref(null) // null (picker) | 'cpu' | 'duo'
const board = ref(Array(CELLS).fill('')) // flat 11×11, '' | 'B' | 'W'
const turn = ref('B')
const winner = ref(null) // null | 'B' | 'W' | 'draw'
const winSet = ref(new Set()) // indices of the winning line
let cpuTimer = 0

const isOver = computed(() => winner.value !== null)
const locked = computed(() => isOver.value || (mode.value === 'cpu' && turn.value === 'W'))

const idx = (r, c) => r * SIZE + c
const rowOf = (i) => Math.floor(i / SIZE)
const colOf = (i) => i % SIZE
const inB = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE
const stoneName = (p) => (p === 'B' ? 'Hitam' : 'Putih')

// The full run (>= 5) through (r,c) for `who`, or null. Returns cell indices.
function winLineAt(r, c, who) {
  for (const [dr, dc] of DIRS) {
    const line = [idx(r, c)]
    let nr = r + dr
    let nc = c + dc
    while (inB(nr, nc) && board.value[idx(nr, nc)] === who) {
      line.push(idx(nr, nc))
      nr += dr
      nc += dc
    }
    nr = r - dr
    nc = c - dc
    while (inB(nr, nc) && board.value[idx(nr, nc)] === who) {
      line.unshift(idx(nr, nc))
      nr -= dr
      nc -= dc
    }
    if (line.length >= 5) return line
  }
  return null
}

// Would placing `who` at (r,c) create five (or more) in a line through it?
function makesFive(r, c, who) {
  for (const [dr, dc] of DIRS) {
    let run = 1
    let nr = r + dr
    let nc = c + dc
    while (inB(nr, nc) && board.value[idx(nr, nc)] === who) {
      run++
      nr += dr
      nc += dc
    }
    nr = r - dr
    nc = c - dc
    while (inB(nr, nc) && board.value[idx(nr, nc)] === who) {
      run++
      nr -= dr
      nc -= dc
    }
    if (run >= 5) return true
  }
  return false
}

function place(i, who) {
  if (board.value[i]) return
  board.value[i] = who
  sfx.tick()
  const line = winLineAt(rowOf(i), colOf(i), who)
  if (line) {
    winner.value = who
    winSet.value = new Set(line)
    sfx.win()
    return
  }
  if (board.value.every((v) => v)) {
    winner.value = 'draw'
    sfx.lose()
    return
  }
  turn.value = who === 'B' ? 'W' : 'B'
  if (mode.value === 'cpu' && turn.value === 'W') cpuTimer = setTimeout(cpuMove, 350)
}

function play(i) {
  if (isOver.value || board.value[i]) return
  if (mode.value === 'cpu' && turn.value !== 'B') return
  place(i, turn.value)
}

// ---- CPU: 1-ply pattern scoring (take-win → block → heuristic) ----

// Score a run length + how many of its two ends stay open. open-four >> four >
// open-three > three > open-two > two.
function runValue(run, open) {
  if (run >= 5) return 100000
  if (run === 4) return open >= 2 ? 50000 : open === 1 ? 5000 : 0
  if (run === 3) return open >= 2 ? 2000 : open === 1 ? 200 : 0
  if (run === 2) return open >= 2 ? 100 : open === 1 ? 10 : 0
  if (run === 1) return open >= 2 ? 4 : open === 1 ? 1 : 0
  return 0
}

// Value of placing `who` at (r,c): summed line potential over the 4 directions.
function placementValue(r, c, who) {
  let total = 0
  for (const [dr, dc] of DIRS) {
    let run = 1
    let open = 0
    let nr = r + dr
    let nc = c + dc
    while (inB(nr, nc) && board.value[idx(nr, nc)] === who) {
      run++
      nr += dr
      nc += dc
    }
    if (inB(nr, nc) && board.value[idx(nr, nc)] === '') open++
    nr = r - dr
    nc = c - dc
    while (inB(nr, nc) && board.value[idx(nr, nc)] === who) {
      run++
      nr -= dr
      nc -= dc
    }
    if (inB(nr, nc) && board.value[idx(nr, nc)] === '') open++
    total += runValue(run, open)
  }
  return total
}

// Is (r,c) within `radius` of any placed stone? (keeps the search local & cheap)
function hasNeighbor(r, c, radius) {
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (inB(nr, nc) && board.value[idx(nr, nc)]) return true
    }
  }
  return false
}

function cpuBest() {
  const center = idx(MID, MID)
  if (board.value.every((v) => !v)) return center
  let best = -1
  let bestScore = -Infinity
  for (let i = 0; i < CELLS; i++) {
    if (board.value[i]) continue
    const r = rowOf(i)
    const c = colOf(i)
    if (!hasNeighbor(r, c, 2)) continue
    const offense = placementValue(r, c, 'W')
    const defense = placementValue(r, c, 'B')
    const centerBias = (2 * MID - (Math.abs(r - MID) + Math.abs(c - MID))) * 1.5
    const score = offense + defense * 0.9 + centerBias + Math.random() * 0.5
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best >= 0 ? best : center
}

function cpuMove() {
  if (isOver.value || turn.value !== 'W') return
  const empties = []
  for (let i = 0; i < CELLS; i++) if (!board.value[i]) empties.push(i)
  let pick = empties.find((i) => makesFive(rowOf(i), colOf(i), 'W')) // complete five
  if (pick === undefined) pick = empties.find((i) => makesFive(rowOf(i), colOf(i), 'B')) // block five
  if (pick === undefined) pick = cpuBest() // score offense + defense
  if (pick !== undefined && pick >= 0) place(pick, 'W')
}

// ---- Flow ----

function chooseMode(m) {
  mode.value = m
  reset()
}
function reset() {
  clearTimeout(cpuTimer)
  board.value = Array(CELLS).fill('')
  turn.value = 'B'
  winner.value = null
  winSet.value = new Set()
}
function backToModes() {
  clearTimeout(cpuTimer)
  mode.value = null
}
function inWin(i) {
  return winSet.value.has(i)
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
  <div class="gomoku">
    <div class="panel">
      <!-- Mode picker -->
      <section v-if="!mode" class="screen">
        <p class="brand">LIMA<span class="brand__accent">SEJAJAR</span></p>
        <p class="eyebrow">PILIH MODE</p>
        <button class="cta" type="button" @click="chooseMode('cpu')">Solo ▸</button>
        <button class="cta cta--alt" type="button" @click="chooseMode('duo')">Duo ▸</button>
      </section>

      <!-- Game -->
      <section v-else class="screen">
        <div class="topbar">
          <button class="mini" type="button" @click="backToModes">← Mode</button>
          <span class="status" :class="{ 'is-over': isOver }">
            <template v-if="winner === 'draw'">Seri!</template>
            <template v-else-if="winner">
              <template v-if="mode === 'cpu'">{{ winner === 'B' ? 'Kamu menang!' : 'Komputer menang' }}</template>
              <template v-else><span class="sname" :class="'sname--' + winner">{{ stoneName(winner) }}</span> menang!</template>
            </template>
            <template v-else-if="mode === 'cpu'">{{ turn === 'B' ? 'Giliranmu' : 'Komputer berpikir...' }}</template>
            <template v-else>Giliran <span class="sname" :class="'sname--' + turn">{{ stoneName(turn) }}</span></template>
          </span>
          <span class="mini mini--ghost" aria-hidden="true" />
        </div>

        <div class="board" :class="{ 'is-locked': locked }">
          <button
            v-for="(v, i) in board"
            :key="i"
            class="cell"
            type="button"
            :disabled="!!v || isOver"
            :aria-label="`Baris ${rowOf(i) + 1} kolom ${colOf(i) + 1}`"
            @click="play(i)"
          >
            <span
              v-if="v"
              class="stone"
              :class="[v === 'B' ? 'is-black' : 'is-white', { 'is-win': inWin(i) }]"
            />
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
/* Page-specific only — panel, screen, brand, eyebrow, cta, topbar, and mini
   come from src/styles.css (see docs/STYLE.md). */
.gomoku {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

/* The global .panel has no padding by design — each game sets its own. */
.panel {
  padding: 22px 16px 24px;
}

.brand {
  font-size: 30px;
}

/* The player's stone name, shown in its stone colour with an ink outline so
   white stays legible on the cream panel. */
.sname {
  paint-order: stroke fill;
  -webkit-text-stroke: 0.7px var(--ink);
}
.sname--B {
  color: #241030;
}
.sname--W {
  color: var(--cream);
}

/* ---- Warm wooden board with thin ink grid lines ---- */
.board {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(11, 1fr);
  gap: 1.5px;
  padding: 1.5px;
  margin-bottom: 20px;
  background: var(--ink); /* shows through the gaps as grid lines */
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  box-shadow: var(--pop);
}
.board.is-locked {
  pointer-events: none;
}

.cell {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: #e3b579; /* tan wood */
  transition: background 0.1s ease;
}
.cell:not(:disabled):hover {
  background: #f0c88f;
}

.stone {
  width: 80%;
  height: 80%;
  border-radius: 50%;
  border: 2px solid var(--ink);
  animation: gomoku-place 0.18s ease-out;
}
.stone.is-black {
  background: radial-gradient(circle at 34% 30%, #6a4a78 0%, #34193f 55%, #241030 100%);
}
.stone.is-white {
  background: radial-gradient(circle at 34% 30%, #ffffff 0%, var(--cream) 60%, #f0dfc4 100%);
}
.stone.is-win {
  box-shadow: 0 0 0 3px var(--berry), 0 0 11px rgba(255, 77, 121, 0.75);
}

@keyframes gomoku-place {
  from {
    transform: scale(0.2);
    opacity: 0.4;
  }
}
</style>
