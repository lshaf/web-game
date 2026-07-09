<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { sfx } from '../sound.js'

// Aliran (Flow / Numberlink) — connect each pair of same-numbered dots with a
// pipe so that every cell of the grid is filled and no pipes cross. Endless:
// solve one and the next appears, the grid and pipe count climbing as you go.
// Puzzles are built by cutting a randomised Hamiltonian path into coloured
// segments — the cut itself is a full-grid solution, so every puzzle is solvable.

const SOLVED_KEY = 'dusk-aliran-solved'
const BEST_KEY = 'dusk-aliran-best'

// Saturated, ink-outlined pipe colours; numbers ride on top in white-with-ink.
const PALETTE = ['#e8544e', '#f2a30f', '#17b3a3', '#4f8ff0', '#9b5de5', '#3fb95f', '#ec6db4']

// Grid + pipe count climb with the number solved.
function levelConfig(solved) {
  if (solved < 3) return { rows: 4, cols: 4, K: 3 }
  if (solved < 7) return { rows: 5, cols: 5, K: 4 }
  if (solved < 12) return { rows: 6, cols: 6, K: 5 }
  if (solved < 18) return { rows: 7, cols: 7, K: 6 }
  return { rows: 8, cols: 8, K: 7 }
}

// --- Generator --------------------------------------------------------------

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}
function buildSnake(rows, cols) {
  const p = []
  for (let r = 0; r < rows; r++) {
    if (r % 2 === 0) for (let c = 0; c < cols; c++) p.push(r * cols + c)
    else for (let c = cols - 1; c >= 0; c--) p.push(r * cols + c)
  }
  return p
}
// Backbite: reroute one end of the path to a random neighbour — keeps it a
// Hamiltonian path but randomises its shape so the cut segments wind around.
function backbite(p, rows, cols, iters) {
  const n = rows * cols
  const pos = new Int32Array(n)
  p.forEach((v, k) => (pos[v] = k))
  const nbrs = (i) => {
    const r = (i / cols) | 0
    const c = i % cols
    const a = []
    if (r > 0) a.push(i - cols)
    if (r < rows - 1) a.push(i + cols)
    if (c > 0) a.push(i - 1)
    if (c < cols - 1) a.push(i + 1)
    return a
  }
  const rev = (lo, hi) => {
    while (lo < hi) {
      const t = p[lo]
      p[lo] = p[hi]
      p[hi] = t
      pos[p[lo]] = lo
      pos[p[hi]] = hi
      lo++
      hi--
    }
  }
  for (let t = 0; t < iters; t++) {
    if (Math.random() < 0.5) {
      const ns = nbrs(p[n - 1])
      const j = pos[ns[(Math.random() * ns.length) | 0]]
      if (j < n - 2) rev(j + 1, n - 1)
    } else {
      const ns = nbrs(p[0])
      const j = pos[ns[(Math.random() * ns.length) | 0]]
      if (j > 1) rev(0, j - 1)
    }
  }
  return p
}

function genFlow(cfg) {
  const { rows, cols, K } = cfg
  const n = rows * cols
  const p = buildSnake(rows, cols)
  backbite(p, rows, cols, 6 * n)
  // Split the path into K segments, each at least 3 cells (so a colour's two
  // dots are never trivially adjacent), lengths otherwise random.
  const minLen = Math.max(2, Math.min(3, Math.floor(n / K)))
  const lengths = new Array(K).fill(minLen)
  let extra = n - minLen * K
  while (extra > 0) {
    lengths[(Math.random() * K) | 0]++
    extra--
  }
  const order = shuffle([...Array(K).keys()]) // scramble which colour each segment gets
  const endpoints = new Array(K)
  const endColor = new Int32Array(n).fill(-1)
  let i = 0
  for (let s = 0; s < K; s++) {
    const seg = p.slice(i, i + lengths[s])
    i += lengths[s]
    const c = order[s]
    endpoints[c] = [seg[0], seg[seg.length - 1]]
    endColor[seg[0]] = c
    endColor[seg[seg.length - 1]] = c
  }
  return { rows, cols, K, endpoints, endColor }
}

// --- Game state -------------------------------------------------------------

const phase = ref('play') // play | won (brief, between puzzles)
const rows = ref(4)
const cols = ref(4)
const K = ref(3)
const endpoints = ref([]) // per colour: [dotA, dotB]
const paths = ref([]) // per colour: ordered cells of the drawn pipe (starts at a dot)
const activeColor = ref(-1)
const cell = ref(52)
const elapsed = ref(0)
const solved = ref(0)
const bestTime = ref(0)
const showStamp = ref(false)
const grew = ref(false)

