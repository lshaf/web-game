<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { sfx } from '../sound.js'

// Shikaku — divide the plot. Drag to draw a rectangle around a number; each
// rectangle must hold exactly one clue and its cell-count must equal that clue.
// Fill the whole grid with no gaps or overlaps — every puzzle has one solution.
// Tap a rectangle to remove it. Endless: solve one and the next appears, the
// grid growing as you go. Generator tiles the grid, drops a clue in each parcel,
// and keeps only clue sets with a unique answer (backtracking solver).

const SOLVED_KEY = 'dusk-shikaku-solved'
const BEST_KEY = 'dusk-shikaku-best'

// Grid grows with the number solved.
function levelConfig(solved) {
  if (solved < 3) return { rows: 6, cols: 6, maxDim: 4, areaCap: 6 }
  if (solved < 8) return { rows: 7, cols: 7, maxDim: 4, areaCap: 7 }
  if (solved < 15) return { rows: 8, cols: 8, maxDim: 5, areaCap: 8 }
  if (solved < 24) return { rows: 9, cols: 9, maxDim: 5, areaCap: 9 }
  return { rows: 10, cols: 10, maxDim: 5, areaCap: 9 }
}

// Each drawn parcel takes the next colour so neighbours stay distinct; the fill
// is opaque so it hides the grid underneath while the clue stays on the layer above.
const PALETTE = [
  '#6cd6c0', // teal
  '#ffd35e', // sun
  '#ff9db0', // rose
  '#a99ae6', // violet
  '#a7db78', // green
  '#ffb273', // orange
  '#84c9f4', // sky
  '#e79ccf', // orchid
]

// --- Generator / solver -----------------------------------------------------

// Bias parcel dimensions toward short sides so clues stay readable.
function pickDim(max) {
  if (max <= 1) return 1
  let sum = 0
  const w = []
  for (let d = 1; d <= max; d++) {
    const x = d === 1 ? 1.0 : d <= 3 ? 2.4 : 1.25
    w.push(x)
    sum += x
  }
  let r = Math.random() * sum
  for (let d = 1; d <= max; d++) {
    r -= w[d - 1]
    if (r <= 0) return d
  }
  return max
}

// Greedily carve the grid into rectangles (a guaranteed-tileable layout).
function randomTiling(rows, cols, maxDim, areaCap) {
  const owner = new Int16Array(rows * cols).fill(-1)
  const rects = []
  let id = 0
  for (let start = 0; start < rows * cols; start++) {
    if (owner[start] !== -1) continue
    const r = (start / cols) | 0
    const c = start % cols
    let maxW = 0
    while (c + maxW < cols && owner[r * cols + c + maxW] === -1 && maxW < maxDim) maxW++
    const wCap = Math.max(1, Math.min(maxW, areaCap))
    const w = pickDim(wCap)
    let maxH = 0
    grow: while (r + maxH < rows && maxH < maxDim) {
      for (let k = 0; k < w; k++) {
        if (owner[(r + maxH) * cols + c + k] !== -1) break grow
      }
      maxH++
    }
    const hCap = Math.max(1, Math.min(maxH, Math.floor(areaCap / w) || 1))
    const h = pickDim(hCap)
    for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) owner[(r + dr) * cols + c + dc] = id
    rects.push({ r, c, w, h, area: w * h })
    id++
  }
  return rects
}

// Drop one clue (the parcel's area) into a random cell of each parcel.
function placeClues(tiling, rows, cols) {
  const grid = new Int16Array(rows * cols)
  for (const t of tiling) {
    const dr = (Math.random() * t.h) | 0
    const dc = (Math.random() * t.w) | 0
    grid[(t.r + dr) * cols + (t.c + dc)] = t.area
  }
  return grid
}

