<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'
import { puzzles } from '../data/words.js'

// Teka-Teki Silang — a mini crossword in Indonesian. Every game a fresh grid is
// woven at runtime from the clued word bank in src/data/words.js: a seed word is
// laid down, then more words are crossed onto it at shared letters, rejecting any
// placement that would touch side-by-side and form an unintended run. Tap a cell
// to select its across/down word (tap again to flip direction), then type to fill.
// There is no on-screen keyboard: desktop uses the physical keys, and on a phone
// tapping a cell focuses a hidden input so the native keyboard rises. The board
// buzzes when it is full but wrong, like Sandi. Solved-count, best time and a
// to-the-second timer persist across games.

const SOLVED_KEY = 'dusk-teka-solved'
const BEST_KEY = 'dusk-teka-best'
const MAX_DIM = 9 // keep the woven grid inside a phone-friendly square
const TARGET = 8 // stop weaving once this many words are placed

// A single sentinel char parks in the hidden input so a soft-keyboard backspace
// on an otherwise-empty field still emits an input event we can read as a delete.
const SENTINEL = ' '
const hidden = ref(null)

// The clued word bank, trimmed to short/mid words that cross cleanly.
const BANK = puzzles.filter(
  (p) => p.answer.length >= 3 && p.answer.length <= 7 && /^[A-Z]+$/.test(p.answer),
)

const puzzle = ref(null) // { rows, cols, grid, entries, aIdx, dIdx, cellKeys }
const user = ref({}) // "r,c" -> typed letter ('' if empty)
const locked = ref({}) // "r,c" -> true once hint-revealed (immutable)
const sel = ref({ r: 0, c: 0 }) // the cursor cell
const dir = ref('across') // across | down
const phase = ref('play') // play | won
const hintsUsed = ref(0)
const solvedCount = ref(0)
const bestTime = ref(0) // seconds; 0 = none yet
const elapsed = ref(0) // seconds since the puzzle started

let timer = 0
let startAt = 0
let wasFull = false // guards the one-shot "board full but wrong" buzzer

const key = (r, c) => r + ',' + c

// --- Grid weaving -----------------------------------------------------------

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