let endColorArr = new Int32Array(0)
let timer = 0
let startAt = 0
let advanceId = 0
const svgRef = ref(null)
const stageRef = ref(null)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const idx = (r, c) => r * cols.value + c
const row = (i) => Math.floor(i / cols.value)
const col = (i) => i % cols.value
const adj = (a, b) => Math.abs(row(a) - row(b)) + Math.abs(col(a) - col(b)) === 1
const replaceAt = (arr, i, val) => {
  const c = arr.slice()
  c[i] = val
  return c
}

// Which colour owns each cell (its dots + drawn pipe cells). Pipes never sit on
// another colour's dot, so there's no conflict.
const owner = computed(() => {
  const a = new Int32Array(rows.value * cols.value).fill(-1)
  endpoints.value.forEach(([x, y], c) => {
    a[x] = c
    a[y] = c
  })
  paths.value.forEach((path, c) => {
    for (const cellIdx of path) a[cellIdx] = c
  })
  return a
})
const filled = computed(() => {
  let f = 0
  const o = owner.value
  for (let i = 0; i < o.length; i++) if (o[i] >= 0) f++
  return f
})
function isComplete(c) {
  const path = paths.value[c]
  if (!path || path.length < 2) return false
  const [a, b] = endpoints.value[c]
  const s = path[0]
  const e = path[path.length - 1]
  return (s === a && e === b) || (s === b && e === a)
}
const connected = computed(() => {
  let n = 0
  for (let c = 0; c < K.value; c++) if (isComplete(c)) n++
  return n
})

const svgStyle = computed(() => ({
  width: cols.value * cell.value + 'px',
  height: rows.value * cell.value + 'px',
}))
const timeLabel = computed(() => fmt(elapsed.value))
function fmt(s) {
  const m = Math.floor(s / 60)
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}
function linePoints(path) {
  return path.map((i) => col(i) + 0.5 + ',' + (row(i) + 0.5)).join(' ')
}

// --- Drawing pipes ----------------------------------------------------------

function cellAt(ev) {
  const b = svgRef.value.getBoundingClientRect()
  const cw = b.width / cols.value
  const ch = b.height / rows.value
  const c = clamp(Math.floor((ev.clientX - b.left) / cw), 0, cols.value - 1)
  const r = clamp(Math.floor((ev.clientY - b.top) / ch), 0, rows.value - 1)
  return idx(r, c)
}
function onDown(ev) {
  if (phase.value !== 'play') return
  ev.preventDefault()
  const cellIdx = cellAt(ev)
  const dc = endColorArr[cellIdx]
  if (dc >= 0) {
    // Grab a dot → (re)start that colour's pipe from here.
    paths.value = replaceAt(paths.value, dc, [cellIdx])
    activeColor.value = dc
  } else {
    // Grab a pipe mid-way → trim it to here and keep drawing.
    const o = owner.value[cellIdx]
    if (o < 0) return
    const j = paths.value[o].indexOf(cellIdx)
    if (j < 0) return
    paths.value = replaceAt(paths.value, o, paths.value[o].slice(0, j + 1))
    activeColor.value = o
  }
  try {
    svgRef.value.setPointerCapture(ev.pointerId)
  } catch (e) {
    /* capture unsupported */
  }
}
function onMove(ev) {
  if (activeColor.value < 0) return
  extendTo(cellAt(ev))
}
function onUp() {
  activeColor.value = -1
}
function extendTo(target) {
  const c = activeColor.value
  const path = paths.value[c]
  const cur = path[path.length - 1]
  if (target === cur || !adj(target, cur)) return
  // Retrace onto our own pipe → trim back to that cell.
  const jSelf = path.indexOf(target)
  if (jSelf >= 0) {
    paths.value = replaceAt(paths.value, c, path.slice(0, jSelf + 1))
    sfx.tick()
    return
  }
  // Already sitting on the far dot (pipe complete) → can only retrace.
  const [ea, eb] = endpoints.value[c]
  if ((cur === ea || cur === eb) && path.length > 1) return
  const tc = endColorArr[target]
  if (tc >= 0 && tc !== c) return // another colour's dot blocks the way
  // Overwrite whatever pipe sits there (truncating that colour at this cell).
  const o = owner.value[target]
  if (o >= 0 && o !== c && tc < 0) {
    const k = paths.value[o].indexOf(target)
    if (k >= 0) paths.value = replaceAt(paths.value, o, paths.value[o].slice(0, k))
  }
  paths.value = replaceAt(paths.value, c, [...path, target])
  sfx.tick()
  checkWin()
}

function clearAll() {
  if (phase.value !== 'play') return
  paths.value = Array.from({ length: K.value }, () => [])
  sfx.tick()
}

function checkWin() {
  if (connected.value === K.value && filled.value === rows.value * cols.value) win()
}

