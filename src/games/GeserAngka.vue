<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Geser Angka — the classic 15-puzzle (solo only). A 4×4 board holds the tiles
// 1–15 and one empty gap; the solved state is 1..15 in order with the gap in
// the bottom-right cell. We scramble by starting from solved and applying a
// large number of random legal slides, so the result is always solvable.

const bestKey = 'dusk-geser-best'
const SIZE = 4
const TOTAL = SIZE * SIZE // 16 cells; value 0 is the gap.

const phase = ref('play') // play | won
// grid[pos] = tile number (0 = gap). Solved = [1..15, 0].
const grid = ref(Array.from({ length: TOTAL }, (_, i) => (i + 1) % TOTAL))
const moves = ref(0)
const seconds = ref(0)
const running = ref(false)
const best = ref(null) // fewest moves ever
const isNewBest = ref(false)
let timer = 0

const gapIndex = computed(() => grid.value.indexOf(0))
const gapRow = computed(() => Math.floor(gapIndex.value / SIZE))
const gapCol = computed(() => gapIndex.value % SIZE)

// The 15 movable tiles, each with its board position (stable :key by number).
const tiles = computed(() => {
  const out = []
  const g = grid.value
  for (let i = 0; i < TOTAL; i++) {
    const n = g[i]
    if (n) out.push({ n, pos: i, row: Math.floor(i / SIZE), col: i % SIZE })
  }
  out.sort((a, b) => a.n - b.n)
  return out
})

function neighbors(pos) {
  const r = Math.floor(pos / SIZE)
  const c = pos % SIZE
  const out = []
  if (r > 0) out.push(pos - SIZE)
  if (r < SIZE - 1) out.push(pos + SIZE)
  if (c > 0) out.push(pos - 1)
  if (c < SIZE - 1) out.push(pos + 1)
  return out
}

// A tile is movable when it sits orthogonally next to the gap.
function canSlide(pos) {
  return neighbors(gapIndex.value).includes(pos)
}

function isSolved(g) {
  for (let i = 0; i < TOTAL - 1; i++) if (g[i] !== i + 1) return false
  return g[TOTAL - 1] === 0
}

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function startTimer() {
  stopTimer()
  timer = setInterval(() => {
    seconds.value++
  }, 1000)
}
function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = 0
  }
}

// Slide the tile at `pos` into the gap, if it is adjacent. Starts the clock on
// the first move; the move that completes the puzzle plays the win sound.
function slideAt(pos) {
  if (phase.value !== 'play' || !canSlide(pos)) return
  const gap = gapIndex.value
  const g = grid.value.slice()
  g[gap] = g[pos]
  g[pos] = 0
  grid.value = g
  moves.value++
  if (!running.value) {
    running.value = true
    startTimer()
  }
  if (isSolved(grid.value)) finish()
  else sfx.tick()
}

// Arrow convention: the arrow points the way a tile travels into the gap, so
// ArrowUp slides the tile below the gap upward, and so on.
function slideDir(dir) {
  const gr = gapRow.value
  const gc = gapCol.value
  let r = gr
  let c = gc
  if (dir === 'up') r = gr + 1
  else if (dir === 'down') r = gr - 1
  else if (dir === 'left') c = gc + 1
  else if (dir === 'right') c = gc - 1
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return
  slideAt(r * SIZE + c)
}

function finish() {
  stopTimer()
  running.value = false
  phase.value = 'won'
  sfx.win()
  isNewBest.value = false
  if (best.value == null || moves.value < best.value) {
    best.value = moves.value
    isNewBest.value = true
    try {
      localStorage.setItem(bestKey, String(moves.value))
    } catch (e) {
      /* storage may be blocked */
    }
  }
}

// Build a well-scrambled, guaranteed-solvable board: from solved, walk the gap
// around with random legal slides (never immediately undoing the last one).
function shuffle() {
  const g = Array.from({ length: TOTAL }, (_, i) => (i + 1) % TOTAL)
  let gap = TOTAL - 1
  let last = -1
  for (let i = 0; i < 400; i++) {
    const opts = neighbors(gap).filter((p) => p !== last)
    const pick = opts[Math.floor(Math.random() * opts.length)]
    g[gap] = g[pick]
    g[pick] = 0
    last = gap
    gap = pick
  }
  if (isSolved(g)) {
    const p = neighbors(gap)[0]
    g[gap] = g[p]
    g[p] = 0
  }
  grid.value = g
  moves.value = 0
  seconds.value = 0
  running.value = false
  isNewBest.value = false
  phase.value = 'play'
  stopTimer()
}

