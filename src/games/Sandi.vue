<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'
import { PERIBAHASA } from '../data/peribahasa.js'

// Sandi — a cryptogram / cryptoquote in Indonesian. A peribahasa (proverb) is
// hidden behind a random substitution cipher (a full derangement, so no letter
// ever codes to itself). Tap a coded tile to select that cipher letter, then
// type a plaintext guess to fill every tile of that letter at once. One correct
// mapping is revealed free at the start; the rest is a solve-at-your-own-pace
// puzzle timed to the second. Solved-count and best time persist across games.

const SOLVED_KEY = 'dusk-sandi-solved'
const BEST_KEY = 'dusk-sandi-best'
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const PROVERBS = PERIBAHASA // 1000 Indonesian proverbs, see src/data/peribahasa.js

// The QWERTY on-screen keyboard, with a wide backspace like Wordle.
const KEY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
]

const answer = ref('') // the plaintext proverb
const encMap = ref({}) // plaintext letter -> cipher letter (derangement)
const cipher = ref('') // the ciphertext string (spaces preserved)
const guessMap = ref({}) // cipher letter -> guessed plaintext letter ('' if none)
const locked = ref({}) // cipher letter -> true when hint-revealed (immutable)
const selected = ref('') // the currently selected cipher letter
const phase = ref('play') // play | won
const hintsUsed = ref(0)
const solvedCount = ref(0)
const bestTime = ref(0) // seconds; 0 = none yet
const elapsed = ref(0) // seconds since the puzzle started

let timer = 0
let startAt = 0
let wasFull = false // guards the one-shot "board full but wrong" buzzer

// A random full derangement of A–Z: a permutation with no fixed point, so no
// letter is ever encoded as itself. Rejection-sample a shuffle until valid.
function makeCipher() {
  const src = ALPHA.split('')
  let perm
  do {
    perm = src.slice()
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = perm[i]
      perm[i] = perm[j]
      perm[j] = t
    }
  } while (perm.some((ch, i) => ch === src[i]))
  const map = {}
  src.forEach((ch, i) => (map[ch] = perm[i]))
  return map
}

// The solution key: cipher letter -> the plaintext letter it stands for.
const decMap = computed(() => {
  const m = {}
  for (const p in encMap.value) m[encMap.value[p]] = p
  return m
})

// Distinct cipher letters in reading order (used for selection + fill checks).
const cipherLetters = computed(() => {
  const seen = []
  for (const c of cipher.value) {
    if (c !== ' ' && !seen.includes(c)) seen.push(c)
  }
  return seen
})

// The board, grouped into words so they can wrap within the panel.
const layout = computed(() => cipher.value.split(' ').map((w) => w.split('')))

// Plaintext letters currently in play — used to tint keyboard keys already used.
const usedPlain = computed(() => {
  const s = new Set()
  for (const ch of cipherLetters.value) {
    const g = guessMap.value[ch]
    if (g) s.add(g)
  }
  return s
})

// Plaintext letters assigned to more than one cipher letter — a duplicate hint.
const dupPlain = computed(() => {
  const count = {}
  for (const ch of cipherLetters.value) {
    const g = guessMap.value[ch]
    if (g) count[g] = (count[g] || 0) + 1
  }
  const dups = new Set()
  for (const p in count) if (count[p] > 1) dups.add(p)
  return dups
})

// Solved when every cipher letter is guessed as its true plaintext.
const solved = computed(() => {
  for (const ch of cipherLetters.value) {
    if (guessMap.value[ch] !== decMap.value[ch]) return false
  }
  return cipherLetters.value.length > 0
})

const timeLabel = computed(() => fmt(elapsed.value))

function fmt(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}

// Reveal the correct mapping for the most frequent cipher letter, and lock it —
// the free leg-up every puzzle opens with (does not count as a Petunjuk).
function revealFrequent() {
  const freq = {}
  for (const c of cipher.value) if (c !== ' ') freq[c] = (freq[c] || 0) + 1
  let best = ''
  let bestN = -1
  for (const ch in freq) {
    if (freq[ch] > bestN) {
      bestN = freq[ch]
      best = ch
    }
  }
  if (best) {
    guessMap.value[best] = decMap.value[best]
    locked.value[best] = true
  }
}

