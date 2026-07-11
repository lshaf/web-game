<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Sudoku — single player. Generate a full solution by randomized backtracking,
// blank out N cells by difficulty, then fill it back in. A placed digit that
// breaks a row/column/box rule flashes red and counts a mistake.

const DIFFS = [
  { id: 'mudah', label: 'Mudah', empty: 38 },
  { id: 'sedang', label: 'Sedang', empty: 46 },
  { id: 'sulit', label: 'Sulit', empty: 52 },
  { id: 'ahli', label: 'Ahli', empty: 56 },
]
const bestKey = 'dusk-sudoku-best'
const CELLS = Array.from({ length: 81 }, (_, i) => i)

const phase = ref('menu') // menu | play | won
const diffIndex = ref(0)
const puzzle = ref([]) // number[81], 0 = empty
const given = ref([]) // boolean[81]
const selected = ref(-1)
const flash = ref(-1)
const mistakes = ref(0)
const seconds = ref(0)
const best = ref({})
let timer = 0
let flashTimer = 0

const diff = computed(() => DIFFS[diffIndex.value])

const conflicts = computed(() => {
  const set = new Set()
  const g = puzzle.value
  for (let i = 0; i < 81; i++) {
    if (g[i] && hasConflict(g, i, g[i])) set.add(i)
  }
  return set
})

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// True if placing `val` at `idx` clashes with any *other* filled cell.
function hasConflict(g, idx, val) {
  const r = Math.floor(idx / 9)
  const c = idx % 9
  for (let i = 0; i < 9; i++) {
    if (i !== c && g[r * 9 + i] === val) return true
    if (i !== r && g[i * 9 + c] === val) return true
  }
  const br = Math.floor(r / 3) * 3
  const bc = Math.floor(c / 3) * 3
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      const j = (br + dr) * 9 + (bc + dc)
      if (j !== idx && g[j] === val) return true
    }
  }
  return false
}

function solve(g) {
  const idx = g.indexOf(0)
  if (idx === -1) return true
  for (const n of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (!hasConflict(g, idx, n)) {
      g[idx] = n
      if (solve(g)) return true
      g[idx] = 0
    }
  }
  return false
}

function startGame() {
  const sol = new Array(81).fill(0)
  solve(sol)
  const pz = [...sol]
  for (const i of shuffle(CELLS).slice(0, diff.value.empty)) pz[i] = 0
  puzzle.value = pz
  given.value = pz.map((v) => v !== 0)
  selected.value = -1
  flash.value = -1
  mistakes.value = 0
  seconds.value = 0
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

function selectCell(idx) {
  selected.value = selected.value === idx ? -1 : idx
}

function inputNum(n) {
  const idx = selected.value
  if (phase.value !== 'play' || idx < 0 || given.value[idx]) return
  puzzle.value[idx] = n
  if (hasConflict(puzzle.value, idx, n)) {
    sfx.wrong()
    mistakes.value++
    flash.value = idx
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => {
      if (flash.value === idx) flash.value = -1
    }, 440)
  } else {
    sfx.tick()
  }
  checkWin()
}

function eraseCell() {
  const idx = selected.value
  if (phase.value !== 'play' || idx < 0 || given.value[idx] || !puzzle.value[idx]) return
  puzzle.value[idx] = 0
  sfx.tick()
}

function checkWin() {
  // A fully filled, conflict-free grid is a win — even if it differs from the
  // generated solution, since easy puzzles can have more than one completion.
  const g = puzzle.value
  for (let i = 0; i < 81; i++) if (!g[i] || hasConflict(g, i, g[i])) return
  stopTimer()
  phase.value = 'won'
  sfx.win()
  const id = diff.value.id
  const prev = best.value[id]
  if (prev == null || seconds.value < prev) {
    best.value = { ...best.value, [id]: seconds.value }
    try {
      localStorage.setItem(bestKey, JSON.stringify(best.value))
    } catch (e) {
      /* storage may be blocked */
    }
  }
}

function moveSel(key) {
  let idx = selected.value < 0 ? 0 : selected.value
  let r = Math.floor(idx / 9)
  let c = idx % 9
  if (key === 'ArrowUp') r = (r + 8) % 9
  else if (key === 'ArrowDown') r = (r + 1) % 9
  else if (key === 'ArrowLeft') c = (c + 8) % 9
  else if (key === 'ArrowRight') c = (c + 1) % 9
  selected.value = r * 9 + c
}

function toMenu() {
  stopTimer()
  phase.value = 'menu'
}

// Per-cell rendering state: box separators, number color, and the
// selected / peer / same-value highlighting.
function cellClass(idx) {
  const r = Math.floor(idx / 9)
  const c = idx % 9
  const v = puzzle.value[idx]
  const sel = selected.value
  const cls = {
    br: c % 3 === 2 && c !== 8,
    bb: r % 3 === 2 && r !== 8,
    'is-given': given.value[idx],
    'is-user': !given.value[idx] && v !== 0,
    'is-conflict': conflicts.value.has(idx),
    'is-flash': flash.value === idx,
    'is-sel': sel === idx,
  }
  if (sel >= 0 && sel !== idx) {
    const sr = Math.floor(sel / 9)
    const sc = sel % 9
    const sameBox =
      Math.floor(sr / 3) === Math.floor(r / 3) && Math.floor(sc / 3) === Math.floor(c / 3)
    if (sr === r || sc === c || sameBox) cls['is-peer'] = true
    const sv = puzzle.value[sel]
    if (sv !== 0 && v === sv) cls['is-same'] = true
  }
  return cls
}

