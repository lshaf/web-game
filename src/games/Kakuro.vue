<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { sfx } from '../sound.js'

// Kakuro — fill the white cells with 1–9 so every across and down run adds up to
// its clue and never repeats a digit. Pick a grid size, then solve one puzzle
// after another. The generator stamps random rectangles of white cells (so each
// run is length ≥ 2 and ≤ maxRun, keeping it fillable with distinct 1–9), keeps
// only layouts that stay dense and reach every quadrant (so the board fills out
// instead of clustering into a corner), then fills them with a run-distinct
// assignment and reads the clues off it. The dense, well-crossed boards are
// near-always single-solution; the hint button covers the rare ambiguous cell.

const SOLVED_KEY = 'dusk-kakuro-solved'
const BEST_KEY = 'dusk-kakuro-best'

// The three difficulties. S is the full side (border included), so the playable
// interior is (S-1)×(S-1). `stamps` seeds white rectangles up to `maxStamp` per
// side; `maxRun` caps run length; `minWhite` sets the density floor and `quad`
// the minimum white cells required in each interior quadrant.
const DIFFS = [
  { id: 'mudah', label: 'Mudah', S: 6, stamps: 5, maxStamp: 3, maxRun: 5, minWhite: 15, quad: 2 },
  { id: 'sedang', label: 'Sedang', S: 10, stamps: 15, maxStamp: 3, maxRun: 6, minWhite: 42, quad: 6 },
  { id: 'sulit', label: 'Sulit', S: 14, stamps: 30, maxStamp: 3, maxRun: 7, minWhite: 80, quad: 8 },
]

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// --- Generator / solver -----------------------------------------------------

// Stamp `stamps` random white blocks (2..maxStamp per side) inside the border.
// Because every white cell lands inside a block, it always has a white neighbour
// both across and down — so no run is ever length 1 and every run gets a header
// cell.
function stampLayout(S, stamps, maxStamp) {
  const kind = new Int8Array(S * S)
  for (let s = 0; s < stamps; s++) {
    const h = 2 + ((Math.random() * (maxStamp - 1)) | 0)
    const w = 2 + ((Math.random() * (maxStamp - 1)) | 0)
    const r = 1 + ((Math.random() * (S - h)) | 0)
    const c = 1 + ((Math.random() * (S - w)) | 0)
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++) kind[(r + dr) * S + (c + dc)] = 1
  }
  return kind
}

// Split the white cells into maximal across/down runs and record, per cell,
// which run it belongs to in each direction. Returns null on a run outside
// [2, maxRun] — length-1 can't be clued and length > 9 can't hold distinct 1–9,
// so such a layout is simply rejected and re-stamped.
function findRuns(kind, S, maxRun) {
  const runsA = []
  const runsD = []
  const cellA = new Int32Array(S * S).fill(-1)
  const cellD = new Int32Array(S * S).fill(-1)
  for (let r = 0; r < S; r++) {
    let c = 0
    while (c < S) {
      if (kind[r * S + c] === 1) {
        const start = c
        const cells = []
        while (c < S && kind[r * S + c] === 1) cells.push(r * S + c++)
        if (cells.length < 2 || cells.length > maxRun) return null
        const id = runsA.length
        runsA.push({ cells, header: r * S + (start - 1), clue: 0 })
        for (const idx of cells) cellA[idx] = id
      } else c++
    }
  }
  for (let c = 0; c < S; c++) {
    let r = 0
    while (r < S) {
      if (kind[r * S + c] === 1) {
        const start = r
        const cells = []
        while (r < S && kind[r * S + c] === 1) cells.push((r++) * S + c)
        if (cells.length < 2 || cells.length > maxRun) return null
        const id = runsD.length
        runsD.push({ cells, header: (start - 1) * S + c, clue: 0 })
        for (const idx of cells) cellD[idx] = id
      } else r++
    }
  }
  return { runsA, runsD, cellA, cellD }
}