function onKeydown(e) {
  if (phase.value === 'won') {
    if (e.key === 'Enter') {
      e.preventDefault()
      shuffle()
    }
    return
  }
  const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]
  if (dir) {
    e.preventDefault() // keep arrows from scrolling the page
    slideDir(dir)
  }
}

onMounted(() => {
  try {
    const v = localStorage.getItem(bestKey)
    const n = Number(v)
    best.value = v != null && v !== '' && !Number.isNaN(n) ? n : null
  } catch (e) {
    best.value = null
  }
  window.addEventListener('keydown', onKeydown)
  shuffle()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopTimer()
})
</script>

<template>
  <div class="geser">
    <div class="panel">
      <!-- ===== Play ===== -->
      <section v-if="phase === 'play'" class="screen">
        <p class="brand">GESER<span class="brand__accent">ANGKA</span></p>
        <p class="eyebrow">SUSUN 1–15 BERURUTAN</p>

        <div class="solobar stats">
          <span>LANGKAH <b>{{ moves }}</b></span>
          <span>WAKTU <b>{{ fmt(seconds) }}</b></span>
          <span class="solobar__best">TERBAIK {{ best != null ? best + ' lgk' : '—' }}</span>
        </div>

        <div class="board" role="group" aria-label="Papan geser angka 4 kali 4">
          <span class="hole" :style="{ '--r': gapRow, '--c': gapCol }" aria-hidden="true" />
          <button
            v-for="t in tiles"
            :key="t.n"
            class="tile"
            :class="{ 'is-move': canSlide(t.pos) }"
            :style="{ '--r': t.row, '--c': t.col }"
            type="button"
            :aria-label="`Angka ${t.n}`"
            @click="slideAt(t.pos)"
          >
            <span class="tile__face">{{ t.n }}</span>
          </button>
        </div>

        <button class="cta" type="button" @click="shuffle">Acak lagi ▸</button>
      </section>

      <!-- ===== Win result ===== -->
      <section v-else class="screen result">
        <p class="brand">GESER<span class="brand__accent">ANGKA</span></p>
        <p class="eyebrow">SELESAI</p>
        <p class="result__title">Tersusun!</p>
        <p class="result__sub">{{ moves }} langkah · {{ fmt(seconds) }}</p>
        <p class="result__streak">
          TERBAIK {{ best != null ? best + ' LANGKAH' : '—'
          }}<span v-if="isNewBest"> · REKOR BARU!</span>
        </p>
        <button class="cta" type="button" @click="shuffle">Main lagi ▸</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/solobar/result come from
   src/styles.css (see docs/STYLE.md). */
.geser {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 18px 26px;
}
.brand {
  font-size: 32px;
}

/* ---- Live stats bar ---- */
.stats {
  margin: 4px 0 16px;
}
.stats b {
  font-size: 14px;
}

/* ---- Board ---- */
.board {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: color-mix(in srgb, var(--ink) 8%, var(--cream));
  border: var(--line) solid var(--ink);
  border-radius: 16px;
  box-shadow: var(--pop);
  margin-bottom: 18px;
}

/* Each tile / hole occupies one quarter of the board and is placed by its
   grid coords; changing --r/--c animates the transform for a smooth slide. */
.tile,
.hole {
  position: absolute;
  top: 0;
  left: 0;
  width: 25%;
  height: 25%;
  padding: 5px;
  transform: translate(calc(var(--c) * 100%), calc(var(--r) * 100%));
}
.tile {
  border: 0;
  background: transparent;
  cursor: default;
  transition: transform 0.16s cubic-bezier(0.34, 1.2, 0.64, 1);
}
.tile.is-move {
  cursor: pointer;
}
.tile__face {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  box-shadow: var(--pop-sm);
  font-family: var(--font-display);
  font-size: clamp(26px, 10vw, 44px);
  line-height: 1;
  color: var(--ink);
  transition: background 0.12s ease, transform 0.08s ease, box-shadow 0.08s ease;
}
/* Tiles next to the gap get a subtle movable hint (lit paper + aqua ring). */
.tile.is-move .tile__face {
  background: var(--tile-live);
  box-shadow: var(--pop-sm), inset 0 0 0 2px var(--aqua);
}
.tile.is-move:active .tile__face {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--ink), inset 0 0 0 2px var(--aqua);
}

/* The gap: a recessed hole that glides with the tiles. */
.hole {
  pointer-events: none;
  transition: transform 0.16s ease;
}
.hole::after {
  content: "";
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  background: color-mix(in srgb, var(--ink) 12%, var(--cream));
  border: 2px dashed rgba(44, 19, 56, 0.25);
  box-shadow: inset 3px 3px 0 rgba(44, 19, 56, 0.16);
}

/* A little pop as the win screen appears. */
.result__title {
  animation: geser-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes geser-pop {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
