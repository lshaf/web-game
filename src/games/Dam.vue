<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Dam (checkers / draughts) — an 8×8 diagonal game on the dark squares, with
// two modes: pass-and-play (two humans) or vs a negamax CPU. Merah (red) sits
// at the bottom and advances upward; Putih (white) sits at the top and advances
// downward. Merah always moves first; in CPU mode the human is Merah and the
// computer is Putih.
//
// Piece codes in a cell: 'm' Merah man, 'M' Merah king (Raja), 'p' Putih man,
// 'P' Putih king, '' empty. Kings are non-flying (move/capture one square in any
// diagonal direction). Forced capture ("wajib makan") and full multi-jumps are
// enforced.

const cells = Array.from({ length: 64 }, (_, i) => i)
const SEARCH_DEPTH = 4

const RED_MAN_DIRS = [[-1, -1], [-1, 1]] // Merah men advance upward
const WHITE_MAN_DIRS = [[1, -1], [1, 1]] // Putih men advance downward
const KING_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

const row = (i) => Math.floor(i / 8)
const col = (i) => i % 8
const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8
const isDark = (i) => (row(i) + col(i)) % 2 === 1
const sideOf = (pc) => (pc === 'm' || pc === 'M' ? 'M' : pc === 'p' || pc === 'P' ? 'P' : null)
const isKing = (pc) => pc === 'M' || pc === 'P'
const opponent = (s) => (s === 'M' ? 'P' : 'M')
const dirsFor = (pc) => (isKing(pc) ? KING_DIRS : pc === 'm' ? RED_MAN_DIRS : WHITE_MAN_DIRS)

const mode = ref(null) // null (picker) | 'cpu' | 'duo'
const board = ref(makeBoard())
const turn = ref('M') // 'M' Merah | 'P' Putih
const winner = ref(null) // null | 'M' | 'P'
const selected = ref(null) // index of the currently picked piece
const chaining = ref(false) // mid multi-jump: only the picked piece may continue
let cpuTimer = 0

const over = computed(() => winner.value !== null)
const locked = computed(() => over.value || (mode.value === 'cpu' && turn.value === 'P'))

const counts = computed(() => {
  let m = 0
  let p = 0
  for (const pc of board.value) {
    if (pc === 'm' || pc === 'M') m++
    else if (pc === 'p' || pc === 'P') p++
  }
  return { m, p }
})

const status = computed(() => {
  if (winner.value) {
    if (mode.value === 'cpu') return winner.value === 'M' ? 'Kamu menang!' : 'Komputer menang'
    return winner.value === 'M' ? 'Merah menang!' : 'Putih menang!'
  }
  if (mode.value === 'cpu') return turn.value === 'M' ? 'Giliranmu' : 'Komputer berpikir...'
  return turn.value === 'M' ? 'Giliran Merah' : 'Giliran Putih'
})

// ---- Board / move geometry (pure helpers over a passed board array) ----

function makeBoard() {
  const b = Array(64).fill('')
  for (let i = 0; i < 64; i++) {
    if (!isDark(i)) continue
    const r = row(i)
    if (r <= 2) b[i] = 'p' // Putih occupies the top three rows
    else if (r >= 5) b[i] = 'm' // Merah occupies the bottom three rows
  }
  return b
}

// Immediate single jumps available to the piece at `idx` on board `b`.
function immediateJumps(b, idx) {
  const pc = b[idx]
  if (!pc) return []
  const side = sideOf(pc)
  const r = row(idx)
  const c = col(idx)
  const jumps = []
  for (const [dr, dc] of dirsFor(pc)) {
    const mr = r + dr
    const mc = c + dc
    const lr = r + 2 * dr
    const lc = c + 2 * dc
    if (!inBounds(lr, lc)) continue
    const mi = mr * 8 + mc
    const li = lr * 8 + lc
    const midPc = b[mi]
    if (midPc && sideOf(midPc) !== side && b[li] === '') jumps.push({ to: li, over: mi })
  }
  return jumps
}

// Plain forward (or any-direction, for kings) single-step moves.
function simpleSteps(b, idx) {
  const pc = b[idx]
  if (!pc) return []
  const r = row(idx)
  const c = col(idx)
  const steps = []
  for (const [dr, dc] of dirsFor(pc)) {
    const nr = r + dr
    const nc = c + dc
    if (!inBounds(nr, nc)) continue
    const ni = nr * 8 + nc
    if (b[ni] === '') steps.push({ to: ni })
  }
  return steps
}

