<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Dakon (Congklak / Mancala) — 7 pits a side + 2 stores (lumbung).
// Board is a flat array of 16 ints, sown counter-clockwise 0→1→…→15→0.
//   0..6  = Player 1 pits (bottom, left→right)   7  = Player 1 store (right)
//   8..14 = Player 2 pits (top)                  15 = Player 2 store (left)
// Player 1 skips index 15 while sowing, Player 2 skips index 7.

const SOW_MS = 110

const phase = ref('mode') // 'mode' | 'play' | 'over'
const mode = ref(null) // 'cpu' | 'duo'
const board = ref(freshBoard())
const turn = ref(1) // 1 | 2 — whose turn it is
const sowing = ref(false)
const active = ref(-1) // pit currently being sown into (for a little highlight)

// Sowing state carried across interval ticks.
let sowTimer = 0
let cpuTimer = 0
let hand = 0
let pos = 0
let curP = 1

// Vertical board: two columns of pits between the two stores. The sow loop
// 0→6 → 7(store) → 8→14 → 15(store) → 0 reads counter-clockwise — down the
// right column, across the bottom, up the left column, across the top.
const leftCol = [14, 13, 12, 11, 10, 9, 8] // Player 2 pits, top→bottom
const rightCol = [0, 1, 2, 3, 4, 5, 6] // Player 1 pits, top→bottom

const isOver = computed(() => phase.value === 'over')

const status = computed(() => {
  if (phase.value === 'over') {
    const a = board.value[7]
    const b = board.value[15]
    if (a === b) return 'Seri'
    const p1win = a > b
    if (mode.value === 'cpu') return p1win ? 'Kamu Menang!' : 'Komputer Menang'
    return p1win ? 'Pemain 1 Menang!' : 'Pemain 2 Menang!'
  }
  if (mode.value === 'cpu') return turn.value === 1 ? 'Giliranmu' : 'Komputer...'
  return turn.value === 1 ? 'Giliran Pemain 1' : 'Giliran Pemain 2'
})

function freshBoard() {
  const b = Array(16).fill(0)
  for (let i = 0; i < 7; i++) b[i] = 7
  for (let i = 8; i < 15; i++) b[i] = 7
  return b
}

// Next index counter-clockwise for player p, skipping the opponent's store.
function next(i, p) {
  let n = (i + 1) % 16
  if (p === 1 && n === 15) n = 0
  if (p === 2 && n === 7) n = 8
  return n
}

function ownSide(i, p) {
  return p === 1 ? i >= 0 && i <= 6 : i >= 8 && i <= 14
}

function playable(i) {
  if (sowing.value || phase.value !== 'play') return false
  if (mode.value === 'cpu' && turn.value === 2) return false
  return ownSide(i, turn.value) && board.value[i] > 0
}

function dotCount(i) {
  return Math.min(board.value[i], 8)
}

// ---- Human input ----
function play(i) {
  if (!playable(i)) return
  beginSow(i, turn.value)
}

// ---- Animated sowing ----
function beginSow(start, p) {
  sowing.value = true
  curP = p
  pos = start
  hand = board.value[start]
  board.value[start] = 0
  active.value = start
  sowTimer = setInterval(sowStep, SOW_MS)
}

function sowStep() {
  pos = next(pos, curP)
  board.value[pos] += 1
  hand -= 1
  active.value = pos
  sfx.tick()
  if (hand === 0) resolveLanding()
}

function resolveLanding() {
  const ownStore = curP === 1 ? 7 : 15
  // Last seed dropped into own store → another turn.
  if (pos === ownStore) {
    finishSow('again')
    return
  }
  // Landed in a pit that was empty before this seed.
  if (board.value[pos] === 1) {
    if (ownSide(pos, curP)) {
      // Capture: this seed + the directly-opposite pit into own store.
      const opp = 14 - pos
      const gain = board.value[pos] + board.value[opp]
      board.value[ownStore] += gain
      board.value[pos] = 0
      board.value[opp] = 0
      sfx.jump()
    }
    finishSow('end')
    return
  }
  // Landed in a non-empty pit → continuous sowing: scoop and keep going.
  hand = board.value[pos]
  board.value[pos] = 0
}

