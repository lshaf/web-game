<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'
import { puzzles } from '../data/words.js'

// Cari Kata (Word Search) — single player. Drag across the letter grid to trace
// hidden words in any of the 8 straight-line directions; forward or reversed
// both count. Find them all before the clock keeps ticking.

const DIFFS = [
  {
    id: 'mudah',
    label: 'Mudah',
    size: 9,
    words: 6,
    dirs: [
      [0, 1],
      [1, 0],
    ],
  },
  {
    id: 'sedang',
    label: 'Sedang',
    size: 11,
    words: 8,
    dirs: [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ],
  },
  {
    id: 'sulit',
    label: 'Sulit',
    size: 12,
    words: 10,
    dirs: [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ],
  },
]
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const bestKey = 'dusk-carikata-best'

const phase = ref('menu') // menu | play | won
const diffId = ref('mudah')
const diff = computed(() => DIFFS.find((d) => d.id === diffId.value))

const size = ref(9)
const grid = ref([]) // flat array of letters, length size*size
const found = ref([]) // boolean per cell — permanently found
const preview = ref([]) // boolean per cell — live drag highlight
const targets = ref([]) // { word, found }

const elapsed = ref(0) // seconds
let timerId = 0
let startAt = 0

const best = ref({})
const cols = computed(() => size.value)
const cellFont = computed(() => (size.value <= 9 ? 18 : size.value <= 11 ? 15 : 13))
const foundCount = computed(() => targets.value.filter((t) => t.found).length)
const total = computed(() => targets.value.length)

const clock = computed(() => {
  const m = Math.floor(elapsed.value / 60)
  const s = elapsed.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const idx = (r, c) => r * size.value + c

function tryPlace(cells, word, dirs, n) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)]
    // Valid start range so the whole word stays on the board.
    const rMin = dr < 0 ? (word.length - 1) : 0
    const rMax = dr > 0 ? n - word.length : n - 1
    const cMin = dc < 0 ? (word.length - 1) : 0
    const cMax = dc > 0 ? n - word.length : n - 1
    if (rMax < rMin || cMax < cMin) continue
    const r0 = rMin + Math.floor(Math.random() * (rMax - rMin + 1))
    const c0 = cMin + Math.floor(Math.random() * (cMax - cMin + 1))
    let ok = true
    for (let i = 0; i < word.length; i++) {
      const cell = cells[(r0 + dr * i) * n + (c0 + dc * i)]
      if (cell !== '' && cell !== word[i]) {
        ok = false
        break
      }
    }
    if (!ok) continue
    for (let i = 0; i < word.length; i++) {
      cells[(r0 + dr * i) * n + (c0 + dc * i)] = word[i]
    }
    return true
  }
  return false
}

function buildGrid() {
  const d = diff.value
  const n = d.size
  size.value = n

  const pool = shuffle(
    puzzles.filter((p) => p.answer.length <= n).map((p) => p.answer),
  )
  const seen = new Set()
  const candidates = []
  for (const w of pool) {
    if (seen.has(w)) continue
    seen.add(w)
    candidates.push(w)
  }

  const cells = new Array(n * n).fill('')
  const placed = []
  for (const w of candidates) {
    if (placed.length >= d.words) break
    if (tryPlace(cells, w, d.dirs, n)) placed.push(w)
  }

  // Fill the blanks with random letters.
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === '') cells[i] = ALPHA[Math.floor(Math.random() * 26)]
  }

  grid.value = cells
  found.value = new Array(n * n).fill(false)
  preview.value = new Array(n * n).fill(false)
  targets.value = placed.map((word) => ({ word, found: false }))
}

function startTimer() {
  stopTimer()
  startAt = Date.now()
  elapsed.value = 0
  timerId = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startAt) / 1000)
  }, 250)
}
function stopTimer() {
  if (timerId) clearInterval(timerId)
  timerId = 0
}

function start() {
  buildGrid()
  phase.value = 'play'
  startTimer()
}

function playAgain() {
  buildGrid()
  phase.value = 'play'
  startTimer()
}

function backToMenu() {
  stopTimer()
  endDrag()
  phase.value = 'menu'
}

// ---- Drag selection ----
const dragging = ref(false)
let startCell = -1
let lineIdx = [] // preview line as cell indices

function clearPreview() {
  const p = preview.value
  for (let i = 0; i < p.length; i++) if (p[i]) p[i] = false
  lineIdx = []
}

function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y)
  const t = el && el.closest ? el.closest('[data-idx]') : null
  if (!t) return -1
  const v = Number(t.getAttribute('data-idx'))
  return Number.isNaN(v) ? -1 : v
}

function updateLine(target) {
  clearPreview()
  if (startCell < 0 || target < 0) return
  const n = size.value
  const r0 = Math.floor(startCell / n)
  const c0 = startCell % n
  const r1 = Math.floor(target / n)
  const c1 = target % n
  const dr = r1 - r0
  const dc = c1 - c0
  // Only snap when the target lies on one of the 8 directions.
  const straight = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)
  if (!straight) {
    preview.value[startCell] = true
    lineIdx = [startCell]
    return
  }
  const len = Math.max(Math.abs(dr), Math.abs(dc))
  const sr = Math.sign(dr)
  const sc = Math.sign(dc)
  const line = []
  for (let i = 0; i <= len; i++) {
    const ci = (r0 + sr * i) * n + (c0 + sc * i)
    line.push(ci)
    preview.value[ci] = true
  }
  lineIdx = line
}

