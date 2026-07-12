<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { sfx } from '../sound.js'

// Jembatan (Hashiwokakero / Bridges) — connect the numbered islands with
// horizontal and vertical bridges. At most two bridges join a pair, bridges
// never cross, and each island ends up with exactly as many bridges as its
// number, with every island linked into one group. The generator grows a
// connected, non-crossing bridge graph and reads each island's number off its
// degree, so a solution always exists; the hint button reveals one of its
// bridges.

const SOLVED_KEY = 'dusk-jembatan-solved'
const BEST_KEY = 'dusk-jembatan-best'

const LEVELS = [
  { key: 'mudah', label: 'Mudah', N: 7, islands: 9 },
  { key: 'sedang', label: 'Sedang', N: 9, islands: 15 },
  { key: 'sulit', label: 'Sulit', N: 11, islands: 24 },
]

const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const pairKey = (a, b) => (a < b ? a + ',' + b : b + ',' + a)
const rnd = (n) => (Math.random() * n) | 0

// --- Generator --------------------------------------------------------------

// Grow a connected, non-crossing bridge graph: from a random island, shoot a
// bridge in a random direction to a fresh landing cell, marking the cells it
// crosses as occupied so nothing can cut through later. A few extra links close
// loops so the puzzle isn't a pure tree.
function generate(cfg) {
  const { N, islands: target } = cfg
  const islandAt = new Int16Array(N * N).fill(-1)
  const occ = new Uint8Array(N * N) // a bridge crosses this cell
  const isl = [] // { r, c }
  const deg = []
  const bridges = new Map() // pairKey -> count (the solution)
  const add = (r, c) => {
    const id = isl.length
    isl.push({ r, c })
    islandAt[r * N + c] = id
    deg.push(0)
    return id
  }
  add(1 + rnd(N - 2), 1 + rnd(N - 2))

  let tries = 0
  while (isl.length < target && tries++ < N * N * 40) {
    const a = rnd(isl.length)
    if (deg[a] >= 8) continue
    const { r, c } = isl[a]
    const [dr, dc] = DIRS[rnd(4)]
    const path = []
    let rr = r + dr
    let cc = c + dc
    while (rr >= 0 && rr < N && cc >= 0 && cc < N) {
      const p = rr * N + cc
      if (islandAt[p] !== -1 || occ[p]) break
      path.push([rr, cc])
      rr += dr
      cc += dc
    }
    if (path.length < 2) continue // need at least one gap cell + a landing
    const k = 1 + rnd(Math.min(path.length - 1, 4))
    const [lr, lc] = path[k]
    // Keep gaps: don't drop a new island orthogonally touching an existing one.
    let touching = false
    for (const [ar, ac] of DIRS) {
      const nr = lr + ar
      const nc = lc + ac
      if (nr >= 0 && nr < N && nc >= 0 && nc < N && islandAt[nr * N + nc] !== -1 && !(nr === r && nc === c)) {
        touching = true
        break
      }
    }
    if (touching) continue
    const b = add(lr, lc)
    const count = 1 + rnd(2)
    for (let x = 0; x < k; x++) occ[path[x][0] * N + path[x][1]] = 1
    bridges.set(pairKey(a, b), count)
    deg[a] += count
    deg[b] += count
  }

  // A handful of extra bridges between aligned islands with a clear path.
  let extra = (isl.length / 3) | 0
  let ex = 0
  while (ex < extra && ex < 200) {
    ex++
    const a = rnd(isl.length)
    const { r, c } = isl[a]
    const [dr, dc] = DIRS[rnd(4)]
    let rr = r + dr
    let cc = c + dc
    const path = []
    while (rr >= 0 && rr < N && cc >= 0 && cc < N) {
      const p = rr * N + cc
      if (islandAt[p] !== -1) {
        const b = islandAt[p]
        const kk = pairKey(a, b)
        const cur = bridges.get(kk) || 0
        if (cur < 2 && deg[a] < 8 && deg[b] < 8 && path.every(([pr, pc]) => !occ[pr * N + pc])) {
          for (const [pr, pc] of path) occ[pr * N + pc] = 1
          bridges.set(kk, cur + 1)
          deg[a]++
          deg[b]++
        }
        break
      }
      if (occ[p]) break
      path.push([rr, cc])
      rr += dr
      cc += dc
    }
  }

  const islands = isl.map((s, i) => ({ r: s.r, c: s.c, num: deg[i] }))
  return { N, islands, solution: bridges }
}

