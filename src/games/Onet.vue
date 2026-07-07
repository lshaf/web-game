<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Onet (a.k.a. Pikachu) — clear the board by matching pairs of identical tiles
// that can be joined by a path with at most two turns, routed through empty
// cells and the one-cell border around the grid. Run out of moves and the board
// reshuffles so it is always finishable. Timed; best time and clears persist.

const SOLVED_KEY = 'dusk-onet-solved'
const BEST_KEY = 'dusk-onet-best'

const SYMBOLS = [
  '🍎', '🍊', '🍋', '🍇', '🍓', '🍉', '🍑', '🍒', '🥝', '🍍',
  '🥑', '🍅', '🌽', '🥕', '🍄', '🌶️', '🍆', '🥦', '🧀', '🍞',
  '🐶', '🐱', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐷',
]

const LEVELS = [
  { key: 'mudah', label: 'Mudah', rows: 6, cols: 6 },
  { key: 'sedang', label: 'Sedang', rows: 7, cols: 8 },
  { key: 'sulit', label: 'Sulit', rows: 9, cols: 8 },
]

const phase = ref('setup') // setup | play | won
const sel = ref(LEVELS[0])
const level = ref(LEVELS[0])
const rows = ref(0)
const cols = ref(0)
const cells = ref([]) // rows×cols, symbol index or -1 (cleared)
const picked = ref(null) // { r, c } or null
const hintPair = ref([]) // two {r,c} flashed by Petunjuk
const left = ref(0) // tiles remaining
const elapsed = ref(0)
const solvedCount = ref(0)
const bestTime = ref(0)

let timer = 0
let startAt = 0
let hintTimer = 0

const timeLabel = computed(() => fmt(elapsed.value))
function fmt(s) {
  const m = Math.floor(s / 60)
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

// --- Path finding (≤ 2 turns through empty cells + the border ring) ---------

// Passable = the one-cell border ring, any cleared inner cell, or an endpoint.
function passable(r, c, a, b) {
  if (r < -1 || r > rows.value || c < -1 || c > cols.value) return false
  if (r === -1 || r === rows.value || c === -1 || c === cols.value) return true
  if ((r === a.r && c === a.c) || (r === b.r && c === b.c)) return true
  return cells.value[r][c] === -1
}

const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

function canConnect(a, b) {
  const best = {}
  const q = []
  for (let d = 0; d < 4; d++) {
    const nr = a.r + DIRS[d][0]
    const nc = a.c + DIRS[d][1]
    if (passable(nr, nc, a, b)) {
      q.push({ r: nr, c: nc, dir: d, turns: 0 })
      best[nr + ',' + nc + ',' + d] = 0
    }
  }
  while (q.length) {
    q.sort((x, y) => x.turns - y.turns)
    const cur = q.shift()
    if (cur.r === b.r && cur.c === b.c) return true
    if (cur.turns >= 2) continue
    for (let d = 0; d < 4; d++) {
      const nt = cur.turns + (d === cur.dir ? 0 : 1)
      if (nt > 2) continue
      const nr = cur.r + DIRS[d][0]
      const nc = cur.c + DIRS[d][1]
      if (!passable(nr, nc, a, b)) continue
      const key = nr + ',' + nc + ',' + d
      if (best[key] === undefined || best[key] > nt) {
        best[key] = nt
        q.push({ r: nr, c: nc, dir: d, turns: nt })
      }
    }
  }
  return false
}

// Every tile still on the board, grouped so we only test same-symbol pairs.
function remainingBySymbol() {
  const groups = new Map()
  for (let r = 0; r < rows.value; r++) {
    for (let c = 0; c < cols.value; c++) {
      const s = cells.value[r][c]
      if (s === -1) continue
      if (!groups.has(s)) groups.set(s, [])
      groups.get(s).push({ r, c })
    }
  }
  return groups
}

// The first connectable same-symbol pair, or null if the board is deadlocked.
function findMove() {
  for (const list of remainingBySymbol().values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (canConnect(list[i], list[j])) return [list[i], list[j]]
      }
    }
  }
  return null
}

// --- Board setup ------------------------------------------------------------

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

function layout(symbolList) {
  const grid = Array.from({ length: rows.value }, () => Array(cols.value).fill(-1))
  let k = 0
  for (let r = 0; r < rows.value; r++) {
    for (let c = 0; c < cols.value; c++) grid[r][c] = symbolList[k++]
  }
  return grid
}

// Deal a fresh board that is guaranteed to have at least one legal move.
function deal() {
  rows.value = level.value.rows
  cols.value = level.value.cols
  const total = rows.value * cols.value
  const pairs = total / 2
  const list = []
  for (let i = 0; i < pairs; i++) {
    const s = SYMBOLS[i % SYMBOLS.length]
    // store the display index into SYMBOLS so identical glyphs compare equal
    list.push(i % SYMBOLS.length, i % SYMBOLS.length)
  }
  let grid
  do {
    shuffle(list)
    cells.value = layout(list)
    grid = cells.value
  } while (!findMove())
  left.value = total
  picked.value = null
  hintPair.value = []
  phase.value = 'play'
}

function start() {
  level.value = sel.value
  deal()
  startTimer()
}
function toSetup() {
  stopTimer()
  phase.value = 'setup'
}

