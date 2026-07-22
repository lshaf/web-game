<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { sfx } from '../sound.js'

// Pagar (Slitherlink) — draw one closed loop along the grid lines so that every
// numbered cell is touched by exactly that many segments of the loop. The puzzle
// is built as the boundary of a random blob, so a valid single-loop solution
// always exists; tap an edge to cycle line → cross → clear, and the hint reveals
// a correct segment.

const SOLVED_KEY = 'dusk-pagar-solved'
const BEST_KEY = 'dusk-pagar-best'

const LEVELS = [
  { key: 'mudah', label: 'Mudah', R: 5, C: 5 },
  { key: 'sedang', label: 'Sedang', R: 7, C: 7 },
  { key: 'sulit', label: 'Sulit', R: 9, C: 9 },
]

const inb = (i, j, R, C) => i >= 0 && i < R && j >= 0 && j < C
const rnd = (n) => (Math.random() * n) | 0

// --- Generator (boundary of a simply-connected, pinch-free polyomino) --------

function grow(R, C, frac) {
  const inSet = Array.from({ length: R }, () => new Array(C).fill(false))
  const si = R >> 1
  const sj = C >> 1
  inSet[si][sj] = true
  let count = 1
  const target = Math.max(2, Math.round(R * C * frac))
  const frontier = []
  const pushN = (i, j) => {
    for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (inb(i + di, j + dj, R, C) && !inSet[i + di][j + dj]) frontier.push([i + di, j + dj])
    }
  }
  pushN(si, sj)
  while (count < target && frontier.length) {
    const k = rnd(frontier.length)
    const [i, j] = frontier.splice(k, 1)[0]
    if (inSet[i][j]) continue
    inSet[i][j] = true
    count++
    pushN(i, j)
  }
  return inSet
}

function fillHoles(inSet, R, C) {
  const seen = Array.from({ length: R }, () => new Array(C).fill(false))
  const st = []
  for (let i = 0; i < R; i++)
    for (let j = 0; j < C; j++)
      if ((i === 0 || j === 0 || i === R - 1 || j === C - 1) && !inSet[i][j] && !seen[i][j]) {
        seen[i][j] = true
        st.push([i, j])
      }
  while (st.length) {
    const [i, j] = st.pop()
    for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const ni = i + di
      const nj = j + dj
      if (inb(ni, nj, R, C) && !inSet[ni][nj] && !seen[ni][nj]) {
        seen[ni][nj] = true
        st.push([ni, nj])
      }
    }
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (!inSet[i][j] && !seen[i][j]) inSet[i][j] = true
}

function hasPinch(inSet, R, C) {
  for (let i = 1; i < R; i++)
    for (let j = 1; j < C; j++) {
      const a = inSet[i - 1][j - 1]
      const b = inSet[i - 1][j]
      const c = inSet[i][j - 1]
      const d = inSet[i][j]
      if ((a && d && !b && !c) || (b && c && !a && !d)) return true
    }
  return false
}

const IN = (inSet, i, j, R, C) => inb(i, j, R, C) && inSet[i][j]
const vId = (i, j, C) => i * (C + 1) + j
const eKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a)

function generate(R, C) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const inSet = grow(R, C, 0.5)
    fillHoles(inSet, R, C)
    if (hasPinch(inSet, R, C)) continue
    const clue = Array.from({ length: R }, () => new Array(C).fill(0))
    for (let i = 0; i < R; i++)
      for (let j = 0; j < C; j++) {
        let n = 0
        for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
          if (IN(inSet, i, j, R, C) !== IN(inSet, i + di, j + dj, R, C)) n++
        clue[i][j] = n
      }
    const sol = new Set()
    for (let i = 0; i <= R; i++)
      for (let j = 0; j < C; j++)
        if (IN(inSet, i - 1, j, R, C) !== IN(inSet, i, j, R, C)) sol.add(eKey(vId(i, j, C), vId(i, j + 1, C)))
    for (let i = 0; i < R; i++)
      for (let j = 0; j <= C; j++)
        if (IN(inSet, i, j - 1, R, C) !== IN(inSet, i, j, R, C)) sol.add(eKey(vId(i, j, C), vId(i + 1, j, C)))
    if (sol.size >= 4) return { R, C, clue, sol }
  }
  return null
}

// --- Game state -------------------------------------------------------------

const phase = ref('setup') // setup | play | won
const sel = ref(LEVELS[0])
const level = ref(LEVELS[0])
const R = ref(5)
const C = ref(5)
const clue = ref([])
const sol = ref(new Set())
const edge = ref({}) // key -> 0 empty | 1 line | 2 cross
const unit = ref(46)
const hints = ref(0)
const note = ref('')
const elapsed = ref(0)
const solvedCount = ref(0)
const bestTime = ref(0)

const stageRef = ref(null)
let timer = 0
let startAt = 0
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