function onKeydown(e) {
  if (phase.value === 'won') {
    if (e.key === 'Enter') {
      e.preventDefault()
      startGame()
    }
    return
  }
  if (phase.value !== 'play') return
  const k = e.key
  if (k >= '1' && k <= '9') {
    e.preventDefault()
    inputNum(Number(k))
  } else if (k === 'Backspace' || k === 'Delete') {
    e.preventDefault()
    eraseCell()
  } else if (k.startsWith('Arrow')) {
    e.preventDefault()
    moveSel(k)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  try {
    best.value = JSON.parse(localStorage.getItem(bestKey)) || {}
  } catch (e) {
    best.value = {}
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopTimer()
  clearTimeout(flashTimer)
})
</script>

<template>
  <div class="sudoku">
    <div class="panel">
      <!-- ===== Menu (difficulty picker) ===== -->
      <section v-if="phase === 'menu'" class="screen">
        <p class="brand">SUDO<span class="brand__accent">KU</span></p>
        <p class="eyebrow">PILIH TINGKAT</p>

        <div class="field">
          <span class="field__label">Tingkat kesulitan</span>
          <div class="picker">
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
        </div>

        <button class="cta" type="button" @click="startGame">Mulai ▸</button>
      </section>

      <!-- ===== Play ===== -->
      <section v-else-if="phase === 'play'" class="screen play">
        <div class="topbar">
          <button class="mini" type="button" @click="toMenu">← Mode</button>
          <span class="status">{{ diff.label }}</span>
          <button class="mini" type="button" @click="startGame">Baru</button>
        </div>

        <div class="solobar meta">
          <span>WAKTU <b>{{ fmt(seconds) }}</b></span>
          <span class="meta__miss">kesalahan <b>{{ mistakes }}</b></span>
        </div>

        <div class="board">
          <button
            v-for="idx in CELLS"
            :key="idx"
            class="cell"
            :class="cellClass(idx)"
            type="button"
            @click="selectCell(idx)"
          >
            {{ puzzle[idx] || '' }}
          </button>
        </div>

        <div class="pad">
          <button v-for="n in 9" :key="n" class="num" type="button" @click="inputNum(n)">
            {{ n }}
          </button>
          <button class="num num--erase" type="button" @click="eraseCell">Hapus</button>
        </div>
      </section>

      <!-- ===== Result ===== -->
      <section v-else class="screen result">
        <div class="backbar"><button class="mini" type="button" @click="toMenu">← Mode</button></div>
        <p class="result__title">Selesai!</p>
        <p class="result__sub">Waktu {{ fmt(seconds) }} · {{ diff.label }}</p>
        <p class="result__streak">
          TERBAIK {{ best[diff.id] != null ? fmt(best[diff.id]) : '—' }} · KESALAHAN {{ mistakes }}
        </p>
        <button class="cta" type="button" @click="startGame">Main lagi ▸</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/backbar/topbar/
   status/solobar/picker/result come from src/styles.css (see docs/STYLE.md). */
.sudoku {
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
  font-size: 34px;
}
.play {
  width: 100%;
}

/* ---- Timer / mistakes bar ---- */
.meta {
  margin-bottom: 14px;
}
.meta b {
  font-size: 14px;
}
.meta__miss b {
  color: var(--berry);
}

/* ---- Board ---- */
.board {
  width: 100%;
  aspect-ratio: 1;
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  overflow: hidden;
  background: var(--paper-lit);
  box-shadow: var(--pop-sm);
  margin-bottom: 16px;
}
.cell {
  border: 0;
  border-right: 1.5px solid rgba(44, 19, 56, 0.16);
  border-bottom: 1.5px solid rgba(44, 19, 56, 0.16);
  background: transparent;
  padding: 0;
  font-family: var(--font-mono);
  font-size: clamp(15px, 5.4vw, 22px);
  line-height: 1;
  color: var(--aqua-deep);
  cursor: pointer;
  transition: background 0.1s ease;
}
/* The yellow selection fill is the focus indicator, so drop the global outline. */
.cell:focus,
.cell:focus-visible {
  outline: none;
}
/* Thick 3x3 box separators. */
.cell.br {
  border-right: var(--line) solid var(--ink);
}
.cell.bb {
  border-bottom: var(--line) solid var(--ink);
}

/* Clue shading + number colors — fixed clues sit on a shaded tile with a bold
   dark-ink digit; your entries stay on bright paper with a teal digit, so the
   two are unmistakable at a glance. */
.cell.is-given {
  background: color-mix(in srgb, var(--ink) 10%, var(--paper-lit));
  color: var(--ink);
  font-weight: 700;
}
.cell.is-user {
  color: var(--aqua-deep);
  font-weight: 600;
}
.cell.is-conflict {
  color: var(--berry);
}

/* Highlighting overrides the clue shade — same row/col/box, then same value,
   then the selected cell, then a mistake flash. */
.cell.is-peer {
  background: color-mix(in srgb, var(--aqua) 12%, var(--paper-lit));
}
.cell.is-same {
  background: color-mix(in srgb, var(--grape) 34%, var(--paper-lit));
}
.cell.is-sel {
  background: var(--tile-live);
}
.cell.is-flash {
  background: var(--tile-wrong);
}

/* ---- Number pad ---- */
.pad {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
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
  grid-column: span 1;
  font-size: 13px;
  letter-spacing: 0.04em;
  background: var(--sun);
}
</style>