function reshuffle() {
  // Collect remaining symbols, drop them back onto the filled cells, and keep
  // trying until at least one move exists.
  const spots = []
  const syms = []
  for (let r = 0; r < rows.value; r++) {
    for (let c = 0; c < cols.value; c++) {
      if (cells.value[r][c] !== -1) {
        spots.push({ r, c })
        syms.push(cells.value[r][c])
      }
    }
  }
  if (spots.length < 2) return
  do {
    shuffle(syms)
    spots.forEach((p, i) => (cells.value[p.r][p.c] = syms[i]))
  } while (!findMove())
  picked.value = null
  hintPair.value = []
  sfx.tick()
}

// --- Interaction ------------------------------------------------------------

function tap(r, c) {
  if (phase.value !== 'play') return
  if (cells.value[r][c] === -1) return
  hintPair.value = []
  if (!picked.value) {
    picked.value = { r, c }
    sfx.tick()
    return
  }
  const p = picked.value
  if (p.r === r && p.c === c) {
    picked.value = null
    return
  }
  if (cells.value[p.r][p.c] === cells.value[r][c] && canConnect(p, { r, c })) {
    cells.value[p.r][p.c] = -1
    cells.value[r][c] = -1
    left.value -= 2
    picked.value = null
    sfx.tick()
    if (left.value === 0) {
      win()
    } else if (!findMove()) {
      reshuffle()
    }
  } else {
    picked.value = { r, c } // wrong / unreachable — move the pick here
    sfx.wrong()
  }
}

function hint() {
  if (phase.value !== 'play') return
  const m = findMove()
  if (!m) {
    reshuffle()
    return
  }
  hintPair.value = m
  clearTimeout(hintTimer)
  hintTimer = setTimeout(() => (hintPair.value = []), 1200)
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

function glyph(r, c) {
  const s = cells.value[r][c]
  return s === -1 ? '' : SYMBOLS[s]
}
function isPicked(r, c) {
  return picked.value && picked.value.r === r && picked.value.c === c
}
function isHint(r, c) {
  return hintPair.value.some((p) => p.r === r && p.c === c)
}

onMounted(() => {
  try {
    solvedCount.value = Number(localStorage.getItem(SOLVED_KEY)) || 0
    bestTime.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch (e) {
    solvedCount.value = 0
    bestTime.value = 0
  }
})
onBeforeUnmount(() => {
  stopTimer()
  clearTimeout(hintTimer)
})
</script>

<template>
  <div class="onet">
    <div class="panel">
      <section class="screen">
        <template v-if="phase === 'setup'">
          <p class="brand">O<span class="brand__accent">NET</span></p>
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
          <p class="setup__info">
            {{ sel.rows }}×{{ sel.cols }} ubin · SELESAI {{ solvedCount }}
          </p>
          <button class="cta" type="button" @click="start">Mulai ▸</button>
        </template>

        <template v-else>
          <div class="backbar">
            <button class="mini" type="button" @click="toSetup">← Tingkat</button>
          </div>
          <p class="brand brand--sm">O<span class="brand__accent">NET</span></p>

          <div class="solobar hud">
            <span>WAKTU <b>{{ timeLabel }}</b></span>
            <span>SISA <b>{{ left }}</b></span>
            <span class="solobar__best">SELESAI {{ solvedCount }}</span>
          </div>

          <div
            class="board"
            :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)` }"
          >
            <template v-for="(row, r) in cells">
              <button
                v-for="(s, c) in row"
                :key="r + '-' + c"
                class="tile"
                type="button"
                :class="{
                  'is-empty': s === -1,
                  'is-picked': isPicked(r, c),
                  'is-hint': isHint(r, c),
                }"
                :disabled="s === -1"
                @click="tap(r, c)"
              >
                {{ glyph(r, c) }}
              </button>
            </template>
          </div>

          <template v-if="phase === 'play'">
            <div class="tools">
              <button class="mini" type="button" @click="hint">Petunjuk</button>
              <button class="mini" type="button" @click="reshuffle">Acak</button>
            </div>
          </template>

          <div v-else class="result">
            <p class="result__title">Bersih!</p>
            <p class="result__streak">WAKTU {{ timeLabel }} · SELESAI {{ solvedCount }}</p>
            <button class="cta" type="button" @click="start">Main lagi ▸</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/backbar/picker/pick/
   solobar/result come from src/styles.css. */
.onet {
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
  font-size: 30px;
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
.board {
  width: 100%;
  display: grid;
  gap: 4px;
  margin-bottom: 14px;
}
.tile {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  font-size: clamp(16px, 5.4vw, 24px);
  line-height: 1;
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 8px;
  box-shadow: var(--pop-sm);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.08s ease, background 0.1s ease, box-shadow 0.08s ease;
}
.tile.is-empty {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}
.tile.is-picked {
  background: #7ddb9c;
}
.tile.is-hint {
  background: var(--aqua);
}

/* ---- Tools + result ---- */
.tools {
  display: flex;
  justify-content: center;
  gap: 10px;
}
.result {
  width: 100%;
  text-align: center;
  padding-top: 4px;
}
.result__streak {
  margin: 6px 0 14px;
}
</style>