// One weaving attempt: seed a word, then greedily cross more words onto shared
// letters. Returns the placed words plus the bounding box they occupy.
function attemptFill(pool) {
  const cells = new Map() // "r,c" -> letter
  const dirsAt = new Map() // "r,c" -> which orientations ('H'/'V') already run through it
  const placed = [] // { word, clue, r, c, dir: 'H' | 'V' }
  const box = { minR: 0, maxR: 0, minC: 0, maxC: 0 }
  const at = (r, c) => cells.get(key(r, c))

  function place(word, clue, r, c, d) {
    const dr = d === 'V' ? 1 : 0
    const dc = d === 'H' ? 1 : 0
    for (let i = 0; i < word.length; i++) {
      const kk = key(r + dr * i, c + dc * i)
      cells.set(kk, word[i])
      dirsAt.set(kk, (dirsAt.get(kk) || '') + d)
    }
    placed.push({ word, clue, r, c, dir: d })
    box.minR = Math.min(box.minR, r)
    box.minC = Math.min(box.minC, c)
    box.maxR = Math.max(box.maxR, r + dr * (word.length - 1))
    box.maxC = Math.max(box.maxC, c + dc * (word.length - 1))
  }

  // A placement is legal if it conflicts with no letter, crosses at least one
  // existing letter, never runs flush beside another word (no unintended words),
  // and keeps the whole grid within MAX_DIM.
  function legal(word, r, c, d) {
    const dr = d === 'V' ? 1 : 0
    const dc = d === 'H' ? 1 : 0
    if (at(r - dr, c - dc) != null) return false // cell before the start must be clear
    if (at(r + dr * word.length, c + dc * word.length) != null) return false // and after the end
    let crosses = 0
    for (let i = 0; i < word.length; i++) {
      const rr = r + dr * i
      const cc = c + dc * i
      const cur = at(rr, cc)
      if (cur != null) {
        if (cur !== word[i]) return false
        // a shared cell must be a real perpendicular crossing, never a second
        // word laid collinearly on top of one already running this way
        if ((dirsAt.get(key(rr, cc)) || '').includes(d)) return false
        crosses++
      } else {
        // no letter flush against the sides of a newly filled cell
        if (at(rr + dc, cc + dr) != null) return false
        if (at(rr - dc, cc - dr) != null) return false
      }
    }
    if (crosses < 1) return false
    const nMinR = Math.min(box.minR, r)
    const nMaxR = Math.max(box.maxR, r + dr * (word.length - 1))
    const nMinC = Math.min(box.minC, c)
    const nMaxC = Math.max(box.maxC, c + dc * (word.length - 1))
    if (nMaxR - nMinR + 1 > MAX_DIM || nMaxC - nMinC + 1 > MAX_DIM) return false
    return true
  }

  // Every legal way to cross `word` onto an existing letter, perpendicular to it.
  function placements(word) {
    const spots = []
    for (const w of placed) {
      const dr = w.dir === 'V' ? 1 : 0
      const dc = w.dir === 'H' ? 1 : 0
      const nd = w.dir === 'H' ? 'V' : 'H'
      const ndr = nd === 'V' ? 1 : 0
      const ndc = nd === 'H' ? 1 : 0
      for (let k = 0; k < w.word.length; k++) {
        const cr = w.r + dr * k
        const cc = w.c + dc * k
        for (let i = 0; i < word.length; i++) {
          if (word[i] !== w.word[k]) continue
          const r0 = cr - ndr * i
          const c0 = cc - ndc * i
          if (legal(word, r0, c0, nd)) spots.push({ r: r0, c: c0, dir: nd })
        }
      }
    }
    return spots
  }

  const seedPool = pool.filter((p) => p.answer.length >= 5)
  const seed = (seedPool.length ? seedPool : pool)[0]
  place(seed.answer, seed.clue, 0, 0, 'H')
  for (const p of pool) {
    if (placed.length >= TARGET) break
    if (p === seed) continue
    const spots = placements(p.answer)
    if (spots.length) {
      const s = spots[Math.floor(Math.random() * spots.length)]
      place(p.answer, p.clue, s.r, s.c, s.dir)
    }
  }
  return { placed, box }
}

// Weave several times and keep the fullest grid, then normalise + number it.
function buildGrid() {
  let best = null
  for (let a = 0; a < 80; a++) {
    const g = attemptFill(shuffle(BANK.slice()))
    if (!best || g.placed.length > best.placed.length) best = g
    if (best.placed.length >= TARGET - 1) break
  }
  return finalize(best)
}

function finalize(built) {
  const { minR, minC, maxR, maxC } = built.box
  const rows = maxR - minR + 1
  const cols = maxC - minC + 1
  const words = built.placed.map((w) => ({ ...w, r: w.r - minR, c: w.c - minC }))

  const grid = Array.from({ length: rows }, () => Array(cols).fill(null))
  for (const w of words) {
    const dr = w.dir === 'V' ? 1 : 0
    const dc = w.dir === 'H' ? 1 : 0
    for (let i = 0; i < w.word.length; i++) {
      grid[w.r + dr * i][w.c + dc * i] = { sol: w.word[i], num: 0 }
    }
  }

  // Standard crossword numbering: a cell is numbered when it begins an across
  // and/or a down word, scanning left-to-right, top-to-bottom.
  const filled = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] != null
  let n = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!filled(r, c)) continue
      const startsA = !filled(r, c - 1) && filled(r, c + 1)
      const startsD = !filled(r - 1, c) && filled(r + 1, c)
      if (startsA || startsD) grid[r][c].num = ++n
    }
  }

  const entries = words.map((w) => {
    const dr = w.dir === 'V' ? 1 : 0
    const dc = w.dir === 'H' ? 1 : 0
    const cellList = []
    for (let i = 0; i < w.word.length; i++) cellList.push({ r: w.r + dr * i, c: w.c + dc * i })
    return {
      num: grid[w.r][w.c].num,
      dir: w.dir === 'H' ? 'across' : 'down',
      cells: cellList,
      clue: w.clue,
      word: w.word,
    }
  })
  entries.sort((a, b) => a.num - b.num || (a.dir === 'across' ? -1 : 1))

  const aIdx = {}
  const dIdx = {}
  const cellKeys = []
  entries.forEach((e, ei) => {
    e.cells.forEach(({ r, c }) => {
      if (e.dir === 'across') aIdx[key(r, c)] = ei
      else dIdx[key(r, c)] = ei
    })
  })
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) if (grid[r][c]) cellKeys.push(key(r, c))
  }
  return { rows, cols, grid, entries, aIdx, dIdx, cellKeys }
}

