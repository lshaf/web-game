<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Single-player Tetris. Board is 10 wide × 18 tall; each cell holds either an
// empty string or a tetromino key ('I','O','T','S','Z','J','L') whose color we
// look up when rendering. Gravity is driven by a rAF loop with a delta timer,
// paused whenever the phase isn't 'play'.

const COLS = 10
const ROWS = 18

// Each shape is a list of [row, col] blocks in its spawn orientation, sized to
// its own bounding box. Rotation spins the box 90° clockwise. O never rotates.
const SHAPES = {
  I: [[1, 0], [1, 1], [1, 2], [1, 3]],
  O: [[0, 0], [0, 1], [1, 0], [1, 1]],
  T: [[0, 1], [1, 0], [1, 1], [1, 2]],
  S: [[0, 1], [0, 2], [1, 0], [1, 1]],
  Z: [[0, 0], [0, 1], [1, 1], [1, 2]],
  J: [[0, 0], [1, 0], [1, 1], [1, 2]],
  L: [[0, 2], [1, 0], [1, 1], [1, 2]],
}
// Bounding-box side length per shape, so rotation pivots correctly.
const BOX = { I: 4, O: 2, T: 3, S: 3, Z: 3, J: 3, L: 3 }

const COLORS = {
  I: 'var(--aqua)',
  O: 'var(--sun)',
  T: 'var(--grape)',
  S: '#43c96b',
  Z: 'var(--berry)',
  J: 'var(--aqua-deep)',
  L: 'var(--sun-core)',
}

const KEYS = Object.keys(SHAPES)
const bestKey = 'dusk-tetris-best'

const phase = ref('ready') // ready | play | over
const grid = reactive(makeGrid())
const score = ref(0)
const lines = ref(0)
const level = ref(1)
const best = ref(0)

// Active piece: its key, rotation state, and top-left position of its box.
const piece = reactive({ key: 'T', cells: [], row: 0, col: 0 })
const nextKey = ref('T')

let rafId = 0
let lastT = 0
let dropAcc = 0 // ms banked toward the next gravity step

function makeGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(''))
}

// Gravity interval in ms — faster each level, floored so it stays playable.
const dropInterval = computed(() => Math.max(90, 800 - (level.value - 1) * 70))

// Absolute board cells the active piece currently occupies.
function pieceCells(p = piece) {
  return p.cells.map(([r, c]) => [p.row + r, p.col + c])
}

function collides(cells) {
  for (const [r, c] of cells) {
    if (c < 0 || c >= COLS || r >= ROWS) return true
    if (r >= 0 && grid[r][c]) return true
  }
  return false
}

function cellsAt(key, cells, row, col) {
  return cells.map(([r, c]) => [row + r, col + c])
}

function randKey() {
  return KEYS[Math.floor(Math.random() * KEYS.length)]
}

// Spawn the queued piece centered at the top. Returns false if it can't fit
// (game over).
function spawn() {
  const key = nextKey.value
  nextKey.value = randKey()
  const cells = SHAPES[key].map(([r, c]) => [r, c])
  const col = Math.floor((COLS - BOX[key]) / 2)
  const row = -topPad(cells) // lift so the piece's filled rows start at 0
  const test = cellsAt(key, cells, row, col)
  if (collides(test)) return false
  piece.key = key
  piece.cells = cells
  piece.row = row
  piece.col = col
  return true
}

// How many empty rows sit above the first filled row of a shape's box.
function topPad(cells) {
  return Math.min(...cells.map(([r]) => r))
}

// Rotate the piece's box 90° clockwise: (r,c) -> (c, n-1-r).
function rotatedCells(key, cells) {
  if (key === 'O') return cells
  const n = BOX[key]
  return cells.map(([r, c]) => [c, n - 1 - r])
}

function tryRotate() {
  const cells = rotatedCells(piece.key, piece.cells)
  // Wall-kick fallback: try in place, then shift right/left by 1, then 2.
  for (const dc of [0, 1, -1, 2, -2]) {
    const test = cellsAt(piece.key, cells, piece.row, piece.col + dc)
    if (!collides(test)) {
      piece.cells = cells
      piece.col += dc
      sfx.tick()
      return
    }
  }
}

function move(dc) {
  const test = cellsAt(piece.key, piece.cells, piece.row, piece.col + dc)
  if (!collides(test)) {
    piece.col += dc
    sfx.tick()
  }
}