// One valid fill: walk the white cells and drop a digit that repeats neither its
// across nor its down run so far. Pure distinctness, so it almost always closes.
function fillValid(order, cellA, cellD, nA, nD, S) {
  const value = new Int8Array(S * S)
  const aMask = new Int16Array(nA)
  const dMask = new Int16Array(nD)
  function bt(i) {
    if (i === order.length) return true
    const idx = order[i]
    const a = cellA[idx]
    const d = cellD[idx]
    for (const digit of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      const bit = 1 << digit
      if (aMask[a] & bit || dMask[d] & bit) continue
      value[idx] = digit
      aMask[a] |= bit
      dMask[d] |= bit
      if (bt(i + 1)) return true
      value[idx] = 0
      aMask[a] &= ~bit
      dMask[d] &= ~bit
    }
    return false
  }
  return bt(0) ? value : null
}

// Pack layout + a chosen fill into the shape the board renders from.
function pack(S, kind, info, value) {
  const { runsA, runsD, cellA, cellD, whiteCells } = info
  const acrossAt = new Int16Array(S * S)
  const downAt = new Int16Array(S * S)
  for (const run of runsA) {
    run.clue = run.cells.reduce((s, i) => s + value[i], 0)
    acrossAt[run.header] = run.clue
  }
  for (const run of runsD) {
    run.clue = run.cells.reduce((s, i) => s + value[i], 0)
    downAt[run.header] = run.clue
  }
  return {
    S,
    kind,
    whiteCells,
    runsA: runsA.map((r) => ({ cells: r.cells, clue: r.clue })),
    runsD: runsD.map((r) => ({ cells: r.cells, clue: r.clue })),
    acrossAt,
    downAt,
    solution: Array.from(value),
  }
}

// Every interior quadrant must hold at least `quad` white cells, so the puzzle
// fills the whole board instead of leaving a dead, empty region that reads as a
// broken / cut-off grid.
function quadCovered(whiteCells, S, quad) {
  const mid = S / 2
  let a = 0, b = 0, c = 0, d = 0
  for (const i of whiteCells) {
    const r = (i / S) | 0
    const col = i % S
    if (r < mid && col < mid) a++
    else if (r < mid) b++
    else if (col < mid) c++
    else d++
  }
  return a >= quad && b >= quad && c >= quad && d >= quad
}

function generate(cfg) {
  const { S, stamps, maxStamp, maxRun, minWhite, quad } = cfg
  let fallback = null // any valid board, if no dense+covered one turns up
  for (let attempt = 0; attempt < 1200; attempt++) {
    const kind = stampLayout(S, stamps, maxStamp)
    const info = findRuns(kind, S, maxRun)
    if (!info) continue
    const whiteCells = []
    for (let i = 0; i < S * S; i++) if (kind[i] === 1) whiteCells.push(i)
    if (whiteCells.length < 2) continue
    info.whiteCells = whiteCells
    const value = fillValid(whiteCells, info.cellA, info.cellD, info.runsA.length, info.runsD.length, S)
    if (!value) continue
    const puzzle = pack(S, kind, info, value)
    if (!fallback) fallback = puzzle
    // Ideal: dense enough and spread across every quadrant.
    if (whiteCells.length >= minWhite && quadCovered(whiteCells, S, quad)) return puzzle
  }
  return fallback
}

// --- Game state -------------------------------------------------------------

const phase = ref('menu') // menu | play | won (brief, between puzzles)
const showStamp = ref(false)
const diffIndex = ref(0)
const S = ref(6)
const kind = ref(new Int8Array(0))
const acrossAt = ref(new Int16Array(0))
const downAt = ref(new Int16Array(0))
const runsA = ref([])
const runsD = ref([])
const whiteCells = ref([])
const value = ref([])
const solution = ref([])
const selected = ref(-1)
const cell = ref(46)
const hints = ref(0)
const elapsed = ref(0)
// Solved-count and best-time are tracked per difficulty id.
const solvedByDiff = ref({})
const bestByDiff = ref({})

const diff = computed(() => DIFFS[diffIndex.value])
const solvedCount = computed(() => solvedByDiff.value[diff.value.id] || 0)
const bestTime = computed(() => bestByDiff.value[diff.value.id] || 0)

const stageRef = ref(null)
const scrollerRef = ref(null)
let timer = 0
let startAt = 0
let advanceId = 0