// --- Puzzle lifecycle -------------------------------------------------------

function initPuzzle() {
  const p = buildGrid()
  puzzle.value = p
  user.value = {}
  locked.value = {}
  hintsUsed.value = 0
  phase.value = 'play'
  elapsed.value = 0
  wasFull = false
  const first = p.entries.find((e) => e.dir === 'across') || p.entries[0]
  sel.value = { r: first.cells[0].r, c: first.cells[0].c }
  dir.value = first.dir
}

// Seed the first render before mount (timer starts in onMounted).
initPuzzle()

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

function newPuzzle() {
  initPuzzle()
  startTimer()
  nextTick(focusInput) // the hidden input re-renders with the play view
}

// --- Selection --------------------------------------------------------------

// The entries index the cursor currently sits in for the active direction,
// falling back to the perpendicular word when the cell has only one.
function activeIndex() {
  const p = puzzle.value
  const k = key(sel.value.r, sel.value.c)
  const want = dir.value === 'across' ? p.aIdx : p.dIdx
  let ei = want[k]
  if (ei == null) ei = (dir.value === 'across' ? p.dIdx : p.aIdx)[k]
  return ei
}

const activeEntry = computed(() => {
  const p = puzzle.value
  if (!p) return null
  const ei = activeIndex()
  return ei == null ? null : p.entries[ei]
})

const activeKeys = computed(() => {
  const e = activeEntry.value
  const set = new Set()
  if (e) for (const c of e.cells) set.add(key(c.r, c.c))
  return set
})

// Cells belonging to a word that is completely and correctly filled — they glow
// green so you know the moment an answer lands, before the whole grid is done.
const doneKeys = computed(() => {
  const p = puzzle.value
  const set = new Set()
  if (!p) return set
  for (const e of p.entries) {
    let ok = true
    for (const c of e.cells) {
      if (user.value[key(c.r, c.c)] !== p.grid[c.r][c.c].sol) {
        ok = false
        break
      }
    }
    if (ok) for (const c of e.cells) set.add(key(c.r, c.c))
  }
  return set
})

function selectCell(r, c) {
  if (phase.value !== 'play') return
  const p = puzzle.value
  if (!p.grid[r][c]) return
  const k = key(r, c)
  const hasA = p.aIdx[k] != null
  const hasD = p.dIdx[k] != null
  if (sel.value.r === r && sel.value.c === c) {
    if (hasA && hasD) dir.value = dir.value === 'across' ? 'down' : 'across'
  } else {
    sel.value = { r, c }
    if (dir.value === 'across' && !hasA) dir.value = 'down'
    else if (dir.value === 'down' && !hasD) dir.value = 'across'
  }
  focusInput() // tapping a cell (a user gesture) raises the native keyboard
}