const timeLabel = computed(() => fmt(elapsed.value))
function fmt(s) {
  const m = Math.floor(s / 60)
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

const PAD = 14
const vx = (v) => PAD + (v % (C.value + 1)) * unit.value
const vy = (v) => PAD + Math.floor(v / (C.value + 1)) * unit.value
const svgW = computed(() => C.value * unit.value + PAD * 2)
const svgH = computed(() => R.value * unit.value + PAD * 2)

// All grid edges to render (with endpoints + midpoint for the cross marker).
const edges = computed(() => {
  const out = []
  const cc = C.value
  for (let i = 0; i <= R.value; i++)
    for (let j = 0; j < cc; j++) {
      const a = vId(i, j, cc)
      const b = vId(i, j + 1, cc)
      out.push({ key: eKey(a, b), a, b })
    }
  for (let i = 0; i < R.value; i++)
    for (let j = 0; j <= cc; j++) {
      const a = vId(i, j, cc)
      const b = vId(i + 1, j, cc)
      out.push({ key: eKey(a, b), a, b })
    }
  return out.map((e) => ({ ...e, x1: vx(e.a), y1: vy(e.a), x2: vx(e.b), y2: vy(e.b), mx: (vx(e.a) + vx(e.b)) / 2, my: (vy(e.a) + vy(e.b)) / 2 }))
})

const dots = computed(() => {
  const out = []
  for (let i = 0; i <= R.value; i++) for (let j = 0; j <= C.value; j++) out.push({ x: PAD + j * unit.value, y: PAD + i * unit.value })
  return out
})

const st = (key) => edge.value[key] || 0

// Per-cell clue text + fill count, for colouring.
function cellEdges(i, j) {
  const cc = C.value
  return [
    eKey(vId(i, j, cc), vId(i, j + 1, cc)),
    eKey(vId(i + 1, j, cc), vId(i + 1, j + 1, cc)),
    eKey(vId(i, j, cc), vId(i + 1, j, cc)),
    eKey(vId(i, j + 1, cc), vId(i + 1, j + 1, cc)),
  ]
}
const clueCells = computed(() => {
  const out = []
  for (let i = 0; i < R.value; i++)
    for (let j = 0; j < C.value; j++) {
      const n = clue.value[i][j]
      const drawn = cellEdges(i, j).reduce((s, k) => s + (st(k) === 1 ? 1 : 0), 0)
      out.push({
        x: PAD + (j + 0.5) * unit.value,
        y: PAD + (i + 0.5) * unit.value,
        n,
        state: drawn === n ? 'ok' : drawn > n ? 'over' : 'under',
      })
    }
  return out
})

// --- Interaction ------------------------------------------------------------

function tapEdge(key) {
  if (phase.value !== 'play') return
  edge.value[key] = (st(key) + 1) % 3
  sfx.tick()
  checkWin()
}

function loopComplete() {
  const drawn = []
  for (const k in edge.value) if (edge.value[k] === 1) drawn.push(k)
  if (drawn.length < 4) return false
  const adj = new Map()
  const deg = new Map()
  for (const k of drawn) {
    const [a, b] = k.split('|').map(Number)
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a).push(b)
    adj.get(b).push(a)
    deg.set(a, (deg.get(a) || 0) + 1)
    deg.set(b, (deg.get(b) || 0) + 1)
  }
  for (const d of deg.values()) if (d !== 2) return false // every used vertex must have degree 2
  // single cycle covering all drawn edges
  const start = Number(drawn[0].split('|')[0])
  let prev = -1
  let cur = start
  let steps = 0
  do {
    const nb = adj.get(cur)
    const next = nb[0] === prev ? nb[1] : nb[0]
    prev = cur
    cur = next
    steps++
    if (steps > drawn.length + 2) return false
  } while (cur !== start)
  return steps === drawn.length
}

function checkWin() {
  // Every clue satisfied AND the drawn lines form exactly one closed loop.
  const allOk = clueCells.value.every((c) => c.state === 'ok')
  if (allOk && loopComplete()) return win()
  // Numbers all match but the lines aren't a single closed loop yet — say so,
  // since that's the easy thing to miss.
  if (allOk) flashNote('Semua angka cocok — sambungkan jadi satu lingkaran tertutup')
}

let noteTimer = 0
function flashNote(t) {
  note.value = t
  clearTimeout(noteTimer)
  noteTimer = setTimeout(() => (note.value = ''), 2800)
}

// --- Controls ---------------------------------------------------------------

function clearBoard() {
  if (phase.value !== 'play') return
  edge.value = {}
  sfx.tick()
}
function hint() {
  if (phase.value !== 'play') return
  for (const k of sol.value) {
    if (st(k) !== 1) {
      edge.value[k] = 1
      hints.value += 1
      sfx.tick()
      checkWin()
      return
    }
  }
}

// --- Lifecycle --------------------------------------------------------------

function computeUnit() {
  const avail = (stageRef.value ? stageRef.value.clientWidth : 340) - 4
  const byW = Math.floor((avail - PAD * 2) / C.value)
  const byH = Math.floor((window.innerHeight - 300) / R.value)
  return clamp(Math.min(byW, byH), 26, 60)
}
function layout() {
  unit.value = computeUnit()
}