// Every pair of islands that face each other in a row/column with only empty
// cells between them is a legal place to build — precompute them once per deal.
function findConnections(islands, N) {
  const at = new Int16Array(N * N).fill(-1)
  for (let i = 0; i < islands.length; i++) at[islands[i].r * N + islands[i].c] = i
  const conns = []
  const seen = new Set()
  for (let i = 0; i < islands.length; i++) {
    const { r, c } = islands[i]
    for (const [dr, dc] of DIRS) {
      const cells = []
      let rr = r + dr
      let cc = c + dc
      while (rr >= 0 && rr < N && cc >= 0 && cc < N && at[rr * N + cc] === -1) {
        cells.push(rr * N + cc)
        rr += dr
        cc += dc
      }
      if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue
      const j = at[rr * N + cc]
      const key = pairKey(i, j)
      if (seen.has(key)) continue
      seen.add(key)
      conns.push({ i, j, key, cells, horiz: dr === 0 })
    }
  }
  return conns
}

// --- Game state -------------------------------------------------------------

const phase = ref('setup') // setup | play | won
const sel = ref(LEVELS[0])
const level = ref(LEVELS[0])
const N = ref(7)
const islands = ref([])
const conns = ref([])
const connByKey = ref(new Map())
const solution = ref(new Map())
const bridges = ref({}) // pairKey -> count (player's build)
const selected = ref(-1)
const unit = ref(44)
const hints = ref(0)
const elapsed = ref(0)
const solvedCount = ref(0)
const bestTime = ref(0)

const stageRef = ref(null)
let timer = 0
let startAt = 0

const timeLabel = computed(() => fmt(elapsed.value))
function fmt(s) {
  const m = Math.floor(s / 60)
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

const boardPx = computed(() => N.value * unit.value)
const center = (idx) => {
  const s = islands.value[idx]
  return { x: (s.c + 0.5) * unit.value, y: (s.r + 0.5) * unit.value }
}

// Per-island bridge total, from the player's current build.
const degrees = computed(() => {
  const d = islands.value.map(() => 0)
  for (const conn of conns.value) {
    const ct = bridges.value[conn.key] || 0
    if (ct) {
      d[conn.i] += ct
      d[conn.j] += ct
    }
  }
  return d
})

// Cells currently covered by a bridge — used to block crossings.
function occupiedExcept(excludeKey) {
  const set = new Set()
  for (const conn of conns.value) {
    if (conn.key === excludeKey) continue
    if (bridges.value[conn.key]) for (const cell of conn.cells) set.add(cell)
  }
  return set
}

// The straight-line segments to draw (one per bridge, doubles drawn as a pair).
const segments = computed(() => {
  const out = []
  const u = unit.value
  for (const conn of conns.value) {
    const ct = bridges.value[conn.key] || 0
    if (!ct) continue
    const p = center(conn.i)
    const q = center(conn.j)
    if (ct === 1) {
      out.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, key: conn.key + '-0' })
    } else {
      const off = u * 0.11
      if (conn.horiz) {
        out.push({ x1: p.x, y1: p.y - off, x2: q.x, y2: q.y - off, key: conn.key + '-a' })
        out.push({ x1: p.x, y1: p.y + off, x2: q.x, y2: q.y + off, key: conn.key + '-b' })
      } else {
        out.push({ x1: p.x - off, y1: p.y, x2: q.x - off, y2: q.y, key: conn.key + '-a' })
        out.push({ x1: p.x + off, y1: p.y, x2: q.x + off, y2: q.y, key: conn.key + '-b' })
      }
    }
  }
  return out
})