function finishSow(result) {
  clearInterval(sowTimer)
  sowTimer = 0
  sowing.value = false
  active.value = -1
  if (result === 'end') turn.value = 3 - curP
  if (checkGameOver()) return
  if (mode.value === 'cpu' && turn.value === 2) {
    cpuTimer = setTimeout(cpuMove, 500)
  }
}

function sideSum(from) {
  let s = 0
  for (let i = from; i < from + 7; i++) s += board.value[i]
  return s
}

function checkGameOver() {
  if (sideSum(0) > 0 && sideSum(8) > 0) return false
  // Sweep every remaining seed into its owner's store.
  for (let i = 0; i < 7; i++) {
    board.value[7] += board.value[i]
    board.value[i] = 0
  }
  for (let i = 8; i < 15; i++) {
    board.value[15] += board.value[i]
    board.value[i] = 0
  }
  phase.value = 'over'
  sfx.win()
  return true
}

// ---- CPU (Player 2) ----
// Simulate a full move on a copy so we can rank candidates.
function simulate(start, p) {
  const b = [...board.value]
  const ownStore = p === 1 ? 7 : 15
  const startStore = b[ownStore]
  let h = b[start]
  let i = start
  b[start] = 0
  let again = false
  let capture = false
  while (true) {
    while (h > 0) {
      i = next(i, p)
      b[i] += 1
      h -= 1
    }
    if (i === ownStore) {
      again = true
      break
    }
    if (b[i] === 1) {
      if (ownSide(i, p)) {
        capture = true
        b[ownStore] += b[i] + b[14 - i]
        b[i] = 0
        b[14 - i] = 0
      }
      break
    }
    h = b[i]
    b[i] = 0
  }
  return { again, capture, gain: b[ownStore] - startStore }
}

function cpuMove() {
  if (phase.value !== 'play' || turn.value !== 2) return
  const holes = [8, 9, 10, 11, 12, 13, 14].filter((i) => board.value[i] > 0)
  if (holes.length === 0) return
  const sims = holes.map((i) => ({ i, ...simulate(i, 2) }))
  let pick = sims.find((s) => s.again) // extra turn
  if (!pick) pick = sims.find((s) => s.capture) // grab a capture
  if (!pick) pick = sims.slice().sort((a, b) => b.gain - a.gain)[0] // most into store
  beginSow(pick.i, 2)
}

// ---- Flow ----
function clearTimers() {
  clearInterval(sowTimer)
  clearTimeout(cpuTimer)
  sowTimer = 0
  cpuTimer = 0
}

function startGame() {
  clearTimers()
  board.value = freshBoard()
  turn.value = 1
  sowing.value = false
  active.value = -1
  phase.value = 'play'
}

function chooseMode(m) {
  mode.value = m
  startGame()
}

function backToModes() {
  clearTimers()
  sowing.value = false
  active.value = -1
  phase.value = 'mode'
}

function onKeydown(e) {
  if (e.key === 'Enter' && isOver.value) {
    e.preventDefault()
    startGame()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimers()
})
</script>

