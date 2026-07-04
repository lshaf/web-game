<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Ranjau (Minesweeper) — single player. Pick a difficulty, clear every safe
// cell without detonating a mine. The first dig is always safe: mines are
// placed after the opening tap, avoiding it and its neighbors, then blank
// (0-adjacent) cells flood-fill open.

const DIFFS = [
  { id: 'mudah', label: 'Mudah', rows: 8, cols: 8, mines: 10 },
  { id: 'sedang', label: 'Sedang', rows: 10, cols: 10, mines: 18 },
  { id: 'sulit', label: 'Sulit', rows: 12, cols: 12, mines: 32 },
]
const BEST_KEY = 'dusk-ranjau-best'

const phase = ref('menu') // menu | play | won | lost
const diffIdx = ref(0)
const tool = ref('dig') // dig | flag

const cells = ref([]) // { mine, revealed, flagged, adj, hit }
const minesPlaced = ref(false)
const seconds = ref(0)
const newBest = ref(false)
const best = ref(loadBest())
let timerId = 0

const diff = computed(() => DIFFS[diffIdx.value])
const rows = computed(() => diff.value.rows)
const cols = computed(() => diff.value.cols)
const mineCount = computed(() => diff.value.mines)

const isOver = computed(() => phase.value === 'won' || phase.value === 'lost')
const flags = computed(() => cells.value.filter((c) => c.flagged).length)
const minesLeft = computed(() => mineCount.value - flags.value)

const clock = computed(() => fmt(seconds.value))
const bestText = computed(() => {
  const b = best.value[diff.value.id]
  return b == null ? '--:--' : fmt(b)
})
const boardStyle = computed(() => ({
  gridTemplateColumns: `repeat(${cols.value}, 1fr)`,
  fontSize: cols.value <= 8 ? '19px' : cols.value <= 10 ? '16px' : '13px',
}))
const toolLabel = computed(() => (tool.value === 'dig' ? '🔦 Gali' : '🚩 Bendera'))

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) || {}
  } catch {
    return {}
  }
}
function saveBest() {
  const key = diff.value.id
  const cur = best.value[key]
  if (cur == null || seconds.value < cur) {
    best.value = { ...best.value, [key]: seconds.value }
    newBest.value = true
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(best.value))
    } catch {
      /* ignore quota / private-mode errors */
    }
  }
}

function neighbors(i) {
  const r = Math.floor(i / cols.value)
  const c = i % cols.value
  const res = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (nr >= 0 && nr < rows.value && nc >= 0 && nc < cols.value) res.push(nr * cols.value + nc)
    }
  }
  return res
}

function start() {
  stopTimer()
  cells.value = Array.from({ length: rows.value * cols.value }, () => ({
    mine: false,
    revealed: false,
    flagged: false,
    adj: 0,
    hit: false,
  }))
  minesPlaced.value = false
  seconds.value = 0
  newBest.value = false
  tool.value = 'dig'
  phase.value = 'play'
}

// Seed mines only after the first dig, keeping the tapped cell and its ring
// clear so the opening move always opens a blank pocket.
function placeMines(safe) {
  const forbidden = new Set([safe, ...neighbors(safe)])
  let placed = 0
  while (placed < mineCount.value) {
    const p = Math.floor(Math.random() * cells.value.length)
    if (forbidden.has(p) || cells.value[p].mine) continue
    cells.value[p].mine = true
    placed++
  }
  for (let i = 0; i < cells.value.length; i++) {
    if (cells.value[i].mine) continue
    cells.value[i].adj = neighbors(i).filter((n) => cells.value[n].mine).length
  }
  minesPlaced.value = true
  startTimer()
}

// Iterative flood fill: open the cell, and if it has no adjacent mines keep
// opening its unrevealed, unflagged neighbors.
function reveal(i) {
  const stack = [i]
  while (stack.length) {
    const j = stack.pop()
    const cell = cells.value[j]
    if (cell.revealed || cell.flagged) continue
    cell.revealed = true
    if (cell.adj === 0 && !cell.mine) {
      for (const n of neighbors(j)) {
        const nc = cells.value[n]
        if (!nc.revealed && !nc.flagged) stack.push(n)
      }
    }
  }
}

