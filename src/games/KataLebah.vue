<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'
import { KBBI } from '../data/kbbi.js'

// Kata Lebah (Spelling Bee) — seven letters in a honeycomb, one required centre.
// Make as many KBBI words of four letters or more as you can, using only these
// letters (repeats allowed) and always including the centre one. The word that
// uses all seven is a pangram, worth a bonus. Puzzles are built from the KBBI
// dictionary around a real pangram, tuned to a findable word count. Reach Jenius
// to bank a clear.

const SOLVED_KEY = 'dusk-lebah-solved'
const MIN = 20 // desired word count window for a fresh puzzle
const MAX = 65

const RANKS = [
  { at: 0, name: 'Pemula' },
  { at: 0.08, name: 'Bagus' },
  { at: 0.2, name: 'Hebat' },
  { at: 0.35, name: 'Keren' },
  { at: 0.5, name: 'Jagoan' },
  { at: 0.7, name: 'Jenius' },
  { at: 1, name: 'Ratu Lebah' },
]

const maskOf = (w) => {
  let m = 0
  for (const ch of w) m |= 1 << (ch.charCodeAt(0) - 65)
  return m
}
const popcount = (m) => {
  let c = 0
  while (m) {
    c += m & 1
    m >>= 1
  }
  return c
}
const lettersOf = (m) => {
  const a = []
  for (let i = 0; i < 26; i++) if (m & (1 << i)) a.push(String.fromCharCode(65 + i))
  return a
}

// Built once, lazily: every 4+ letter word with ≤7 distinct letters (+ its mask),
// and the set of 7-letter masks that actually spell a pangram.
let DATA = null
function ensureData() {
  if (DATA) return DATA
  const words = []
  const panSet = new Set()
  for (const w of KBBI) {
    if (w.length < 4 || !/^[A-Z]+$/.test(w)) continue
    const m = maskOf(w)
    const bits = popcount(m)
    if (bits > 7) continue
    words.push({ w, m })
    if (bits === 7) panSet.add(m)
  }
  DATA = { words, pangramMasks: [...panSet] }
  return DATA
}

const wordScore = (w, isPan) => (w.length === 4 ? 1 : w.length) + (isPan ? 7 : 0)

// A puzzle around a real pangram, with a centre that yields MIN..MAX words.
function generate() {
  const { words, pangramMasks } = ensureData()
  const shuf = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  let fallback = null
  for (let t = 0; t < 400; t++) {
    const setM = pangramMasks[Math.floor(Math.random() * pangramMasks.length)]
    const inSet = words.filter((x) => (x.m & setM) === x.m)
    for (const L of shuf(lettersOf(setM))) {
      const bit = 1 << (L.charCodeAt(0) - 65)
      const valid = inSet.filter((x) => x.m & bit)
      const pangrams = valid.filter((x) => x.m === setM)
      if (!pangrams.length) continue
      const build = () => {
        const wset = new Set(valid.map((x) => x.w))
        const maxScore = valid.reduce((s, x) => s + wordScore(x.w, x.m === setM), 0)
        return {
          center: L,
          outer: lettersOf(setM).filter((c) => c !== L),
          words: wset,
          total: wset.size,
          maxScore,
        }
      }
      if (valid.length >= MIN && valid.length <= MAX) return build()
      if (!fallback && valid.length >= 8) fallback = build()
    }
  }
  return fallback
}

// Honeycomb offsets (units of hex width / height) — centre, then the six around.
const HEX = [
  { dx: 0, dy: 0 },
  { dx: -0.5, dy: -0.75 },
  { dx: 0.5, dy: -0.75 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -0.5, dy: 0.75 },
  { dx: 0.5, dy: 0.75 },
]

const puzzle = ref(null)
const outer = ref([]) // the six outer letters, in display order
const draft = ref('')
const found = ref([]) // words found, newest first
const score = ref(0)
const note = ref('')
const solvedCount = ref(0)

let geniusHit = false
let noteTimer = 0

const rank = computed(() => {
  if (!puzzle.value) return RANKS[0].name
  const pct = score.value / puzzle.value.maxScore
  let r = RANKS[0].name
  for (const t of RANKS) if (pct >= t.at) r = t.name
  return r
})

const hexes = computed(() => {
  const p = puzzle.value
  if (!p) return []
  return HEX.map((h, i) => ({
    ...h,
    letter: i === 0 ? p.center : outer.value[i - 1],
    center: i === 0,
  }))
})

function toast(msg) {
  note.value = msg
  clearTimeout(noteTimer)
  noteTimer = setTimeout(() => (note.value = ''), 1400)
  sfx.wrong()
}

function newPuzzle() {
  const p = generate()
  puzzle.value = p
  outer.value = [...p.outer]
  draft.value = ''
  found.value = []
  score.value = 0
  note.value = ''
  geniusHit = false
}

function tapLetter(L) {
  draft.value += L
}
function del() {
  draft.value = draft.value.slice(0, -1)
}
function clear() {
  draft.value = ''
}
function shuffleOuter() {
  const a = outer.value.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  outer.value = a
}