// Count solutions up to `limit` via first-uncovered-cell backtracking.
function countSolutions(rows, cols, grid, limit) {
  const cover = new Int8Array(rows * cols)
  let count = 0
  function solve() {
    if (count >= limit) return
    let start = -1
    for (let i = 0; i < rows * cols; i++) {
      if (!cover[i]) {
        start = i
        break
      }
    }
    if (start === -1) {
      count++
      return
    }
    const r = (start / cols) | 0
    const c = start % cols
    const maxW = cols - c
    const maxH = rows - r
    for (let w = 1; w <= maxW; w++) {
      if (cover[r * cols + c + w - 1]) break
      for (let h = 1; h <= maxH; h++) {
        const rr = r + h - 1
        let ok = true
        for (let k = 0; k < w; k++) {
          if (cover[rr * cols + c + k]) {
            ok = false
            break
          }
        }
        if (!ok) break
        let cnt = 0
        let val = 0
        for (let dr = 0; dr < h; dr++) {
          const base = (r + dr) * cols
          for (let dc = 0; dc < w; dc++) {
            const v = grid[base + c + dc]
            if (v) {
              cnt++
              val += v
            }
          }
        }
        if (cnt >= 2) break
        const area = w * h
        if (cnt === 1) {
          if (val === area) {
            for (let dr = 0; dr < h; dr++) {
              const base = (r + dr) * cols
              for (let dc = 0; dc < w; dc++) cover[base + c + dc] = 1
            }
            solve()
            for (let dr = 0; dr < h; dr++) {
              const base = (r + dr) * cols
              for (let dc = 0; dc < w; dc++) cover[base + c + dc] = 0
            }
            if (count >= limit) return
            break
          } else if (val < area) {
            break
          }
        }
      }
    }
  }
  solve()
  return count
}

function generate(cfg) {
  const { rows, cols, maxDim, areaCap } = cfg
  for (let a = 0; a < 160; a++) {
    const tiling = randomTiling(rows, cols, maxDim, areaCap)
    for (let p = 0; p < 3; p++) {
      const grid = placeClues(tiling, rows, cols)
      if (countSolutions(rows, cols, grid, 2) === 1) return { rows, cols, grid, solution: tiling }
    }
  }
  const tiling = randomTiling(rows, cols, maxDim, areaCap) // fallback (rare)
  return { rows, cols, grid: placeClues(tiling, rows, cols), solution: tiling }
}

// --- Game state -------------------------------------------------------------

const phase = ref('play') // play | won (brief, between puzzles)
const showStamp = ref(false)
const grew = ref(false)
const rows = ref(6)
const cols = ref(6)
const grid = ref(new Int16Array(0))
const solution = ref([])
const rects = ref([]) // player rectangles {r1,c1,r2,c2}
const cell = ref(44)
const drag = ref(null)
const hints = ref(0)
const elapsed = ref(0)
const solvedCount = ref(0)
const bestTime = ref(0)

