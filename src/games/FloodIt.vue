<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Flood-It — single player. A 12×12 mosaic of 6 colours. The flooded region
// grows from the top-left cell: every move repaints the whole region one colour
// and swallows any orthogonally-adjacent cells that now match. Make the entire
// board a single colour within the move limit to win.

const N = 12
const LIMIT = 25
const bestKey = 'dusk-flood-best'
const CELLS = Array.from({ length: N * N }, (_, i) => i)

// On-palette swatches (referenced as tokens so they track the theme).
const COLORS = [
  'var(--aqua)',
  'var(--berry)',
  'var(--sun)',
  'var(--grape)',
  'var(--sun-core)',
  'var(--aqua-deep)',
]

const phase = ref('play') // play | won | lost
const grid = ref([]) // int[N*N], each 0..5
const moves = ref(0)
const best = ref(null)

// The set of cells reachable from the top-left through same-coloured neighbours.
const flooded = computed(() => new Set(region(grid.value)))
const current = computed(() => grid.value[0])
const movesLeft = computed(() => LIMIT - moves.value)
const captured = computed(() => Math.round((flooded.value.size / (N * N)) * 100))

// Flood-fill from cell 0, collecting every cell of the top-left colour.
function region(g) {
  const target = g[0]
  const seen = new Uint8Array(N * N)
  const stack = [0]
  const out = [0]
  seen[0] = 1
  while (stack.length) {
    const idx = stack.pop()
    const r = (idx / N) | 0
    const c = idx % N
    if (r > 0) tryAdd(g, seen, stack, out, idx - N, target)
    if (r < N - 1) tryAdd(g, seen, stack, out, idx + N, target)
    if (c > 0) tryAdd(g, seen, stack, out, idx - 1, target)
    if (c < N - 1) tryAdd(g, seen, stack, out, idx + 1, target)
  }
  return out
}
function tryAdd(g, seen, stack, out, j, target) {
  if (!seen[j] && g[j] === target) {
    seen[j] = 1
    stack.push(j)
    out.push(j)
  }
}

function newBoard() {
  let g
  do {
    g = Array.from({ length: N * N }, () => (Math.random() * COLORS.length) | 0)
  } while (region(g).length === N * N) // never start already solved
  grid.value = g
  moves.value = 0
  phase.value = 'play'
}

function pick(ci) {
  if (phase.value !== 'play' || ci === grid.value[0]) return
  moves.value++
  sfx.tick()
  const g = grid.value.slice()
  for (const idx of flooded.value) g[idx] = ci
  grid.value = g

  const grown = region(g)
  if (grown.length === N * N) {
    phase.value = 'won'
    sfx.win()
    if (best.value == null || moves.value < best.value) {
      best.value = moves.value
      try {
        localStorage.setItem(bestKey, String(best.value))
      } catch (e) {
        /* storage may be blocked */
      }
    }
  } else if (moves.value >= LIMIT) {
    phase.value = 'lost'
    sfx.lose()
  }
}

function onKeydown(e) {
  if (phase.value !== 'play') {
    if (e.key === 'Enter') {
      e.preventDefault()
      newBoard()
    }
    return
  }
  const k = e.key
  if (k >= '1' && k <= '6') {
    e.preventDefault()
    pick(Number(k) - 1)
  } else if (k === 'r' || k === 'R') {
    e.preventDefault()
    newBoard()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  try {
    const raw = localStorage.getItem(bestKey)
    best.value = raw == null ? null : Number(raw)
  } catch (e) {
    best.value = null
  }
  newBoard()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="flood">
    <div class="panel">
      <!-- ===== Play ===== -->
      <section v-if="phase === 'play'" class="screen play">
        <p class="brand">FLOOD<span class="brand__accent">IT</span></p>
        <p class="eyebrow">SATUKAN SEMUA WARNA</p>

        <div class="solobar meta">
          <span>SISA <b>{{ movesLeft }}</b>/{{ LIMIT }}</span>
          <span>DIKUASAI <b>{{ captured }}%</b></span>
          <span class="solobar__best">TERBAIK {{ best == null ? '—' : best }}</span>
        </div>

        <div class="board" role="img" aria-label="Papan Flood-It">
          <span
            v-for="idx in CELLS"
            :key="idx"
            class="cell"
            :class="{ 'is-flood': flooded.has(idx) }"
            :style="{ background: COLORS[grid[idx]] }"
          />
        </div>

        <div class="swatches">
          <button
            v-for="(col, i) in COLORS"
            :key="i"
            class="swatch"
            :class="{ 'is-current': current === i }"
            type="button"
            :style="{ background: col }"
            :disabled="current === i"
            :aria-label="'Pilih warna ' + (i + 1)"
            @click="pick(i)"
          />
        </div>

        <button class="cta" type="button" @click="newBoard">Acak lagi ▸</button>
      </section>

      <!-- ===== Result ===== -->
      <section v-else class="screen result">
        <p class="result__title" :class="{ 'is-lost': phase === 'lost' }">
          {{ phase === 'won' ? 'Menang!' : 'Kehabisan Langkah' }}
        </p>
        <p class="result__sub">
          {{
            phase === 'won'
              ? 'Semua warna disatukan dalam ' + moves + ' langkah'
              : 'Papan belum jadi satu warna'
          }}
        </p>
        <p class="result__streak">TERBAIK {{ best == null ? '—' : best }} LANGKAH</p>
        <button class="cta" type="button" @click="newBoard">Main lagi ▸</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/solobar/result come from
   src/styles.css (see docs/STYLE.md). */
.flood {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 20px 16px 24px;
}
.brand {
  font-size: 34px;
}
.play {
  width: 100%;
}

/* ---- Moves / captured / best bar ---- */
.meta {
  margin-bottom: 14px;
}
.meta b {
  font-size: 14px;
}

/* ---- Mosaic board ---- */
.board {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--pop-sm);
  margin-bottom: 16px;
}
.cell {
  aspect-ratio: 1;
  /* Hairline seams keep the mosaic crisp without stealing from the colour. */
  box-shadow: inset -1px -1px 0 rgba(44, 19, 56, 0.12);
  transition: background 0.16s ease;
}
/* The captured blob gets a soft cream inner ring so its edge stays readable. */
.cell.is-flood {
  box-shadow: inset 0 0 0 1.5px rgba(255, 243, 223, 0.55);
}

/* ---- Colour swatches ---- */
.swatches {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  margin-bottom: 4px;
}
.swatch {
  aspect-ratio: 1;
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  box-shadow: var(--pop-sm);
  padding: 0;
  transition: transform 0.1s ease, box-shadow 0.1s ease, opacity 0.1s ease;
}
.swatch:hover:not(:disabled),
.swatch:focus-visible:not(:disabled) {
  transform: translate(-2px, -2px);
  box-shadow: 5px 5px 0 var(--ink);
}
.swatch:active:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--ink);
}
/* The colour you already hold: dimmed, disabled, and gently pulsing. */
.swatch.is-current {
  opacity: 0.42;
  cursor: not-allowed;
  animation: flood-pop 1.3s ease-in-out infinite;
}

@keyframes flood-pop {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.07);
  }
}
</style>
