<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'
import {
  parseFen,
  generateLegalMoves,
  applyMove,
  findMove,
  isCheck,
  isCheckmate,
  isStalemate,
  searchBestMove,
  rankOf,
  fileOf,
} from '../data/chess.js'

// Catur — a full game of chess. Play two-up on one device, or take White against
// the built-in CPU (a small alpha-beta search; harder tiers look further ahead).
// All the rules are handled by the shared engine: castling, en passant,
// promotion, check, checkmate and stalemate, plus draws by repetition, the
// 50-move rule and insufficient material.

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const MODES = [
  { key: 'solo', label: 'Solo' },
  { key: 'duo', label: 'Duo' },
]
const LEVELS = [
  { key: 'mudah', label: 'Mudah', depth: 2 },
  { key: 'sedang', label: 'Sedang', depth: 3 },
  { key: 'sulit', label: 'Sulit', depth: 4 },
]

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const isWhitePiece = (p) => p >= 'A' && p <= 'Z'
const SQUARES = Array.from({ length: 64 }, (_, i) => i)

// --- Game state -------------------------------------------------------------

const phase = ref('setup') // setup | play | over
const modeSel = ref(MODES[0])
const levelSel = ref(LEVELS[1])
const mode = ref('solo')
const level = ref(LEVELS[1])

const gs = ref(null)
const selected = ref(-1)
const targets = ref(new Set())
const lastMove = ref(null)
const pendingPromo = ref(null) // { from, to }
const busy = ref(false) // CPU thinking or promotion open
const result = ref(null) // null | 'white' | 'black' | 'draw'
const resultReason = ref('')
const halfmove = ref(0)
const moveNo = ref(1)
const reps = new Map()

let cpuTimer = 0

// --- Rendering helpers ------------------------------------------------------

const turnLabel = computed(() => (gs.value && gs.value.white ? 'Putih' : 'Hitam'))
const checkSq = computed(() => {
  const s = gs.value
  if (!s || !isCheck(s)) return -1
  return s.board.indexOf(s.white ? 'K' : 'k')
})

function squareClass(i) {
  const light = (rankOf(i) + fileOf(i)) % 2 === 0
  return {
    'sq--light': light,
    'sq--dark': !light,
    'is-sel': selected.value === i,
    'is-last': lastMove.value && (lastMove.value.from === i || lastMove.value.to === i),
    'is-check': checkSq.value === i,
  }
}
const emptyTarget = (i) => targets.value.has(i) && gs.value.board[i] === ''
const promoGlyphs = computed(() => {
  const w = gs.value && gs.value.white
  return ['Q', 'R', 'B', 'N'].map((t) => ({ t, glyph: GLYPH[t.toLowerCase()], white: w }))
})

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

function myTurn() {
  // Whose taps are accepted: both sides in duo, only White in solo.
  return mode.value === 'duo' || gs.value.white
}

function onSquare(i) {
  if (phase.value !== 'play' || busy.value || result.value || !myTurn()) return
  const piece = gs.value.board[i]
  if (selected.value === i) return clearSel()
  if (selected.value >= 0 && targets.value.has(i)) return doMove(selected.value, i)
  if (piece && isWhitePiece(piece) === gs.value.white) return select(i)
  clearSel()
}

function doMove(from, to) {
  const piece = gs.value.board[from]
  if (piece.toUpperCase() === 'P' && (rankOf(to) === 0 || rankOf(to) === 7)) {
    pendingPromo.value = { from, to } // ask which piece to promote to
    busy.value = true
    clearSel()
    return
  }
  const m = findMove(gs.value, from, to)
  if (m) applyAndAdvance(m)
}

function pickPromo(t) {
  const p = pendingPromo.value
  pendingPromo.value = null
  busy.value = false
  if (!p) return
  const m = findMove(gs.value, p.from, p.to, t)
  if (m) applyAndAdvance(m)
}

