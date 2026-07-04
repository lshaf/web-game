<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Permata — a solo Match-3. Tap a gem, then an orthogonally adjacent one to
// swap. A swap is only allowed if it forms a line of 3+ of one colour; matched
// runs clear, gems above fall, empty cells refill from the top, and any new
// matches cascade (with a growing bonus) until the board is stable. You get a
// fixed number of moves; when they run out we tally the score.

const SIZE = 8
const CELLS = SIZE * SIZE
const TYPES = 6
const MOVES = 20
const CLEAR_MS = 280 // pop/fade before a run is removed
const FALL_MS = 240 // slide/refill settle time
const bestKey = 'dusk-permata-best'

// Indonesian colour names — for screen readers and extra (non-colour) clarity.
const NAMES = ['toska', 'merah', 'kuning', 'ungu', 'oranye', 'hijau']

const phase = ref('play') // play | result
const grid = ref([]) // (gem | null)[64] — gem = { id, type }
const selected = ref(-1)
const clearing = ref(new Set()) // indices mid-pop
const busy = ref(false)
const score = ref(0)
const movesLeft = ref(MOVES)
const best = ref(loadBest())
const newBest = ref(false)
const note = ref('')

let nextId = 1
let alive = true
let stepTimer = 0
let noteTimer = 0

function loadBest() {
  try {
    return Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    return 0
  }
}
function saveBest() {
  try {
    localStorage.setItem(bestKey, String(best.value))
  } catch (e) {
    /* storage may be blocked; keep in-memory */
  }
}

function sleep(ms) {
  return new Promise((res) => {
    stepTimer = setTimeout(res, ms)
  })
}

const rnd = () => Math.floor(Math.random() * TYPES)

// ---- Pure board logic (operates on a flat array of type values) ----

// Every index that belongs to a horizontal or vertical run of 3+ same types.
function findMatches(t) {
  const m = new Set()
  for (let r = 0; r < SIZE; r++) {
    let run = 1
    for (let c = 1; c < SIZE; c++) {
      const a = t[r * SIZE + c]
      if (a != null && a === t[r * SIZE + c - 1]) run++
      else {
        if (run >= 3) for (let k = c - run; k < c; k++) m.add(r * SIZE + k)
        run = 1
      }
    }
    if (run >= 3) for (let k = SIZE - run; k < SIZE; k++) m.add(r * SIZE + k)
  }
  for (let c = 0; c < SIZE; c++) {
    let run = 1
    for (let r = 1; r < SIZE; r++) {
      const a = t[r * SIZE + c]
      if (a != null && a === t[(r - 1) * SIZE + c]) run++
      else {
        if (run >= 3) for (let k = r - run; k < r; k++) m.add(k * SIZE + c)
        run = 1
      }
    }
    if (run >= 3) for (let k = SIZE - run; k < SIZE; k++) m.add(k * SIZE + c)
  }
  return m
}

// Would swapping a and b create at least one match?
function makesMatch(t, a, b) {
  const s = t.slice()
  const tmp = s[a]
  s[a] = s[b]
  s[b] = tmp
  return findMatches(s).size > 0
}

// Is any legal (match-making) swap available anywhere?
function hasAnyMove(t) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const i = r * SIZE + c
      if (c < SIZE - 1 && makesMatch(t, i, i + 1)) return true
      if (r < SIZE - 1 && makesMatch(t, i, i + SIZE)) return true
    }
  }
  return false
}

// A fresh board with no pre-existing matches and at least one valid move.
function makeTypes() {
  while (true) {
    const t = new Array(CELLS)
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const i = r * SIZE + c
        let v
        let guard = 0
        do {
          v = rnd()
          guard++
        } while (
          guard < 30 &&
          ((c >= 2 && t[i - 1] === v && t[i - 2] === v) ||
            (r >= 2 && t[i - SIZE] === v && t[i - 2 * SIZE] === v))
        )
        t[i] = v
      }
    }
    if (findMatches(t).size === 0 && hasAnyMove(t)) return t
  }
}

function buildGrid(types) {
  return types.map((type) => ({ id: nextId++, type }))
}

const curTypes = () => grid.value.map((g) => (g ? g.type : null))

// Drop existing gems down each column and spawn new ones on top.
function applyGravity() {
  const g = grid.value
  for (let c = 0; c < SIZE; c++) {
    const stack = []
    for (let r = SIZE - 1; r >= 0; r--) {
      const cell = g[r * SIZE + c]
      if (cell) stack.push(cell)
    }
    let r = SIZE - 1
    let k = 0
    for (; k < stack.length; k++, r--) g[r * SIZE + c] = stack[k]
    for (; r >= 0; r--) g[r * SIZE + c] = { id: nextId++, type: rnd() }
  }
}

// ---- Interaction ----

function adjacent(a, b) {
  const ra = Math.floor(a / SIZE)
  const ca = a % SIZE
  const rb = Math.floor(b / SIZE)
  const cb = b % SIZE
  return (ra === rb && Math.abs(ca - cb) === 1) || (ca === cb && Math.abs(ra - rb) === 1)
}