// --- Endless lifecycle ------------------------------------------------------

function computeCell() {
  const wrap = stageRef.value
  const avail = (wrap ? wrap.clientWidth : 360) - 8
  let c = Math.floor(avail / cols.value)
  const maxByH = Math.floor((window.innerHeight * 0.52) / rows.value)
  c = Math.min(c, maxByH, 68)
  return clamp(c, 30, 68)
}
function layout() {
  cell.value = computeCell()
}

function deal() {
  const cfg = levelConfig(solved.value)
  const p = genFlow(cfg)
  rows.value = p.rows
  cols.value = p.cols
  K.value = p.K
  endpoints.value = p.endpoints
  endColorArr = p.endColor
  paths.value = Array.from({ length: p.K }, () => [])
  activeColor.value = -1
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
  sfx.win()
  const prev = levelConfig(solved.value)
  solved.value += 1
  persist(SOLVED_KEY, solved.value)
  if (bestTime.value === 0 || elapsed.value < bestTime.value) {
    bestTime.value = elapsed.value
    persist(BEST_KEY, bestTime.value)
  }
  const next = levelConfig(solved.value)
  grew.value = next.rows !== prev.rows
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
    solved.value = Number(localStorage.getItem(SOLVED_KEY)) || 0
    bestTime.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch (e) {
    solved.value = 0
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
  <div class="aliran">
    <div class="panel">
      <section class="screen">
        <p class="brand brand--sm">ALI<span class="brand__accent">RAN</span></p>

        <div class="solobar hud">
          <span>WAKTU <b>{{ timeLabel }}</b></span>
          <span>{{ rows }}×{{ cols }}</span>
          <span class="solobar__best">SELESAI {{ solved }}</span>
        </div>

        <div class="stage" ref="stageRef">
          <div class="boardwrap">
            <svg
              class="plot"
              ref="svgRef"
              :viewBox="`0 0 ${cols} ${rows}`"
              :style="svgStyle"
              @pointerdown="onDown"
              @pointermove="onMove"
              @pointerup="onUp"
              @pointercancel="onUp"
            >
              <g stroke="rgba(44,19,56,.13)" stroke-width="0.03">
                <line v-for="i in cols + 1" :key="'v' + i" :x1="i - 1" y1="0" :x2="i - 1" :y2="rows" />
                <line v-for="i in rows + 1" :key="'h' + i" x1="0" :y1="i - 1" :x2="cols" :y2="i - 1" />
              </g>
              <!-- pipes -->
              <polyline
                v-for="(path, c) in paths"
                :key="'p' + c"
                v-show="path.length > 1"
                :points="linePoints(path)"
                fill="none"
                :stroke="PALETTE[c]"
                stroke-width="0.58"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <!-- endpoint dots + numbers -->
              <template v-for="(pair, c) in endpoints">
                <g v-for="(d, di) in pair" :key="'d' + c + '-' + di">
                  <circle
                    :cx="col(d) + 0.5"
                    :cy="row(d) + 0.5"
                    r="0.34"
                    :fill="PALETTE[c]"
                    stroke="var(--ink)"
                    stroke-width="0.05"
                  />
                  <text
                    :x="col(d) + 0.5"
                    :y="row(d) + 0.5"
                    text-anchor="middle"
                    dominant-baseline="central"
                    fill="#fff"
                    stroke="var(--ink)"
                    stroke-width="0.055"
                    paint-order="stroke"
                    font-size="0.4"
                    font-weight="700"
                    style="font-family: var(--font-body)"
                    >{{ c + 1 }}</text
                  >
                </g>
              </template>
            </svg>
            <div class="stamp" :class="{ show: showStamp }" aria-hidden="true">
              <span class="stamp__ring">✓</span>
              <span class="stamp__label">{{ grew ? 'LEVEL NAIK' : 'SELESAI' }}</span>
            </div>
          </div>
        </div>

        <p class="tip">
          Pipa {{ connected }}/{{ K }} · terisi {{ filled }}/{{ rows * cols }} · sambungkan titik
          senomor, isi semua kotak
        </p>

        <div class="tools">
          <button class="mini" type="button" @click="clearAll">Bersihkan</button>
          <button class="mini" type="button" @click="skip">Lewati</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/solobar/mini come from src/styles.css. */
.aliran {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 20px 18px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.brand--sm {
  font-size: 24px;
}
.hud {
  margin: 10px 0 14px;
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
  display: block;
  background: var(--paper-lit);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  box-shadow: var(--pop);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
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
  animation: aliran-stamp 1.1s ease both;
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
@keyframes aliran-stamp {
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

/* ---- Tip + tools ---- */
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
</style>