// Every maximal capture chain starting from `from` for piece `pc` on board `b`.
// A man promoting mid-jump stops the chain (kept simple + consistent).
function captureSequences(b, from, pc) {
  const results = []
  const side = sideOf(pc)
  const r = row(from)
  const c = col(from)
  for (const [dr, dc] of dirsFor(pc)) {
    const mr = r + dr
    const mc = c + dc
    const lr = r + 2 * dr
    const lc = c + 2 * dc
    if (!inBounds(lr, lc)) continue
    const mi = mr * 8 + mc
    const li = lr * 8 + lc
    const midPc = b[mi]
    if (!midPc || sideOf(midPc) === side || b[li] !== '') continue
    const nb = b.slice()
    nb[from] = ''
    nb[mi] = ''
    let np = pc
    let promoted = false
    if (pc === 'm' && lr === 0) {
      np = 'M'
      promoted = true
    } else if (pc === 'p' && lr === 7) {
      np = 'P'
      promoted = true
    }
    nb[li] = np
    const cont = promoted ? [] : captureSequences(nb, li, np)
    if (cont.length) {
      for (const s of cont) results.push({ path: [li, ...s.path], captures: [mi, ...s.captures] })
    } else {
      results.push({ path: [li], captures: [mi] })
    }
  }
  return results
}

// All legal moves for `side`: captures if any exist (forced capture), else the
// plain single steps. Each move is { from, path[], captures[] }.
function generateMoves(b, side) {
  const caps = []
  for (let i = 0; i < 64; i++) {
    const pc = b[i]
    if (!pc || sideOf(pc) !== side) continue
    for (const s of captureSequences(b, i, pc)) caps.push({ from: i, path: s.path, captures: s.captures })
  }
  if (caps.length) return caps
  const moves = []
  for (let i = 0; i < 64; i++) {
    const pc = b[i]
    if (!pc || sideOf(pc) !== side) continue
    for (const st of simpleSteps(b, i)) moves.push({ from: i, path: [st.to], captures: [] })
  }
  return moves
}

function applyMoveToBoard(b, move) {
  const nb = b.slice()
  const pc = nb[move.from]
  nb[move.from] = ''
  for (const cap of move.captures) nb[cap] = ''
  const dest = move.path[move.path.length - 1]
  let np = pc
  if (pc === 'm' && row(dest) === 0) np = 'M'
  else if (pc === 'p' && row(dest) === 7) np = 'P'
  nb[dest] = np
  return nb
}

// ---- Interaction state ----

const mustCapture = computed(() => {
  if (over.value) return false
  return board.value.some((pc, i) => pc && sideOf(pc) === turn.value && immediateJumps(board.value, i).length > 0)
})

const selectableSet = computed(() => {
  const s = new Set()
  if (locked.value) return s
  if (chaining.value) {
    if (selected.value != null) s.add(selected.value)
    return s
  }
  const mc = mustCapture.value
  for (let i = 0; i < 64; i++) {
    const pc = board.value[i]
    if (!pc || sideOf(pc) !== turn.value) continue
    if (mc ? immediateJumps(board.value, i).length : simpleSteps(board.value, i).length) s.add(i)
  }
  return s
})

const targetSet = computed(() => {
  const s = new Set()
  if (selected.value == null || locked.value) return s
  if (chaining.value || mustCapture.value) {
    for (const j of immediateJumps(board.value, selected.value)) s.add(j.to)
  } else {
    for (const st of simpleSteps(board.value, selected.value)) s.add(st.to)
  }
  return s
})

function pieceClass(pc) {
  return sideOf(pc) === 'M' ? 'is-red' : 'is-white'
}

function onCell(i) {
  if (locked.value || over.value) return
  const pc = board.value[i]
  // Pick one of your own movable pieces.
  if (!chaining.value && pc && sideOf(pc) === turn.value && selectableSet.value.has(i)) {
    if (selected.value !== i) sfx.tick()
    selected.value = i
    return
  }
  // Move the picked piece onto a highlighted destination.
  if (selected.value != null && targetSet.value.has(i)) {
    stepMove(selected.value, i)
    return
  }
  // Tapping empty space clears the pick (never while mid-chain).
  if (!chaining.value) selected.value = null
}

