<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Blok Kayu — Woodoku (solo, no mode picker). Drop wooden block shapes onto a
// 9×9 board; whenever a row, column, or 3×3 box fills up it clears. You never
// draw new pieces on demand — a tray of 3 shapes refills only once all three
// are placed, so the challenge is fitting them all. Game over the moment none
// of the current tray pieces can go anywhere. Best score is persisted.

const SIZE = 9
const CELLS = SIZE * SIZE
const INDICES = Array.from({ length: CELLS }, (_, i) => i)
const TINTS = 4 // number of wood-tint variants (see .c0–.c3)
const CLEAR_MS = 300 // pop/fade before cleared cells are emptied
const LIFT = 0.7 // cells the dragged ghost floats above the finger
const bestKey = 'dusk-blokkayu-best'

// ---- Shape pool ------------------------------------------------------------
// Each entry is a list of [row, col] filled cells; makeShape() normalises it to
// a top-left origin and precomputes width/height + a flat matrix for rendering.
const RAW_SHAPES = [
  [[0, 0]], // dot
  [[0, 0], [0, 1]], // 2 horizontal
  [[0, 0], [1, 0]], // 2 vertical
  [[0, 0], [0, 1], [0, 2]], // 3 horizontal
  [[0, 0], [1, 0], [2, 0]], // 3 vertical
  [[0, 0], [0, 1], [0, 2], [0, 3]], // 4 horizontal
  [[0, 0], [1, 0], [2, 0], [3, 0]], // 4 vertical
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], // 5 horizontal
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], // 5 vertical
  [[0, 0], [0, 1], [1, 0], [1, 1]], // 2×2 square
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], // 3×3 square
  [[0, 0], [1, 0], [1, 1]], // corner ┗
  [[0, 1], [1, 0], [1, 1]], // corner ┛
  [[0, 0], [0, 1], [1, 0]], // corner ┏
  [[0, 0], [0, 1], [1, 1]], // corner ┓
  [[0, 0], [0, 1], [0, 2], [1, 1]], // T tetromino
  [[0, 1], [0, 2], [1, 0], [1, 1]], // S tetromino
  [[0, 0], [0, 1], [1, 1], [1, 2]], // Z tetromino
  [[0, 0], [1, 0], [2, 0], [2, 1]], // L tetromino
  [[0, 1], [1, 1], [2, 1], [2, 0]], // J tetromino
]

function makeShape(cells) {
  const minR = Math.min(...cells.map((p) => p[0]))
  const minC = Math.min(...cells.map((p) => p[1]))
  const norm = cells.map(([r, c]) => [r - minR, c - minC])
  const h = Math.max(...norm.map((p) => p[0])) + 1
  const w = Math.max(...norm.map((p) => p[1])) + 1
  const flat = []
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) flat.push(norm.some((p) => p[0] === r && p[1] === c))
  }
  return { cells: norm, w, h, size: norm.length, flat }
}
const SHAPES = RAW_SHAPES.map(makeShape)

// ---- State -----------------------------------------------------------------
const phase = ref('play') // play | over
const board = ref(new Array(CELLS).fill(null)) // null = empty, else tint index
const tray = ref([]) // 3 slots of { shape, color, id } | null
const score = ref(0)
const best = ref(loadBest())
const record = ref(false)
const busy = ref(false) // true while a clear animates — blocks input

const selectedPiece = ref(-1) // tray index selected via tap
const clearing = ref(new Set()) // indices mid-clear-flash
const ghost = ref(null) // drag preview: { set:Set, valid, tr, tc }
const boardShake = ref(false)
const shakeIdx = ref(-1) // tray index shaking after an invalid drop
const boardEl = ref(null)

let pieceId = 1
let clearTimer = 0
let shakeTimer = 0
let boardShakeTimer = 0

// Drag bookkeeping (plain vars — no need to be reactive).
let dragTrayIdx = -1
let dragPiece = null
let dragEl = null
let dragPointerId = 0
let startX = 0
let startY = 0
let moved = false