function swapCells(a, b) {
  const g = grid.value
  const tmp = g[a]
  g[a] = g[b]
  g[b] = tmp
}

function tapGem(idx) {
  if (busy.value || phase.value !== 'play') return
  if (selected.value === -1) {
    selected.value = idx
    return
  }
  if (selected.value === idx) {
    selected.value = -1
    return
  }
  if (adjacent(selected.value, idx)) {
    trySwap(selected.value, idx)
    return
  }
  selected.value = idx // tapped a far gem — move the selection there
}

async function trySwap(a, b) {
  busy.value = true
  selected.value = -1
  swapCells(a, b)
  if (findMatches(curTypes()).size === 0) {
    // Illegal — let the visual swap land, shake, then swap back.
    sfx.wrong()
    await sleep(200)
    if (!alive) return
    note.value = ''
    shakeBoard()
    await sleep(260)
    if (!alive) return
    swapCells(a, b)
    await sleep(180)
    if (!alive) return
    busy.value = false
    return
  }
  sfx.tick()
  movesLeft.value--
  await resolveBoard()
  if (!alive) return
  if (movesLeft.value <= 0) endRound()
  else if (!hasAnyMove(curTypes())) reshuffle()
  busy.value = false
}

// Clear → gravity → refill → repeat, with a cascade bonus each round.
async function resolveBoard() {
  let cascade = 0
  while (alive) {
    const matched = findMatches(curTypes())
    if (matched.size === 0) break
    cascade++
    score.value += matched.size * 10 * cascade
    clearing.value = new Set(matched)
    sfx.tick()
    await sleep(CLEAR_MS)
    if (!alive) return
    matched.forEach((i) => {
      grid.value[i] = null
    })
    applyGravity()
    clearing.value = new Set()
    if (cascade >= 2) flashNote('Rantai ×' + cascade + '!')
    await sleep(FALL_MS)
    if (!alive) return
  }
}

function reshuffle() {
  grid.value = buildGrid(makeTypes())
  selected.value = -1
  flashNote('Tak ada langkah — diacak ulang')
}

function isClearing(idx) {
  return clearing.value.has(idx)
}

const shake = ref(false)
function shakeBoard() {
  shake.value = false
  requestAnimationFrame(() => {
    shake.value = true
  })
}

function flashNote(text) {
  note.value = text
  clearTimeout(noteTimer)
  noteTimer = setTimeout(() => {
    note.value = ''
  }, 1300)
}

function endRound() {
  phase.value = 'result'
  selected.value = -1
  busy.value = false
  newBest.value = score.value > best.value
  if (newBest.value) {
    best.value = score.value
    saveBest()
  }
  sfx.win()
}

function startGame() {
  clearTimeout(stepTimer)
  clearTimeout(noteTimer)
  grid.value = buildGrid(makeTypes())
  selected.value = -1
  clearing.value = new Set()
  score.value = 0
  movesLeft.value = MOVES
  newBest.value = false
  note.value = ''
  busy.value = false
  phase.value = 'play'
}

startGame()

onMounted(() => {
  best.value = loadBest()
})
onBeforeUnmount(() => {
  alive = false
  clearTimeout(stepTimer)
  clearTimeout(noteTimer)
})
</script>

<template>
  <div class="permata">
    <div class="panel">
      <!-- ===== Play ===== -->
      <section v-if="phase === 'play'" class="screen">
        <p class="brand">PER<span class="brand__accent">MATA</span></p>
        <p class="eyebrow">TUKAR &amp; COCOKKAN 3</p>

        <div class="solobar meta">
          <span>SKOR <b>{{ score }}</b></span>
          <span>LANGKAH <b :class="{ 'is-low': movesLeft <= 5 }">{{ movesLeft }}</b></span>
          <span class="solobar__best">TERBAIK {{ best }}</span>
        </div>

        <div class="board" :class="{ shake }">
          <button
            v-for="(gem, idx) in grid"
            :key="gem.id"
            class="gem"
            :class="{ 'is-sel': selected === idx }"
            :style="{ '--c': idx % SIZE, '--r': Math.floor(idx / SIZE) }"
            type="button"
            :disabled="busy"
            :aria-label="'Permata ' + NAMES[gem.type]"
            @click="tapGem(idx)"
          >
            <span class="gem__body" :class="['g' + gem.type, { 'is-pop': isClearing(idx) }]">
              <span class="gem__pip" />
            </span>
          </button>
          <span v-if="note" class="note" aria-live="polite">{{ note }}</span>
        </div>

        <button class="cta" type="button" @click="startGame">Ulang</button>
      </section>

      <!-- ===== Result ===== -->
      <section v-else class="screen result">
        <p class="brand">PER<span class="brand__accent">MATA</span></p>
        <p class="eyebrow">TUKAR &amp; COCOKKAN 3</p>
        <p class="result__title">Selesai!</p>
        <p class="result__sub">Skor akhir <b>{{ score }}</b></p>
        <p class="result__streak">
          TERBAIK {{ best }}<span v-if="newBest"> · REKOR BARU!</span>
        </p>
        <button class="cta" type="button" @click="startGame">Main lagi ▸</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/solobar/result come from
   src/styles.css (see docs/STYLE.md). */
