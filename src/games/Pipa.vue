<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Pipa — a solo rotate-the-pipes / plumber puzzle. Each tile is a pipe piece
// whose openings point to some of its 4 sides. Tap a tile to rotate it 90°.
// Water floods from the SOURCE through every pair of tiles that BOTH open onto
// their shared side; get the flow to reach the DRAIN to win. Best = fewest
// rotations for that size.
//
// GENERATION guarantees solvability: we carve a random spanning tree over the
// N×N grid (randomized DFS "maze"), so every cell is connected. Each tree edge
// sets a matching opening on both of its cells, giving a fully-solvable layout
// (the source's flood reaches the whole tree, drain included). We then spin each
// tile a random 0–3 quarter-turns to scramble it — the player just has to undo
// the spins (or find any equivalent flow).

const SIZES = [5, 6, 7]

// Direction encoding: 0=up 1=right 2=down 3=left, packed as bits 1/2/4/8.
const DIRS = [0, 1, 2, 3]
const bit = (d) => 1 << d
const opp = (d) => (d + 2) % 4
// Rotate the opening mask one quarter-turn clockwise (up→right→down→left→up).
const rotateCW = (m) => ((m << 1) | (m >> 3)) & 0b1111
// Where each opening's pipe segment ends inside the 0..100 tile viewBox.
const SEG = [
  [50, 0],
  [100, 50],
  [50, 100],
  [0, 50],
]

const phase = ref('menu') // menu | play | won
const sizeIndex = ref(0)
const n = ref(5) // active board size
const tiles = ref([]) // opening mask per cell
const source = ref(-1)
const drain = ref(-1)
const rotations = ref(0)
const pressed = ref(-1)
const perfect = ref(false)
const best = ref({}) // { [size]: fewest rotations }
let pressTimer = 0

const cells = computed(() => Array.from({ length: n.value * n.value }, (_, i) => i))

// Set of every cell the water reaches from the source (recomputes live as the
// player rotates tiles).
const filled = computed(() => flood(tiles.value, n.value, source.value))

function neighborRC(r, c, d) {
  if (d === 0) return [r - 1, c]
  if (d === 1) return [r, c + 1]
  if (d === 2) return [r + 1, c]
  return [r, c - 1]
}

function dirsOf(m) {
  const out = []
  for (const d of DIRS) if (m & bit(d)) out.push(d)
  return out
}

// Flood fill from `src`: two adjacent tiles connect only if BOTH open onto the
// side they share.
function flood(t, N, src) {
  const set = new Set()
  if (src < 0 || !t.length) return set
  const stack = [src]
  set.add(src)
  while (stack.length) {
    const i = stack.pop()
    const r = Math.floor(i / N)
    const c = i % N
    for (const d of DIRS) {
      if (!(t[i] & bit(d))) continue
      const [nr, nc] = neighborRC(r, c, d)
      if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue
      const j = nr * N + nc
      if (set.has(j)) continue
      if (t[j] & bit(opp(d))) {
        set.add(j)
        stack.push(j)
      }
    }
  }
  return set
}

// The node of the tree farthest (in edges) from `src` — always a leaf, so it
// makes a natural degree-1 drain at the far end of the layout.
function farthest(t, N, src) {
  const total = N * N
  const dist = new Array(total).fill(-1)
  dist[src] = 0
  const q = [src]
  let far = src
  for (let h = 0; h < q.length; h++) {
    const i = q[h]
    if (dist[i] > dist[far]) far = i
    const r = Math.floor(i / N)
    const c = i % N
    for (const d of DIRS) {
      if (!(t[i] & bit(d))) continue
      const [nr, nc] = neighborRC(r, c, d)
      if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue
      const j = nr * N + nc
      if (dist[j] !== -1) continue
      dist[j] = dist[i] + 1
      q.push(j)
    }
  }
  return far
}

// Carve a spanning tree, pick source + drain, then scramble every tile.
function buildPuzzle(N) {
  const total = N * N
  const solved = new Array(total).fill(0)
  const deg = new Array(total).fill(0)
  const visited = new Array(total).fill(false)
  const start = Math.floor(Math.random() * total)
  visited[start] = true
  const stack = [start]
  while (stack.length) {
    const i = stack[stack.length - 1]
    const r = Math.floor(i / N)
    const c = i % N
    const nb = []
    for (const d of DIRS) {
      const [nr, nc] = neighborRC(r, c, d)
      if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue
      const j = nr * N + nc
      if (!visited[j]) nb.push([d, j])
    }
    if (!nb.length) {
      stack.pop()
      continue
    }
    const [d, j] = nb[Math.floor(Math.random() * nb.length)]
    solved[i] |= bit(d)
    solved[j] |= bit(opp(d))
    deg[i]++
    deg[j]++
    visited[j] = true
    stack.push(j)
  }
  // Source = a random leaf; drain = the far end from it.
  const leaves = []
  for (let i = 0; i < total; i++) if (deg[i] === 1) leaves.push(i)
  const src = leaves[Math.floor(Math.random() * leaves.length)]
  const dst = farthest(solved, N, src)
  // Scramble: 0–3 quarter-turns per tile.
  const t = solved.slice()
  for (let i = 0; i < total; i++) {
    const turns = Math.floor(Math.random() * 4)
    for (let k = 0; k < turns; k++) t[i] = rotateCW(t[i])
  }
  return { tiles: t, source: src, drain: dst }
}