// ---- Persistence -----------------------------------------------------------
function loadBest() {
  try {
    return Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    return 0
  }
}
function saveBest() {
  if (score.value > best.value) {
    best.value = score.value
    record.value = true
    try {
      localStorage.setItem(bestKey, String(best.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory best */
    }
  }
}

// ---- Pure board logic ------------------------------------------------------
function fits(shape, tr, tc) {
  for (const [r, c] of shape.cells) {
    const rr = tr + r
    const cc = tc + c
    if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) return false
    if (board.value[rr * SIZE + cc] != null) return false
  }
  return true
}

function canPlaceAnywhere(shape) {
  for (let tr = 0; tr <= SIZE - shape.h; tr++) {
    for (let tc = 0; tc <= SIZE - shape.w; tc++) {
      if (fits(shape, tr, tc)) return true
    }
  }
  return false
}

function anyMovePossible() {
  return tray.value.some((p) => p && canPlaceAnywhere(p.shape))
}

// Every full row, column and 3×3 box, collected into one set so they clear at
// the same instant. Returns the cells plus how many lines were completed.
function findClears() {
  const b = board.value
  const cells = new Set()
  let lines = 0
  for (let r = 0; r < SIZE; r++) {
    let full = true
    for (let c = 0; c < SIZE; c++) if (b[r * SIZE + c] == null) { full = false; break }
    if (full) { lines++; for (let c = 0; c < SIZE; c++) cells.add(r * SIZE + c) }
  }
  for (let c = 0; c < SIZE; c++) {
    let full = true
    for (let r = 0; r < SIZE; r++) if (b[r * SIZE + c] == null) { full = false; break }
    if (full) { lines++; for (let r = 0; r < SIZE; r++) cells.add(r * SIZE + c) }
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      let full = true
      for (let r = 0; r < 3 && full; r++) {
        for (let c = 0; c < 3; c++) {
          if (b[(br * 3 + r) * SIZE + (bc * 3 + c)] == null) { full = false; break }
        }
      }
      if (full) {
        lines++
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.add((br * 3 + r) * SIZE + (bc * 3 + c))
      }
    }
  }
  return { cells, lines }
}

// ---- Tray ------------------------------------------------------------------
function randomPiece() {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)]
  const color = Math.floor(Math.random() * TINTS)
  return { shape, color, id: pieceId++ }
}
function refillTray() {
  tray.value = [randomPiece(), randomPiece(), randomPiece()]
}

// Pieces that can't be placed anywhere on the current board (greyed hint).
const deadFlags = computed(() => tray.value.map((p) => (p ? !canPlaceAnywhere(p.shape) : false)))

// Valid top-left cells for the tap-selected piece (guides tap-to-place).
const placeable = computed(() => {
  const s = new Set()
  if (selectedPiece.value === -1) return s
  const piece = tray.value[selectedPiece.value]
  if (!piece) return s
  for (let tr = 0; tr <= SIZE - piece.shape.h; tr++) {
    for (let tc = 0; tc <= SIZE - piece.shape.w; tc++) {
      if (fits(piece.shape, tr, tc)) s.add(tr * SIZE + tc)
    }
  }
  return s
})

// ---- Placement -------------------------------------------------------------
function commitPlace(piece, trayIdx, tr, tc) {
  for (const [r, c] of piece.shape.cells) board.value[(tr + r) * SIZE + (tc + c)] = piece.color
  score.value += piece.shape.size
  sfx.tick()
  tray.value[trayIdx] = null
  selectedPiece.value = -1

  const { cells, lines } = findClears()
  if (cells.size) {
    busy.value = true
    clearing.value = cells
    // 10 per line, plus an escalating combo bonus when several clear at once.
    score.value += 10 * lines + (lines >= 2 ? 10 * (lines - 1) : 0)
    sfx.win()
    clearTimeout(clearTimer)
    clearTimer = setTimeout(() => {
      cells.forEach((i) => { board.value[i] = null })
      clearing.value = new Set()
      busy.value = false
      resolveAfter()
    }, CLEAR_MS)
  } else {
    resolveAfter()
  }
  saveBest()
}

// Refill an emptied tray, then check whether the player is stuck.
function resolveAfter() {
  if (tray.value.every((p) => p == null)) refillTray()
  if (!anyMovePossible()) gameOver()
}

function gameOver() {
  phase.value = 'over'
  sfx.lose()
}

// ---- Drag (pointer) --------------------------------------------------------
// Snap the finger position to a board top-left cell, centred horizontally and
// lifted a touch so the ghost isn't hidden under the fingertip.
function targetFor(clientX, clientY, shape) {
  const rect = boardEl.value.getBoundingClientRect()
  const cell = rect.width / SIZE
  const cx = (clientX - rect.left) / cell
  const cy = (clientY - rect.top) / cell
  return {
    tr: Math.round(cy - shape.h / 2 - LIFT),
    tc: Math.round(cx - shape.w / 2),
  }
}