const plotRef = ref(null)
const stageRef = ref(null)
let timer = 0
let startAt = 0
let advanceId = 0
let colorTick = 0 // next palette slot for a freshly drawn parcel

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const timeLabel = computed(() => fmt(elapsed.value))
function fmt(s) {
  const m = Math.floor(s / 60)
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

const clues = computed(() => {
  const out = []
  const g = grid.value
  const c = cols.value
  for (let i = 0; i < g.length; i++) if (g[i]) out.push({ r: (i / c) | 0, c: i % c, v: g[i] })
  return out
})

// --- Rectangle evaluation ---------------------------------------------------

function evalRect(rc) {
  let cnt = 0
  let val = 0
  const g = grid.value
  const c = cols.value
  for (let r = rc.r1; r <= rc.r2; r++)
    for (let col = rc.c1; col <= rc.c2; col++) {
      const v = g[r * c + col]
      if (v) {
        cnt++
        val += v
      }
    }
  const area = (rc.r2 - rc.r1 + 1) * (rc.c2 - rc.c1 + 1)
  if (cnt === 1 && val === area) return 'good'
  if (cnt >= 1) return 'warn'
  return 'neu'
}

function coverageComplete() {
  const cov = new Int8Array(rows.value * cols.value)
  const c = cols.value
  for (const rc of rects.value)
    for (let r = rc.r1; r <= rc.r2; r++)
      for (let col = rc.c1; col <= rc.c2; col++) {
        const i = r * c + col
        if (cov[i]) return false
        cov[i] = 1
      }
  for (let i = 0; i < cov.length; i++) if (!cov[i]) return false
  return true
}

function checkSolved() {
  if (phase.value !== 'play' || !rects.value.length) return
  for (const rc of rects.value) if (evalRect(rc) !== 'good') return
  if (coverageComplete()) win()
}

// --- Rendering helpers ------------------------------------------------------

const plotStyle = computed(() => ({
  width: cols.value * cell.value + 'px',
  height: rows.value * cell.value + 'px',
  '--cell': cell.value + 'px',
}))

function numStyle(cl) {
  const c = cell.value
  return { left: (cl.c + 0.5) * c + 'px', top: (cl.r + 0.5) * c + 'px' }
}
function rectStyle(rc) {
  const c = cell.value
  return {
    left: rc.c1 * c + 1 + 'px',
    top: rc.r1 * c + 1 + 'px',
    width: (rc.c2 - rc.c1 + 1) * c - 2 + 'px',
    height: (rc.r2 - rc.r1 + 1) * c - 2 + 'px',
  }
}
function rectColor(rc) {
  return PALETTE[(rc.col ?? 0) % PALETTE.length]
}
const previewRect = computed(() => {
  if (!drag.value) return null
  return norm(drag.value.anchor, drag.value.cur)
})

// --- Pointer drawing --------------------------------------------------------

function cellAt(ev) {
  const box = plotRef.value.getBoundingClientRect()
  const c = clamp(Math.floor((ev.clientX - box.left) / cell.value), 0, cols.value - 1)
  const r = clamp(Math.floor((ev.clientY - box.top) / cell.value), 0, rows.value - 1)
  return { r, c }
}
function norm(a, b) {
  return { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) }
}
function overlap(a, b) {
  return !(a.r2 < b.r1 || b.r2 < a.r1 || a.c2 < b.c1 || b.c2 < a.c1)
}
function contains(rc, r, c) {
  return r >= rc.r1 && r <= rc.r2 && c >= rc.c1 && c <= rc.c2
}

function onDown(ev) {
  if (phase.value !== 'play' || ev.button !== 0) return
  ev.preventDefault()
  const at = cellAt(ev)
  drag.value = { anchor: at, cur: at, pid: ev.pointerId }
  try {
    plotRef.value.setPointerCapture(ev.pointerId)
  } catch (e) {
    /* capture unsupported */
  }
}
function onMove(ev) {
  if (!drag.value) return
  drag.value = { ...drag.value, cur: cellAt(ev) }
}
function onUp() {
  if (!drag.value) return
  const sel2 = norm(drag.value.anchor, drag.value.cur)
  const single = drag.value.anchor.r === drag.value.cur.r && drag.value.anchor.c === drag.value.cur.c
  try {
    plotRef.value.releasePointerCapture(drag.value.pid)
  } catch (e) {
    /* capture unsupported */
  }
  drag.value = null
  if (single) {
    const hit = rects.value.find((rc) => contains(rc, sel2.r1, sel2.c1))
    if (hit) {
      rects.value = rects.value.filter((rc) => rc !== hit)
      sfx.tick()
      return
    }
  }
  sel2.col = colorTick++
  rects.value = rects.value.filter((rc) => !overlap(rc, sel2)).concat(sel2)
  sfx.tick()
  checkSolved()
}
function onCancel() {
  drag.value = null
}
function onContext(ev) {
  ev.preventDefault()
  if (phase.value !== 'play') return
  const at = cellAt(ev)
  const hit = rects.value.find((rc) => contains(rc, at.r, at.c))
  if (hit) {
    rects.value = rects.value.filter((rc) => rc !== hit)
    sfx.tick()
  }
}

