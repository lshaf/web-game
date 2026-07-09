<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { sfx } from '../sound.js'

// Isi Penuh (Fill) — trace ONE continuous line that covers every cell of the
// grid, steering with the d-pad, swipe, or arrow keys. Yellow "double" cells
// must be crossed twice. Endless: solve one and the next appears, the grid and
// double count climbing as you go. A backtracking search builds each puzzle's
// solution walk (obeying the same rules the player does), so every puzzle is
// solvable and the cells the walk revisits become the doubles.

const SOLVED_KEY = 'dusk-isipenuh-solved'
const BEST_KEY = 'dusk-isipenuh-best'

// Grid + double count climb with the number solved.
function levelConfig(solved) {
  if (solved < 3) return { rows: 5, cols: 5, k: 2 }
  if (solved < 8) return { rows: 6, cols: 6, k: 3 }
  if (solved < 15) return { rows: 6, cols: 6, k: 4 }
  if (solved < 24) return { rows: 7, cols: 7, k: 5 }
  return { rows: 7, cols: 7, k: 6 }
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

// Backtracking covering walk: find a single continuous line from a random start
// that visits every cell of the grid, revisiting exactly `k` of them (those
// become the double cells). Because the walk obeys the same rules the player
// does — orthogonal steps, at most two visits, no immediate reverse — the walk
// itself is a guaranteed solution, so every generated puzzle is solvable.
function genWalk(rows, cols, k, budget) {
  const n = rows * cols
  const L = n + k
  const NB = Array.from({ length: n }, (_, i) => {
    const r = (i / cols) | 0
    const c = i % cols
    const a = []
    if (r > 0) a.push(i - cols)
    if (r < rows - 1) a.push(i + cols)
    if (c > 0) a.push(i - 1)
    if (c < cols - 1) a.push(i + 1)
    return a
  })
  const visits = new Int8Array(n)
  const walk = new Int32Array(L)
  let steps = 0
  let covered = 0
  function dfs(pos) {
    if (++steps > budget) return false
    if (pos === L) return covered === n
    if (L - pos < n - covered) return false // not enough steps left to cover the rest
    const cur = walk[pos - 1]
    const prev = pos >= 2 ? walk[pos - 2] : -1
    const cand = []
    for (const v of NB[cur]) if (visits[v] < 2 && v !== prev) cand.push(v)
    shuffle(cand)
    cand.sort((a, b) => visits[a] - visits[b]) // cover fresh cells before revisiting
    for (const v of cand) {
      const fresh = visits[v] === 0
      visits[v]++
      if (fresh) covered++
      walk[pos] = v
      if (dfs(pos + 1)) return true
      visits[v]--
      if (fresh) covered--
    }
    return false
  }
  for (let tries = 0; tries < 300; tries++) {
    visits.fill(0)
    covered = 1
    steps = 0
    const s = Math.floor(Math.random() * n)
    walk[0] = s
    visits[s] = 1
    if (dfs(1)) {
      const cap = new Int8Array(n).fill(1)
      const doubles = []
      for (let i = 0; i < n; i++) if (visits[i] === 2) {
        cap[i] = 2
        doubles.push(i)
      }
      return { rows, cols, start: s, cap, doubles, targetCount: L }
    }
  }
  return null
}

function generate(cfg) {
  for (let kk = cfg.k; kk >= 0; kk--) {
    const res = genWalk(cfg.rows, cfg.cols, kk, 150000)
    if (res) return res
  }
  return genWalk(cfg.rows, cfg.cols, 0, 4000000) // k=0 (plain fill) always exists
}

// --- Game state -------------------------------------------------------------

const phase = ref('play') // play | won (brief, between puzzles)
const showStamp = ref(false)
const grew = ref(false)
const rows = ref(5)
const cols = ref(5)
const start = ref(0)
const doubles = ref([])
const targetCount = ref(0)
const path = ref([0])
const cell = ref(48)
const shake = ref(false)
const elapsed = ref(0)
const solvedCount = ref(0)
const bestTime = ref(0)

let capArr = new Int8Array(0)
let dragging = false
let timer = 0
let startAt = 0
let advanceId = 0
const svgRef = ref(null)
const stageRef = ref(null)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const idx = (r, c) => r * cols.value + c
const row = (i) => Math.floor(i / cols.value)
const col = (i) => i % cols.value

const head = computed(() => path.value[path.value.length - 1])
const visitCount = computed(() => {
  const a = new Int8Array(rows.value * cols.value)
  for (const i of path.value) a[i]++
  return a
})
const filled = computed(() => path.value.length)
const linePoints = computed(() =>
  path.value.map((i) => col(i) + 0.5 + ',' + (row(i) + 0.5)).join(' '),
)
const svgStyle = computed(() => ({
  width: cols.value * cell.value + 'px',
  height: rows.value * cell.value + 'px',
}))
const timeLabel = computed(() => fmt(elapsed.value))
function fmt(s) {
  const m = Math.floor(s / 60)
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

// --- Movement ---------------------------------------------------------------

function pushStep(ti) {
  path.value = [...path.value, ti]
  sfx.tick()
  if (path.value.length === targetCount.value) win()
}
function popStep() {
  if (path.value.length > 1) {
    path.value = path.value.slice(0, -1)
    sfx.tick()
  }
}
function stepTo(ti) {
  if (phase.value !== 'play') return
  const h = head.value
  if (Math.abs(row(ti) - row(h)) + Math.abs(col(ti) - col(h)) !== 1) return // not adjacent
  if (path.value.length >= 2 && ti === path.value[path.value.length - 2]) {
    popStep() // stepping back onto the line retraces
    return
  }
  if (visitCount.value[ti] >= capArr[ti]) {
    shake.value = true
    setTimeout(() => (shake.value = false), 240)
    return
  }
  pushStep(ti)
}
function moveDir(dr, dc) {
  if (phase.value !== 'play') return
  const r = row(head.value) + dr
  const c = col(head.value) + dc
  if (r < 0 || c < 0 || r >= rows.value || c >= cols.value) return
  stepTo(idx(r, c))
}
function undo() {
  if (phase.value !== 'play') return
  popStep()
}
function restart() {
  if (phase.value !== 'play') return
  path.value = [start.value]
}

// --- Pointer (swipe-drag) ---------------------------------------------------

function pointerCell(ev) {
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
  dragging = true
  try {
    svgRef.value.setPointerCapture(ev.pointerId)
  } catch (e) {
    /* capture unsupported */
  }
  stepTo(pointerCell(ev))
}
function onMove(ev) {
  if (!dragging) return
  stepTo(pointerCell(ev))
}
function onUp() {
  dragging = false
}

function onKey(ev) {
  if (phase.value !== 'play') return
  const k = ev.key
  if (k === 'ArrowUp') moveDir(-1, 0)
  else if (k === 'ArrowDown') moveDir(1, 0)
  else if (k === 'ArrowLeft') moveDir(0, -1)
  else if (k === 'ArrowRight') moveDir(0, 1)
  else if (k === 'z' || k === 'Backspace') undo()
  else return
  ev.preventDefault()
}

// --- Lifecycle --------------------------------------------------------------

function computeCell() {
  const wrap = stageRef.value
  const avail = (wrap ? wrap.clientWidth : 360) - 8
  let c = Math.floor(avail / cols.value)
  const maxByH = Math.floor((window.innerHeight * 0.5) / rows.value)
  c = Math.min(c, maxByH, 66)
  return clamp(c, 30, 66)
}
function layout() {
  cell.value = computeCell()
}

function deal() {
  const p = generate(levelConfig(solvedCount.value))
  rows.value = p.rows
  cols.value = p.cols
  start.value = p.start
  doubles.value = p.doubles
  capArr = p.cap
  targetCount.value = p.targetCount
  path.value = [p.start]
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
  window.addEventListener('keydown', onKey)
  deal()
  startTimer()
})
onBeforeUnmount(() => {
  stopTimer()
  clearTimeout(advanceId)
  window.removeEventListener('resize', layout)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="fill">
    <div class="panel">
      <section class="screen">
        <p class="brand brand--sm">ISI <span class="brand__accent">PENUH</span></p>

        <div class="solobar hud">
          <span>WAKTU <b>{{ timeLabel }}</b></span>
          <span>{{ rows }}×{{ cols }}</span>
          <span class="solobar__best">SELESAI {{ solvedCount }}</span>
        </div>

        <div class="stage" ref="stageRef">
          <div class="boardwrap">
            <svg
              class="plot"
              ref="svgRef"
              :class="{ shake }"
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
              <rect
                v-for="d in doubles"
                :key="'d' + d"
                :x="col(d) + 0.06"
                :y="row(d) + 0.06"
                width="0.88"
                height="0.88"
                rx="0.16"
                :fill="visitCount[d] >= 2 ? 'rgba(15,168,142,.24)' : 'rgba(255,205,60,.4)'"
              />
              <polyline
                :points="linePoints"
                fill="none"
                stroke="var(--aqua-deep)"
                stroke-width="0.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <text
                v-for="d in doubles"
                :key="'t' + d"
                :x="col(d) + 0.5"
                :y="row(d) + 0.54"
                text-anchor="middle"
                dominant-baseline="central"
                :fill="visitCount[d] >= 2 ? '#fff' : 'var(--ink)'"
                font-size="0.4"
                font-weight="700"
                style="font-family: var(--font-body)"
              >
                {{ visitCount[d] >= 2 ? '✓' : '2' }}
              </text>
              <circle
                :cx="col(start) + 0.5"
                :cy="row(start) + 0.5"
                r="0.31"
                fill="none"
                stroke="var(--ink)"
                stroke-width="0.08"
              />
              <circle
                :cx="col(head) + 0.5"
                :cy="row(head) + 0.5"
                r="0.24"
                fill="var(--sun)"
                stroke="var(--ink)"
                stroke-width="0.07"
              />
            </svg>
            <div class="stamp" :class="{ show: showStamp }" aria-hidden="true">
              <span class="stamp__ring">✓</span>
              <span class="stamp__label">{{ grew ? 'LEVEL NAIK' : 'PENUH' }}</span>
            </div>
          </div>
        </div>

        <p class="tip">
          Terisi {{ filled }} / {{ targetCount }} · satu garis tanpa putus · kotak kuning 2×
        </p>

        <div class="dpad">
          <span class="dpad__gap" />
          <button class="dbtn" type="button" @click="moveDir(-1, 0)" aria-label="Atas">▲</button>
          <span class="dpad__gap" />
          <button class="dbtn" type="button" @click="moveDir(0, -1)" aria-label="Kiri">◀</button>
          <button class="dbtn dbtn--mid" type="button" @click="undo" aria-label="Urungkan">↺</button>
          <button class="dbtn" type="button" @click="moveDir(0, 1)" aria-label="Kanan">▶</button>
          <span class="dpad__gap" />
          <button class="dbtn" type="button" @click="moveDir(1, 0)" aria-label="Bawah">▼</button>
          <span class="dpad__gap" />
        </div>

        <div class="tools">
          <button class="mini" type="button" @click="restart">Ulangi</button>
          <button class="mini" type="button" @click="skip">Lewati</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/mini/solobar/shake come from src/styles.css. */
.fill {
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
  margin-bottom: 10px;
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
  animation: fill-stamp 1.1s ease both;
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
@keyframes fill-stamp {
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

/* ---- Progress tip ---- */
.tip {
  margin: 0 0 12px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.02em;
  color: var(--muted);
  text-align: center;
  line-height: 1.5;
}

/* ---- D-pad ---- */
.dpad {
  display: grid;
  grid-template-columns: repeat(3, 52px);
  grid-auto-rows: 52px;
  gap: 8px;
  justify-content: center;
  margin: 2px 0 14px;
}
.dpad__gap {
  visibility: hidden;
}
.dbtn {
  font-family: var(--font-body);
  font-size: 20px;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  box-shadow: var(--pop-sm);
  cursor: pointer;
  display: grid;
  place-items: center;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.06s ease;
}
.dbtn--mid {
  background: var(--sun);
  font-size: 22px;
}
.dbtn:active {
  transform: translate(2px, 2px);
  box-shadow: none;
}

/* ---- Tools + result ---- */
.tools {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
.result {
  width: 100%;
  text-align: center;
  padding-top: 6px;
}
.result__streak {
  margin: 6px 0 14px;
}
</style>