function applyAndAdvance(m) {
  const before = gs.value
  const capture = before.board[m.to] !== '' || (before.board[m.from].toUpperCase() === 'P' && m.to === before.ep)
  const pawn = before.board[m.from].toUpperCase() === 'P'
  if (!before.white) moveNo.value += 1
  gs.value = applyMove(before, m)
  lastMove.value = { from: m.from, to: m.to }
  clearSel()
  halfmove.value = capture || pawn ? 0 : halfmove.value + 1
  const key = posKey(gs.value)
  reps.set(key, (reps.get(key) || 0) + 1)
  sfx.tick()
  if (checkOver()) return
  if (mode.value === 'solo' && !gs.value.white) {
    busy.value = true
    cpuTimer = setTimeout(cpuMove, 340)
  }
}

function cpuMove() {
  busy.value = false
  if (result.value) return
  const m = searchBestMove(gs.value, level.value.depth)
  if (!m) return checkOver()
  applyAndAdvance(m)
}

function posKey(s) {
  return s.board.join('') + (s.white ? 'w' : 'b') + (s.castling.K ? 'K' : '') + (s.castling.Q ? 'Q' : '') +
    (s.castling.k ? 'k' : '') + (s.castling.q ? 'q' : '') + ':' + s.ep
}

function insufficient(s) {
  let minors = 0
  for (const p of s.board) {
    if (p === '' || p.toUpperCase() === 'K') continue
    const t = p.toUpperCase()
    if (t === 'P' || t === 'R' || t === 'Q') return false // enough to mate
    minors++
  }
  return minors <= 1 // K vs K, K+minor vs K
}

function checkOver() {
  const s = gs.value
  if (isCheckmate(s)) {
    finish(s.white ? 'black' : 'white', 'Skakmat')
    return true
  }
  if (isStalemate(s)) return finish('draw', 'Buntu (pat)'), true
  if (insufficient(s)) return finish('draw', 'Materi tak cukup'), true
  if (halfmove.value >= 100) return finish('draw', 'Aturan 50 langkah'), true
  if ((reps.get(posKey(s)) || 0) >= 3) return finish('draw', 'Pengulangan tiga kali'), true
  return false
}

function finish(res, reason) {
  result.value = res
  resultReason.value = reason
  phase.value = 'over'
  busy.value = false
  clearSel()
  sfx.win()
}

// --- Lifecycle --------------------------------------------------------------

function deal() {
  gs.value = parseFen(START)
  selected.value = -1
  targets.value = new Set()
  lastMove.value = null
  pendingPromo.value = null
  busy.value = false
  result.value = null
  resultReason.value = ''
  halfmove.value = 0
  moveNo.value = 1
  reps.clear()
  reps.set(posKey(gs.value), 1)
  phase.value = 'play'
}
function start() {
  mode.value = modeSel.value.key
  level.value = levelSel.value
  deal()
}
function newGame() {
  clearTimeout(cpuTimer)
  deal()
}
function toSetup() {
  clearTimeout(cpuTimer)
  phase.value = 'setup'
}

const resultTitle = computed(() => {
  if (result.value === 'draw') return 'Seri'
  if (mode.value === 'solo') return result.value === 'white' ? 'Kamu menang!' : 'CPU menang'
  return result.value === 'white' ? 'Putih menang!' : 'Hitam menang!'
})

onMounted(() => {})
onBeforeUnmount(() => clearTimeout(cpuTimer))
</script>

