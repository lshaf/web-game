<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Otello (Reversi) — an 8×8 flip game with two modes: pass-and-play (two
// humans) or vs a positional-heuristic CPU. Black (B) always moves first; in
// CPU mode the human is Black and the computer is White (W).

const SIZE = 8
const CELLS = SIZE * SIZE
const cellIndexes = Array.from({ length: CELLS }, (_, i) => i)
// The eight straight directions as [dr, dc].
const DIRS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

// Positional weights: corners are gold, X-squares (diagonal to a corner) are
// traps, edges are decent, the rest neutral. Used only by the CPU.
const WEIGHTS = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
]

const mode = ref(null) // null (picker) | 'cpu' | 'duo'
const board = ref(Array(CELLS).fill(''))
const turn = ref('B')
const over = ref(false)
const passed = ref(false) // a pass just happened → briefly note it in the status
let cpuTimer = 0

const opponent = (who) => (who === 'B' ? 'W' : 'B')

// Discs captured if `who` plays at `idx` — the union of every bounded run of
// opponent discs across the eight directions (empty if the move is illegal).
function captures(b, idx, who) {
  if (b[idx] !== '') return []
  const foe = opponent(who)
  const r0 = Math.floor(idx / SIZE)
  const c0 = idx % SIZE
  const flips = []
  for (const [dr, dc] of DIRS) {
    const run = []
    let r = r0 + dr
    let c = c0 + dc
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && b[r * SIZE + c] === foe) {
      run.push(r * SIZE + c)
      r += dr
      c += dc
    }
    // The run must be non-empty and closed by one of `who`'s own discs.
    if (run.length && r >= 0 && r < SIZE && c >= 0 && c < SIZE && b[r * SIZE + c] === who) {
      flips.push(...run)
    }
  }
  return flips
}

// Every legal move index for `who` on board `b`.
function legalMoves(b, who) {
  const moves = []
  for (let i = 0; i < CELLS; i++) {
    if (b[i] === '' && captures(b, i, who).length) moves.push(i)
  }
  return moves
}

const myLegal = computed(() => (over.value ? [] : legalMoves(board.value, turn.value)))
const legalSet = computed(() => new Set(myLegal.value))

const scores = computed(() => {
  let b = 0
  let w = 0
  for (const c of board.value) {
    if (c === 'B') b++
    else if (c === 'W') w++
  }
  return { B: b, W: w }
})

const locked = computed(
  () => over.value || (mode.value === 'cpu' && turn.value === 'W'),
)

const status = computed(() => {
  if (over.value) {
    const { B, W } = scores.value
    if (B === W) return 'Seri'
    const win = B > W ? 'B' : 'W'
    if (mode.value === 'cpu') return win === 'B' ? 'Kamu menang!' : 'Komputer menang'
    return `${win === 'B' ? 'Hitam' : 'Putih'} menang`
  }
  if (passed.value) return 'Pass'
  if (mode.value === 'cpu') return turn.value === 'B' ? 'Giliranmu' : 'Komputer berpikir...'
  return turn.value === 'B' ? 'Giliran Hitam' : 'Giliran Putih'
})

// Apply `who`'s move at `idx` to the live board, flipping every capture. Then
// hand the turn over, auto-passing (and ending) as the legality allows.
function place(idx, who) {
  const flips = captures(board.value, idx, who)
  if (!flips.length) return
  const next = [...board.value]
  next[idx] = who
  for (const f of flips) next[f] = who
  board.value = next
  sfx.tick()
  advanceTurn(who)
}

// Decide who moves next after `who` just played: the opponent if they have a
// move, else `who` again (a pass), else the game is over.
function advanceTurn(who) {
  const foe = opponent(who)
  if (legalMoves(board.value, foe).length) {
    passed.value = false
    turn.value = foe
    maybeCpu()
    return
  }
  if (legalMoves(board.value, who).length) {
    // Opponent must pass; `who` plays again.
    passed.value = true
    turn.value = who
    maybeCpu()
    return
  }
  // Neither side can move → game over.
  passed.value = false
  over.value = true
  sfx.win()
}

// If it's now the CPU's turn, let it think for a beat then move.
function maybeCpu() {
  if (mode.value === 'cpu' && !over.value && turn.value === 'W') {
    clearTimeout(cpuTimer)
    cpuTimer = setTimeout(cpuMove, 450)
  }
}