function startGame() {
  const N = SIZES[sizeIndex.value]
  n.value = N
  let built = buildPuzzle(N)
  // Never hand out a board that's already flowing to the drain.
  let guard = 0
  while (guard < 20 && flood(built.tiles, N, built.source).has(built.drain)) {
    built = buildPuzzle(N)
    guard++
  }
  tiles.value = built.tiles
  source.value = built.source
  drain.value = built.drain
  rotations.value = 0
  perfect.value = false
  pressed.value = -1
  phase.value = 'play'
}

function rotate(i) {
  if (phase.value !== 'play') return
  tiles.value[i] = rotateCW(tiles.value[i])
  rotations.value++
  sfx.tick()
  pressed.value = i
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    if (pressed.value === i) pressed.value = -1
  }, 220)
  if (filled.value.has(drain.value)) win()
}

// A "SEMPURNA" solve: every tile is watered and no opening points at a wall or a
// closed neighbour (no leaks anywhere).
function isPerfect() {
  const t = tiles.value
  const N = n.value
  const total = N * N
  if (filled.value.size !== total) return false
  for (let i = 0; i < total; i++) {
    const r = Math.floor(i / N)
    const c = i % N
    for (const d of DIRS) {
      if (!(t[i] & bit(d))) continue
      const [nr, nc] = neighborRC(r, c, d)
      if (nr < 0 || nc < 0 || nr >= N || nc >= N) return false
      const j = nr * N + nc
      if (!(t[j] & bit(opp(d)))) return false
    }
  }
  return true
}