const timeLabel = computed(() => fmt(elapsed.value))
function fmt(s) {
  const m = Math.floor(s / 60)
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

// Per-cell descriptor list the board renders from: white / clue / wall.
const board = computed(() => {
  const n = S.value
  const k = kind.value
  const a = acrossAt.value
  const d = downAt.value
  const out = []
  for (let i = 0; i < n * n; i++) {
    if (k[i] === 1) out.push({ idx: i, type: 'white' })
    else if (a[i] || d[i]) out.push({ idx: i, type: 'clue', a: a[i], d: d[i] })
    else out.push({ idx: i, type: 'wall' })
  }
  return out
})

// A run is in conflict when it repeats a digit, overshoots its clue, or is full
// but off-target; every filled cell of such a run is flagged.
const conflictSet = computed(() => {
  const bad = new Set()
  const v = value.value
  for (const run of runsA.value) flagRun(run, v, bad)
  for (const run of runsD.value) flagRun(run, v, bad)
  return bad
})
function flagRun(run, v, bad) {
  let sum = 0
  let filled = 0
  let dup = false
  const seen = new Set()
  for (const idx of run.cells) {
    const x = v[idx]
    if (x) {
      sum += x
      filled++
      if (seen.has(x)) dup = true
      seen.add(x)
    }
  }
  if (dup || sum > run.clue || (filled === run.cells.length && sum !== run.clue))
    for (const idx of run.cells) if (v[idx]) bad.add(idx)
}

// The two runs through the selected cell, for row/column highlighting.
const peerSet = computed(() => {
  const set = new Set()
  const sel = selected.value
  if (sel < 0) return set
  for (const run of runsA.value)
    if (run.cells.includes(sel)) for (const i of run.cells) set.add(i)
  for (const run of runsD.value)
    if (run.cells.includes(sel)) for (const i of run.cells) set.add(i)
  return set
})

function whiteClass(idx) {
  return {
    'is-sel': selected.value === idx,
    'is-conflict': conflictSet.value.has(idx),
    'is-peer': selected.value >= 0 && selected.value !== idx && peerSet.value.has(idx),
    'is-filled': !!value.value[idx],
  }
}

const boardStyle = computed(() => ({
  '--cell': cell.value + 'px',
  width: S.value * cell.value + 'px',
  gridTemplateColumns: `repeat(${S.value}, var(--cell))`,
}))

// --- Interaction ------------------------------------------------------------

function select(idx) {
  if (phase.value !== 'play') return
  // A mouse drag that panned the board shouldn't also select the cell it
  // started on — swallow that one click.
  if (didPan) {
    didPan = false
    return
  }
  selected.value = selected.value === idx ? -1 : idx
}

// Grab-and-drag the board itself to pan when it's bigger than its viewport (the
// large boards overflow both ways). Handlers live on the board grid; once a drag
// clears the threshold we capture the pointer, so the board keeps following the
// cursor even past the scroll-box edge, and swallow the click so the cell you
// grabbed isn't also selected. Touch keeps native scrolling (and the browser
// cancels the tap on a swipe).
let panStart = null
let didPan = false
function onPanDown(e) {
  if (e.pointerType && e.pointerType !== 'mouse') return
  const el = scrollerRef.value
  if (!el) return
  panStart = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId, target: e.currentTarget }
  didPan = false
}
function onPanMove(e) {
  if (!panStart) return
  // A missed pointerup (released off-element) would otherwise leave us panning
  // on a buttonless hover — drop the stale drag.
  if (e.buttons === 0) {
    onPanUp()
    return
  }
  const dx = e.clientX - panStart.x
  const dy = e.clientY - panStart.y
  if (!didPan && Math.abs(dx) < 6 && Math.abs(dy) < 6) return
  if (!didPan) {
    didPan = true
    try {
      panStart.target.setPointerCapture(panStart.id)
    } catch (err) {
      /* capture unsupported */
    }
  }
  e.preventDefault()
  scrollerRef.value.scrollLeft = panStart.left - dx
  scrollerRef.value.scrollTop = panStart.top - dy
}
function onPanUp() {
  if (panStart) {
    try {
      panStart.target.releasePointerCapture(panStart.id)
    } catch (err) {
      /* capture was never taken */
    }
  }
  panStart = null
}

function inputNum(n) {
  const idx = selected.value
  if (phase.value !== 'play' || idx < 0 || kind.value[idx] !== 1) return
  value.value[idx] = n
  sfx.tick()
  checkWin()
}