// CPU picks the legal move with the best positional value: the weight of the
// landing square plus the summed weight of every disc it flips.
function cpuMove() {
  if (over.value || turn.value !== 'W') return
  const moves = legalMoves(board.value, 'W')
  if (!moves.length) return
  let best = moves[0]
  let bestScore = -Infinity
  for (const m of moves) {
    let s = WEIGHTS[m]
    for (const f of captures(board.value, m, 'W')) s += WEIGHTS[f]
    if (s > bestScore) {
      bestScore = s
      best = m
    }
  }
  place(best, 'W')
}

function play(idx) {
  if (locked.value) return
  if (mode.value === 'cpu' && turn.value !== 'B') return
  if (!legalSet.value.has(idx)) return
  place(idx, turn.value)
}

function reset() {
  clearTimeout(cpuTimer)
  const b = Array(CELLS).fill('')
  // Standard opening: white on the main diagonal, black on the anti-diagonal.
  b[3 * SIZE + 3] = 'W'
  b[4 * SIZE + 4] = 'W'
  b[3 * SIZE + 4] = 'B'
  b[4 * SIZE + 3] = 'B'
  board.value = b
  turn.value = 'B'
  over.value = false
  passed.value = false
}

function chooseMode(m) {
  mode.value = m
  reset()
}

function backToModes() {
  clearTimeout(cpuTimer)
  mode.value = null
}

function onKeydown(e) {
  if (e.key === 'Enter' && over.value) {
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
  <div class="otello">
    <div class="panel">
      <!-- Mode picker -->
      <section v-if="!mode" class="screen">
        <p class="brand">OTE<span class="brand__accent">LLO</span></p>
        <p class="eyebrow">PILIH MODE</p>
        <button class="cta" type="button" @click="chooseMode('cpu')">Solo ▸</button>
        <button class="cta cta--alt" type="button" @click="chooseMode('duo')">Duo ▸</button>
      </section>

      <!-- Game -->
      <section v-else class="screen">
        <div class="topbar">
          <button class="mini" type="button" @click="backToModes">← Mode</button>
          <span class="status" :class="{ 'is-over': over }">{{ status }}</span>
          <span class="mini mini--ghost" aria-hidden="true" />
        </div>

        <div class="score" aria-label="Skor">
          <span class="score__side">
            <span class="swatch swatch--b" /> {{ scores.B }}
          </span>
          <span class="score__dot">·</span>
          <span class="score__side">
            <span class="swatch swatch--w" /> {{ scores.W }}
          </span>
        </div>

        <div class="board" :class="{ 'is-locked': locked }">
          <button
            v-for="i in cellIndexes"
            :key="i"
            class="cell"
            type="button"
            :disabled="over || !legalSet.has(i)"
            :aria-label="`Petak ${i + 1}`"
            @click="play(i)"
          >
            <span
              v-if="board[i]"
              class="disc"
              :class="board[i] === 'B' ? 'is-black' : 'is-white'"
            />
            <span v-else-if="legalSet.has(i)" class="hint-dot" />
          </button>
        </div>

        <button class="cta" type="button" @click="reset">
          {{ over ? 'Main lagi ▸' : 'Ulang papan' }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — the panel, screen, brand, eyebrow, cta, topbar, status,
   and mini come from src/styles.css (see docs/STYLE.md). */
.otello {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

.panel {
  padding: 22px 18px 26px;
}

.brand {
  font-size: 38px;
}

/* ---- Score row with small disc swatches ---- */
.score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 14px;
  font-family: var(--font-mono);
  font-size: 18px;
  color: var(--ink);
}
.score__side {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.score__dot {
  color: var(--muted);
}
.swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--ink);
}
.swatch--b {
  background: var(--ink);
}
.swatch--w {
  background: var(--cream);
}

/* ---- The green felt board ---- */
.board {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 3px;
  padding: 3px;
  margin-bottom: 20px;
  background: var(--ink);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  box-shadow: var(--pop);
}

.cell {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  padding: 0;
  background: #4f9d54;
  border: 0;
  border-radius: 3px;
  transition: background 0.1s ease;
}
.cell:not(:disabled):hover {
  background: #5cb063;
  cursor: pointer;
}
.board.is-locked {
  pointer-events: none;
}

.disc {
  width: 82%;
  height: 82%;
  border-radius: 50%;
  border: 2px solid var(--ink);
  animation: otello-pop 0.16s ease both;
}
.disc.is-black {
  background: var(--ink);
}
.disc.is-white {
  background: var(--cream);
}

/* A small dot marking a legal move for the current player. */
.hint-dot {
  width: 26%;
  height: 26%;
  border-radius: 50%;
  background: rgba(44, 19, 56, 0.4);
}

@keyframes otello-pop {
  from {
    transform: scale(0.3);
    opacity: 0;
  }
}
</style>