// Jump the cursor to an entry, landing on its first still-blank cell.
function focusEntry(ei) {
  const e = puzzle.value.entries[ei]
  dir.value = e.dir
  const open = e.cells.find((c) => !locked.value[key(c.r, c.c)] && !user.value[key(c.r, c.c)])
  const t = open || e.cells[0]
  sel.value = { r: t.r, c: t.c }
}

function stepEntry(delta) {
  const p = puzzle.value
  const ei = activeIndex()
  if (ei == null) return
  focusEntry((ei + delta + p.entries.length) % p.entries.length)
  focusInput()
}

function moveCursor(dr, dc) {
  const p = puzzle.value
  dir.value = dr !== 0 ? 'down' : 'across'
  const r = sel.value.r + dr
  const c = sel.value.c + dc
  if (r >= 0 && r < p.rows && c >= 0 && c < p.cols && p.grid[r][c]) sel.value = { r, c }
}

// --- Filling ----------------------------------------------------------------

function advanceCursor() {
  const e = activeEntry.value
  if (!e) return
  const i = e.cells.findIndex((c) => c.r === sel.value.r && c.c === sel.value.c)
  let j = i + 1
  while (j < e.cells.length && locked.value[key(e.cells[j].r, e.cells[j].c)]) j++
  if (j < e.cells.length) sel.value = { r: e.cells[j].r, c: e.cells[j].c }
}

function type(letter) {
  if (phase.value !== 'play') return
  const k = key(sel.value.r, sel.value.c)
  if (locked.value[k]) return
  user.value[k] = letter
  sfx.tick()
  advanceCursor()
  checkComplete()
}

function backspace() {
  if (phase.value !== 'play') return
  const k = key(sel.value.r, sel.value.c)
  if (user.value[k] && !locked.value[k]) {
    user.value[k] = ''
    wasFull = false
    return
  }
  const e = activeEntry.value
  if (!e) return
  const i = e.cells.findIndex((c) => c.r === sel.value.r && c.c === sel.value.c)
  let j = i - 1
  while (j >= 0 && locked.value[key(e.cells[j].r, e.cells[j].c)]) j--
  if (j >= 0) {
    sel.value = { r: e.cells[j].r, c: e.cells[j].c }
    user.value[key(e.cells[j].r, e.cells[j].c)] = ''
    wasFull = false
  }
}

function checkComplete() {
  const p = puzzle.value
  let full = true
  let correct = true
  for (const k of p.cellKeys) {
    const [r, c] = k.split(',').map(Number)
    if (!user.value[k]) full = false
    if (user.value[k] !== p.grid[r][c].sol) correct = false
  }
  if (full && correct) {
    win()
    return
  }
  if (full && !wasFull) sfx.wrong() // board complete but not correct
  wasFull = full
}