// --- Controls ---------------------------------------------------------------

function clearBoard() {
  if (phase.value !== 'play') return
  rects.value = []
  sfx.tick()
}
function hint() {
  if (phase.value !== 'play') return
  const missing = solution.value.filter((t) => {
    const tgt = { r1: t.r, c1: t.c, r2: t.r + t.h - 1, c2: t.c + t.w - 1 }
    return !rects.value.some(
      (rc) => rc.r1 === tgt.r1 && rc.c1 === tgt.c1 && rc.r2 === tgt.r2 && rc.c2 === tgt.c2,
    )
  })
  if (!missing.length) return
  const t = missing[(Math.random() * missing.length) | 0]
  const tgt = { r1: t.r, c1: t.c, r2: t.r + t.h - 1, c2: t.c + t.w - 1, col: colorTick++ }
  rects.value = rects.value.filter((rc) => !overlap(rc, tgt)).concat(tgt)
  hints.value += 1
  sfx.tick()
  checkSolved()
}

// --- Lifecycle --------------------------------------------------------------

function computeCell() {
  const wrap = stageRef.value
  const avail = (wrap ? wrap.clientWidth : 360) - 8
  let c = Math.floor(avail / cols.value)
  const maxByH = Math.floor((window.innerHeight * 0.56) / rows.value)
  c = Math.min(c, maxByH, 56)
  return clamp(c, 26, 56)
}
function layout() {
  cell.value = computeCell()
}

function deal() {
  const p = generate(levelConfig(solvedCount.value))
  rows.value = p.rows
  cols.value = p.cols
  grid.value = p.grid
  solution.value = p.solution
  rects.value = []
  drag.value = null
  hints.value = 0
  colorTick = 0
  phase.value = 'play'
  nextTick(layout)
}
function skip() {
  if (phase.value !== 'play') return
  deal()
  startTimer()
}

function win() {
  phase.value = 'won'
  stopTimer()
  clearTimeout(advanceId)
  sfx.win()
  const prev = levelConfig(solvedCount.value)
  solvedCount.value += 1
  persist(SOLVED_KEY, solvedCount.value)
  if (bestTime.value === 0 || elapsed.value < bestTime.value) {
    bestTime.value = elapsed.value
    persist(BEST_KEY, bestTime.value)
  }
  grew.value = levelConfig(solvedCount.value).rows !== prev.rows
  showStamp.value = true
  advanceId = setTimeout(() => {
    showStamp.value = false
    deal()
    startTimer()
  }, 1150)
}

function startTimer() {
  stopTimer()
  startAt = Date.now()
  elapsed.value = 0
  timer = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startAt) / 1000)
  }, 1000)
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
  window.addEventListener('resize', layout)
  deal()
  startTimer()
})
onBeforeUnmount(() => {
  stopTimer()
  clearTimeout(advanceId)
  window.removeEventListener('resize', layout)
})
</script>