// Build a fresh proverb + cipher without touching the timer.
function initPuzzle() {
  answer.value = PROVERBS[Math.floor(Math.random() * PROVERBS.length)]
  encMap.value = makeCipher()
  cipher.value = answer.value
    .split('')
    .map((c) => (c === ' ' ? ' ' : encMap.value[c]))
    .join('')
  guessMap.value = {}
  locked.value = {}
  hintsUsed.value = 0
  selected.value = ''
  phase.value = 'play'
  elapsed.value = 0
  wasFull = false
  revealFrequent()
  selected.value = cipherLetters.value.find((ch) => !locked.value[ch]) || ''
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

function newPuzzle() {
  initPuzzle()
  startTimer()
}

// Seed the first render before mount (timer starts in onMounted).
initPuzzle()

function persistSolved() {
  try {
    localStorage.setItem(SOLVED_KEY, String(solvedCount.value))
  } catch (e) {
    /* storage may be blocked; keep in-memory count */
  }
}
function persistBest() {
  try {
    localStorage.setItem(BEST_KEY, String(bestTime.value))
  } catch (e) {
    /* storage may be blocked; keep in-memory best */
  }
}

function win() {
  phase.value = 'won'
  stopTimer()
  sfx.win()
  solvedCount.value += 1
  persistSolved()
  if (bestTime.value === 0 || elapsed.value < bestTime.value) {
    bestTime.value = elapsed.value
    persistBest()
  }
}

// Move the selection to the next still-unsolved cipher letter, wrapping around.
function advanceSelection() {
  const list = cipherLetters.value
  if (!list.length) return
  const start = list.indexOf(selected.value)
  for (let k = 1; k <= list.length; k++) {
    const ch = list[(start + k) % list.length]
    if (!locked.value[ch] && !guessMap.value[ch]) {
      selected.value = ch
      return
    }
  }
}

function moveSelection(dir) {
  const list = cipherLetters.value
  if (!list.length) return
  let idx = list.indexOf(selected.value)
  if (idx === -1) idx = 0
  else idx = (idx + dir + list.length) % list.length
  // Skip locked tiles when stepping.
  for (let k = 0; k < list.length; k++) {
    const ch = list[(idx + (dir >= 0 ? k : -k) + list.length) % list.length]
    if (!locked.value[ch]) {
      selected.value = ch
      return
    }
  }
}

function selectCipher(ch) {
  if (phase.value !== 'play' || ch === ' ' || locked.value[ch]) return
  selected.value = ch
}

// Assign a plaintext letter to every tile of the selected cipher letter.
function assign(letter) {
  if (phase.value !== 'play') return
  const sel = selected.value
  if (!sel || locked.value[sel]) return
  guessMap.value[sel] = letter
  sfx.tick()
  advanceSelection()
  if (solved.value) {
    win()
    return
  }
  const allFilled = cipherLetters.value.every((ch) => guessMap.value[ch])
  if (allFilled && !wasFull) sfx.wrong() // board complete but not correct
  wasFull = allFilled
}

function clearSelected() {
  if (phase.value !== 'play') return
  const sel = selected.value
  if (!sel || locked.value[sel]) return
  guessMap.value[sel] = ''
  wasFull = false
}

// Petunjuk: reveal + lock one more correct letter, counts toward the tally.
function hint() {
  if (phase.value !== 'play') return
  const candidates = cipherLetters.value.filter(
    (ch) => !locked.value[ch] && guessMap.value[ch] !== decMap.value[ch],
  )
  if (!candidates.length) return
  const ch = candidates[Math.floor(Math.random() * candidates.length)]
  guessMap.value[ch] = decMap.value[ch]
  locked.value[ch] = true
  hintsUsed.value += 1
  sfx.tick()
  if (selected.value === ch) advanceSelection()
  if (solved.value) win()
}

function onKey(k) {
  if (k === 'BACK') clearSelected()
  else assign(k)
}

function keyClass(k) {
  if (k === 'BACK') return ''
  return usedPlain.value.has(k) ? 'is-used' : ''
}
function keyLabel(k) {
  return k === 'BACK' ? '⌫' : k
}

function tileGuess(c) {
  return guessMap.value[c] || ''
}
function isSelected(c) {
  return c === selected.value
}
function isLocked(c) {
  return !!locked.value[c]
}
function isDup(c) {
  const g = guessMap.value[c]
  return !!g && !locked.value[c] && dupPlain.value.has(g)
}
// A word tile gets a soft aqua tint once its whole word decodes correctly.
function wordDone(word) {
  return word.every((c) => guessMap.value[c] === decMap.value[c])
}

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
    clearSelected()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    moveSelection(-1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    moveSelection(1)
  } else if (/^[a-zA-Z]$/.test(e.key)) {
    assign(e.key.toUpperCase())
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
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopTimer()
})
</script>