// Drop one row. Returns true if it moved, false if it locked.
function stepDown(soft = false) {
  const test = cellsAt(piece.key, piece.cells, piece.row + 1, piece.col)
  if (!collides(test)) {
    piece.row += 1
    if (soft) score.value += 1
    return true
  }
  lock()
  return false
}

function hardDrop() {
  if (phase.value !== 'play') return
  let dist = 0
  while (!collides(cellsAt(piece.key, piece.cells, piece.row + 1, piece.col))) {
    piece.row += 1
    dist += 1
  }
  score.value += dist * 2
  lock()
}

function lock() {
  for (const [r, c] of pieceCells()) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = piece.key
  }
  sfx.tick()
  clearLines()
  if (!spawn()) gameOver()
  dropAcc = 0
}

function clearLines() {
  let cleared = 0
  for (let r = ROWS - 1; r >= 0; r--) {
    if (grid[r].every((c) => c)) {
      grid.splice(r, 1)
      grid.unshift(Array(COLS).fill(''))
      cleared += 1
      r += 1 // re-check the same index after the shift-down
    }
  }
  if (cleared > 0) {
    const points = [0, 100, 300, 500, 800][cleared] * level.value
    score.value += points
    lines.value += cleared
    level.value = Math.floor(lines.value / 10) + 1
    sfx.win()
  }
}

function gameOver() {
  phase.value = 'over'
  sfx.lose()
  if (score.value > best.value) {
    best.value = score.value
    try {
      localStorage.setItem(bestKey, String(best.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory best */
    }
  }
}

function start() {
  for (let r = 0; r < ROWS; r++) grid[r] = Array(COLS).fill('')
  score.value = 0
  lines.value = 0
  level.value = 1
  nextKey.value = randKey()
  dropAcc = 0
  lastT = 0
  spawn()
  phase.value = 'play'
}

// rAF loop with a delta accumulator; only advances gravity while playing.
function tick(t) {
  rafId = requestAnimationFrame(tick)
  if (!lastT) lastT = t
  let dt = t - lastT
  lastT = t
  if (dt > 200) dt = 200 // clamp after a tab switch
  if (phase.value !== 'play') {
    dropAcc = 0
    return
  }
  dropAcc += dt
  while (dropAcc >= dropInterval.value) {
    dropAcc -= dropInterval.value
    stepDown(false)
    if (phase.value !== 'play') break
  }
}

// A flat 10×18 view for the template: the settled grid plus the live piece.
const view = computed(() => {
  const out = grid.map((row) => row.slice())
  if (phase.value === 'play') {
    for (const [r, c] of pieceCells()) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) out[r][c] = piece.key
    }
  }
  return out.flat()
})

// 4×4 preview cells for the queued piece.
const preview = computed(() => {
  const cells = new Set(SHAPES[nextKey.value].map(([r, c]) => `${r},${c}`))
  const out = []
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      out.push(cells.has(`${r},${c}`) ? nextKey.value : '')
    }
  }
  return out
})

function colorOf(key) {
  return key ? COLORS[key] : ''
}

function onKey(e) {
  if (phase.value !== 'play') return
  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault()
      move(-1)
      break
    case 'ArrowRight':
      e.preventDefault()
      move(1)
      break
    case 'ArrowUp':
    case 'x':
    case 'X':
      e.preventDefault()
      tryRotate()
      break
    case 'ArrowDown':
      e.preventDefault()
      stepDown(true)
      dropAcc = 0
      break
    case ' ':
    case 'Spacebar':
      e.preventDefault()
      hardDrop()
      break
  }
}

// Hold-to-repeat for the on-screen move buttons.
let repeatTimer = 0
let repeatDelay = 0
function pressMove(dc) {
  if (phase.value !== 'play') return
  move(dc)
  clearTimeout(repeatDelay)
  repeatDelay = setTimeout(() => {
    repeatTimer = setInterval(() => move(dc), 70)
  }, 220)
}
function releaseMove() {
  clearTimeout(repeatDelay)
  clearInterval(repeatTimer)
}

function tapRotate() {
  if (phase.value === 'play') tryRotate()
}
function tapSoft() {
  if (phase.value !== 'play') return
  stepDown(true)
  dropAcc = 0
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    best.value = 0
  }
  window.addEventListener('keydown', onKey, { passive: false })
  rafId = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('keydown', onKey)
  releaseMove()
})
</script>