// Perform a single step (simple move or one jump of a chain) on the live board.
function stepMove(from, to) {
  const isCap = Math.abs(row(to) - row(from)) === 2
  const b = board.value.slice()
  const pc = b[from]
  b[from] = ''
  if (isCap) {
    const mid = ((row(from) + row(to)) / 2) * 8 + (col(from) + col(to)) / 2
    b[mid] = ''
  }
  let np = pc
  let promoted = false
  if (pc === 'm' && row(to) === 0) {
    np = 'M'
    promoted = true
  } else if (pc === 'p' && row(to) === 7) {
    np = 'P'
    promoted = true
  }
  b[to] = np
  board.value = b
  sfx.tick()
  // A capture that can continue with the same (non-promoted) piece must go on.
  if (isCap && !promoted && immediateJumps(b, to).length) {
    selected.value = to
    chaining.value = true
    return
  }
  endTurn()
}

// Hand the turn to the opponent, or end the game if they cannot answer.
function endTurn() {
  selected.value = null
  chaining.value = false
  const next = opponent(turn.value)
  const hasPiece = board.value.some((pc) => pc && sideOf(pc) === next)
  const nextMoves = hasPiece ? generateMoves(board.value, next) : []
  if (nextMoves.length === 0) {
    winner.value = turn.value
    if (mode.value === 'cpu' && winner.value === 'P') sfx.lose()
    else sfx.win()
    return
  }
  turn.value = next
  if (mode.value === 'cpu' && next === 'P') {
    clearTimeout(cpuTimer)
    cpuTimer = setTimeout(runCpu, 400)
  }
}

// ---- CPU: negamax with alpha-beta ----

// Static evaluation; positive favours Putih (the CPU).
function centerBonus(c) {
  if (c === 3 || c === 4) return 6
  if (c === 2 || c === 5) return 2
  return 0
}
function evaluate(b) {
  let s = 0
  for (let i = 0; i < 64; i++) {
    const pc = b[i]
    if (!pc) continue
    const r = row(i)
    const king = isKing(pc)
    let v = king ? 250 : 100
    v += centerBonus(col(i))
    if (sideOf(pc) === 'M') {
      if (!king) {
        v += (7 - r) * 4 // advancement toward promotion at row 0
        if (r === 7) v += 14 // back-row guard
      }
      s -= v
    } else {
      if (!king) {
        v += r * 4 // advancement toward promotion at row 7
        if (r === 0) v += 14 // back-row guard
      }
      s += v
    }
  }
  return s
}
const evalFor = (b, side) => (side === 'P' ? evaluate(b) : -evaluate(b))