function tapCell(i) {
  if (phase.value !== 'play') return
  const cell = cells.value[i]
  // Tapping an already-open number chords (works in either tool mode).
  if (cell.revealed) {
    chord(i)
    return
  }
  if (tool.value === 'flag') {
    toggleFlag(i)
    return
  }
  if (cell.flagged) return
  if (!minesPlaced.value) placeMines(i)
  if (cell.mine) {
    loseGame(i)
    return
  }
  reveal(i)
  sfx.tick()
  checkWin()
}

// Chord: tapping an open number whose surrounding flags already equal its count
// opens all the other (unflagged) neighbours at once. If a flag is wrong this
// can uncover a mine — same as classic Minesweeper.
function chord(i) {
  const cell = cells.value[i]
  if (!cell.revealed || cell.adj === 0) return
  const nbrs = neighbors(i)
  const flagged = nbrs.filter((n) => cells.value[n].flagged).length
  if (flagged !== cell.adj) return
  const mineHit = nbrs.find((n) => {
    const nc = cells.value[n]
    return !nc.flagged && !nc.revealed && nc.mine
  })
  if (mineHit != null) {
    loseGame(mineHit)
    return
  }
  for (const n of nbrs) {
    const nc = cells.value[n]
    if (!nc.flagged && !nc.revealed) reveal(n)
  }
  sfx.tick()
  checkWin()
}

function onRightClick(i) {
  if (phase.value !== 'play') return
  toggleFlag(i)
}

function toggleFlag(i) {
  const cell = cells.value[i]
  if (cell.revealed) return
  cell.flagged = !cell.flagged
  sfx.tick()
}

function toggleTool() {
  tool.value = tool.value === 'dig' ? 'flag' : 'dig'
}

function loseGame(i) {
  cells.value[i].revealed = true
  cells.value[i].hit = true
  cells.value.forEach((c) => {
    if (c.mine) c.revealed = true
  })
  stopTimer()
  phase.value = 'lost'
  sfx.wrong()
  sfx.lose()
}

function checkWin() {
  const cleared = cells.value.filter((c) => c.revealed && !c.mine).length
  if (cleared === cells.value.length - mineCount.value) {
    cells.value.forEach((c) => {
      if (c.mine) c.flagged = true
    })
    stopTimer()
    phase.value = 'won'
    saveBest()
    sfx.win()
  }
}

function startTimer() {
  stopTimer()
  timerId = setInterval(() => {
    seconds.value++
  }, 1000)
}
function stopTimer() {
  clearInterval(timerId)
  timerId = 0
}

function backToMenu() {
  stopTimer()
  phase.value = 'menu'
}

function cellClass(c) {
  return {
    'is-revealed': c.revealed,
    'is-mine': c.revealed && c.mine,
    'is-hit': c.hit,
    'is-flagged': c.flagged && !c.revealed,
  }
}

function onKeydown(e) {
  if (e.key === 'Enter' && isOver.value) {
    e.preventDefault()
    start()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopTimer()
})
</script>

