<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'
import {
  PUZZLES,
  parseFen,
  generateLegalMoves,
  applyMove,
  findMove,
  isCheck,
  isCheckmate,
  isMatingKey,
  bestReply,
  rankOf,
  fileOf,
} from '../data/chess.js'

// Skak Mat — chess mate puzzles. White is always to move; find the checkmate.
// Mudah is mate in one; Sedang and Sulit are forced mate in two (make the key
// move, the defence replies, then you deliver mate). Every position is verified
// by the bundled engine, so a solution always exists — the hint points at the
// piece that starts it. A wrong move is refused so you can keep trying.

const SOLVED_KEY = 'dusk-skakmat-solved'
const BEST_KEY = 'dusk-skakmat-best'

const LEVELS = [
  { key: 'mudah', label: 'Mudah', mate: 1, info: 'Skakmat 1 langkah' },
  { key: 'sedang', label: 'Sedang', mate: 2, info: 'Skakmat 2 langkah' },
  { key: 'sulit', label: 'Sulit', mate: 2, info: 'Skakmat 2 langkah · rumit' },
]

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const isWhite = (p) => p >= 'A' && p <= 'Z'
const SQUARES = Array.from({ length: 64 }, (_, i) => i)

// --- Game state -------------------------------------------------------------

const phase = ref('setup') // setup | play | won
const sel = ref(LEVELS[0])
const level = ref(LEVELS[0])
const gs = ref(null) // engine state
const mateN = ref(1) // mate distance remaining
const selected = ref(-1)
const targets = ref(new Set())
const lastMove = ref(null) // { from, to }
const wrongSq = ref(-1)
const busy = ref(false)
const mistakes = ref(0)
const hintSq = ref(-1)
const elapsed = ref(0)
const solvedCount = ref(0)
const bestTime = ref(0)

let order = []
let orderPos = 0
let timer = 0
let startAt = 0
let wrongTimer = 0
let replyTimer = 0