function eraseCell() {
  const idx = selected.value
  if (phase.value !== 'play' || idx < 0 || !value.value[idx]) return
  value.value[idx] = 0
  sfx.tick()
}

function moveSel(key) {
  const n = S.value
  if (selected.value < 0) {
    selected.value = whiteCells.value[0] ?? -1
    return
  }
  let r = Math.floor(selected.value / n)
  let c = selected.value % n
  const dr = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0
  const dc = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
  for (let step = 0; step < n; step++) {
    r = (r + dr + n) % n
    c = (c + dc + n) % n
    const idx = r * n + c
    if (kind.value[idx] === 1) {
      selected.value = idx
      return
    }
  }
}

function onKeydown(e) {
  if (phase.value !== 'play') return
  const k = e.key
  if (k >= '1' && k <= '9') {
    e.preventDefault()
    inputNum(Number(k))
  } else if (k === 'Backspace' || k === 'Delete' || k === '0') {
    e.preventDefault()
    eraseCell()
  } else if (k.startsWith('Arrow')) {
    e.preventDefault()
    moveSel(k)
  }
}

// --- Controls ---------------------------------------------------------------

function clearBoard() {
  if (phase.value !== 'play') return
  for (const idx of whiteCells.value) value.value[idx] = 0
  sfx.tick()
}

function hint() {
  if (phase.value !== 'play') return
  const sel = selected.value
  const target =
    sel >= 0 && kind.value[sel] === 1 && !value.value[sel]
      ? sel
      : whiteCells.value.find((i) => !value.value[i])
  if (target == null) return
  value.value[target] = solution.value[target]
  selected.value = target
  hints.value += 1
  sfx.tick()
  checkWin()
}

function checkWin() {
  const v = value.value
  for (const idx of whiteCells.value) if (!v[idx]) return
  if (conflictSet.value.size) return
  win()
}

// --- Lifecycle --------------------------------------------------------------

function computeCell() {
  // Fill the available width (board spans edge to edge), but never shrink cells
  // below a readable floor. On the big boards that floor makes the grid larger
  // than the board viewport, so it overflows and you scroll / drag around it.
  // Measure the stage (full width); the board sizes to its own content.
  const avail = (stageRef.value ? stageRef.value.clientWidth : 360) - 6
  const full = Math.floor(avail / S.value)
  return clamp(Math.max(full, 40), 40, 96)
}
function layout() {
  cell.value = computeCell()
}

function deal() {
  const p = generate(diff.value)
  S.value = p.S
  kind.value = p.kind
  acrossAt.value = p.acrossAt
  downAt.value = p.downAt
  runsA.value = p.runsA
  runsD.value = p.runsD
  whiteCells.value = p.whiteCells
  solution.value = p.solution
  value.value = new Array(p.S * p.S).fill(0)
  selected.value = -1
  hints.value = 0
  phase.value = 'play'
  nextTick(() => {
    layout()
    if (scrollerRef.value) scrollerRef.value.scrollTo(0, 0)
  })
}

function startGame(i) {
  diffIndex.value = i
  clearTimeout(advanceId)
  showStamp.value = false
  deal()
  startTimer()
}