<template>
  <div class="ranjau">
    <div class="panel">
      <!-- Difficulty menu -->
      <section v-if="phase === 'menu'" class="screen">
        <p class="brand">RAN<span class="brand__accent">JAU</span></p>
        <p class="eyebrow">PILIH TINGKAT</p>

        <div class="picker picker--3">
          <button
            v-for="(d, i) in DIFFS"
            :key="d.id"
            class="pick"
            :class="{ 'is-on': diffIdx === i }"
            type="button"
            @click="diffIdx = i"
          >
            {{ d.label }}
          </button>
        </div>
        <p class="diffinfo">
          {{ diff.cols }}×{{ diff.rows }} · {{ diff.mines }} ranjau · TERBAIK {{ bestText }}
        </p>

        <button class="cta" type="button" @click="start">Mulai ▸</button>
      </section>

      <!-- Play / result -->
      <section v-else class="screen">
        <div class="topbar">
          <button class="mini" type="button" @click="backToMenu">← Mode</button>
          <button
            class="mini toolbtn"
            :class="{ 'is-flag': tool === 'flag' }"
            type="button"
            :disabled="isOver"
            @click="toggleTool"
          >
            {{ toolLabel }}
          </button>
        </div>

        <div class="hud">
          <span class="hud__box">💣 <b>{{ minesLeft }}</b></span>
          <span class="hud__box hud__clock"><span class="hud__k">WAKTU</span> {{ clock }}</span>
        </div>

        <div class="board" :class="{ 'is-locked': isOver }" :style="boardStyle" @contextmenu.prevent>
          <button
            v-for="(c, i) in cells"
            :key="i"
            class="cell"
            :class="cellClass(c)"
            type="button"
            @click="tapCell(i)"
            @contextmenu.prevent="onRightClick(i)"
          >
            <template v-if="c.revealed">
              <span v-if="c.mine" class="glyph">💣</span>
              <span v-else-if="c.adj > 0" class="num" :class="'n' + c.adj">{{ c.adj }}</span>
            </template>
            <span v-else-if="c.flagged" class="glyph">🚩</span>
          </button>
        </div>

        <div v-if="isOver" class="result">
          <p class="result__title" :class="{ 'is-lost': phase === 'lost' }">
            {{ phase === 'won' ? 'Menang!' : 'Kena ranjau' }}
          </p>
          <p class="result__sub">
            WAKTU {{ clock }}<template v-if="newBest"> · REKOR BARU</template>
          </p>
          <button class="cta" type="button" @click="start">Main lagi ▸</button>
          <button class="cta cta--alt" type="button" @click="backToMenu">← Mode</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/topbar/picker/
   result come from src/styles.css (see docs/STYLE.md). */
.ranjau {
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
  font-size: 38px;
}

/* ---- Difficulty picker ---- */
.picker--3 {
  grid-template-columns: repeat(3, 1fr);
  width: 100%;
}
.diffinfo {
  width: 100%;
  margin: 12px 0 22px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--muted);
  text-align: center;
}

/* ---- Play HUD ---- */
.toolbtn.is-flag {
  background: var(--berry);
  color: var(--cream);
}
.hud {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin: 14px 0 16px;
}
.hud__box {
  flex: 1;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--ink);
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 12px;
  padding: 9px 4px;
}
.hud__box b {
  color: var(--berry);
  font-weight: 700;
}
.hud__clock {
  letter-spacing: 0.08em;
}
.hud__k {
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 0.14em;
}

/* ---- Board ---- */
.board {
  width: 100%;
  aspect-ratio: 1;
  display: grid;
  gap: 4px;
  margin-bottom: 16px;
}
.board.is-locked {
  pointer-events: none;
}
.cell {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  padding: 0;
  line-height: 1;
  font-family: var(--font-mono);
  font-weight: 700;
  background: var(--absent);
  border: 1.5px solid var(--ink);
  border-radius: 6px;
  box-shadow: 0 2px 0 var(--ink);
  transition: transform 0.06s ease, background 0.1s ease;
}
.cell:hover:not(.is-revealed) {
  background: var(--tile-live);
}
.cell:active:not(.is-revealed) {
  transform: translateY(1px);
  box-shadow: 0 1px 0 var(--ink);
}
.cell.is-revealed {
  background: var(--paper-lit);
  box-shadow: none;
  cursor: default;
}
.cell.is-flagged {
  background: var(--tile-live);
}
.cell.is-mine {
  background: var(--tile-wrong);
}
.cell.is-hit {
  background: var(--berry);
}
.glyph {
  font-size: 0.9em;
}

/* ---- Adjacency number palette ---- */
.num {
  font-size: 1em;
}
.n1 {
  color: var(--aqua-deep);
}
.n2 {
  color: #1f9e6b;
}
.n3 {
  color: var(--berry);
}
.n4 {
  color: var(--grape);
}
.n5 {
  color: var(--sun-core);
}
.n6 {
  color: var(--aqua);
}
.n7 {
  color: var(--ink);
}
.n8 {
  color: var(--muted);
}
</style>