function negamax(b, side, depth, alpha, beta) {
  const moves = generateMoves(b, side)
  if (moves.length === 0) return -(1e6 + depth) // side to move is stuck → loses
  if (depth === 0) return evalFor(b, side)
  let best = -Infinity
  for (const m of moves) {
    const nb = applyMoveToBoard(b, m)
    const v = -negamax(nb, opponent(side), depth - 1, -beta, -alpha)
    if (v > best) best = v
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

function shuffled(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function runCpu() {
  if (over.value || turn.value !== 'P') return
  const moves = generateMoves(board.value, 'P')
  if (!moves.length) {
    endTurn()
    return
  }
  let best = moves[0]
  let bestV = -Infinity
  for (const m of shuffled(moves)) {
    const nb = applyMoveToBoard(board.value, m)
    const v = -negamax(nb, 'M', SEARCH_DEPTH - 1, -Infinity, Infinity)
    if (v > bestV) {
      bestV = v
      best = m
    }
  }
  playCpuMove(best)
}

// Play the CPU move one jump at a time so a multi-jump is visible, then pass.
function playCpuMove(move) {
  let from = move.from
  let step = 0
  const doStep = () => {
    if (over.value) return
    const to = move.path[step]
    const cap = move.captures.length ? move.captures[step] : null
    const b = board.value.slice()
    const pc = b[from]
    b[from] = ''
    if (cap != null) b[cap] = ''
    let np = pc
    if (pc === 'p' && row(to) === 7) np = 'P'
    else if (pc === 'm' && row(to) === 0) np = 'M'
    b[to] = np
    board.value = b
    sfx.tick()
    from = to
    step++
    if (step < move.path.length) {
      cpuTimer = setTimeout(doStep, 260)
    } else {
      endTurn()
    }
  }
  doStep()
}

// ---- Lifecycle / controls ----

function reset() {
  clearTimeout(cpuTimer)
  board.value = makeBoard()
  turn.value = 'M'
  winner.value = null
  selected.value = null
  chaining.value = false
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
  <div class="dam">
    <div class="panel">
      <!-- Mode picker -->
      <section v-if="!mode" class="screen">
        <p class="brand">DA<span class="brand__accent">M</span></p>
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

        <div class="tally" aria-label="Sisa bidak">
          <span class="tally__side"><span class="pip pip--red" /> {{ counts.m }}</span>
          <span class="tally__dot">·</span>
          <span class="tally__side">{{ counts.p }} <span class="pip pip--white" /></span>
        </div>

        <div class="board" :class="{ 'is-locked': locked }">
          <template v-for="i in cells" :key="i">
            <button
              v-if="isDark(i)"
              class="cell cell--dark"
              type="button"
              :class="{
                'is-sel': selected === i,
                'is-target': targetSet.has(i),
                'can-pick': selectableSet.has(i),
              }"
              :disabled="locked || (!selectableSet.has(i) && !targetSet.has(i))"
              :aria-label="`Petak ${i + 1}`"
              @click="onCell(i)"
            >
              <span v-if="board[i]" class="man" :class="[pieceClass(board[i]), { 'is-king': isKing(board[i]) }]">
                <span v-if="isKing(board[i])" class="crown" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M3 17 L3 9 L8 12.5 L12 6 L16 12.5 L21 9 L21 17 Z"
                      fill="var(--sun)"
                      stroke="var(--ink)"
                      stroke-width="2"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
              </span>
              <span v-else-if="targetSet.has(i)" class="dot" />
            </button>
            <span v-else class="cell cell--light" aria-hidden="true" />
          </template>
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
.dam {
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
  font-size: 40px;
}

/* ---- Remaining-piece tally ---- */
.tally {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 14px;
  font-family: var(--font-mono);
  font-size: 18px;
  color: var(--ink);
}
.tally__side {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tally__dot {
  color: var(--muted);
}
.pip {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--ink);
}
.pip--red {
  background: var(--berry);
}
.pip--white {
  background: var(--cream);
}

/* ---- The wooden checkerboard ---- */
.board {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  margin-bottom: 20px;
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  overflow: hidden;
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
  margin: 0;
  border: 0;
}
.cell--light {
  background: #ffe9c9;
}
.cell--dark {
  background: #c98a4e;
  transition: box-shadow 0.1s ease, background 0.1s ease;
}
.cell--dark.can-pick,
.cell--dark.is-target,
.cell--dark.is-sel {
  cursor: pointer;
}
/* Movable pieces get a soft aqua ring; the picked piece a solid one. */
.cell--dark.can-pick:not(.is-sel) {
  box-shadow: inset 0 0 0 3px rgba(15, 168, 142, 0.5);
}
.cell--dark.is-sel {
  box-shadow: inset 0 0 0 3px var(--aqua-deep);
  background: #d89a5c;
}

/* ---- Discs ---- */
.man {
  width: 78%;
  height: 78%;
  border-radius: 50%;
  border: 2.5px solid var(--ink);
  display: grid;
  place-items: center;
  box-shadow: inset 0 -3px 0 rgba(44, 19, 56, 0.18);
  animation: dam-hop 0.16s ease both;
}
.man.is-red {
  background: var(--berry);
}
.man.is-white {
  background: var(--cream);
}
/* A Raja gets a doubled ring plus its crown. */
.man.is-king {
  box-shadow: inset 0 -3px 0 rgba(44, 19, 56, 0.18), 0 0 0 2px var(--ink);
}
.crown {
  width: 56%;
  height: 56%;
  display: block;
}
.crown svg {
  display: block;
  width: 100%;
  height: 100%;
}
.cell--dark.is-sel .man {
  animation: dam-pulse 0.9s ease-in-out infinite;
}

/* A dot marking a legal destination for the picked piece. */
.dot {
  width: 34%;
  height: 34%;
  border-radius: 50%;
  background: var(--aqua-deep);
  box-shadow: 0 0 0 2px rgba(255, 243, 223, 0.65);
  animation: dam-hop 0.16s ease both;
}

@keyframes dam-hop {
  from {
    transform: scale(0.3);
    opacity: 0;
  }
}
@keyframes dam-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(0.9);
  }
}
</style>