function islandClass(idx) {
  const d = degrees.value[idx]
  const num = islands.value[idx].num
  return {
    'is-sel': selected.value === idx,
    'is-done': d === num,
    'is-over': d > num,
  }
}

// --- Interaction ------------------------------------------------------------

function tapIsland(idx) {
  if (phase.value !== 'play') return
  if (selected.value === -1) {
    selected.value = idx
    return
  }
  if (selected.value === idx) {
    selected.value = -1
    return
  }
  const conn = connByKey.value.get(pairKey(selected.value, idx))
  if (conn) {
    cycle(conn)
    selected.value = -1
  } else {
    selected.value = idx // not aligned — move the selection instead
  }
}

function cycle(conn) {
  const cur = bridges.value[conn.key] || 0
  if (cur === 2) {
    setBridge(conn.key, 0)
  } else {
    // Adding needs a clear path (no other bridge crossing it).
    const occ = occupiedExcept(conn.key)
    if (conn.cells.some((cell) => occ.has(cell))) {
      sfx.wrong()
      return
    }
    setBridge(conn.key, cur + 1)
  }
  sfx.tick()
  checkWin()
}

function setBridge(key, count) {
  const next = { ...bridges.value }
  if (count) next[key] = count
  else delete next[key]
  bridges.value = next
}

function checkWin() {
  const d = degrees.value
  for (let i = 0; i < islands.value.length; i++) if (d[i] !== islands.value[i].num) return
  if (!isConnected()) return
  win()
}

function isConnected() {
  const n = islands.value.length
  if (!n) return false
  const adj = islands.value.map(() => [])
  for (const conn of conns.value) {
    if (bridges.value[conn.key]) {
      adj[conn.i].push(conn.j)
      adj[conn.j].push(conn.i)
    }
  }
  const seen = new Uint8Array(n)
  const st = [0]
  seen[0] = 1
  let cnt = 1
  while (st.length) {
    const x = st.pop()
    for (const y of adj[x])
      if (!seen[y]) {
        seen[y] = 1
        cnt++
        st.push(y)
      }
  }
  return cnt === n
}

// --- Controls ---------------------------------------------------------------

function clearBoard() {
  if (phase.value !== 'play') return
  bridges.value = {}
  selected.value = -1
  sfx.tick()
}

function hint() {
  if (phase.value !== 'play') return
  // Reveal one solution bridge the player hasn't matched yet.
  for (const [key, want] of solution.value) {
    if ((bridges.value[key] || 0) < want) {
      const occ = occupiedExcept(key)
      const conn = connByKey.value.get(key)
      if (conn && conn.cells.some((cell) => occ.has(cell))) continue
      setBridge(key, (bridges.value[key] || 0) + 1)
      hints.value += 1
      selected.value = -1
      sfx.tick()
      checkWin()
      return
    }
  }
}

// --- Lifecycle --------------------------------------------------------------

function computeUnit() {
  const avail = (stageRef.value ? stageRef.value.clientWidth : 360) - 4
  const byW = Math.floor(avail / N.value)
  const byH = Math.floor((window.innerHeight * 0.56) / N.value)
  return clamp(Math.min(byW, byH), 26, 56)
}
function layout() {
  unit.value = computeUnit()
}

function deal() {
  const g = generate(level.value)
  N.value = g.N
  islands.value = g.islands
  solution.value = g.solution
  conns.value = findConnections(g.islands, g.N)
  const m = new Map()
  for (const conn of conns.value) m.set(conn.key, conn)
  connByKey.value = m
  bridges.value = {}
  selected.value = -1
  hints.value = 0
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
})
onBeforeUnmount(() => {
  stopTimer()
  window.removeEventListener('resize', layout)
})
</script>

