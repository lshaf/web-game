<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { sfx } from '../sound.js'
import { KBBI } from '../data/kbbi.js'
import { puzzles } from '../data/words.js'

// Tangga Kata (Word Ladder) — climb from the start word to the goal by changing
// one letter at a time, and every rung must be a real KBBI word. Puzzles are
// generated from the KBBI graph: a start word is chosen, breadth-first search
// finds a goal exactly N steps away, so a solution always exists and N is the
// par. Endpoints are drawn from the common (clued) wordlist so they read well;
// the rungs in between can be any dictionary word.

const L = 5 // word length
const SOLVED_KEY = 'dusk-tangga-solved'

// Common, recognisable 5-letter words for the start/goal endpoints.
const COMMON = new Set(puzzles.filter((p) => p.answer.length === L).map((p) => p.answer))

const LEVELS = [
  { key: 'mudah', label: 'Mudah', par: 3 },
  { key: 'sedang', label: 'Sedang', par: 5 },
  { key: 'sulit', label: 'Sulit', par: 7 },
]

// The word graph is heavy to build, so do it once, lazily, and reuse it.
let GRAPH = null
function ensureGraph() {
  if (GRAPH) return GRAPH
  const words = []
  for (const w of KBBI) if (w.length === L) words.push(w)
  // Wildcard buckets: two words share a bucket iff they differ by one letter.
  const buckets = new Map()
  for (const w of words) {
    for (let i = 0; i < L; i++) {
      const k = w.slice(0, i) + '*' + w.slice(i + 1)
      let a = buckets.get(k)
      if (!a) buckets.set(k, (a = []))
      a.push(w)
    }
  }
  const common = words.filter((w) => COMMON.has(w))
  GRAPH = { buckets, common }
  return GRAPH
}
function neighbors(w, buckets) {
  const out = []
  for (let i = 0; i < L; i++) {
    const a = buckets.get(w.slice(0, i) + '*' + w.slice(i + 1))
    if (a) for (const x of a) if (x !== w) out.push(x)
  }
  return out
}
function bfs(start, buckets) {
  const dist = new Map([[start, 0]])
  const prev = new Map()
  const q = [start]
  let h = 0
  while (h < q.length) {
    const x = q[h++]
    for (const y of neighbors(x, buckets)) {
      if (!dist.has(y)) {
        dist.set(y, dist.get(x) + 1)
        prev.set(y, x)
        q.push(y)
      }
    }
  }
  return { dist, prev }
}

// A start/goal pair exactly `par` letter-swaps apart, so par is the shortest ladder.
function generate(par) {
  const { common, buckets } = ensureGraph()
  for (let t = 0; t < 150; t++) {
    const start = common[Math.floor(Math.random() * common.length)]
    const { dist } = bfs(start, buckets)
    const atD = []
    for (const [w, d] of dist) if (d === par) atD.push(w)
    if (!atD.length) continue
    const commons = atD.filter((w) => COMMON.has(w))
    const pool = commons.length ? commons : atD
    return { start, end: pool[Math.floor(Math.random() * pool.length)], par }
  }
  return null
}

const phase = ref('setup') // setup | play | won
const sel = ref(LEVELS[0])
const level = ref(LEVELS[0])
const puzzle = ref(null) // { start, end, par }
const rungs = ref([]) // words climbed so far, start first
const used = ref(new Set())
const draft = ref('')
const note = ref('')
const hintsUsed = ref(0)
const solvedCount = ref(0)

let noteTimer = 0
const input = ref(null)
const ladder = ref(null)

const steps = computed(() => rungs.value.length - 1)
const current = computed(() => rungs.value[rungs.value.length - 1] || '')

function focusInput() {
  nextTick(() => input.value?.focus({ preventScroll: true }))
}
function scrollLadder() {
  nextTick(() => {
    if (ladder.value) ladder.value.scrollTop = ladder.value.scrollHeight
  })
}
function toast(msg) {
  note.value = msg
  clearTimeout(noteTimer)
  noteTimer = setTimeout(() => (note.value = ''), 1500)
  sfx.wrong()
}

