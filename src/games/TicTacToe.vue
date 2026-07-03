<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Tic-Tac-Toe with two modes: pass-and-play (two humans) or vs a simple
// heuristic CPU. X always moves first; in CPU mode the human is X.

const WINS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

// Endless variant: each player keeps only their last 3 marks. Placing a 4th
// removes that player's oldest mark, so the board never fills and there are no
// draws — play continues until someone lines up three.
const MAX_MARKS = 3

const mode = ref(null) // null (picker) | 'duo' | 'cpu'
const board = ref(Array(9).fill(''))
const xMoves = ref([]) // X's mark positions, oldest first
const oMoves = ref([]) // O's mark positions, oldest first
const turn = ref('X')
const winner = ref(null) // null | 'X' | 'O'
const winLine = ref(null)
let cpuTimer = 0

const isOver = computed(() => winner.value !== null)
const status = computed(() => {
  if (winner.value) {
    if (mode.value === 'cpu') return winner.value === 'X' ? 'Kamu menang!' : 'Komputer menang'
    return `Pemain ${winner.value} menang!`
  }
  if (mode.value === 'cpu') return turn.value === 'X' ? 'Giliranmu' : 'Komputer berpikir...'
  return `Giliran ${turn.value}`
})

// The mark that will vanish on the current player's next placement (once they
// already hold three), so the board can hint which one is about to go.
const fading = computed(() => {
  if (isOver.value) return -1
  const q = turn.value === 'X' ? xMoves.value : oMoves.value
  return q.length >= MAX_MARKS ? q[0] : -1
})

function findWin(b) {
  for (const line of WINS) {
    const [a, c, d] = line
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { who: b[a], line }
  }
  return null
}

function evaluate() {
  const w = findWin(board.value)
  if (w) {
    winner.value = w.who
    winLine.value = w.line
    sfx.win()
    return true
  }
  return false
}

function placeMark(i, who) {
  board.value[i] = who
  const q = who === 'X' ? xMoves : oMoves
  q.value.push(i)
  // Drop this player's oldest mark once they exceed three.
  if (q.value.length > MAX_MARKS) {
    const old = q.value.shift()
    if (board.value[old] === who) board.value[old] = ''
  }
  sfx.tick()
  if (evaluate()) return
  turn.value = who === 'X' ? 'O' : 'X'
  if (mode.value === 'cpu' && turn.value === 'O') {
    cpuTimer = setTimeout(cpuMove, 380)
  }
}

function play(i) {
  if (isOver.value || board.value[i] !== '') return
  if (mode.value === 'cpu' && turn.value !== 'X') return
  placeMark(i, turn.value)
}

// Resulting board if `who` plays `i` now, including the drop of their oldest
// mark — so the AI doesn't count a "win" that its own removal would undo.
function afterMove(who, i) {
  const b = [...board.value]
  const q = who === 'X' ? [...xMoves.value] : [...oMoves.value]
  b[i] = who
  q.push(i)
  if (q.length > MAX_MARKS && b[q[0]] === who) b[q[0]] = ''
  return b
}

// Heuristic: win if possible, else block, else center, corner, side.
function bestMove() {
  const b = board.value
  const empty = b.map((c, i) => (c === '' ? i : -1)).filter((i) => i >= 0)
  const wins = (who) => {
    for (const i of empty) {
      const w = findWin(afterMove(who, i))
      if (w && w.who === who) return i
    }
    return -1
  }
  let m = wins('O')
  if (m >= 0) return m
  m = wins('X')
  if (m >= 0) return m
  if (b[4] === '') return 4
  const corners = [0, 2, 6, 8].filter((i) => b[i] === '')
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)]
  return empty[Math.floor(Math.random() * empty.length)]
}

function cpuMove() {
  if (isOver.value || turn.value !== 'O') return
  placeMark(bestMove(), 'O')
}

function chooseMode(m) {
  mode.value = m
  reset()
}

function reset() {
  clearTimeout(cpuTimer)
  board.value = Array(9).fill('')
  xMoves.value = []
  oMoves.value = []
  turn.value = 'X'
  winner.value = null
  winLine.value = null
}

function backToModes() {
  clearTimeout(cpuTimer)
  mode.value = null
}

function inWin(i) {
  return winLine.value && winLine.value.includes(i)
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
  <div class="ttt">
    <div class="panel">
      <!-- Mode picker -->
      <section v-if="!mode" class="screen">
        <p class="brand">TIC<span>TAC</span></p>
        <p class="eyebrow">PILIH MODE</p>
        <button class="cta" type="button" @click="chooseMode('cpu')">Lawan Komputer ▸</button>
        <button class="cta cta--alt" type="button" @click="chooseMode('duo')">2 Pemain ▸</button>
      </section>

      <!-- Game -->
      <section v-else class="screen">
        <div class="topbar">
          <button class="mini" type="button" @click="backToModes">Mode</button>
          <span class="status" :class="{ 'is-over': isOver }">{{ status }}</span>
          <span class="mini mini--ghost" aria-hidden="true" />
        </div>

        <div class="grid" :class="{ 'is-locked': isOver || (mode === 'cpu' && turn === 'O') }">
          <button
            v-for="(cell, i) in board"
            :key="i"
            class="cell"
            :class="{ 'is-win': inWin(i), 'is-fading': i === fading }"
            type="button"
            :disabled="cell !== '' || isOver"
            @click="play(i)"
          >
            <svg v-if="cell === 'X'" class="mark mark--x" viewBox="0 0 40 40">
              <line x1="9" y1="9" x2="31" y2="31" />
              <line x1="31" y1="9" x2="9" y2="31" />
            </svg>
            <svg v-else-if="cell === 'O'" class="mark mark--o" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="12" />
            </svg>
          </button>
        </div>

        <p class="hint">Endless · tiap pemain maksimal 3 bidak</p>

        <button class="cta" type="button" @click="reset">
          {{ isOver ? 'Main lagi ▸' : 'Ulang papan' }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ttt {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

.panel {
  padding: 26px 22px 28px;
}

.brand {
  font-size: 40px;
  color: var(--berry);
}
.brand span {
  color: var(--aqua-deep);
}
.eyebrow {
  color: var(--muted);
}

/* ---- Top bar (base is global; page-specific bits only) ---- */
.topbar {
  margin-bottom: 16px;
}
.mini {
  font-size: 12px;
  padding: 5px 12px;
}
.mini--ghost {
  visibility: hidden;
}
.status {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--ink);
}
.status.is-over {
  color: var(--berry);
}

/* ---- Board ---- */
.grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}
.grid.is-locked {
  pointer-events: none;
}
.cell {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  background: var(--paper-lit);
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  box-shadow: 0 4px 0 var(--ink);
  transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.12s ease;
}
.cell:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 0 var(--ink);
  background: var(--tile-live);
}
.cell:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 2px 0 var(--ink);
}
.cell:disabled {
  cursor: default;
}
.cell.is-win {
  background: var(--sun);
}
/* The mark about to be dropped on this player's next move. */
.cell.is-fading .mark {
  opacity: 0.4;
  animation: fade-pulse 1.1s ease-in-out infinite;
}
@keyframes fade-pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.16;
  }
}

.mark {
  width: 68%;
  height: 68%;
  animation: mark-in 0.16s ease both;
}
.mark--x line {
  stroke: var(--berry);
  stroke-width: 6;
  stroke-linecap: round;
}
.mark--o circle {
  fill: none;
  stroke: var(--aqua-deep);
  stroke-width: 6;
}
@keyframes mark-in {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
}

.hint {
  margin: -4px 0 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--muted);
  text-align: center;
}

</style>