function submit() {
  const p = puzzle.value
  const w = draft.value.toUpperCase()
  if (!w) return
  if (w.length < 4) return toast('Minimal 4 huruf')
  if (!w.includes(p.center)) return toast(`Harus ada ${p.center}`)
  const allowed = new Set([p.center, ...p.outer])
  if ([...w].some((ch) => !allowed.has(ch))) return toast('Huruf tak tersedia')
  if (found.value.includes(w)) return toast('Sudah ketemu')
  if (!p.words.has(w)) return toast('Bukan kata KBBI')
  const isPan = maskOf(w) === maskOf(p.center + p.outer.join(''))
  found.value.unshift(w)
  score.value += wordScore(w, isPan)
  draft.value = ''
  sfx.win()
  if (isPan) sfx.win()
  if (!geniusHit && score.value / p.maxScore >= 0.7) {
    geniusHit = true
    solvedCount.value += 1
    try {
      localStorage.setItem(SOLVED_KEY, String(solvedCount.value))
    } catch (e) {
      /* storage may be blocked */
    }
  }
}

function isPangramWord(w) {
  return puzzle.value && maskOf(w) === maskOf(puzzle.value.center + puzzle.value.outer.join(''))
}

function onKeydown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const p = puzzle.value
  if (!p) return
  if (e.key === 'Enter') {
    e.preventDefault()
    submit()
  } else if (e.key === 'Backspace') {
    e.preventDefault()
    del()
  } else if (/^[a-zA-Z]$/.test(e.key)) {
    const L = e.key.toUpperCase()
    if (L === p.center || p.outer.includes(L)) {
      e.preventDefault()
      draft.value += L
    }
  }
}

newPuzzle()

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  try {
    solvedCount.value = Number(localStorage.getItem(SOLVED_KEY)) || 0
  } catch (e) {
    solvedCount.value = 0
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(noteTimer)
})
</script>

<template>
  <div class="lebah">
    <div class="panel">
      <section class="screen">
        <p class="brand">KATA<span class="brand__accent"> LEBAH</span></p>
        <p class="eyebrow">SUSUN KATA DARI SARANG</p>

        <div class="solobar hud">
          <span>SKOR <b>{{ score }}</b></span>
          <span>{{ rank }}</span>
          <span class="solobar__best">KATA {{ found.length }}/{{ puzzle.total }}</span>
        </div>

        <div class="toastwrap">
          <transition name="toast">
            <span v-if="note" class="toast">{{ note }}</span>
          </transition>
        </div>

        <!-- The word being built. -->
        <p class="draft">
          <template v-for="(ch, i) in draft" :key="i">
            <span :class="{ 'draft__center': ch === puzzle.center }">{{ ch }}</span>
          </template>
          <span v-if="!draft" class="draft__hint">Ketik atau ketuk huruf…</span>
        </p>

        <!-- The honeycomb. -->
        <div class="hive">
          <button
            v-for="(h, i) in hexes"
            :key="i"
            class="hex"
            type="button"
            :style="{
              left: `calc(50% + ${h.dx} * var(--hw) - var(--hw) / 2)`,
              top: `calc(50% + ${h.dy} * var(--hh) - var(--hh) / 2)`,
            }"
            @click="tapLetter(h.letter)"
          >
            <span class="hex__face" :class="{ 'hex__face--center': h.center }">{{ h.letter }}</span>
          </button>
        </div>

        <div class="controls">
          <button class="mini" type="button" @click="del">⌫ Hapus</button>
          <button class="mini" type="button" @click="shuffleOuter">↻ Acak</button>
          <button class="cta cta--enter" type="button" @click="submit">Kirim</button>
        </div>

        <div class="tools">
          <button class="mini mini--ghost-real" type="button" @click="newPuzzle">Sarang baru</button>
        </div>

        <!-- Found words. -->
        <div v-if="found.length" class="found">
          <span
            v-for="w in found"
            :key="w"
            class="chip"
            :class="{ 'chip--pan': isPangramWord(w) }"
            >{{ w }}</span
          >
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/solobar come from
   src/styles.css. */
.lebah {
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
  font-size: 25px;
}
.hud {
  margin: 12px 0 6px;
}
.hud b {
  color: var(--aqua-deep);
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
  top: 2px;
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

/* ---- Draft word ---- */
.draft {
  height: 34px;
  margin: 8px 0 4px;
  text-align: center;
  font-family: var(--font-display);
  font-size: 26px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink);
}
.draft__center {
  color: var(--sun-core);
}
.draft__hint {
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--muted);
  text-transform: none;
}

/* ---- Honeycomb ---- */
.hive {
  --hh: clamp(54px, 17vw, 66px);
  --hw: calc(var(--hh) * 0.866);
  position: relative;
  width: 100%;
  height: calc(var(--hh) * 2.85);
  margin: 6px 0 14px;
}
.hex {
  position: absolute;
  width: var(--hw);
  height: var(--hh);
  padding: 0;
  border: none;
  background: var(--ink); /* the outline */
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.08s ease;
}
.hex__face {
  position: absolute;
  inset: 2.5px;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: calc(var(--hh) * 0.42);
  color: var(--ink);
  background: var(--paper-lit);
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
}
.hex__face--center {
  background: var(--sun);
}
.hex:active {
  transform: scale(0.92);
}

/* ---- Controls ---- */
.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.cta--enter {
  width: auto;
  margin-top: 0;
  padding: 11px 22px;
}
.tools {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}
.mini--ghost-real {
  background: var(--paper-lit);
}

/* ---- Found words ---- */
.found {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
  max-height: 150px;
  overflow-y: auto;
  padding: 10px;
  background: rgba(44, 19, 56, 0.04);
  border-radius: 12px;
}
.chip {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink);
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 8px;
  padding: 4px 9px;
}
.chip--pan {
  background: var(--sun);
}
</style>