<template>
  <div class="jembatan">
    <div class="panel">
      <section class="screen">
        <!-- ===== Setup ===== -->
        <template v-if="phase === 'setup'">
          <p class="brand">JEM<span class="brand__accent">BATAN</span></p>
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
          <p class="setup__info">{{ sel.islands }} pulau · SELESAI {{ solvedCount }}</p>
          <button class="cta" type="button" @click="start">Mulai ▸</button>
        </template>

        <!-- ===== Play / Won ===== -->
        <template v-else>
          <div class="backbar">
            <button class="mini" type="button" @click="toSetup">← Tingkat</button>
          </div>
          <p class="brand brand--sm">JEM<span class="brand__accent">BATAN</span></p>

          <div class="solobar hud">
            <span>WAKTU <b>{{ timeLabel }}</b></span>
            <span>TERBAIK {{ bestTime ? fmt(bestTime) : '—' }}</span>
            <span class="solobar__best">SELESAI {{ solvedCount }}</span>
          </div>

          <div class="stage" ref="stageRef">
            <svg
              class="board"
              :class="{ locked: phase !== 'play' }"
              :width="boardPx"
              :height="boardPx"
              :viewBox="`0 0 ${boardPx} ${boardPx}`"
            >
              <line
                v-for="s in segments"
                :key="s.key"
                :x1="s.x1"
                :y1="s.y1"
                :x2="s.x2"
                :y2="s.y2"
                class="bridge"
                :stroke-width="unit * 0.08"
              />
              <g
                v-for="(isl, i) in islands"
                :key="i"
                class="island"
                :class="islandClass(i)"
                @click="tapIsland(i)"
              >
                <circle :cx="center(i).x" :cy="center(i).y" :r="unit * 0.46" class="island__hit" />
                <circle :cx="center(i).x" :cy="center(i).y" :r="unit * 0.36" class="island__disc" />
                <text
                  :x="center(i).x"
                  :y="center(i).y"
                  class="island__num"
                  :font-size="unit * 0.42"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {{ isl.num }}
                </text>
              </g>
            </svg>
          </div>

          <p class="tip">Ketuk dua pulau untuk membangun jembatan · maksimal dua · tak boleh silang.</p>

          <div class="tools">
            <button class="mini" type="button" @click="clearBoard">Bersihkan</button>
            <button class="mini" type="button" @click="hint">Petunjuk · {{ hints }}</button>
            <button class="mini" type="button" @click="newGame">Baru</button>
          </div>

          <div v-if="phase === 'won'" class="result">
            <p class="result__title">Terpecahkan!</p>
            <p class="result__streak">WAKTU {{ timeLabel }} · SELESAI {{ solvedCount }}</p>
            <button class="cta" type="button" @click="newGame">Main lagi ▸</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/backbar/picker/pick/
   solobar/result come from src/styles.css. */
.jembatan {
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
  background-image: linear-gradient(to right, rgba(44, 19, 56, 0.08) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(44, 19, 56, 0.08) 1px, transparent 1px);
  background-size: calc(100% / v-bind(N)) calc(100% / v-bind(N));
}
.board.locked {
  pointer-events: none;
}
.bridge {
  stroke: var(--aqua-deep);
  stroke-linecap: round;
}
.island {
  cursor: pointer;
}
.island__hit {
  fill: transparent;
}
.island__disc {
  fill: var(--cream);
  stroke: var(--ink);
  stroke-width: 2.4;
  transition: fill 0.1s ease;
}
.island__num {
  fill: var(--ink);
  font-family: var(--font-mono);
  font-weight: 600;
  pointer-events: none;
}
.island.is-done .island__disc {
  fill: var(--aqua);
}
.island.is-over .island__disc {
  fill: var(--tile-wrong);
  stroke: var(--berry);
}
.island.is-sel .island__disc {
  fill: var(--sun);
  stroke-width: 3.4;
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