// Petunjuk: reveal + lock the correct letter under the cursor.
function hint() {
  if (phase.value !== 'play') return
  const p = puzzle.value
  const k = key(sel.value.r, sel.value.c)
  if (locked.value[k]) return
  user.value[k] = p.grid[sel.value.r][sel.value.c].sol
  locked.value[k] = true
  hintsUsed.value += 1
  sfx.tick()
  advanceCursor()
  checkComplete()
  focusInput()
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

function persist(k, v) {
  try {
    localStorage.setItem(k, String(v))
  } catch (e) {
    /* storage may be blocked; keep in-memory */
  }
}

// --- Presentation helpers ---------------------------------------------------

const timeLabel = computed(() => fmt(elapsed.value))
function fmt(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}

const clueBar = computed(() => {
  const e = activeEntry.value
  if (!e) return { num: '', dir: '', text: '' }
  return { num: e.num, dir: e.dir === 'across' ? 'MENDATAR' : 'MENURUN', text: e.clue }
})

function cellVal(r, c) {
  return user.value[key(r, c)] || ''
}
function isCursor(r, c) {
  return phase.value === 'play' && sel.value.r === r && sel.value.c === c
}
function isActive(r, c) {
  return activeKeys.value.has(key(r, c))
}
function isDone(r, c) {
  return doneKeys.value.has(key(r, c))
}
function isLocked(r, c) {
  return !!locked.value[key(r, c)]
}

// Keep the hidden input focused (and reset to the sentinel) so the native mobile
// keyboard stays up between actions.
function focusInput() {
  const el = hidden.value
  if (!el) return
  el.value = SENTINEL
  el.focus({ preventScroll: true })
}

// The soft keyboard path: on a phone there are no useful keydown events, so we
// read letters (and an emptied field as a backspace) straight from the input.
function onInput(e) {
  const el = e.target
  const v = el.value
  el.value = SENTINEL
  if (v === '') {
    backspace()
    return
  }
  for (const ch of v) {
    if (ch !== SENTINEL && /^[a-zA-Z]$/.test(ch)) type(ch.toUpperCase())
  }
}

// The physical-keyboard path (desktop). Letters preventDefault too, so a focused
// hidden input never also receives the character and double-types it.
function onKeydown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (phase.value === 'won') {
    if (e.key === 'Enter') {
      e.preventDefault()
      newPuzzle()
    }
    return
  }
  if (e.key === 'Backspace') {
    e.preventDefault()
    backspace()
  } else if (e.key === 'Tab') {
    e.preventDefault()
    stepEntry(e.shiftKey ? -1 : 1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    moveCursor(0, -1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    moveCursor(0, 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveCursor(-1, 0)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveCursor(1, 0)
  } else if (/^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault()
    type(e.key.toUpperCase())
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  try {
    solvedCount.value = Number(localStorage.getItem(SOLVED_KEY)) || 0
    bestTime.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch (e) {
    solvedCount.value = 0
    bestTime.value = 0
  }
  startTimer()
  focusInput()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopTimer()
})
</script>

<template>
  <div class="teka">
    <div class="panel">
      <section class="screen">
        <p class="brand">TEKA<span class="brand__accent">TEKI</span></p>
        <p class="eyebrow">SILANG KATA INDONESIA</p>

        <div class="solobar hud">
          <span>WAKTU <b>{{ timeLabel }}</b></span>
          <span>PETUNJUK <b>{{ hintsUsed }}</b></span>
          <span class="solobar__best">SELESAI {{ solvedCount }}</span>
        </div>

        <!-- Clue bar above the grid so it stays visible when a phone's native
             keyboard slides up over the lower half of the screen. -->
        <div v-if="phase === 'play'" class="cluebar">
          <button class="cluebar__nav" type="button" aria-label="Sebelumnya" @click="stepEntry(-1)">
            ‹
          </button>
          <div class="cluebar__body">
            <span class="cluebar__tag">{{ clueBar.num }} {{ clueBar.dir }}</span>
            <span class="cluebar__text">{{ clueBar.text }}</span>
          </div>
          <button class="cluebar__nav" type="button" aria-label="Berikutnya" @click="stepEntry(1)">
            ›
          </button>
        </div>

        <!-- The woven grid: filled cells are tappable, blanks stay dark. -->
        <div
          class="board"
          :style="{ gridTemplateColumns: `repeat(${puzzle.cols}, var(--cell))` }"
        >
          <template v-for="(row, r) in puzzle.grid">
            <template v-for="(cell, c) in row">
              <div v-if="!cell" :key="r + '-' + c" class="cell cell--blank" />
              <button
                v-else
                :key="r + '-' + c"
                type="button"
                class="cell"
                :class="{
                  'is-active': isActive(r, c),
                  'is-done': isDone(r, c),
                  'is-cursor': isCursor(r, c),
                  'is-locked': isLocked(r, c),
                }"
                @click="selectCell(r, c)"
              >
                <span v-if="cell.num" class="cell__num">{{ cell.num }}</span>
                <span class="cell__ch">{{ cellVal(r, c) }}</span>
              </button>
            </template>
          </template>
        </div>

        <!-- Controls: clue bar + hint while playing, the result otherwise. Typing
             is via the physical keyboard, or the native keyboard a phone raises
             through the off-screen input below. -->
        <template v-if="phase === 'play'">
          <input
            ref="hidden"
            class="hidden-input"
            type="text"
            inputmode="text"
            autocapitalize="characters"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            aria-hidden="true"
            tabindex="-1"
            @input="onInput"
          />

          <p class="tip">Ketuk kotak untuk pindah arah, lalu ketik.</p>

          <div class="tools">
            <button class="mini" type="button" @click="hint">Petunjuk</button>
          </div>
        </template>

        <div v-else class="result">
          <p class="result__title">Selesai!</p>
          <p class="result__streak">WAKTU {{ timeLabel }} · SELESAI {{ solvedCount }}</p>
          <button class="cta" type="button" @click="newPuzzle">Teka baru ▸</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/solobar/result come
   from src/styles.css. */
.teka {
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
  font-size: 27px;
}

/* base is global; only the margin is page-specific */
.hud {
  margin-bottom: 16px;
}
.hud b {
  color: var(--aqua-deep);
}

/* ---- Woven grid ---- */
.board {
  --cell: clamp(26px, 8.6vw, 34px);
  display: grid;
  justify-content: center;
  gap: 3px;
  margin: 4px auto 14px;
}
.cell {
  position: relative;
  width: var(--cell);
  height: var(--cell);
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: calc(var(--cell) * 0.6);
  line-height: 1;
  color: var(--ink);
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 6px;
  box-shadow: var(--pop-sm);
  -webkit-tap-highlight-color: transparent;
  transition: background 0.12s ease, transform 0.08s ease, box-shadow 0.08s ease;
}
.cell--blank {
  width: var(--cell);
  height: var(--cell);
  background: transparent;
  border: none;
  box-shadow: none;
}
.cell__num {
  position: absolute;
  top: 1px;
  left: 3px;
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 1;
  color: var(--muted);
}
.cell.is-active {
  background: #74bdf2; /* clear blue — the word you're on, distinct from green done */
}
.cell.is-locked {
  color: var(--aqua-deep);
}
.cell.is-done {
  background: #43c96b; /* solid green — a solved word, clearly distinct from active */
  color: var(--ink);
}
.cell.is-done .cell__num {
  color: var(--ink);
}
.cell.is-cursor {
  background: #b2dbf8; /* the current cell: a lighter tint of the active blue */
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--ink);
}
/* On a solved cell the cursor takes a lighter tint of the done green instead, so
   it always reads as a paler shade of the state it sits on. */
.cell.is-done.is-cursor {
  background: #98e1ae;
}
.cell.is-cursor .cell__num {
  color: var(--ink);
}

/* ---- Clue bar ---- */
.cluebar {
  width: 100%;
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 12px;
}
.cluebar__nav {
  flex: 0 0 auto;
  width: 34px;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--ink);
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 8px;
  box-shadow: var(--pop-sm);
  -webkit-tap-highlight-color: transparent;
}
.cluebar__nav:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--ink);
}
.cluebar__body {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 7px 12px;
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 8px;
  box-shadow: var(--pop-sm);
}
.cluebar__tag {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--aqua-deep);
}
.cluebar__text {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 15px;
  line-height: 1.2;
  color: var(--ink);
}

/* ---- Tip + tools ---- */
.tip {
  margin: 0 0 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--muted);
  text-align: center;
}
.tools {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}

/* Off-screen focus target: invisible but focusable, so a phone raises its native
   keyboard on tap. 16px font keeps iOS from zooming when it takes focus. */
.hidden-input {
  position: fixed;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  font-size: 16px;
  opacity: 0;
  z-index: -1;
  pointer-events: none;
}

/* ---- Result ---- */
.result {
  width: 100%;
  text-align: center;
  padding-top: 4px;
}
.result__streak {
  margin: 6px 0 14px;
}
</style>