function deal() {
  const p = generate(level.value.par) || generate(3)
  puzzle.value = p
  rungs.value = [p.start]
  used.value = new Set([p.start])
  draft.value = p.start
  hintsUsed.value = 0
  note.value = ''
  phase.value = 'play'
  focusInput()
}
function start() {
  level.value = sel.value
  deal()
}
function toSetup() {
  phase.value = 'setup'
}

// The single letter that changed between rung k and the one before it (-1 = none).
function changedIdx(k) {
  if (k <= 0) return -1
  const a = rungs.value[k]
  const b = rungs.value[k - 1]
  for (let i = 0; i < L; i++) if (a[i] !== b[i]) return i
  return -1
}

function submit() {
  if (phase.value !== 'play') return
  const w = draft.value.trim().toUpperCase()
  const cur = current.value
  if (w.length !== L) return toast(`${L} huruf`)
  if (!/^[A-Z]+$/.test(w)) return toast('Huruf saja')
  let diff = 0
  for (let i = 0; i < L; i++) if (w[i] !== cur[i]) diff++
  if (diff !== 1) return toast('Ubah satu huruf saja')
  if (used.value.has(w)) return toast('Sudah dipakai')
  if (!KBBI.has(w)) return toast('Bukan kata KBBI')
  rungs.value.push(w)
  used.value.add(w)
  sfx.tick()
  scrollLadder()
  if (w === puzzle.value.end) {
    win()
    return
  }
  draft.value = w
  focusInput()
}

function undo() {
  if (phase.value !== 'play' || rungs.value.length <= 1) return
  const removed = rungs.value.pop()
  used.value.delete(removed)
  draft.value = current.value
  focusInput()
}

// Petunjuk: put the best next word (one step along the shortest remaining path)
// into the box, so you still choose to play it.
function hint() {
  if (phase.value !== 'play') return
  const { buckets } = ensureGraph()
  const { prev } = bfs(current.value, buckets)
  const goal = puzzle.value.end
  if (!prev.has(goal)) return
  let node = goal
  const path = [node]
  while (prev.has(node)) {
    node = prev.get(node)
    path.unshift(node)
  }
  draft.value = path[1] || goal
  hintsUsed.value += 1
  focusInput()
}

function win() {
  phase.value = 'won'
  sfx.win()
  solvedCount.value += 1
  try {
    localStorage.setItem(SOLVED_KEY, String(solvedCount.value))
  } catch (e) {
    /* storage may be blocked; keep in-memory */
  }
}

onMounted(() => {
  try {
    solvedCount.value = Number(localStorage.getItem(SOLVED_KEY)) || 0
  } catch (e) {
    solvedCount.value = 0
  }
})
</script>

