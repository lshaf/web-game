<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Titik & Kotak (Dots and Boxes) — draw one edge at a time; close a box and you
// keep the turn. Two modes: vs a greedy CPU (human is P1) or pass-and-play.
//
// Board model for N boxes/side: (N+1)×(N+1) dots.
//   H[r][c] horizontal edges — r in 0..N, c in 0..N-1
//   V[r][c] vertical edges   — r in 0..N-1, c in 0..N
//   B[r][c] boxes owned by 0 (none) / 1 / 2 — r,c in 0..N-1

const MODES = [
  { id: 'cpu', label: 'Vs CPU' },
  { id: 'duo', label: '2 Pemain' },
]
const SIZES = [3, 4, 5]

const mode = ref('cpu') // 'cpu' | 'duo'
const size = ref(4) // boxes per side
const phase = ref('menu') // 'menu' | 'play' | 'over'

const H = ref([]) // (N+1) x N
const V = ref([]) // N x (N+1)
const B = ref([]) // N x N  (0/1/2)
const turn = ref(1) // 1 | 2
const last = ref(null) // { type, r, c, player } — the freshly drawn edge (glow)
let cpuTimer = 0

// Index helpers that follow the current board size.
const rowsN = computed(() => Array.from({ length: size.value }, (_, i) => i)) // 0..N-1
const linesN = computed(() => Array.from({ length: size.value + 1 }, (_, i) => i)) // 0..N

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${size.value}, var(--dot) 1fr) var(--dot)`,
  gridTemplateRows: `repeat(${size.value}, var(--dot) 1fr) var(--dot)`,
}))

const scores = computed(() => {
  let a = 0
  let b = 0
  for (const row of B.value) {
    for (const o of row) {
      if (o === 1) a++
      else if (o === 2) b++
    }
  }
  return { a, b }
})

const soloMode = computed(() => mode.value === 'cpu')
const p1Label = computed(() => (soloMode.value ? 'Kamu' : 'P1'))
const p2Label = computed(() => (soloMode.value ? 'CPU' : 'P2'))
// It is not the human's turn while the CPU (P2) is thinking.
const locked = computed(() => phase.value !== 'play' || (soloMode.value && turn.value === 2))

const turnStatus = computed(() => {
  if (soloMode.value) return turn.value === 1 ? 'Giliranmu' : 'CPU berpikir...'
  return turn.value === 1 ? 'Giliran P1' : 'Giliran P2'
})

const result = computed(() => {
  const { a, b } = scores.value
  if (a === b) return { title: 'Seri!', lost: false }
  const p1win = a > b
  if (soloMode.value) {
    return p1win ? { title: 'Kamu Menang!', lost: false } : { title: 'CPU Menang!', lost: true }
  }
  return p1win ? { title: 'P1 Menang!', lost: false } : { title: 'P2 Menang!', lost: false }
})

// ---- Board helpers (operate on plain 2D arrays so they work for the CPU's
// look-ahead clones as well as the live refs) ----
function makeGrid(rows, cols, val) {
  return Array.from({ length: rows }, () => Array(cols).fill(val))
}
function cloneGrid(g) {
  return g.map((row) => row.slice())
}
function sidesOf(h, v, r, c) {
  let s = 0
  if (h[r][c]) s++ // top
  if (h[r + 1][c]) s++ // bottom
  if (v[r][c]) s++ // left
  if (v[r][c + 1]) s++ // right
  return s
}
function countComplete(h, v, n) {
  let k = 0
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (sidesOf(h, v, r, c) === 4) k++
  return k
}
function boxSides(r, c) {
  return sidesOf(H.value, V.value, r, c)
}
// The boxes bordering a given edge (0, 1 or 2 of them).
function adjacentBoxes(type, r, c) {
  const n = size.value
  const res = []
  if (type === 'h') {
    if (r - 1 >= 0) res.push([r - 1, c]) // box above
    if (r < n) res.push([r, c]) // box below
  } else {
    if (c - 1 >= 0) res.push([r, c - 1]) // box to the left
    if (c < n) res.push([r, c]) // box to the right
  }
  return res
}
function isDrawn(type, r, c) {
  return type === 'h' ? H.value[r][c] : V.value[r][c]
}

// ---- Move application ----
// Draw the current player's edge, claim any boxes it closes, and switch turns
// only when it closed none. Returns how many boxes were completed.
function applyEdge(type, r, c) {
  const player = turn.value
  if (type === 'h') H.value[r][c] = true
  else V.value[r][c] = true
  sfx.tick()
  last.value = { type, r, c, player }

  let made = 0
  for (const [br, bc] of adjacentBoxes(type, r, c)) {
    if (B.value[br][bc] === 0 && boxSides(br, bc) === 4) {
      B.value[br][bc] = player
      made++
    }
  }
  if (made > 0) sfx.win() // satisfying blip on completing a box — same player continues
  else turn.value = player === 1 ? 2 : 1
  return made
}

function checkOver() {
  const { a, b } = scores.value
  if (a + b === size.value * size.value) {
    endGame()
    return true
  }
  return false
}

function endGame() {
  phase.value = 'over'
  const { a, b } = scores.value
  if (soloMode.value && b > a) sfx.lose()
  else sfx.win()
}

// A human tap on an undrawn edge.
function onEdgeTap(type, r, c) {
  if (locked.value) return
  if (isDrawn(type, r, c)) return
  applyEdge(type, r, c)
  if (checkOver()) return
  if (soloMode.value && turn.value === 2) scheduleCpu()
}

// ---- CPU (solo, plays P2) ----
function undrawnEdges() {
  const n = size.value
  const res = []
  for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) if (!H.value[r][c]) res.push({ type: 'h', r, c })
  for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) if (!V.value[r][c]) res.push({ type: 'v', r, c })
  return res
}
// Would drawing this edge close a box? (some neighbour already has 3 sides)
function edgeCompletes(e) {
  return adjacentBoxes(e.type, e.r, e.c).some(([br, bc]) => boxSides(br, bc) === 3)
}
// Safe = doesn't hand a box over, i.e. no neighbour becomes a 3-sided box.
function edgeSafe(e) {
  return adjacentBoxes(e.type, e.r, e.c).every(([br, bc]) => boxSides(br, bc) < 2)
}
// Estimate how many boxes this (unsafe) edge gives away: draw it, then let the
// opponent greedily hoover every 3-sided box in the resulting chain.
function giveaway(type, r, c) {
  const n = size.value
  const h = cloneGrid(H.value)
  const v = cloneGrid(V.value)
  if (type === 'h') h[r][c] = true
  else v[r][c] = true
  const before = countComplete(h, v, n)
  // Repeatedly close any box that has exactly three sides.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let found = null
    for (let br = 0; br < n && !found; br++) {
      for (let bc = 0; bc < n; bc++) {
        if (sidesOf(h, v, br, bc) === 3) {
          found = [br, bc]
          break
        }
      }
    }
    if (!found) break
    const [br, bc] = found
    if (!h[br][bc]) h[br][bc] = true
    else if (!h[br + 1][bc]) h[br + 1][bc] = true
    else if (!v[br][bc]) v[br][bc] = true
    else v[br][bc + 1] = true
  }
  return countComplete(h, v, n) - before
}

function chooseCpuMove() {
  const edges = undrawnEdges()
  if (!edges.length) return null
  // 1) Always take a free box.
  const taking = edges.filter(edgeCompletes)
  if (taking.length) return taking[Math.floor(Math.random() * taking.length)]
  // 2) Play a safe edge that hands nothing over.
  const safe = edges.filter(edgeSafe)
  if (safe.length) return safe[Math.floor(Math.random() * safe.length)]
  // 3) No safe move — give away as few boxes as possible.
  let bestG = Infinity
  let bestList = []
  for (const e of edges) {
    const g = giveaway(e.type, e.r, e.c)
    if (g < bestG) {
      bestG = g
      bestList = [e]
    } else if (g === bestG) {
      bestList.push(e)
    }
  }
  return bestList[Math.floor(Math.random() * bestList.length)]
}

function scheduleCpu() {
  clearTimeout(cpuTimer)
  cpuTimer = setTimeout(cpuStep, 350)
}
// One CPU edge; loops (with a beat) as long as it keeps closing boxes.
function cpuStep() {
  if (phase.value !== 'play' || !soloMode.value || turn.value !== 2) return
  const move = chooseCpuMove()
  if (!move) return
  applyEdge(move.type, move.r, move.c)
  if (checkOver()) return
  if (turn.value === 2) cpuTimer = setTimeout(cpuStep, 350)
}

// ---- Flow ----
function startGame() {
  clearTimeout(cpuTimer)
  const n = size.value
  H.value = makeGrid(n + 1, n, false)
  V.value = makeGrid(n, n + 1, false)
  B.value = makeGrid(n, n, 0)
  turn.value = 1
  last.value = null
  phase.value = 'play'
}
function restart() {
  startGame()
}
function toMenu() {
  clearTimeout(cpuTimer)
  phase.value = 'menu'
}

// ---- Rendering helpers ----
function boxStyle(r, c) {
  return { gridColumn: `${2 * c + 1} / span 3`, gridRow: `${2 * r + 1} / span 3` }
}
function edgeStyle(type, r, c) {
  if (type === 'h') return { gridRow: `${2 * r + 1}`, gridColumn: `${2 * c + 2}` }
  return { gridRow: `${2 * r + 2}`, gridColumn: `${2 * c + 1}` }
}
function dotStyle(r, c) {
  return { gridRow: `${2 * r + 1}`, gridColumn: `${2 * c + 1}` }
}
function edgeClass(type, r, c) {
  const drawn = isDrawn(type, r, c)
  const l = last.value
  const isLast = l && l.type === type && l.r === r && l.c === c
  return {
    'is-drawn': drawn,
    'is-last-1': isLast && l.player === 1,
    'is-last-2': isLast && l.player === 2,
  }
}

function onKeydown(e) {
  if (e.key === 'Enter' && phase.value === 'over') {
    e.preventDefault()
    restart()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(cpuTimer)
})
</script>

<template>
  <div class="titikkotak">
    <div class="panel">
      <!-- ===== Menu ===== -->
      <section v-if="phase === 'menu'" class="screen">
        <p class="brand">TITIK<span class="brand__accent"> &amp; KOTAK</span></p>
        <p class="eyebrow">REBUT KOTAK TERBANYAK</p>

        <div class="field">
          <span class="field__label">Mode</span>
          <div class="picker picker--mode">
            <button
              v-for="m in MODES"
              :key="m.id"
              class="pick"
              :class="{ 'is-on': mode === m.id }"
              type="button"
              @click="mode = m.id"
            >
              {{ m.label }}
            </button>
          </div>
        </div>

        <div class="field">
          <span class="field__label">Ukuran</span>
          <div class="picker picker--size">
            <button
              v-for="s in SIZES"
              :key="s"
              class="pick"
              :class="{ 'is-on': size === s }"
              type="button"
              @click="size = s"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <button class="cta" type="button" @click="startGame">Mulai ▸</button>
      </section>

      <!-- ===== Play ===== -->
      <section v-else-if="phase === 'play'" class="screen play">
        <div class="topbar">
          <button class="mini" type="button" @click="toMenu">← Menu</button>
          <span class="status">{{ turnStatus }}</span>
          <button class="mini" type="button" @click="restart">Ulang</button>
        </div>

        <div class="score" aria-label="Skor">
          <span class="score__side score__side--p1" :class="{ 'is-active': turn === 1 }">
            <span class="lab">{{ p1Label }}</span><span class="num">{{ scores.a }}</span>
          </span>
          <span class="score__dash">—</span>
          <span class="score__side score__side--p2" :class="{ 'is-active': turn === 2 }">
            <span class="num">{{ scores.b }}</span><span class="lab">{{ p2Label }}</span>
          </span>
        </div>

        <div class="grid" :style="gridStyle">
          <!-- Boxes (behind the lines) -->
          <template v-for="r in rowsN" :key="'brow' + r">
            <div
              v-for="c in rowsN"
              :key="'b' + r + '-' + c"
              class="box"
              :class="{ 'box--p1': B[r][c] === 1, 'box--p2': B[r][c] === 2 }"
              :style="boxStyle(r, c)"
            />
          </template>

          <!-- Horizontal edges -->
          <template v-for="r in linesN" :key="'hrow' + r">
            <button
              v-for="c in rowsN"
              :key="'h' + r + '-' + c"
              class="edge edge-h"
              :class="edgeClass('h', r, c)"
              :style="edgeStyle('h', r, c)"
              type="button"
              :disabled="H[r][c] || locked"
              aria-label="Garis mendatar"
              @click="onEdgeTap('h', r, c)"
            >
              <span class="line" />
            </button>
          </template>

          <!-- Vertical edges -->
          <template v-for="r in rowsN" :key="'vrow' + r">
            <button
              v-for="c in linesN"
              :key="'v' + r + '-' + c"
              class="edge edge-v"
              :class="edgeClass('v', r, c)"
              :style="edgeStyle('v', r, c)"
              type="button"
              :disabled="V[r][c] || locked"
              aria-label="Garis tegak"
              @click="onEdgeTap('v', r, c)"
            >
              <span class="line" />
            </button>
          </template>

          <!-- Dots (on top of the joints) -->
          <template v-for="r in linesN" :key="'drow' + r">
            <span v-for="c in linesN" :key="'d' + r + '-' + c" class="dot" :style="dotStyle(r, c)" />
          </template>
        </div>
      </section>

      <!-- ===== Result ===== -->
      <section v-else class="screen result">
        <p class="result__title" :class="{ 'is-lost': result.lost }">{{ result.title }}</p>
        <p class="result__sub">{{ scores.a }} — {{ scores.b }}</p>
        <button class="cta" type="button" @click="restart">Main lagi ▸</button>
        <button class="cta cta--ghost" type="button" @click="toMenu">Ganti mode</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/topbar/status/field/
   picker/pick/result come from src/styles.css. */
.titikkotak {
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

.panel {
  padding: 22px 18px 26px;
}

.brand {
  font-size: 34px;
}

.play {
  width: 100%;
}

/* The shared .picker is a fixed 4-up grid; these games only need 2 and 3. */
.picker--mode {
  grid-template-columns: repeat(2, 1fr);
}
.picker--size {
  grid-template-columns: repeat(3, 1fr);
}

/* ---- Score / turn row ---- */
.score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 16px;
}
.score__side {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 2px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.score__side .lab {
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 0.02em;
}
.score__side .num {
  font-family: var(--font-mono);
  font-size: 19px;
  font-weight: 700;
}
.score__side--p1 {
  color: var(--berry);
}
.score__side--p2 {
  color: var(--aqua-deep);
}
.score__side.is-active {
  border-color: currentColor;
  background: color-mix(in srgb, currentColor 14%, var(--cream));
  box-shadow: var(--pop-sm);
}
.score__dash {
  font-family: var(--font-mono);
  color: var(--muted);
}

/* ---- Board ---- */
.grid {
  --dot: clamp(18px, 6vw, 26px);
  width: 100%;
  max-width: 420px;
  margin: 0 auto 4px;
  aspect-ratio: 1;
  display: grid;
  -webkit-tap-highlight-color: transparent;
}

/* A claimed box, filled corner-to-corner to the surrounding line centres. */
.box {
  z-index: 0;
  margin: calc(var(--dot) / 2);
  border-radius: 9px;
  background: transparent;
  transition: background 0.18s ease;
}
.box--p1 {
  background: color-mix(in srgb, var(--berry) 24%, var(--cream));
  animation: box-pop 0.2s ease;
}
.box--p2 {
  background: color-mix(in srgb, var(--aqua-deep) 24%, var(--cream));
  animation: box-pop 0.2s ease;
}
@keyframes box-pop {
  from {
    transform: scale(0.82);
    opacity: 0.3;
  }
}

/* Each edge is a thin visible line inside a fat, invisible tap target (the whole
   grid cell — at least var(--dot) thick, which is >= 18px). */
.edge {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  padding: 0;
  background: transparent;
  border: 0;
  -webkit-tap-highlight-color: transparent;
}
.edge:not(:disabled) {
  cursor: pointer;
}
.line {
  position: absolute;
  border-radius: 999px;
  background: rgba(44, 19, 56, 0.16);
  transition: background 0.12s ease;
}
.edge-h .line {
  top: 50%;
  transform: translateY(-50%);
  left: calc(-1 * var(--dot) / 2);
  right: calc(-1 * var(--dot) / 2);
  height: var(--line);
}
.edge-v .line {
  left: 50%;
  transform: translateX(-50%);
  top: calc(-1 * var(--dot) / 2);
  bottom: calc(-1 * var(--dot) / 2);
  width: var(--line);
}
.edge:not(:disabled):hover .line {
  background: rgba(44, 19, 56, 0.42);
}
.edge.is-drawn .line {
  background: var(--ink);
}
.edge-h.is-drawn .line {
  height: 5px;
}
.edge-v.is-drawn .line {
  width: 5px;
}
/* The freshly drawn edge glows briefly in the mover's colour. */
.edge.is-last-1 .line {
  animation: glow-1 0.55s ease;
}
.edge.is-last-2 .line {
  animation: glow-2 0.55s ease;
}
@keyframes glow-1 {
  from {
    box-shadow: 0 0 0 3px var(--berry), 0 0 16px 4px rgba(255, 77, 121, 0.9);
  }
  to {
    box-shadow: 0 0 0 0 rgba(255, 77, 121, 0);
  }
}
@keyframes glow-2 {
  from {
    box-shadow: 0 0 0 3px var(--aqua-deep), 0 0 16px 4px rgba(15, 168, 142, 0.9);
  }
  to {
    box-shadow: 0 0 0 0 rgba(15, 168, 142, 0);
  }
}

.dot {
  z-index: 3;
  place-self: center;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ink);
  pointer-events: none;
}

/* Stack the two result buttons with a little breathing room. */
.result .cta + .cta {
  margin-top: 10px;
}
</style>
