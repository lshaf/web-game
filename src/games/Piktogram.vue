<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Piktogram — a Nonogram / Picross (solo). Pick a size, then a random hidden
// picture is generated (~55% of cells filled). The number clues down the left
// and across the top count the runs of filled cells in each row/column; fill
// the right cells to reveal the picture. In "Isi" you paint cells (a wrong
// guess flashes red and counts a mistake, it never fills); in "Tandai" you drop
// cosmetic ✕ marks on cells you've ruled out. Best = fewest seconds per size.

const SIZES = [5, 10, 15]

const phase = ref('menu') // menu | play | won
const sizeIndex = ref(0)
const solution = ref([]) // boolean[N*N] — the hidden picture
const filled = ref([]) // boolean[N*N] — cells the player has painted
const marked = ref([]) // boolean[N*N] — cosmetic ✕ marks
const rowClues = ref([]) // number[][] — run lengths per row
const colClues = ref([]) // number[][] — run lengths per column
const rowRunIdx = ref([]) // per row: runs of solution cell indices, aligned to rowClues
const colRunIdx = ref([]) // per column: runs of solution cell indices, aligned to colClues
const mode = ref('fill') // fill | mark
const flash = ref(-1) // index of the wrong-guess red flash
const mistakes = ref(0)
const seconds = ref(0)
const best = ref(null) // fewest seconds for the current size
const isNewBest = ref(false)
let timer = 0
let flashTimer = 0

const N = computed(() => SIZES[sizeIndex.value])
const indices = computed(() => Array.from({ length: N.value * N.value }, (_, i) => i))
// The board fills whatever width is left after the row-clue gutter, so clues and
// grid always fit together — no sideways scroll, even at 15×15. Cells size
// themselves via CSS (repeat(N,1fr) + a square board); here we only measure the
// clue gutters so they hold the widest/tallest clue of this exact puzzle.
const colTrack = computed(() => `repeat(${N.value}, 1fr)`)
const clueFont = computed(() => (N.value <= 5 ? 15 : N.value <= 10 ? 12 : 10))
const maxColLen = computed(() => colClues.value.reduce((m, c) => Math.max(m, c.length), 1))
const gutterW = computed(() => {
  const f = clueFont.value
  const gap = f * 0.42
  let w = 0
  for (const clue of rowClues.value) {
    let cw = 0
    for (const n of clue) cw += String(n).length * f * 0.62
    cw += Math.max(0, clue.length - 1) * gap
    if (cw > w) w = cw
  }
  return Math.ceil(w + 12)
})
const bandH = computed(() => Math.ceil(maxColLen.value * clueFont.value * 1.32 + 6))
const puzzleStyle = computed(() => ({
  '--gutter': gutterW.value + 'px',
  '--band': bandH.value + 'px',
  '--clue': clueFont.value + 'px',
}))

// Each clue NUMBER greys out on its own the moment its run is fully filled —
// e.g. for "2 1", filling the 2-run greys the 2 while the 1 stays black.
const rowClueDone = computed(() =>
  rowRunIdx.value.map((runs) => runs.map((run) => run.every((i) => filled.value[i]))),
)
const colClueDone = computed(() =>
  colRunIdx.value.map((runs) => runs.map((run) => run.every((i) => filled.value[i]))),
)
const previewCell = computed(() => Math.max(6, Math.floor(150 / N.value)))
const previewStyle = computed(() => ({
  gridTemplateColumns: `repeat(${N.value}, ${previewCell.value}px)`,
  gridAutoRows: previewCell.value + 'px',
}))

function bestKey(n) {
  return `dusk-piktogram-best-${n}`
}

function loadBest(n) {
  try {
    const v = localStorage.getItem(bestKey(n))
    const num = Number(v)
    return v != null && v !== '' && !Number.isNaN(num) ? num : null
  } catch (e) {
    return null
  }
}