function win() {
  perfect.value = isPerfect()
  phase.value = 'won'
  sfx.win()
  const N = n.value
  const prev = best.value[N]
  if (prev == null || rotations.value < prev) {
    best.value = { ...best.value, [N]: rotations.value }
    try {
      localStorage.setItem(`dusk-pipa-best-${N}`, String(rotations.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory best */
    }
  }
}

function toMenu() {
  phase.value = 'menu'
}

function tileClass(i) {
  return {
    'is-filled': filled.value.has(i),
    'is-src': i === source.value,
    'is-drain': i === drain.value,
    'is-press': pressed.value === i,
  }
}

onMounted(() => {
  const loaded = {}
  for (const s of SIZES) {
    try {
      const v = localStorage.getItem(`dusk-pipa-best-${s}`)
      if (v != null) loaded[s] = Number(v)
    } catch (e) {
      /* storage may be blocked */
    }
  }
  best.value = loaded
})
onBeforeUnmount(() => {
  clearTimeout(pressTimer)
})
</script>

<template>
  <div class="pipa">
    <div class="panel">
      <!-- ===== Menu (size picker) ===== -->
      <section v-if="phase === 'menu'" class="screen">
        <p class="brand">PI<span class="brand__accent">PA</span></p>
        <p class="eyebrow">SAMBUNGKAN AIRNYA</p>

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

        <p class="hint">
          Ketuk pipa buat memutarnya. Alirkan air dari sumber hijau sampai ke pembuangan.
        </p>

        <button class="cta" type="button" @click="startGame">Mulai ▸</button>
      </section>

      <!-- ===== Play ===== -->
      <section v-else-if="phase === 'play'" class="screen play">
        <div class="topbar">
          <button class="mini" type="button" @click="toMenu">← Ukuran</button>
          <span class="status">{{ n }}×{{ n }}</span>
          <button class="mini" type="button" @click="startGame">Baru</button>
        </div>

        <div class="solobar meta">
          <span>PUTAR <b>{{ rotations }}</b></span>
          <span class="solobar__best">TERBAIK {{ best[n] == null ? '—' : best[n] }}</span>
        </div>

        <div class="board" :style="{ '--n': n }">
          <button
            v-for="i in cells"
            :key="i"
            class="tile"
            :class="tileClass(i)"
            type="button"
            :aria-label="'Pipa ' + (i + 1)"
            @click="rotate(i)"
          >
            <svg class="pipe" viewBox="0 0 100 100" aria-hidden="true">
              <line
                v-for="d in dirsOf(tiles[i])"
                :key="'o' + d"
                class="pipe__out"
                x1="50"
                y1="50"
                :x2="SEG[d][0]"
                :y2="SEG[d][1]"
              />
              <line
                v-for="d in dirsOf(tiles[i])"
                :key="'f' + d"
                class="pipe__in"
                x1="50"
                y1="50"
                :x2="SEG[d][0]"
                :y2="SEG[d][1]"
              />
              <circle class="hub__out" cx="50" cy="50" r="16" />
              <circle class="hub__in" cx="50" cy="50" r="10" />

              <!-- endpoint markers -->
              <circle v-if="i === source" class="src-mark" cx="50" cy="50" r="15" />
              <template v-else-if="i === drain">
                <circle class="drain-ring" cx="50" cy="50" r="16" />
                <circle class="drain-dot" cx="50" cy="50" r="7" />
              </template>
            </svg>
          </button>
        </div>
      </section>

      <!-- ===== Result ===== -->
      <section v-else class="screen result">
        <p class="brand">PI<span class="brand__accent">PA</span></p>
        <p class="result__title">Air Mengalir!</p>
        <p class="result__sub">{{ n }}×{{ n }} · {{ rotations }} putaran</p>
        <p class="result__streak">
          TERBAIK {{ best[n] }}<span v-if="perfect"> · SEMPURNA</span>
        </p>
        <button class="cta" type="button" @click="startGame">Main lagi ▸</button>
        <button class="cta cta--ghost" type="button" @click="toMenu">Ganti ukuran</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/topbar/status/field/
   picker/solobar/result come from src/styles.css (see docs/STYLE.md). */
.pipa {
  --pipe-dry: #b7a3d1; /* dry pipe lilac */
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
  -webkit-tap-highlight-color: transparent;
}
/* Three sizes read cleaner as a 3-up row than the shared 4-up picker grid. */
.sizes {
  grid-template-columns: repeat(3, 1fr);
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

/* Short menu hint. */
.hint {
  margin: -6px 0 18px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--muted);
  text-align: center;
}

/* ---- Rotations / best bar ---- */
.meta {
  margin-bottom: 14px;
}
.meta b {
  color: var(--aqua-deep);
  font-size: 14px;
}

/* ---- The pipe board ---- */
.board {
  width: 100%;
  max-width: 420px;
  aspect-ratio: 1;
  margin: 2px auto 4px;
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  grid-auto-rows: 1fr;
  border: var(--line) solid var(--ink);
  border-radius: 16px;
  overflow: hidden;
  background: var(--paper-lit);
  box-shadow: var(--pop);
}

.tile {
  position: relative;
  min-width: 0;
  padding: 0;
  border: 0;
  background: var(--paper-lit);
  box-shadow: inset 0 0 0 1px rgba(44, 19, 56, 0.09);
  cursor: pointer;
  transition: background 0.2s ease;
}
/* Watered tiles glow faintly aqua behind their pipes. */
.tile.is-filled {
  background: color-mix(in srgb, var(--aqua) 15%, var(--paper-lit));
}
.tile:active .pipe {
  transform: scale(0.94);
}

.pipe {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: 50% 50%;
}
/* A tapped tile spins its (already-rotated) pipe into place. */
.tile.is-press .pipe {
  animation: pipa-turn 0.2s ease;
}

/* Ink-outlined pipe: a wide dark stroke underneath, the coloured bore on top. */
.pipe__out {
  stroke: var(--ink);
  stroke-width: 30;
  stroke-linecap: round;
}
.pipe__in {
  stroke: var(--pipe-dry);
  stroke-width: 17;
  stroke-linecap: round;
  transition: stroke 0.25s ease;
}
.hub__out {
  fill: var(--ink);
}
.hub__in {
  fill: var(--pipe-dry);
  transition: fill 0.25s ease;
}
.tile.is-filled .pipe__in {
  stroke: var(--aqua);
}
.tile.is-filled .hub__in {
  fill: var(--aqua);
}

/* Source = a green inlet dot; drain = a bullseye target that goes green on flow. */
.src-mark {
  fill: #35c46b;
  stroke: var(--ink);
  stroke-width: 4;
}
.drain-ring {
  fill: var(--cream);
  stroke: var(--ink);
  stroke-width: 4;
}
.drain-dot {
  fill: var(--berry);
  transition: fill 0.25s ease;
}
.tile.is-drain.is-filled .drain-dot {
  fill: #35c46b;
}

/* ---- Result ---- */
.result .brand {
  margin-bottom: 12px;
}
.result .cta--ghost {
  margin-top: 10px;
}

@keyframes pipa-turn {
  from {
    transform: rotate(-90deg);
  }
}
</style>