function deal() {
  const lv = level.value
  const p = generate(lv.R, lv.C) || generate(5, 5)
  R.value = p.R
  C.value = p.C
  clue.value = p.clue
  sol.value = p.sol
  edge.value = {}
  hints.value = 0
  note.value = ''
  elapsed.value = 0
  phase.value = 'play'
  nextTick(layout)
}
function start() {
  level.value = sel.value
  deal()
  startTimer()
}
function newGame() {
  deal()
  startTimer()
}
function toSetup() {
  stopTimer()
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
  window.addEventListener('resize', layout)
})
onBeforeUnmount(() => {
  stopTimer()
  clearTimeout(noteTimer)
  window.removeEventListener('resize', layout)
})
</script>

<template>
  <div class="pagar">
    <div class="panel">
      <section class="screen">
        <!-- ===== Setup ===== -->
        <template v-if="phase === 'setup'">
          <p class="brand">PA<span class="brand__accent">GAR</span></p>
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
          <p class="setup__info">{{ sel.R }}×{{ sel.C }} · SELESAI {{ solvedCount }}</p>
          <button class="cta" type="button" @click="start">Mulai ▸</button>
        </template>

        <!-- ===== Play / Won ===== -->
        <template v-else>
          <div class="topbar">
            <button class="mini" type="button" @click="toSetup">← Tingkat</button>
            <span class="status">{{ level.label }}</span>
            <button class="mini" type="button" @click="newGame">Baru</button>
          </div>

          <div class="solobar hud">
            <span>WAKTU <b>{{ timeLabel }}</b></span>
            <span>TERBAIK {{ bestTime ? fmt(bestTime) : '—' }}</span>
            <span class="solobar__best">SELESAI {{ solvedCount }}</span>
          </div>

          <div class="stage" ref="stageRef">
            <svg class="board" :class="{ locked: phase !== 'play' }" :width="svgW" :height="svgH" :viewBox="`0 0 ${svgW} ${svgH}`">
              <!-- clue numbers -->
              <text
                v-for="(c, i) in clueCells"
                :key="'c' + i"
                :x="c.x"
                :y="c.y"
                class="clue"
                :class="'clue--' + c.state"
                text-anchor="middle"
                dominant-baseline="central"
                :font-size="unit * 0.42"
              >{{ c.n }}</text>

              <!-- drawn lines + crosses -->
              <template v-for="e in edges" :key="e.key">
                <line v-if="st(e.key) === 1" :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2" class="line" :stroke-width="unit * 0.12" />
                <g v-else-if="st(e.key) === 2" class="cross" :stroke-width="unit * 0.06">
                  <line :x1="e.mx - 3" :y1="e.my - 3" :x2="e.mx + 3" :y2="e.my + 3" />
                  <line :x1="e.mx - 3" :y1="e.my + 3" :x2="e.mx + 3" :y2="e.my - 3" />
                </g>
              </template>

              <!-- dots -->
              <circle v-for="(d, i) in dots" :key="'d' + i" :cx="d.x" :cy="d.y" :r="unit * 0.06" class="dot" />

              <!-- invisible hit areas (drawn last so they sit on top) -->
              <line
                v-for="e in edges"
                :key="'h' + e.key"
                :x1="e.x1"
                :y1="e.y1"
                :x2="e.x2"
                :y2="e.y2"
                class="hit"
                :stroke-width="unit * 0.42"
                @click="tapEdge(e.key)"
              />
            </svg>
          </div>

          <p v-if="note" class="note" aria-live="polite">{{ note }}</p>
          <p class="tip">Ketuk garis: gambar → silang → hapus · buat satu lingkaran tertutup.</p>

          <div class="tools">
            <button class="mini" type="button" @click="clearBoard">Bersihkan</button>
            <button class="mini" type="button" @click="hint">Petunjuk · {{ hints }}</button>
          </div>

          <div v-if="phase === 'won'" class="result">
            <p class="result__title">Tersambung!</p>
            <p class="result__streak">WAKTU {{ timeLabel }} · SELESAI {{ solvedCount }}</p>
            <button class="cta" type="button" @click="newGame">Main lagi ▸</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/topbar/status/picker/
   pick/solobar/result come from src/styles.css. */
.pagar {
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
.stage {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}
.board {
  background: var(--paper-lit);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  box-shadow: var(--pop-sm);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.clue {
  font-family: var(--font-mono);
  font-weight: 600;
  fill: var(--muted);
}
.clue--ok {
  fill: var(--aqua-deep);
}
.clue--over {
  fill: var(--berry);
}
.dot {
  fill: var(--ink);
}
.line {
  stroke: var(--ink);
  stroke-linecap: round;
}
.cross line {
  stroke: var(--berry);
  stroke-linecap: round;
}
.hit {
  stroke: transparent;
  cursor: pointer;
}

/* ---- Tip + tools + result ---- */
.note {
  margin: 0 auto 8px;
  width: fit-content;
  max-width: 100%;
  padding: 5px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--cream);
  background: var(--aqua-deep);
  border: 2px solid var(--ink);
  border-radius: 999px;
  text-align: center;
  line-height: 1.4;
}
.tip {
  margin: 0 0 12px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.01em;
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