// Random picture with ~55% fill, then guarantee every row and column has at
// least one filled cell (so no clue line is a lonely [0]-only edge case).
function genSolution(n) {
  const sol = Array.from({ length: n * n }, () => Math.random() < 0.55)
  for (let r = 0; r < n; r++) {
    let any = false
    for (let c = 0; c < n; c++) if (sol[r * n + c]) any = true
    if (!any) sol[r * n + Math.floor(Math.random() * n)] = true
  }
  for (let c = 0; c < n; c++) {
    let any = false
    for (let r = 0; r < n; r++) if (sol[r * n + c]) any = true
    if (!any) sol[Math.floor(Math.random() * n) * n + c] = true
  }
  return sol
}

// Run lengths of consecutive filled cells in a line; an empty line → [0].
function lineClues(line) {
  const runs = []
  let run = 0
  for (const v of line) {
    if (v) run++
    else if (run) {
      runs.push(run)
      run = 0
    }
  }
  if (run) runs.push(run)
  return runs.length ? runs : [0]
}

// The solution's runs as lists of cell indices, in the same order as the clue
// numbers — so clue number k corresponds to run k and can grey on its own.
function lineRunsIdx(idxList, sol) {
  const runs = []
  let cur = null
  for (const i of idxList) {
    if (sol[i]) {
      if (!cur) {
        cur = []
        runs.push(cur)
      }
      cur.push(i)
    } else {
      cur = null
    }
  }
  return runs
}

function computeClues(sol, n) {
  const rc = []
  const cc = []
  const rri = []
  const cri = []
  for (let r = 0; r < n; r++) {
    const idx = []
    for (let c = 0; c < n; c++) idx.push(r * n + c)
    rc.push(lineClues(idx.map((i) => sol[i])))
    rri.push(lineRunsIdx(idx, sol))
  }
  for (let c = 0; c < n; c++) {
    const idx = []
    for (let r = 0; r < n; r++) idx.push(r * n + c)
    cc.push(lineClues(idx.map((i) => sol[i])))
    cri.push(lineRunsIdx(idx, sol))
  }
  rowClues.value = rc
  colClues.value = cc
  rowRunIdx.value = rri
  colRunIdx.value = cri
}

function startGame() {
  const n = N.value
  const sol = genSolution(n)
  solution.value = sol
  filled.value = Array(n * n).fill(false)
  marked.value = Array(n * n).fill(false)
  computeClues(sol, n)
  mode.value = 'fill'
  mistakes.value = 0
  seconds.value = 0
  flash.value = -1
  isNewBest.value = false
  best.value = loadBest(n)
  phase.value = 'play'
  startTimer()
}

function startTimer() {
  stopTimer()
  timer = setInterval(() => {
    seconds.value++
  }, 1000)
}
function stopTimer() {
  clearInterval(timer)
  timer = 0
}

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function tapCell(i) {
  if (phase.value !== 'play') return

  if (mode.value === 'mark') {
    if (filled.value[i]) return // marks only live on empty cells
    marked.value[i] = !marked.value[i]
    sfx.tick()
    return
  }

  // Isi (fill) mode.
  if (filled.value[i]) {
    filled.value[i] = false // tapping a filled cell clears it
    sfx.tick()
    return
  }
  if (solution.value[i]) {
    filled.value[i] = true
    marked.value[i] = false
    sfx.tick()
    checkWin()
  } else {
    sfx.wrong()
    mistakes.value++
    flash.value = i
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => {
      if (flash.value === i) flash.value = -1
    }, 440)
  }
}

function checkWin() {
  const sol = solution.value
  const fl = filled.value
  for (let i = 0; i < sol.length; i++) if (fl[i] !== sol[i]) return
  win()
}