<template>
  <div class="tetris">
    <div class="panel">
      <!-- Ready -->
      <section v-if="phase === 'ready'" class="screen">
        <p class="brand">TET<span class="brand__accent">RIS</span></p>
        <p class="eyebrow">SUSUN BARISNYA</p>
        <button class="cta" type="button" @click="start">Mulai ▸</button>
      </section>

      <!-- Play -->
      <section v-else class="screen">
        <div class="hud">
          <div class="hud__stat">
            <span class="hud__label">SKOR</span>
            <b class="hud__value">{{ score }}</b>
          </div>
          <div class="hud__stat">
            <span class="hud__label">BARIS</span>
            <b class="hud__value">{{ lines }}</b>
          </div>
          <div class="hud__stat">
            <span class="hud__label">LEVEL</span>
            <b class="hud__value">{{ level }}</b>
          </div>
          <div class="hud__next">
            <span class="hud__label">NEXT</span>
            <div class="preview">
              <span
                v-for="(k, i) in preview"
                :key="i"
                class="pcell"
                :class="{ 'is-on': k }"
                :style="k ? { background: colorOf(k) } : null"
              />
            </div>
          </div>
        </div>

        <div class="board">
          <span
            v-for="(k, i) in view"
            :key="i"
            class="cell"
            :class="{ 'is-on': k }"
            :style="k ? { background: colorOf(k) } : null"
          />
          <div v-if="phase === 'over'" class="board__over">
            <p class="over__title">GAME OVER</p>
          </div>
        </div>

        <!-- Touch controls -->
        <div class="pad">
          <button
            class="key"
            type="button"
            aria-label="Kiri"
            @pointerdown.prevent="pressMove(-1)"
            @pointerup="releaseMove"
            @pointerleave="releaseMove"
            @pointercancel="releaseMove"
          >◀</button>
          <button
            class="key"
            type="button"
            aria-label="Putar"
            @pointerdown.prevent="tapRotate"
          >⟳</button>
          <button
            class="key"
            type="button"
            aria-label="Turun"
            @pointerdown.prevent="tapSoft"
          >▼</button>
          <button
            class="key"
            type="button"
            aria-label="Kanan"
            @pointerdown.prevent="pressMove(1)"
            @pointerup="releaseMove"
            @pointerleave="releaseMove"
            @pointercancel="releaseMove"
          >▶</button>
          <button
            class="key key--drop"
            type="button"
            @pointerdown.prevent="hardDrop"
          >JATUH</button>
        </div>

        <!-- Over -->
        <div v-if="phase === 'over'" class="solobar over-bar">
          <span>SKOR <b>{{ score }}</b></span>
          <span class="solobar__best">TERBAIK <b>{{ best }}</b></span>
        </div>
        <button v-if="phase === 'over'" class="cta" type="button" @click="start">
          Main lagi ▸
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tetris {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

.panel {
  padding: 20px 18px 24px;
}

.brand {
  font-size: 40px;
}

/* ---- HUD ---- */
.hud {
  width: 100%;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 12px;
}
.hud__stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hud__label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--muted);
}
.hud__value {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--ink);
  line-height: 1;
}
.hud__next {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}
.preview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  width: 52px;
}
.pcell {
  aspect-ratio: 1;
  border-radius: 2px;
}
.pcell.is-on {
  border: 2px solid var(--ink);
}

/* ---- Board ---- */
.board {
  position: relative;
  width: 100%;
  aspect-ratio: 10 / 18;
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  grid-template-rows: repeat(18, 1fr);
  gap: 2px;
  padding: 6px;
  background: var(--ink);
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  box-shadow: var(--pop);
  margin-bottom: 14px;
}
.cell {
  border-radius: 3px;
  background: var(--paper-lit);
  opacity: 0.35;
}
.cell.is-on {
  opacity: 1;
  border: 2px solid var(--ink);
  box-shadow: inset 0 -3px 0 rgba(44, 19, 56, 0.22);
}

.board__over {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(44, 19, 56, 0.5);
  border-radius: 14px;
}
.over__title {
  font-family: var(--font-display);
  font-size: 34px;
  margin: 0;
  color: var(--berry);
  -webkit-text-stroke: 3px var(--ink);
  paint-order: stroke fill;
  text-shadow: var(--pop-sm);
}

/* ---- Touch controls ---- */
.pad {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  width: 100%;
  margin-bottom: 14px;
}
.key {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 20px;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  padding: 12px 0;
  box-shadow: 0 4px 0 var(--ink);
  cursor: pointer;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  transition: transform 0.06s ease, box-shadow 0.06s ease;
}
.key:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--ink);
}
.key--drop {
  grid-column: 1 / -1;
  font-family: var(--font-display);
  letter-spacing: 0.05em;
  background: var(--sun);
}

.over-bar {
  margin-bottom: 12px;
}
</style>