<template>
  <div class="catur">
    <div class="panel">
      <section class="screen">
        <!-- ===== Setup ===== -->
        <template v-if="phase === 'setup'">
          <p class="brand">CA<span class="brand__accent">TUR</span></p>
          <p class="eyebrow">PILIH MODE</p>
          <div class="picker picker--2 setup__picker">
            <button
              v-for="md in MODES"
              :key="md.key"
              class="pick"
              type="button"
              :class="{ 'is-on': md.key === modeSel.key }"
              @click="modeSel = md"
            >
              {{ md.label }}
            </button>
          </div>

          <div v-if="modeSel.key === 'solo'" class="field">
            <span class="field__label">Tingkat CPU</span>
            <div class="picker picker--3">
              <button
                v-for="lv in LEVELS"
                :key="lv.key"
                class="pick"
                type="button"
                :class="{ 'is-on': lv.key === levelSel.key }"
                @click="levelSel = lv"
              >
                {{ lv.label }}
              </button>
            </div>
          </div>

          <p class="setup__info">
            {{ modeSel.key === 'solo' ? 'Kamu Putih melawan CPU' : 'Dua pemain bergantian' }}
          </p>
          <button class="cta" type="button" @click="start">Mulai ▸</button>
        </template>

        <!-- ===== Play / Over ===== -->
        <template v-else>
          <div class="topbar">
            <button class="mini" type="button" @click="toSetup">← Mode</button>
            <span class="status" :class="{ 'is-over': result }">
              {{ result ? resultTitle : (busy && mode === 'solo' ? 'CPU berpikir…' : 'Giliran ' + turnLabel) }}
            </span>
            <button class="mini" type="button" @click="newGame">Baru</button>
          </div>

          <div class="boardwrap">
            <div class="board" :class="{ locked: busy || result }">
              <button
                v-for="i in SQUARES"
                :key="i"
                class="sq"
                :class="squareClass(i)"
                type="button"
                @click="onSquare(i)"
              >
                <span
                  v-if="gs.board[i]"
                  class="piece"
                  :class="isWhitePiece(gs.board[i]) ? 'piece--w' : 'piece--b'"
                >{{ GLYPH[gs.board[i].toLowerCase()] }}</span>
                <span v-else-if="emptyTarget(i)" class="dot" />
              </button>
            </div>

            <!-- Promotion picker -->
            <div v-if="pendingPromo" class="promo">
              <span class="promo__label">Promosi ke:</span>
              <div class="promo__row">
                <button
                  v-for="pg in promoGlyphs"
                  :key="pg.t"
                  class="promo__btn"
                  type="button"
                  @click="pickPromo(pg.t)"
                >
                  <span class="piece" :class="pg.white ? 'piece--w' : 'piece--b'">{{ pg.glyph }}</span>
                </button>
              </div>
            </div>
          </div>

          <p class="tip">Ketuk bidak lalu petak tujuan · raja yang diskak ditandai.</p>

          <div v-if="result" class="result">
            <p class="result__title" :class="{ 'is-lost': mode === 'solo' && result === 'black' }">
              {{ resultTitle }}
            </p>
            <p class="result__streak">{{ resultReason }} · langkah {{ moveNo }}</p>
            <button class="cta" type="button" @click="newGame">Main lagi ▸</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/topbar/status/field/
   picker/pick/result come from src/styles.css. */
.catur {
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
.picker--2 {
  grid-template-columns: repeat(2, 1fr);
  width: 100%;
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
  margin: 14px 0 20px;
}

/* ---- Board ---- */
.boardwrap {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  margin: 14px 0 12px;
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
.sq.sq--dark.is-last {
  background: #cbb055;
}
.sq.is-sel {
  background: var(--sun);
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

/* ---- Promotion picker ---- */
.promo {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(44, 19, 56, 0.55);
  border-radius: 10px;
}
.promo__label {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--cream);
}
.promo__row {
  display: flex;
  gap: 8px;
}
.promo__btn {
  width: 15cqi;
  height: 15cqi;
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 10px;
  box-shadow: var(--pop-sm);
  container-type: inline-size;
}
.promo__btn .piece {
  font-size: 60cqi;
}
.promo__btn:active {
  transform: translateY(2px);
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
  padding-top: 8px;
}
.result__streak {
  margin: 6px 0 14px;
}
</style>