function win() {
  stopTimer()
  phase.value = 'won'
  sfx.win()
  if (best.value == null || seconds.value < best.value) {
    best.value = seconds.value
    isNewBest.value = true
    try {
      localStorage.setItem(bestKey(N.value), String(seconds.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory best */
    }
  }
}

function cellClass(i) {
  return {
    'is-filled': filled.value[i],
    'is-mark': marked.value[i] && !filled.value[i],
    'is-flash': flash.value === i,
  }
}

function toMenu() {
  stopTimer()
  phase.value = 'menu'
}

function onKeydown(e) {
  if (phase.value === 'won' && e.key === 'Enter') {
    e.preventDefault()
    startGame()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopTimer()
  clearTimeout(flashTimer)
})
</script>

<template>
  <div class="piktogram">
    <div class="panel">
      <!-- ===== Menu (size picker) ===== -->
      <section v-if="phase === 'menu'" class="screen">
        <p class="brand">PIKTO<span class="brand__accent">GRAM</span></p>
        <p class="eyebrow">GAMBAR DARI ANGKA</p>

        <div class="field">
          <span class="field__label">Ukuran</span>
          <div class="picker sizes">
            <button
              v-for="(s, i) in SIZES"
              :key="s"
              class="pick"
              :class="{ 'is-on': sizeIndex === i }"
              type="button"
              @click="sizeIndex = i"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <p class="menuhint">
          Angka di tepi papan itu petunjuk banyaknya kotak berisi. Isi kotak yang benar
          sampai gambarnya muncul—salah tebak? Kena catatan salah.
        </p>

        <button class="cta" type="button" @click="startGame">Mulai ▸</button>
      </section>

      <!-- ===== Play ===== -->
      <section v-else-if="phase === 'play'" class="screen play">
        <div class="topbar">
          <button class="mini" type="button" @click="toMenu">← Ukuran</button>
          <span class="status">{{ N }}×{{ N }}</span>
          <button class="mini" type="button" @click="startGame">Baru</button>
        </div>

        <div class="solobar meta">
          <span>WAKTU <b>{{ fmt(seconds) }}</b></span>
          <span class="meta__miss">SALAH <b>{{ mistakes }}</b></span>
          <span class="solobar__best">TERBAIK {{ best == null ? '—' : fmt(best) }}</span>
        </div>

        <div class="modes">
          <button
            class="pick"
            :class="{ 'is-on': mode === 'fill' }"
            type="button"
            @click="mode = 'fill'"
          >
            Isi
          </button>
          <button
            class="pick"
            :class="{ 'is-on': mode === 'mark' }"
            type="button"
            @click="mode = 'mark'"
          >
            Tandai
          </button>
        </div>

        <div class="puzzle" :style="puzzleStyle">
          <div class="corner" aria-hidden="true" />
          <div class="colclues" :style="{ gridTemplateColumns: colTrack }">
            <div v-for="c in N" :key="'c' + c" class="cclue">
              <span
                v-for="(v, k) in colClues[c - 1]"
                :key="k"
                :class="{ 'is-done': colClueDone[c - 1] && colClueDone[c - 1][k] }"
                >{{ v }}</span
              >
            </div>
          </div>
          <div class="rowclues" :style="{ gridTemplateRows: colTrack }">
            <div v-for="r in N" :key="'r' + r" class="rclue">
              <span
                v-for="(v, k) in rowClues[r - 1]"
                :key="k"
                :class="{ 'is-done': rowClueDone[r - 1] && rowClueDone[r - 1][k] }"
                >{{ v }}</span
              >
            </div>
          </div>
          <div class="board" :style="{ gridTemplateColumns: colTrack, gridTemplateRows: colTrack }" role="group">
            <button
              v-for="i in indices"
              :key="i"
              class="cell"
              :class="cellClass(i)"
              type="button"
              :aria-label="'Kotak ' + (i + 1)"
              @click="tapCell(i)"
            >
              <span v-if="marked[i] && !filled[i]" class="mark" aria-hidden="true">✕</span>
            </button>
          </div>
        </div>
      </section>

      <!-- ===== Win result ===== -->
      <section v-else class="screen result">
        <p class="brand">PIKTO<span class="brand__accent">GRAM</span></p>
        <p class="eyebrow">SELESAI</p>

        <div class="result__board preview" :style="previewStyle" aria-hidden="true">
          <span v-for="i in indices" :key="i" :class="{ on: solution[i] }" />
        </div>

        <p class="result__title">Gambar Selesai!</p>
        <p class="result__sub">{{ N }}×{{ N }} · {{ fmt(seconds) }} · {{ mistakes }} salah</p>
        <p class="result__streak">
          TERBAIK {{ best == null ? '—' : fmt(best) }}<span v-if="isNewBest"> · REKOR BARU!</span>
        </p>

        <button class="cta" type="button" @click="startGame">Main lagi ▸</button>
        <button class="cta cta--ghost" type="button" @click="toMenu">Ganti ukuran</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/topbar/status/field/
   picker/pick/solobar/result come from src/styles.css (see docs/STYLE.md). */
.piktogram {
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

/* Three sizes read cleaner as a 3-up row than the shared 4-up picker grid. */
.sizes {
  grid-template-columns: repeat(3, 1fr);
}

.menuhint {
  font-size: 14px;
  line-height: 1.4;
  color: var(--muted);
  text-align: center;
  margin: 2px 0 18px;
}

/* ---- Time / mistakes / best bar ---- */
.meta {
  margin-bottom: 14px;
}
.meta b {
  color: var(--aqua-deep);
  font-size: 14px;
}
.meta__miss b {
  color: var(--berry);
}

/* ---- Fill / mark mode toggle (built from shared .pick pills) ---- */
.modes {
  width: 100%;
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.modes .pick {
  flex: 1;
  font-family: var(--font-body);
  font-weight: 700;
}

/* ---- Clues + board. The board takes whatever width is left after the row-clue
   gutter (var(--gutter)), so the clues and grid always fit together — no sideways
   scroll, even at 15×15. Cells size themselves from the board width. ---- */
.puzzle {
  display: grid;
  grid-template-columns: var(--gutter) minmax(0, 1fr); /* [row-clue gutter][board] */
  grid-template-rows: var(--band) auto; /* [col-clue band][board] */
  width: 100%;
}
.corner {
  grid-column: 1;
  grid-row: 1;
}

/* Column clues sit in a band above the board, one sub-column per board column so
   each stack of numbers lines up over its column (gap + side padding mirror the
   board's 2px gutters and 3px border). */
.colclues {
  grid-column: 2;
  grid-row: 1;
  display: grid;
  align-items: end;
  column-gap: 2px;
  padding: 0 3px;
}
.cclue {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--clue) * 0.12);
  padding-bottom: 4px;
}

/* Row clues sit in a gutter left of the board, right-aligned to each row. */
.rowclues {
  grid-column: 1;
  grid-row: 2;
  display: grid;
  row-gap: 2px;
  padding: 3px 0;
}
.rclue {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--clue) * 0.42);
  padding-right: 6px;
}