<template>
  <div class="dakon">
    <div class="panel">
      <!-- Mode picker -->
      <section v-if="phase === 'mode'" class="screen">
        <p class="brand">DA<span class="brand__accent">KON</span></p>
        <p class="eyebrow">PILIH MODE</p>
        <button class="cta" type="button" @click="chooseMode('cpu')">Solo ▸</button>
        <button class="cta cta--alt" type="button" @click="chooseMode('duo')">Duo ▸</button>
      </section>

      <!-- Game -->
      <section v-else class="screen">
        <div class="topbar">
          <button class="mini" type="button" @click="backToModes">← Mode</button>
          <span class="status" :class="{ 'is-over': isOver }">{{ status }}</span>
          <span class="mini mini--ghost" aria-hidden="true" />
        </div>

        <div class="board" :class="{ 'is-locked': sowing || isOver }">
          <!-- Player 2 store (top) -->
          <div class="store store--p2" :class="{ 'is-turn': turn === 2 && !isOver }">
            <span class="store__num">{{ board[15] }}</span>
            <span class="store__cap">Lumbung P2</span>
          </div>

          <div class="cols">
            <div class="col">
              <button
                v-for="i in leftCol"
                :key="i"
                class="hole"
                type="button"
                :class="{ 'is-playable': playable(i), 'is-active': active === i }"
                :disabled="!playable(i)"
                :aria-label="`Lubang ${board[i]} biji`"
                @click="play(i)"
              >
                <span class="dots"><i v-for="n in dotCount(i)" :key="n" /></span>
                <span class="count">{{ board[i] }}</span>
              </button>
            </div>
            <div class="col">
              <button
                v-for="i in rightCol"
                :key="i"
                class="hole"
                type="button"
                :class="{ 'is-playable': playable(i), 'is-active': active === i }"
                :disabled="!playable(i)"
                :aria-label="`Lubang ${board[i]} biji`"
                @click="play(i)"
              >
                <span class="dots"><i v-for="n in dotCount(i)" :key="n" /></span>
                <span class="count">{{ board[i] }}</span>
              </button>
            </div>
          </div>

          <!-- Player 1 store (bottom) -->
          <div class="store store--p1" :class="{ 'is-turn': turn === 1 && !isOver }">
            <span class="store__num">{{ board[7] }}</span>
            <span class="store__cap">Lumbung P1</span>
          </div>
        </div>

        <button v-if="isOver" class="cta" type="button" @click="startGame">Main lagi ▸</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel, screen, brand, eyebrow, cta, topbar, mini, status
   come from src/styles.css (see docs/STYLE.md). */
.dakon {
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
  font-size: 40px;
}

/* ---- The wood board (vertical / portrait) ---- */
.board {
  width: 100%;
  max-width: 232px;
  margin: 0 auto 20px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 10px;
  padding: 12px;
  /* wood tone — the one hard-coded colour allowed for this board */
  background: #b5763e;
  border: var(--line) solid var(--ink);
  border-radius: 22px;
  box-shadow: var(--pop);
}
.board.is-locked {
  pointer-events: none;
}

.cols {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  min-height: 0;
}
.col {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  gap: 8px;
}

/* ---- A pit ---- */
.hole {
  position: relative;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  padding: 0;
  background: var(--paper-lit);
  border: var(--line) solid var(--ink);
  border-radius: 50%;
  box-shadow: inset 0 3px 0 rgba(44, 19, 56, 0.14);
  transition: transform 0.08s ease, background 0.12s ease, box-shadow 0.08s ease;
}
.hole:disabled {
  cursor: default;
}
.hole.is-playable {
  background: var(--sun);
  cursor: pointer;
  box-shadow: inset 0 3px 0 rgba(44, 19, 56, 0.14), 0 0 0 2px var(--ink);
  animation: dakon-pulse 1.2s ease-in-out infinite;
}
.hole.is-playable:hover {
  transform: translateY(-2px);
  background: var(--sun-core);
}
.hole.is-active {
  background: var(--tile-live);
  transform: scale(1.06);
}

.hole .dots {
  position: absolute;
  inset: 15%;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-content: center;
  justify-content: center;
  opacity: 0.45;
  pointer-events: none;
}
.hole .dots i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--berry);
}
.hole .count {
  position: relative;
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: clamp(15px, 5vw, 21px);
  color: var(--ink);
  text-shadow: 0 1px 0 var(--cream), 0 -1px 0 var(--cream), 1px 0 0 var(--cream),
    -1px 0 0 var(--cream);
}

/* ---- Stores (lumbung) — wide troughs at top and bottom ---- */
.store {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 48px;
  padding: 8px 16px;
  background: var(--paper-lit);
  border: var(--line) solid var(--ink);
  border-radius: 26px;
  box-shadow: inset 0 3px 0 rgba(44, 19, 56, 0.14);
  transition: background 0.15s ease;
}
.store.is-turn {
  background: var(--aqua);
}
.store__num {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 26px;
  color: var(--ink);
}
.store__cap {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

@keyframes dakon-pulse {
  0%,
  100% {
    box-shadow: inset 0 3px 0 rgba(44, 19, 56, 0.14), 0 0 0 2px var(--ink);
  }
  50% {
    box-shadow: inset 0 3px 0 rgba(44, 19, 56, 0.14), 0 0 0 4px var(--ink);
  }
}
</style>