<template>
  <div class="tangga">
    <div class="panel">
      <section class="screen">
        <!-- Setup: pick a difficulty (by ladder length) before playing. -->
        <template v-if="phase === 'setup'">
          <p class="brand">TANGGA<span class="brand__accent"> KATA</span></p>
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
          <p class="setup__info">{{ sel.par }} langkah minimum · SELESAI {{ solvedCount }}</p>
          <button class="cta" type="button" @click="start">Mulai ▸</button>
        </template>

        <!-- Play / won. -->
        <template v-else>
          <div class="backbar">
            <button class="mini" type="button" @click="toSetup">← Tingkat</button>
          </div>
          <p class="brand brand--sm">TANGGA<span class="brand__accent"> KATA</span></p>

          <div class="solobar hud">
            <span>LANGKAH <b>{{ steps }}</b></span>
            <span>PAR <b>{{ puzzle.par }}</b></span>
            <span class="solobar__best">SELESAI {{ solvedCount }}</span>
          </div>

          <!-- The goal word to reach. -->
          <div class="goal">
            <span class="goal__cap">TUJUAN</span>
            <span class="goal__word">
              <span v-for="(ch, i) in puzzle.end" :key="i" class="tile tile--goal">{{ ch }}</span>
            </span>
          </div>

          <div class="toastwrap">
            <transition name="toast">
              <span v-if="note" class="toast">{{ note }}</span>
            </transition>
          </div>

          <!-- The ladder: start at the top, newest rung at the bottom. -->
          <div ref="ladder" class="ladder">
            <div
              v-for="(word, k) in rungs"
              :key="k"
              class="rung"
              :class="{ 'is-start': k === 0, 'is-current': k === rungs.length - 1 }"
            >
              <span
                v-for="(ch, i) in word"
                :key="i"
                class="tile"
                :class="{ 'is-changed': i === changedIdx(k), 'is-win': phase === 'won' && k === rungs.length - 1 }"
              >
                {{ ch }}
              </span>
            </div>
          </div>

          <template v-if="phase === 'play'">
            <form class="entry" @submit.prevent="submit">
              <input
                ref="input"
                v-model="draft"
                class="entry__input"
                type="text"
                :maxlength="L"
                inputmode="text"
                autocapitalize="characters"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
              />
              <button class="cta" type="submit">Naik ▸</button>
            </form>
            <div class="tools">
              <button class="mini" type="button" :disabled="rungs.length <= 1" @click="undo">
                ↶ Undo
              </button>
              <button class="mini" type="button" @click="hint">Petunjuk</button>
            </div>
          </template>

          <div v-else class="result">
            <p class="result__title">Sampai puncak!</p>
            <p class="result__streak">
              {{ steps }} LANGKAH · PAR {{ puzzle.par }} · SELESAI {{ solvedCount }}
            </p>
            <button class="cta" type="button" @click="deal">Tangga baru ▸</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/backbar/picker/pick/
   solobar/result come from src/styles.css. */
.tangga {
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
  font-size: 26px;
}
.brand--sm {
  font-size: 21px;
  margin-top: 2px;
}

/* ---- Setup ---- */
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
  margin: 12px 0;
}
.hud b {
  color: var(--aqua-deep);
}

/* ---- Goal ---- */
.goal {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.goal__cap {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--muted);
}
.goal__word {
  display: flex;
  gap: 5px;
}

/* ---- Tiles + ladder ---- */
.ladder {
  --tile: clamp(38px, 12vw, 50px);
  width: 100%;
  max-height: 264px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 6px 0 2px;
  margin-bottom: 12px;
}
.rung {
  display: flex;
  gap: 5px;
}
.tile {
  width: var(--tile, 44px);
  height: var(--tile, 44px);
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: calc(var(--tile, 44px) * 0.5);
  color: var(--ink);
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 8px;
}
.rung.is-start .tile {
  background: var(--paper-lit);
}
.tile.is-changed {
  background: var(--sun);
}
.rung.is-current .tile {
  box-shadow: var(--pop-sm);
}
.tile.is-win {
  background: #43c96b;
  color: var(--cream);
}
/* Goal tiles read a touch smaller and cooler than the ladder. */
.tile--goal {
  width: clamp(30px, 9vw, 38px);
  height: clamp(30px, 9vw, 38px);
  font-size: 18px;
  background: var(--aqua);
  border-radius: 7px;
}

/* ---- Toast ---- */
.toastwrap {
  position: relative;
  width: 100%;
  height: 0;
  z-index: 5;
}
.toast {
  position: absolute;
  left: 50%;
  top: -2px;
  transform: translateX(-50%);
  background: var(--ink);
  color: var(--cream);
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  padding: 7px 15px;
  border-radius: 999px;
  box-shadow: var(--pop-sm);
  white-space: nowrap;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px);
}

/* ---- Entry: full-width input, then a standard full-width CTA ---- */
.entry {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.entry__input {
  width: 100%;
  height: 50px;
  padding: 0 16px;
  font-family: var(--font-display);
  font-size: 22px;
  letter-spacing: 0.32em;
  text-align: center;
  text-transform: uppercase;
  color: var(--ink);
  background: var(--paper-lit);
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  box-shadow: var(--pop-sm);
}
.entry__input:focus {
  outline: none;
  background: var(--tile-live);
}
.tools {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 12px;
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