function updateGhost(clientX, clientY) {
  if (!boardEl.value || !dragPiece) { ghost.value = null; return }
  const { tr, tc } = targetFor(clientX, clientY, dragPiece.shape)
  const set = new Set()
  let valid = true
  for (const [r, c] of dragPiece.shape.cells) {
    const rr = tr + r
    const cc = tc + c
    if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) { valid = false; continue }
    const i = rr * SIZE + cc
    if (board.value[i] != null) valid = false
    set.add(i)
  }
  ghost.value = { set, valid, tr, tc }
}

function onPiecePointerDown(e, idx) {
  if (busy.value || phase.value !== 'play') return
  const piece = tray.value[idx]
  if (!piece) return
  dragTrayIdx = idx
  dragPiece = piece
  dragEl = e.currentTarget
  dragPointerId = e.pointerId
  startX = e.clientX
  startY = e.clientY
  moved = false
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch (err) {
    /* capture unsupported; drag still works via the same element's events */
  }
}

function onPiecePointerMove(e) {
  if (dragTrayIdx === -1) return
  if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 8) return
  if (!moved) selectedPiece.value = -1 // a real drag cancels any tap-selection
  moved = true
  updateGhost(e.clientX, e.clientY)
}

function onPiecePointerUp(e) {
  if (dragTrayIdx === -1) return
  const idx = dragTrayIdx
  const piece = dragPiece
  const wasMoved = moved
  const g = ghost.value
  try {
    dragEl && dragEl.releasePointerCapture(dragPointerId)
  } catch (err) {
    /* nothing captured */
  }
  dragTrayIdx = -1
  dragPiece = null
  dragEl = null
  moved = false
  ghost.value = null

  if (!wasMoved) {
    // A tap, not a drag → toggle tap-selection.
    toggleSelect(idx)
    return
  }
  if (g && g.valid) commitPlace(piece, idx, g.tr, g.tc)
  else { sfx.wrong(); shakePiece(idx) }
}

// An interrupted gesture (system cancel) just returns the piece — no drop.
function onPiecePointerCancel() {
  if (dragTrayIdx === -1) return
  try {
    dragEl && dragEl.releasePointerCapture(dragPointerId)
  } catch (err) {
    /* nothing captured */
  }
  dragTrayIdx = -1
  dragPiece = null
  dragEl = null
  moved = false
  ghost.value = null
}

// ---- Tap-to-place ----------------------------------------------------------
function toggleSelect(idx) {
  if (busy.value || phase.value !== 'play') return
  if (!tray.value[idx]) return
  selectedPiece.value = selectedPiece.value === idx ? -1 : idx
}

function onCellClick(idx) {
  if (busy.value || phase.value !== 'play') return
  if (selectedPiece.value === -1) return
  const piece = tray.value[selectedPiece.value]
  if (!piece) { selectedPiece.value = -1; return }
  const tr = Math.floor(idx / SIZE)
  const tc = idx % SIZE
  if (fits(piece.shape, tr, tc)) commitPlace(piece, selectedPiece.value, tr, tc)
  else { sfx.wrong(); shakeBoard() }
}

// ---- Feedback --------------------------------------------------------------
function shakePiece(idx) {
  shakeIdx.value = idx
  clearTimeout(shakeTimer)
  shakeTimer = setTimeout(() => { shakeIdx.value = -1 }, 420)
}
function shakeBoard() {
  boardShake.value = false
  requestAnimationFrame(() => { boardShake.value = true })
  clearTimeout(boardShakeTimer)
  boardShakeTimer = setTimeout(() => { boardShake.value = false }, 420)
}

// ---- Cell rendering --------------------------------------------------------
function cellClass(i) {
  const out = []
  const col = i % SIZE
  const row = Math.floor(i / SIZE)
  if (col === 3 || col === 6) out.push('sep-l')
  if (row === 3 || row === 6) out.push('sep-t')
  const v = board.value[i]
  if (v != null) out.push('is-filled', 'c' + v)
  if (clearing.value.has(i)) out.push('is-clear')
  const g = ghost.value
  if (g && g.set.has(i)) out.push(g.valid ? 'ghost-ok' : 'ghost-bad')
  else if (selectedPiece.value !== -1 && placeable.value.has(i)) out.push('is-drop')
  return out
}

// ---- Lifecycle -------------------------------------------------------------
function newGame() {
  clearTimeout(clearTimer)
  clearTimeout(shakeTimer)
  clearTimeout(boardShakeTimer)
  board.value = new Array(CELLS).fill(null)
  refillTray()
  score.value = 0
  record.value = false
  selectedPiece.value = -1
  clearing.value = new Set()
  ghost.value = null
  boardShake.value = false
  shakeIdx.value = -1
  busy.value = false
  dragTrayIdx = -1
  dragPiece = null
  phase.value = 'play'
}