<template>
  <div class="shikaku">
    <div class="panel">
      <section class="screen">
        <p class="brand brand--sm">SHI<span class="brand__accent">KAKU</span></p>

        <div class="solobar hud">
          <span>WAKTU <b>{{ timeLabel }}</b></span>
          <span>{{ rows }}×{{ cols }}</span>
          <span class="solobar__best">SELESAI {{ solvedCount }}</span>
        </div>

        <div class="stage" ref="stageRef">
          <div class="boardwrap">
            <div
              class="plot"
              ref="plotRef"
              :class="{ locked: phase !== 'play' }"
              :style="plotStyle"
              @pointerdown="onDown"
              @pointermove="onMove"
              @pointerup="onUp"
              @pointercancel="onCancel"
              @contextmenu="onContext"
            >
              <div
                v-for="(rc, i) in rects"
                :key="'r' + i"
                class="rect"
                :class="evalRect(rc)"
                :style="{ ...rectStyle(rc), background: rectColor(rc) }"
              >
                <span class="rect__badge">✓</span>
              </div>
              <div v-if="previewRect" class="preview" :style="rectStyle(previewRect)" />
              <span
                v-for="(cl, i) in clues"
                :key="'n' + i"
                class="num"
                :style="numStyle(cl)"
                >{{ cl.v }}</span
              >
            </div>
            <div class="stamp" :class="{ show: showStamp }" aria-hidden="true">
              <span class="stamp__ring">✓</span>
              <span class="stamp__label">{{ grew ? 'LEVEL NAIK' : 'TERPECAHKAN' }}</span>
            </div>
          </div>
        </div>

        <p class="tip">Seret melingkupi satu angka · luas kotak = angka itu · tanpa celah.</p>

        <div class="tools">
          <button class="mini" type="button" @click="clearBoard">Bersihkan</button>
          <button class="mini" type="button" @click="hint">Petunjuk · {{ hints }}</button>
          <button class="mini" type="button" @click="skip">Lewati</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/mini/solobar come from src/styles.css. */
.shikaku {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 18px 26px;
}
.brand--sm {
  font-size: 22px;
}
.hud {
  margin: 12px 0 14px;
}
.hud b {
  color: var(--aqua-deep);
}

/* ---- Board ---- */
.stage {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}
.boardwrap {
  position: relative;
}
.plot {
  position: relative;
  background: var(--paper-lit);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  box-shadow: var(--pop);
  cursor: crosshair;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  background-image: linear-gradient(to right, rgba(44, 19, 56, 0.13) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(44, 19, 56, 0.13) 1px, transparent 1px);
  background-size: var(--cell) var(--cell);
}
.plot.locked {
  cursor: default;
}
.num {
  position: absolute;
  transform: translate(-50%, -50%);
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: calc(var(--cell) * 0.42);
  color: var(--ink);
  pointer-events: none;
  z-index: 3;
  text-shadow: 0 0 3px var(--paper-lit), 0 0 3px var(--paper-lit), 0 0 6px var(--paper-lit);
}
.rect {
  position: absolute;
  z-index: 2;
  border: 2.5px solid var(--ink);
  border-radius: 6px;
  pointer-events: none;
  transition: border-color 0.1s ease;
}
/* Wrong-sized parcels keep their colour but flag with a dashed berry outline;
   correct ones are marked by the ✓ badge instead. */
.rect.warn {
  border-color: var(--berry);
  border-style: dashed;
  border-width: 3px;
}
.rect__badge {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--aqua-deep);
  color: #fff;
  border: 1.5px solid var(--ink);
  display: none;
  align-items: center;
  justify-content: center;
  font: 700 10px/1 var(--font-body);
}
.rect.good .rect__badge {
  display: flex;
}
.preview {
  position: absolute;
  z-index: 4;
  border: 2.5px dashed var(--ink);
  border-radius: 6px;
  background: rgba(255, 210, 63, 0.32);
  pointer-events: none;
}

/* ---- Tip + tools ---- */
.tip {
  margin: 0 0 10px;
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

/* ---- Solved stamp ---- */
.stamp {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
  opacity: 0;
  transform: scale(0.6);
}
.stamp.show {
  animation: shikaku-stamp 1.1s ease both;
}
.stamp__ring {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: var(--aqua);
  border: var(--line) solid var(--ink);
  box-shadow: var(--pop);
  display: grid;
  place-items: center;
  font: 700 44px/1 var(--font-body);
  color: var(--ink);
}
.stamp__label {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.16em;
  color: var(--ink);
  background: var(--sun);
  border: 2px solid var(--ink);
  border-radius: 999px;
  padding: 3px 12px;
}
@keyframes shikaku-stamp {
  0% {
    opacity: 0;
    transform: scale(1.5);
  }
  18% {
    opacity: 1;
    transform: scale(0.94);
  }
  30% {
    transform: scale(1);
  }
  80% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}
</style>