<template>
  <div class="sandi">
    <div class="panel">
      <section class="screen">
        <p class="brand">SAN<span class="brand__accent">DI</span></p>
        <p class="eyebrow">PECAHKAN SANDI PERIBAHASA</p>

        <div class="solobar hud">
          <span>WAKTU <b>{{ timeLabel }}</b></span>
          <span>PETUNJUK <b>{{ hintsUsed }}</b></span>
          <span class="solobar__best">SELESAI {{ solvedCount }}</span>
        </div>

        <!-- The cryptogram: words wrap; each tile shows the coded letter and
             your current guess for it. -->
        <div class="crypto">
          <div
            v-for="(word, wi) in layout"
            :key="wi"
            class="cword"
            :class="{ 'is-done': phase === 'play' && wordDone(word) }"
          >
            <button
              v-for="(c, ci) in word"
              :key="ci"
              class="ctile"
              type="button"
              :class="{
                'is-selected': isSelected(c),
                'is-locked': isLocked(c),
                'is-dup': isDup(c),
              }"
              @click="selectCipher(c)"
            >
              <span class="ctile__guess">{{ tileGuess(c) }}</span>
              <span class="ctile__code">{{ c }}</span>
            </button>
          </div>
        </div>

        <!-- Controls: keyboard + Petunjuk while playing, the result otherwise. -->
        <template v-if="phase === 'play'">
          <p class="tip">Ketuk ubin, lalu ketik hurufnya.</p>

          <div class="tools">
            <button class="mini" type="button" @click="hint">Petunjuk</button>
          </div>

          <div class="keyboard">
            <div v-for="(krow, ri) in KEY_ROWS" :key="ri" class="krow">
              <button
                v-for="k in krow"
                :key="k"
                class="key"
                type="button"
                :class="[keyClass(k), { 'key--wide': k === 'BACK' }]"
                @click="onKey(k)"
              >
                {{ keyLabel(k) }}
              </button>
            </div>
          </div>
        </template>

        <div v-else class="result">
          <p class="result__title">Terpecahkan!</p>
          <p class="result__sub">{{ answer }}</p>
          <p class="result__streak">WAKTU {{ timeLabel }} · SELESAI {{ solvedCount }}</p>
          <button class="cta" type="button" @click="newPuzzle">Sandi baru ▸</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/solobar/result come
   from src/styles.css. */
.sandi {
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
  font-size: 34px;
}

/* base is global; only the margin is page-specific */
.hud {
  margin-bottom: 16px;
}
.hud b {
  color: var(--aqua-deep);
}

/* ---- Cryptogram board ---- */
.crypto {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 9px 11px;
  margin: 6px 0 16px;
}
.cword {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}
.ctile {
  width: clamp(24px, 6.6vw, 30px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 3px 0 0;
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 8px;
  box-shadow: var(--pop-sm);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.12s ease;
}
.ctile__guess {
  height: 22px;
  font-family: var(--font-display);
  font-size: 20px;
  line-height: 22px;
  color: var(--ink);
}
.ctile__code {
  width: 100%;
  border-top: 2px solid var(--ink);
  padding-top: 2px;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
  color: var(--muted);
}
.ctile.is-selected {
  background: var(--tile-live);
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--ink);
}
.ctile.is-selected .ctile__code {
  color: var(--sun-core);
}
.cword.is-done .ctile:not(.is-selected):not(.is-locked) {
  background: #d9f6ef;
}
.ctile.is-locked {
  background: var(--aqua);
}
.ctile.is-locked .ctile__code {
  color: var(--aqua-deep);
}
.ctile.is-dup .ctile__guess {
  color: var(--berry);
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

/* ---- On-screen keyboard (physical keys work too) ---- */
.keyboard {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
}
.krow {
  display: flex;
  gap: 5px;
  justify-content: center;
}
.key {
  flex: 1 1 0;
  min-width: 24px;
  height: 48px;
  display: grid;
  place-items: center;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 15px;
  color: var(--ink);
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 8px;
  box-shadow: var(--pop-sm);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.12s ease;
}
.key:hover:not(:active),
.key:focus-visible {
  transform: translate(-1px, -1px);
}
.key:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--ink);
}
.key--wide {
  flex: 1.6 1 0;
  font-size: 18px;
}
.key.is-used {
  background: var(--sun);
}

/* ---- Result ---- */
.result {
  width: 100%;
  text-align: center;
  padding-top: 4px;
}
.result__sub {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--ink);
  letter-spacing: 0.01em;
}
.result__streak {
  margin: 6px 0 14px;
}
</style>