newGame()

onMounted(() => {
  best.value = loadBest()
})
onBeforeUnmount(() => {
  clearTimeout(clearTimer)
  clearTimeout(shakeTimer)
  clearTimeout(boardShakeTimer)
})
</script>

<template>
  <div class="blokkayu">
    <div class="panel">
      <!-- ===== Play ===== -->
      <section v-if="phase === 'play'" class="screen">
        <p class="brand">BLOK<span class="brand__accent"> KAYU</span></p>
        <p class="eyebrow">SUSUN BALOK, PENUHI BARIS</p>

        <div class="solobar meta">
          <span>SKOR <b>{{ score }}</b></span>
          <span class="solobar__best">REKOR {{ best }}</span>
        </div>

        <div ref="boardEl" class="board" :class="{ shake: boardShake }">
          <div
            v-for="i in INDICES"
            :key="i"
            class="cell"
            :class="cellClass(i)"
            @click="onCellClick(i)"
          />
          <div class="board__sep" />
        </div>

        <div class="tray">
          <button
            v-for="(piece, idx) in tray"
            :key="piece ? piece.id : 'empty-' + idx"
            class="slot"
            :class="{ 'is-sel': selectedPiece === idx, 'is-empty': !piece, 'is-dead': deadFlags[idx], shake: shakeIdx === idx }"
            type="button"
            :disabled="!piece || busy"
            :aria-label="piece ? 'Balok ' + (idx + 1) : 'Slot kosong'"
            @pointerdown="onPiecePointerDown($event, idx)"
            @pointermove="onPiecePointerMove($event)"
            @pointerup="onPiecePointerUp($event)"
            @pointercancel="onPiecePointerCancel()"
          >
            <span
              v-if="piece"
              class="piece"
              :class="'c' + piece.color"
              :style="{ '--w': piece.shape.w, '--h': piece.shape.h }"
            >
              <span
                v-for="(on, k) in piece.shape.flat"
                :key="k"
                class="pcell"
                :class="{ 'is-on': on }"
              />
            </span>
          </button>
        </div>

        <p class="hint">Seret balok ke papan, atau ketuk balok lalu ketuk petak.</p>
        <button class="cta cta--ghost" type="button" @click="newGame">Ulang</button>
      </section>

      <!-- ===== Result ===== -->
      <section v-else class="screen result">
        <p class="brand">BLOK<span class="brand__accent"> KAYU</span></p>
        <p class="result__title is-lost">Buntu!</p>
        <p class="result__sub">Skor {{ score }} · rekor {{ best }}</p>
        <p v-if="record" class="result__streak">REKOR BARU!</p>
        <button class="cta" type="button" @click="newGame">Main lagi ▸</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/solobar/result come from
   src/styles.css (see docs/STYLE.md). */
.blokkayu {
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 18px 26px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.screen {
  width: 100%;
}
.brand {
  font-size: 36px;
}

/* ---- Score / best bar ---- */
.meta {
  margin-bottom: 14px;
}
.meta b {
  color: var(--aqua-deep);
  font-size: 14px;
}

/* ---- Board: a recessed wooden well with faint 3×3 box separators ---- */
.board {
  position: relative;
  width: 100%;
  max-width: 420px;
  aspect-ratio: 1;
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  grid-template-rows: repeat(9, 1fr);
  gap: 2px;
  padding: 8px;
  background: #efe0c4;
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  box-shadow: var(--pop), inset 0 3px 7px rgba(44, 19, 56, 0.16);
  margin: 4px auto 16px;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.board.shake {
  animation: shake 0.4s ease;
}

/* Empty cells read as shallow recessed slots. */
.cell {
  position: relative;
  border-radius: 4px;
  background: rgba(44, 19, 56, 0.06);
  box-shadow: inset 0 1px 2px rgba(44, 19, 56, 0.08);
}

/* Placed wood blocks: warm fill, ink outline (via inset shadow to keep size),
   a lit top edge and a shaded bottom edge. */
.cell.is-filled {
  background: var(--wood);
  box-shadow:
    inset 0 0 0 2px var(--ink),
    inset 0 3px 0 rgba(255, 255, 255, 0.28),
    inset 0 -4px 0 rgba(44, 19, 56, 0.24);
}

/* Wood tints — a couple of on-palette warm variants plus a berry pop. */
.c0 { --wood: #c98b3a; }
.c1 { --wood: var(--sun-core); }
.c2 { --wood: var(--sun); }
.c3 { --wood: var(--berry); }

/* Drag ghost + clear flash draw over the cell via ::after so they layer above a
   filled block (needed for an invalid overlap preview). */
.cell.ghost-ok::after,
.cell.ghost-bad::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 4px;
  z-index: 1;
}
.cell.ghost-ok::after {
  background: rgba(255, 138, 61, 0.42);
  box-shadow: inset 0 0 0 2px rgba(44, 19, 56, 0.55);
}
.cell.ghost-bad::after {
  background: rgba(255, 77, 121, 0.45);
  box-shadow: inset 0 0 0 2px var(--berry);
}

/* Faint centre dot marking a valid top-left for the tap-selected piece. */
.cell.is-drop::before {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 22%;
  height: 22%;
  border-radius: 50%;
  background: rgba(44, 19, 56, 0.2);
}

/* Cleared cells flash bright then shrink away. */
.cell.is-clear {
  z-index: 2;
  animation: bk-clear 0.3s ease forwards;
}
@keyframes bk-clear {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.12);
    filter: brightness(1.7) saturate(1.2);
  }
  100% {
    transform: scale(0.12);
    filter: brightness(2);
    opacity: 0;
  }
}