function onCellDown(i, e) {
  if (phase.value !== 'play') return
  e.preventDefault()
  dragging.value = true
  startCell = i
  updateLine(i)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onMove(e) {
  if (!dragging.value) return
  const target = cellFromPoint(e.clientX, e.clientY)
  if (target >= 0) updateLine(target)
}

function onUp() {
  if (!dragging.value) return
  resolveLine()
  endDrag()
}

function endDrag() {
  dragging.value = false
  startCell = -1
  clearPreview()
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
}

function resolveLine() {
  if (lineIdx.length < 2) return
  const str = lineIdx.map((i) => grid.value[i]).join('')
  const rev = str.split('').reverse().join('')
  const t = targets.value.find((x) => !x.found && (x.word === str || x.word === rev))
  if (t) {
    t.found = true
    for (const i of lineIdx) found.value[i] = true
    sfx.win()
    if (foundCount.value === total.value) win()
  } else {
    sfx.wrong()
  }
}

function win() {
  stopTimer()
  phase.value = 'won'
  sfx.win()
  const cur = best.value[diffId.value]
  if (cur == null || elapsed.value < cur) {
    best.value = { ...best.value, [diffId.value]: elapsed.value }
    try {
      localStorage.setItem(bestKey, JSON.stringify(best.value))
    } catch (e) {
      /* storage may be blocked */
    }
  }
}

const bestLabel = computed(() => {
  const b = best.value[diffId.value]
  if (b == null) return null
  const m = Math.floor(b / 60)
  const s = b % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

onMounted(() => {
  try {
    best.value = JSON.parse(localStorage.getItem(bestKey) || '{}') || {}
  } catch (e) {
    best.value = {}
  }
})
onBeforeUnmount(() => {
  stopTimer()
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
})
</script>

<template>
  <div class="carikata">
    <div class="panel">
      <!-- ===== Menu ===== -->
      <section v-if="phase === 'menu'" class="screen">
        <p class="brand">CARI <span class="brand__accent">KATA</span></p>
        <p class="eyebrow">PILIH TINGKAT</p>

        <div class="field">
          <span class="field__label">Tingkat kesulitan</span>
          <div class="picker picker--3">
            <button
              v-for="d in DIFFS"
              :key="d.id"
              class="pick"
              :class="{ 'is-on': diffId === d.id }"
              type="button"
              @click="diffId = d.id"
            >
              {{ d.label }}
            </button>
          </div>
        </div>

        <p class="menu-note">{{ diff.size }}×{{ diff.size }} · {{ diff.words }} kata</p>

        <button class="cta" type="button" @click="start">Mulai ▸</button>
      </section>

      <!-- ===== Play ===== -->
      <section v-else-if="phase === 'play'" class="screen play">
        <div class="backbar"><button class="mini" type="button" @click="backToMenu">← Mode</button></div>

        <div class="solobar">
          <span>WAKTU <b>{{ clock }}</b></span>
          <span>{{ foundCount }}/{{ total }} kata</span>
        </div>

        <div
          class="board"
          :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)`, fontSize: cellFont + 'px' }"
        >
          <button
            v-for="(ch, i) in grid"
            :key="i"
            class="cell"
            :class="{ 'is-found': found[i], 'is-preview': preview[i] }"
            :data-idx="i"
            type="button"
            @pointerdown="onCellDown(i, $event)"
          >
            {{ ch }}
          </button>
        </div>

        <div class="words">
          <span
            v-for="t in targets"
            :key="t.word"
            class="wordchip"
            :class="{ 'is-found': t.found }"
          >
            {{ t.word }}
          </span>
        </div>
      </section>

      <!-- ===== Won ===== -->
      <section v-else class="screen result">
        <div class="backbar"><button class="mini" type="button" @click="backToMenu">← Mode</button></div>
        <p class="result__title">Selesai!</p>
        <p class="result__sub">Semua {{ total }} kata ditemukan dalam {{ clock }}.</p>
        <p v-if="bestLabel" class="result__streak">TERBAIK · {{ diff.label }} · {{ bestLabel }}</p>
        <button class="cta" type="button" @click="playAgain">Main lagi ▸</button>
        <button class="cta cta--alt" type="button" @click="backToMenu">← Mode</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/backbar/picker/
   solobar/result come from src/styles.css (see docs/STYLE.md). */
.carikata {
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

/* The picker holds 3 difficulties, not the global 4. */
.picker--3 {
  grid-template-columns: repeat(3, 1fr);
}
.menu-note {
  width: 100%;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin: -6px 0 18px;
}

.solobar {
  margin: 4px 0 14px;
}
.solobar b {
  color: var(--aqua-deep);
  font-weight: 700;
}

/* ---- Letter grid ---- */
.board {
  width: 100%;
  aspect-ratio: 1;
  display: grid;
  gap: 3px;
  margin: 0 auto 16px;
  touch-action: none;
  user-select: none;
}
.cell {
  display: grid;
  place-items: center;
  padding: 0;
  aspect-ratio: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-weight: 700;
  line-height: 1;
  color: var(--ink);
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.08s ease, color 0.08s ease;
}
.cell.is-preview {
  background: var(--tile-live);
}
.cell.is-found {
  background: var(--aqua);
  color: var(--ink);
}
.cell.is-found.is-preview {
  background: var(--tile-live);
}

/* ---- Word list ---- */
.words {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}
.wordchip {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--ink);
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 10px;
  padding: 5px 10px;
  transition: background 0.12s ease, color 0.12s ease;
}
.wordchip.is-found {
  background: var(--aqua);
  color: var(--aqua-deep);
  text-decoration: line-through;
  text-decoration-thickness: 2px;
}
</style>