function toMenu() {
  stopTimer()
  clearTimeout(advanceId)
  showStamp.value = false
  phase.value = 'menu'
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
  const id = diff.value.id
  solvedByDiff.value = { ...solvedByDiff.value, [id]: (solvedByDiff.value[id] || 0) + 1 }
  persist(SOLVED_KEY, solvedByDiff.value)
  if (bestTime.value === 0 || elapsed.value < bestTime.value) {
    bestByDiff.value = { ...bestByDiff.value, [id]: elapsed.value }
    persist(BEST_KEY, bestByDiff.value)
  }
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
function persist(k, obj) {
  try {
    localStorage.setItem(k, JSON.stringify(obj))
  } catch (e) {
    /* storage may be blocked; keep in-memory */
  }
}

onMounted(() => {
  try {
    solvedByDiff.value = JSON.parse(localStorage.getItem(SOLVED_KEY)) || {}
    bestByDiff.value = JSON.parse(localStorage.getItem(BEST_KEY)) || {}
  } catch (e) {
    solvedByDiff.value = {}
    bestByDiff.value = {}
  }
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', layout)
})
onBeforeUnmount(() => {
  stopTimer()
  clearTimeout(advanceId)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', layout)
})
</script>

<template>
  <div class="kakuro">
    <div class="panel">
      <!-- ===== Menu (size picker) ===== -->
      <section v-if="phase === 'menu'" class="screen">
        <p class="brand">KAKU<span class="brand__accent">RO</span></p>
        <p class="eyebrow">PILIH TINGKAT</p>

        <div class="picker picker--3 setup__picker">
          <button
            v-for="(d, i) in DIFFS"
            :key="d.id"
            class="pick"
            :class="{ 'is-on': diffIndex === i }"
            type="button"
            @click="diffIndex = i"
          >
            {{ d.label }}
          </button>
        </div>
        <p class="setup__info">{{ diff.S - 1 }}×{{ diff.S - 1 }} · SELESAI {{ solvedCount }}</p>

        <button class="cta" type="button" @click="startGame(diffIndex)">Mulai ▸</button>
      </section>

      <!-- ===== Play ===== -->
      <section v-else class="screen play">
        <div class="topbar">
          <button class="mini" type="button" @click="toMenu">← Tingkat</button>
          <span class="status">{{ diff.label }} · {{ S - 1 }}×{{ S - 1 }}</span>
          <button class="mini" type="button" @click="skip">Baru</button>
        </div>

        <div class="solobar hud">
          <span>WAKTU <b>{{ timeLabel }}</b></span>
          <span>TERBAIK {{ bestTime ? fmt(bestTime) : '—' }}</span>
          <span class="solobar__best">SELESAI {{ solvedCount }}</span>
        </div>

        <div class="stage" ref="stageRef">
          <div class="boardwrap">
            <div
              class="board"
              ref="scrollerRef"
              :class="{ locked: phase !== 'play' }"
              @pointerdown="onPanDown"
              @pointermove="onPanMove"
              @pointerup="onPanUp"
              @pointercancel="onPanUp"
            >
              <div class="grid" :style="boardStyle">
                <template v-for="c in board" :key="c.idx">
                  <button
                    v-if="c.type === 'white'"
                    class="cell white"
                    :class="whiteClass(c.idx)"
                    type="button"
                    @click="select(c.idx)"
                  >
                    {{ value[c.idx] || '' }}
                  </button>
                  <div
                    v-else-if="c.type === 'clue'"
                    class="cell clue-cell"
                    :class="{ 'clue-cell--split': c.a && c.d }"
                  >
                    <span v-if="c.a" class="clue-cell__a">{{ c.a }}</span>
                    <span v-if="c.d" class="clue-cell__d">{{ c.d }}</span>
                  </div>
                  <div v-else class="cell wall" />
                </template>
              </div>
            </div>
            <div class="stamp" :class="{ show: showStamp }" aria-hidden="true">
              <span class="stamp__ring">✓</span>
              <span class="stamp__label">TERPECAHKAN</span>
            </div>
          </div>
        </div>

        <p class="tip">Isi 1–9 · tiap deret = angka petunjuk · tanpa angka kembar.<br />Seret papan untuk menggeser bagian yang terpotong.</p>

        <div class="pad">
          <button v-for="n in 9" :key="n" class="num" type="button" @click="inputNum(n)">
            {{ n }}
          </button>
          <button class="num num--erase" type="button" @click="eraseCell">Hapus</button>
        </div>

        <div class="tools">
          <button class="mini" type="button" @click="clearBoard">Bersihkan</button>
          <button class="mini" type="button" @click="hint">Petunjuk · {{ hints }}</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/mini/solobar come from src/styles.css. */
.kakuro {
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
/* Standard setup picker (matches the other puzzles). */
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
  margin-bottom: 12px;
}
.boardwrap {
  position: relative; /* anchors the solved stamp over the board */
  width: max-content;
  max-width: 100%;
  margin: 0 auto; /* centre the board when it's narrower than the stage */
}
/* The board itself is the scroll viewport: when the grid is bigger than the
   screen you grab-drag (or swipe / wheel) around it in both directions, with a
   styled scrollbar showing there's more to reach. It shrinks to the grid when
   the grid fits, so a small board isn't padded out with empty scroll space. */
.board {
  max-width: 100%;
  max-height: 58vh;
  width: max-content;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x pan-y;
  cursor: grab;
  background: var(--ink);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  box-shadow: var(--pop-sm);
  scrollbar-width: thin;
  scrollbar-color: var(--aqua-deep) rgba(255, 243, 223, 0.12);
}
.board:active {
  cursor: grabbing;
}
.board.locked {
  pointer-events: none;
}
.board::-webkit-scrollbar {
  width: 11px;
  height: 11px;
}
.board::-webkit-scrollbar-track {
  background: rgba(255, 243, 223, 0.1);
  border-radius: 8px;
}
.board::-webkit-scrollbar-thumb {
  background: var(--aqua-deep);
  border: 2px solid var(--ink);
  border-radius: 8px;
}
.board::-webkit-scrollbar-thumb:hover {
  background: var(--aqua);
}
.board::-webkit-scrollbar-corner {
  background: var(--ink);
}
/* The actual cell grid, sized to S×cell and scrolled inside the board. */
.grid {
  display: grid;
  gap: 1.5px;
  padding: 1.5px;
  width: max-content;
  background: var(--ink);
}
.cell {
  width: var(--cell);
  height: var(--cell);
  position: relative;
  padding: 0;
  border: 0;
}

/* Solid clue/wall cells are the dark ink; white cells are the paper you fill. */
.wall {
  background: var(--ink);
}
.clue-cell {
  background: var(--ink);
}
/* Only a cell carrying BOTH an across and a down clue gets the divider diagonal.
   The band in a linear-gradient runs perpendicular to its axis, so `to top
   right` renders the main diagonal (top-left → bottom-right) that splits the
   across clue (top-right triangle) from the down clue (bottom-left). Single-clue
   header cells stay solid so the board's frame isn't a mess of slashes. */
.clue-cell--split {
  background-image: linear-gradient(
    to top right,
    transparent calc(50% - 0.9px),
    rgba(255, 243, 223, 0.34) calc(50% - 0.9px),
    rgba(255, 243, 223, 0.34) calc(50% + 0.9px),
    transparent calc(50% + 0.9px)
  );
}
.clue-cell__a,
.clue-cell__d {
  position: absolute;
  font-family: var(--font-mono);
  font-size: calc(var(--cell) * 0.32);
  line-height: 1;
  color: var(--cream);
}
/* Single clue: put the number on the side of the run it points at — across to
   the right, down to the bottom. */
.clue-cell__a {
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
}
.clue-cell__d {
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
}
/* Split cell: across into the top-right triangle, down into the bottom-left. */
.clue-cell--split .clue-cell__a {
  top: 3px;
  transform: none;
}
.clue-cell--split .clue-cell__d {
  left: 4px;
  transform: none;
}

.white {
  background: var(--paper-lit);
  font-family: var(--font-mono);
  font-size: calc(var(--cell) * 0.5);
  line-height: 1;
  color: var(--aqua-deep);
  cursor: pointer;
  transition: background 0.1s ease;
}
.white:focus,
.white:focus-visible {
  outline: none;
}
.white.is-filled {
  font-weight: 600;
}
.white.is-peer {
  background: color-mix(in srgb, var(--aqua) 14%, var(--paper-lit));
}
.white.is-conflict {
  color: var(--berry);
  background: var(--tile-wrong);
}
.white.is-sel {
  background: var(--tile-live);
}

/* ---- Tip ---- */
.tip {
  margin: 0 0 12px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.02em;
  color: var(--muted);
  text-align: center;
  line-height: 1.5;
}

/* ---- Number pad ---- */
.pad {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
.num {
  font-family: var(--font-mono);
  font-size: 20px;
  color: var(--ink);
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 12px;
  padding: 12px 0;
  box-shadow: 0 3px 0 var(--ink);
  transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.08s ease;
}
.num:hover,
.num:focus-visible {
  transform: translateY(-2px);
  box-shadow: 0 5px 0 var(--ink);
}
.num:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 var(--ink);
}
.num--erase {
  font-size: 13px;
  letter-spacing: 0.04em;
  background: var(--sun);
}

/* ---- Tools ---- */
.tools {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

/* ---- Solved stamp (shared visual language with the other puzzles) ---- */
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
  animation: kakuro-stamp 1.1s ease both;
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
@keyframes kakuro-stamp {
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