/* Box separators — 2 vertical + 2 horizontal faint lines at the thirds, drawn
   as an overlay so they never disturb cell layout or intercept taps. */
.board__sep {
  position: absolute;
  inset: 8px;
  pointer-events: none;
  z-index: 3;
  --l: rgba(44, 19, 56, 0.28);
  background:
    linear-gradient(to right, transparent calc(33.333% - 1px), var(--l) calc(33.333% - 1px), var(--l) calc(33.333% + 1px), transparent calc(33.333% + 1px)),
    linear-gradient(to right, transparent calc(66.666% - 1px), var(--l) calc(66.666% - 1px), var(--l) calc(66.666% + 1px), transparent calc(66.666% + 1px)),
    linear-gradient(to bottom, transparent calc(33.333% - 1px), var(--l) calc(33.333% - 1px), var(--l) calc(33.333% + 1px), transparent calc(33.333% + 1px)),
    linear-gradient(to bottom, transparent calc(66.666% - 1px), var(--l) calc(66.666% - 1px), var(--l) calc(66.666% + 1px), transparent calc(66.666% + 1px));
}

/* ---- Tray: 3 shape slots across the full width ---- */
.tray {
  width: 100%;
  max-width: 420px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 0 auto 14px;
}
.slot {
  aspect-ratio: 1;
  container-type: size;
  display: grid;
  place-items: center;
  padding: 8px;
  background: var(--paper-lit);
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  box-shadow: var(--pop-sm);
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.1s ease, box-shadow 0.1s ease, background 0.1s ease;
}
.slot:disabled {
  cursor: default;
}
.slot.is-empty {
  background: rgba(44, 19, 56, 0.05);
  box-shadow: none;
  opacity: 0.6;
}
.slot.is-sel {
  background: var(--tile-live);
  box-shadow: 0 0 0 3px var(--sun), var(--pop-sm);
}
.slot.is-dead .piece {
  opacity: 0.32;
  filter: grayscale(0.5);
}
.slot.shake {
  animation: shake 0.4s ease;
}

/* Each piece is a mini grid sized in container units so even a 5-long bar fits
   any slot on any screen (17 per cell × 5 + gaps ≈ 93cqmin). */
.piece {
  display: grid;
  grid-template-columns: repeat(var(--w), 1fr);
  grid-template-rows: repeat(var(--h), 1fr);
  gap: 2cqmin;
  width: calc(var(--w) * 17cqmin + (var(--w) - 1) * 2cqmin);
  height: calc(var(--h) * 17cqmin + (var(--h) - 1) * 2cqmin);
}
.pcell {
  border-radius: 3px;
}
.pcell.is-on {
  background: var(--wood);
  box-shadow:
    inset 0 0 0 1.5px var(--ink),
    inset 0 2px 0 rgba(255, 255, 255, 0.28),
    inset 0 -2px 0 rgba(44, 19, 56, 0.22);
}

/* ---- Hint ---- */
.hint {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--muted);
  text-align: center;
  margin: 2px 0 12px;
}

/* ---- Result ---- */
.result {
  width: 100%;
}
.result .brand {
  margin-bottom: 12px;
}
</style>