.cclue span,
.rclue span {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: var(--clue);
  line-height: 1.05;
  color: var(--ink);
}
/* Each clue number fades to grey once its own run is filled. */
.cclue span.is-done,
.rclue span.is-done {
  color: #b7a9c9;
}

/* ---- The board — a square grid; ink gridlines show through the cell gaps ---- */
.board {
  grid-column: 2;
  grid-row: 2;
  display: grid;
  aspect-ratio: 1;
  gap: 2px;
  background: var(--ink);
  border: var(--line) solid var(--ink);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: var(--pop-sm);
}
.cell {
  min-width: 0;
  min-height: 0;
  border: 0;
  padding: 0;
  display: grid;
  place-items: center;
  background: var(--paper-lit);
  transition: background 0.1s ease;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
  container-type: size;
}
.cell.is-filled {
  background: var(--grape);
  box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.16);
}
.cell.is-mark {
  background: var(--cream);
}
.cell.is-flash {
  background: var(--tile-wrong);
}
.mark {
  font-family: var(--font-mono);
  font-size: 62cqmin;
  line-height: 1;
  color: var(--muted);
}

/* ---- Solved-picture preview on the win screen ---- */
.result__board.preview {
  display: grid;
  gap: 2px;
  padding: 6px;
  background: var(--ink);
  border: var(--line) solid var(--ink);
  border-radius: 10px;
  box-shadow: var(--pop-sm);
}
.preview span {
  width: 100%;
  height: 100%;
  background: var(--paper-lit);
}
.preview span.on {
  background: var(--grape);
}

.result__title {
  animation: pikto-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes pikto-pop {
  0% {
    transform: scale(0.6);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