.permata {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: 4px max(10px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(10px, env(safe-area-inset-left));
}
.panel {
  padding: 20px 12px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* Give the column a definite width so the board's width:100% fills the panel
   instead of collapsing to the content width. */
.screen {
  width: 100%;
}
.brand {
  font-size: 34px;
}

/* ---- Score / moves / best bar ---- */
.meta {
  margin-bottom: 14px;
}
.meta b {
  font-size: 14px;
}
.meta b.is-low {
  color: var(--berry);
}

/* ---- Board ---- */
.board {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border: var(--line) solid var(--ink);
  border-radius: 16px;
  background: #f4ecff;
  box-shadow: var(--pop-sm);
  overflow: hidden;
  margin-bottom: 18px;
  touch-action: manipulation;
}
.board.shake {
  animation: permata-shake 0.4s ease;
}

/* Each gem is absolutely placed; moving it between array slots changes --c/--r
   so the transform (and thus the tile) slides — that is the falling motion. */
.gem {
  position: absolute;
  top: 0;
  left: 0;
  width: 12.5%;
  height: 12.5%;
  padding: 0;
  border: 0;
  background: transparent;
  transform: translate(calc(var(--c) * 100%), calc(var(--r) * 100%));
  transition: transform 0.22s cubic-bezier(0.34, 1.15, 0.64, 1);
  will-change: transform;
}
.gem:disabled {
  cursor: default;
}

.gem__body {
  position: absolute;
  inset: 7%;
  border-radius: 30%;
  border: 2.5px solid var(--ink);
  background: linear-gradient(158deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 46%),
    var(--gem);
  box-shadow: inset 0 -4px 0 rgba(44, 19, 56, 0.16);
  animation: permata-drop 0.26s ease both;
}
/* Soft top highlight glint. */
.gem__body::before {
  content: '';
  position: absolute;
  top: 12%;
  left: 16%;
  width: 34%;
  height: 22%;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.72);
}
.gem.is-sel .gem__body {
  box-shadow: 0 0 0 3px var(--sun), 0 0 0 5.5px var(--ink), inset 0 -4px 0 rgba(44, 19, 56, 0.16);
  animation: permata-sel 0.85s ease-in-out infinite;
}
.gem__body.is-pop {
  animation: permata-pop 0.28s ease-out forwards;
  z-index: 2;
}

/* Colours (on-palette tokens). */
.g0 {
  --gem: var(--aqua);
}
.g1 {
  --gem: var(--berry);
}
.g2 {
  --gem: var(--sun);
}
.g3 {
  --gem: var(--grape);
}
.g4 {
  --gem: var(--sun-core);
}
.g5 {
  --gem: var(--aqua-deep);
}

/* A distinct inner glyph per colour so they read apart without relying on hue. */
.gem__pip {
  position: absolute;
  inset: 31%;
  background: var(--ink);
  opacity: 0.82;
}
.g0 .gem__pip {
  clip-path: circle(50% at 50% 50%);
}
.g1 .gem__pip {
  clip-path: polygon(50% 2%, 98% 50%, 50% 98%, 2% 50%);
}
.g2 .gem__pip {
  clip-path: polygon(50% 4%, 94% 92%, 6% 92%);
}
.g3 .gem__pip {
  border-radius: 22%;
}
.g4 .gem__pip {
  clip-path: polygon(
    36% 4%,
    64% 4%,
    64% 36%,
    96% 36%,
    96% 64%,
    64% 64%,
    64% 96%,
    36% 96%,
    36% 64%,
    4% 64%,
    4% 36%,
    36% 36%
  );
}
.g5 .gem__pip {
  clip-path: polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%);
}

/* ---- Transient banner (cascade / reshuffle) ---- */
.note {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  padding: 6px 14px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--cream);
  background: var(--ink);
  border-radius: 999px;
  box-shadow: var(--pop-sm);
  pointer-events: none;
  animation: permata-note 0.25s ease;
}

/* ---- Result ---- */
.result {
  width: 100%;
}
.result__sub b {
  color: var(--aqua-deep);
}

@keyframes permata-drop {
  0% {
    transform: translateY(-16%) scale(0.55);
    opacity: 0;
  }
  60% {
    opacity: 1;
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
@keyframes permata-pop {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.22);
  }
  100% {
    transform: scale(0);
    opacity: 0;
  }
}
@keyframes permata-sel {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(0.92);
  }
}
@keyframes permata-note {
  from {
    opacity: 0;
    transform: translate(-50%, 8px);
  }
}
@keyframes permata-shake {
  10%,
  90% {
    transform: translateX(-2px);
  }
  30%,
  70% {
    transform: translateX(4px);
  }
  50% {
    transform: translateX(-6px);
  }
}
</style>