const timeLabel = computed(() => fmt(elapsed.value))
function fmt(s) {
  const m = Math.floor(s / 60)
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

function shuffle(a) {
  const arr = a.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// The square holding the king that is currently in check (to flag it).
const checkSq = computed(() => {
  const s = gs.value
  if (!s || !isCheck(s)) return -1
  const k = s.white ? 'K' : 'k'
  return s.board.indexOf(k)
})

function squareClass(i) {
  const light = (rankOf(i) + fileOf(i)) % 2 === 0
  return {
    'sq--light': light,
    'sq--dark': !light,
    'is-sel': selected.value === i,
    'is-target': targets.value.has(i),
    'is-hint': hintSq.value === i,
    'is-last': lastMove.value && (lastMove.value.from === i || lastMove.value.to === i),
    'is-wrong': wrongSq.value === i,
    'is-check': checkSq.value === i,
  }
}
const emptyTarget = (i) => targets.value.has(i) && gs.value.board[i] === ''

// --- Interaction ------------------------------------------------------------

function select(i) {
  selected.value = i
  const set = new Set()
  for (const m of generateLegalMoves(gs.value)) if (m.from === i) set.add(m.to)
  targets.value = set
}
function clearSel() {
  selected.value = -1
  targets.value = new Set()
}

function onSquare(i) {
  if (phase.value !== 'play' || busy.value) return
  hintSq.value = -1
  const piece = gs.value.board[i]
  if (selected.value === i) return clearSel()
  if (selected.value >= 0 && targets.value.has(i)) return doMove(selected.value, i)
  if (piece && isWhite(piece)) return select(i)
  clearSel()
}

function doMove(from, to) {
  // For a promotion, pick the piece that actually forces mate (usually the
  // queen, but honour a rare underpromotion mate too).
  const promoting = gs.value.board[from].toUpperCase() === 'P' && (rankOf(to) === 0 || rankOf(to) === 7)
  let m = findMove(gs.value, from, to, 'Q')
  if (promoting) {
    for (const pr of ['Q', 'R', 'B', 'N']) {
      const cand = findMove(gs.value, from, to, pr)
      if (cand && isMatingKey(gs.value, cand, mateN.value)) {
        m = cand
        break
      }
    }
  }
  if (!m) return
  clearSel()
  if (!isMatingKey(gs.value, m, mateN.value)) {
    // Legal but doesn't force mate — refuse it and let the player retry.
    flashWrong(to)
    mistakes.value += 1
    sfx.wrong()
    return
  }
  const s1 = applyMove(gs.value, m)
  gs.value = s1
  lastMove.value = { from, to }
  sfx.tick()
  if (isCheckmate(s1)) return win()
  // Key move made; the defence answers, then the player mates next.
  busy.value = true
  replyTimer = setTimeout(() => {
    const r = bestReply(gs.value)
    if (r) {
      gs.value = applyMove(gs.value, r)
      lastMove.value = { from: r.from, to: r.to }
    }
    mateN.value = 1
    busy.value = false
  }, 420)
}

function flashWrong(i) {
  wrongSq.value = i
  clearTimeout(wrongTimer)
  wrongTimer = setTimeout(() => (wrongSq.value = -1), 420)
}

function hint() {
  if (phase.value !== 'play' || busy.value) return
  for (const m of generateLegalMoves(gs.value)) {
    if (isMatingKey(gs.value, m, mateN.value)) {
      hintSq.value = m.from
      break
    }
  }
}

// --- Lifecycle --------------------------------------------------------------

function deal() {
  if (orderPos >= order.length) {
    order = shuffle(PUZZLES[level.value.key])
    orderPos = 0
  }
  const fen = order[orderPos++]
  gs.value = parseFen(fen)
  mateN.value = level.value.mate
  clearSel()
  lastMove.value = null
  hintSq.value = -1
  wrongSq.value = -1
  busy.value = false
  mistakes.value = 0
  elapsed.value = 0
  phase.value = 'play'
}
function start() {
  level.value = sel.value
  order = shuffle(PUZZLES[level.value.key])
  orderPos = 0
  deal()
  startTimer()
}
function newGame() {
  clearTimeout(replyTimer)
  deal()
  startTimer()
}
function toSetup() {
  stopTimer()
  clearTimeout(replyTimer)
  phase.value = 'setup'
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
  timer = setInterval(() => (elapsed.value = Math.floor((Date.now() - startAt) / 1000)), 1000)
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

onMounted(() => {
  try {
    solvedCount.value = Number(localStorage.getItem(SOLVED_KEY)) || 0
    bestTime.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch (e) {
    solvedCount.value = 0
    bestTime.value = 0
  }
})
onBeforeUnmount(() => {
  stopTimer()
  clearTimeout(wrongTimer)
  clearTimeout(replyTimer)
})
</script>

<template>
  <div class="skakmat">
    <div class="panel">
      <section class="screen">
        <!-- ===== Setup ===== -->
        <template v-if="phase === 'setup'">
          <p class="brand">SKAK<span class="brand__accent">MAT</span></p>
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
          <p class="setup__info">{{ sel.info }} · SELESAI {{ solvedCount }}</p>
          <button class="cta" type="button" @click="start">Mulai ▸</button>
        </template>

        <!-- ===== Play / Won ===== -->
        <template v-else>
          <div class="backbar">
            <button class="mini" type="button" @click="toSetup">← Tingkat</button>
          </div>
          <p class="brand brand--sm">SKAK<span class="brand__accent">MAT</span></p>

          <div class="solobar hud">
            <span>WAKTU <b>{{ timeLabel }}</b></span>
            <span>{{ mateN === 1 ? 'SKAKMAT 1' : 'SKAKMAT 2' }}</span>
            <span class="solobar__best">SELESAI {{ solvedCount }}</span>
          </div>

          <div class="boardwrap">
            <div class="board" :class="{ locked: phase !== 'play' || busy }">
              <button
                v-for="i in SQUARES"
                :key="i"
                class="sq"
                :class="squareClass(i)"
                type="button"
                @click="onSquare(i)"
              >
                <span v-if="gs.board[i]" class="piece" :class="isWhite(gs.board[i]) ? 'piece--w' : 'piece--b'">
                  {{ GLYPH[gs.board[i].toLowerCase()] }}
                </span>
                <span v-else-if="emptyTarget(i)" class="dot" />
              </button>
            </div>
          </div>

          <p class="tip">Putih melangkah dan skakmat · ketuk bidak lalu petak tujuan.</p>

          <div class="tools">
            <button class="mini" type="button" @click="hint">Petunjuk</button>
            <button class="mini" type="button" @click="newGame">Baru</button>
          </div>

          <div v-if="phase === 'won'" class="result">
            <p class="result__title">Skakmat!</p>
            <p class="result__streak">WAKTU {{ timeLabel }} · SELESAI {{ solvedCount }}</p>
            <button class="cta" type="button" @click="newGame">Lagi ▸</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/backbar/picker/pick/
   solobar/result come from src/styles.css. */
.skakmat {
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
.boardwrap {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}
.board {
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  border: var(--line) solid var(--ink);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--pop-sm);
  container-type: inline-size;
}
.board.locked {
  pointer-events: none;
}
.sq {
  position: relative;
  min-width: 0;
  min-height: 0;
  border: 0;
  padding: 0;
  display: grid;
  place-items: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.sq--light {
  background: #f1e2c0;
}
.sq--dark {
  background: #c08a52;
}
.sq.is-last {
  background: #e7d67a;
}
.sq.is-dark.is-last {
  background: #cbb055;
}
.sq.is-sel {
  background: var(--sun);
}
.sq.is-hint {
  box-shadow: inset 0 0 0 3px var(--aqua-deep);
}
.sq.is-wrong {
  background: var(--tile-wrong);
}
.sq.is-check {
  background: #f2a0a8;
}

.piece {
  font-size: 9cqi;
  line-height: 1;
  pointer-events: none;
  user-select: none;
}
.piece--w {
  color: #fbf4e4;
  text-shadow: 0 0 1px var(--ink), 0.5px 0.5px 0 var(--ink), -0.5px -0.5px 0 var(--ink),
    0.5px -0.5px 0 var(--ink), -0.5px 0.5px 0 var(--ink);
}
.piece--b {
  color: #241030;
  text-shadow: 0 0 1px rgba(255, 255, 255, 0.5);
}
.dot {
  width: 26%;
  height: 26%;
  border-radius: 50%;
  background: rgba(44, 19, 56, 0.4);
  pointer-events: none;
}

/* ---- Tip + tools + result ---- */
.tip {
  margin: 0 0 12px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.02em;
  color: var(--muted);
  text-align: center;
  line-height: 1.5;
}
.tools {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
.result {
  width: 100%;
  text-align: center;
  padding-top: 14px;
}
.result__streak {
  margin: 6px 0 14px;
}
</style>
