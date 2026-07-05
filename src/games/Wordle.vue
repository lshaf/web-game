<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ANSWERS, VALID } from '../data/wordle.js'
import { sfx } from '../sound.js'

// Wordle — the classic word game in Indonesian. Guess a secret 5-letter word in
// 6 tries; each guess is scored letter-by-letter (correct / present / absent)
// with the duplicate-safe two-pass rule. Solo stats persist across games.

const ROWS = 6
const COLS = 5
const STATS_KEY = 'dusk-wordle-stats'

const KEY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
]

const secret = ref('')
const guesses = ref([]) // { letters: string[], states: string[] }
const current = ref('') // the active row being typed
const phase = ref('play') // play | won | lost
const revealIndex = ref(-1) // row currently doing its flip reveal
const shaking = ref(false)
const bukan = ref(false) // "Bukan kata" toast

const stats = ref({ played: 0, won: 0, streak: 0, best: 0 })

let shakeTimer = 0
let toastTimer = 0

// A fresh secret + empty board; starts playing straight away.
function newGame() {
  secret.value = ANSWERS[Math.floor(Math.random() * ANSWERS.length)]
  guesses.value = []
  current.value = ''
  revealIndex.value = -1
  shaking.value = false
  bukan.value = false
  phase.value = 'play'
}

secret.value = ANSWERS[Math.floor(Math.random() * ANSWERS.length)]

// Two-pass scoring: pass 1 locks exact hits and consumes those secret letters,
// pass 2 marks 'present' only against letters still unconsumed.
function evaluate(guess, answer) {
  const states = Array(COLS).fill('absent')
  const letters = answer.split('')
  const used = Array(COLS).fill(false)
  for (let i = 0; i < COLS; i++) {
    if (guess[i] === letters[i]) {
      states[i] = 'correct'
      used[i] = true
    }
  }
  for (let i = 0; i < COLS; i++) {
    if (states[i] === 'correct') continue
    for (let j = 0; j < COLS; j++) {
      if (!used[j] && letters[j] === guess[i]) {
        states[i] = 'present'
        used[j] = true
        break
      }
    }
  }
  return states
}

// The 6×5 grid: submitted guesses, then the active typing row, then blanks.
const board = computed(() => {
  const rows = []
  for (let r = 0; r < ROWS; r++) {
    const cells = []
    if (r < guesses.value.length) {
      const g = guesses.value[r]
      for (let c = 0; c < COLS; c++) cells.push({ ch: g.letters[c], state: g.states[c] })
      rows.push({ cells, active: false })
    } else if (r === guesses.value.length && phase.value === 'play') {
      const typed = current.value
      for (let c = 0; c < COLS; c++) {
        cells.push({ ch: typed[c] || '', state: c < typed.length ? 'live' : 'empty' })
      }
      rows.push({ cells, active: true })
    } else {
      for (let c = 0; c < COLS; c++) cells.push({ ch: '', state: 'empty' })
      rows.push({ cells, active: false })
    }
  }
  return rows
})

// Best-known state per letter across every guess (correct beats present beats absent).
const keyState = computed(() => {
  const rank = { absent: 1, present: 2, correct: 3 }
  const map = {}
  for (const g of guesses.value) {
    for (let i = 0; i < COLS; i++) {
      const ch = g.letters[i]
      const st = g.states[i]
      if (!map[ch] || rank[st] > rank[map[ch]]) map[ch] = st
    }
  }
  return map
})

function tileClass(state) {
  return state === 'empty' ? '' : 'is-' + state
}
function keyClass(k) {
  if (k === 'ENTER' || k === 'BACK') return ''
  const st = keyState.value[k]
  return st ? 'is-' + st : ''
}
function keyLabel(k) {
  if (k === 'ENTER') return 'Enter'
  if (k === 'BACK') return '⌫'
  return k
}

function shakeRow() {
  shaking.value = true
  clearTimeout(shakeTimer)
  shakeTimer = setTimeout(() => (shaking.value = false), 420)
}
function toast() {
  bukan.value = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (bukan.value = false), 1300)
}

function typeLetter(ch) {
  if (phase.value !== 'play') return
  if (current.value.length >= COLS) return
  current.value += ch
  sfx.tick()
}
function backspace() {
  if (phase.value !== 'play') return
  current.value = current.value.slice(0, -1)
}

function finishGame(didWin) {
  const s = stats.value
  s.played += 1
  if (didWin) {
    s.won += 1
    s.streak += 1
    if (s.streak > s.best) s.best = s.streak
  } else {
    s.streak = 0
  }
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s))
  } catch (e) {
    /* storage may be blocked; keep in-memory stats */
  }
}

function submit() {
  if (phase.value !== 'play') return
  const guess = current.value
  if (guess.length < COLS) {
    shakeRow()
    sfx.wrong()
    return
  }
  if (!VALID.has(guess)) {
    shakeRow()
    sfx.wrong()
    toast()
    return
  }
  const states = evaluate(guess, secret.value)
  guesses.value.push({ letters: guess.split(''), states })
  revealIndex.value = guesses.value.length - 1
  current.value = ''
  if (guess === secret.value) {
    phase.value = 'won'
    sfx.win()
    finishGame(true)
  } else if (guesses.value.length >= ROWS) {
    phase.value = 'lost'
    sfx.lose()
    finishGame(false)
  }
}

function onKey(k) {
  if (k === 'ENTER') submit()
  else if (k === 'BACK') backspace()
  else typeLetter(k)
}

function onKeydown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (phase.value !== 'play') {
    if (e.key === 'Enter') {
      e.preventDefault()
      newGame()
    }
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    submit()
  } else if (e.key === 'Backspace') {
    e.preventDefault()
    backspace()
  } else if (/^[a-zA-Z]$/.test(e.key)) {
    typeLetter(e.key.toUpperCase())
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      stats.value = {
        played: Number(p.played) || 0,
        won: Number(p.won) || 0,
        streak: Number(p.streak) || 0,
        best: Number(p.best) || 0,
      }
    }
  } catch (e) {
    /* storage may be blocked; keep defaults */
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(shakeTimer)
  clearTimeout(toastTimer)
})
</script>

<template>
  <div class="wordle">
    <div class="panel">
      <section class="screen">
        <p class="brand">WORD<span class="brand__accent">LE</span></p>
        <p class="eyebrow">TEBAK KATA LIMA HURUF</p>

        <div class="solobar stats">
          <span>MENANG <b>{{ stats.won }}/{{ stats.played }}</b></span>
          <span>BERUNTUN <b>{{ stats.streak }}</b></span>
          <span class="solobar__best">TERBAIK {{ stats.best }}</span>
        </div>

        <div class="toastwrap">
          <transition name="toast">
            <span v-if="bukan" class="toast">Bukan kata</span>
          </transition>
        </div>

        <div class="board">
          <div
            v-for="(row, r) in board"
            :key="r"
            class="row"
            :class="{ shake: shaking && row.active }"
          >
            <div
              v-for="(cell, c) in row.cells"
              :key="c"
              class="tile"
              :class="[tileClass(cell.state), { 'is-reveal': r === revealIndex }]"
              :style="{ '--i': c }"
            >
              {{ cell.ch }}
            </div>
          </div>
        </div>

        <!-- Controls: the on-screen keyboard while playing, the result otherwise. -->
        <div v-if="phase === 'play'" class="keyboard">
          <div v-for="(krow, ri) in KEY_ROWS" :key="ri" class="krow">
            <button
              v-for="k in krow"
              :key="k"
              class="key"
              :class="[keyClass(k), { 'key--wide': k === 'ENTER' || k === 'BACK' }]"
              type="button"
              @click="onKey(k)"
            >
              {{ keyLabel(k) }}
            </button>
          </div>
        </div>

        <div v-else class="result">
          <p class="result__title" :class="{ 'is-lost': phase === 'lost' }">
            {{ phase === 'won' ? 'Tepat!' : 'Yah!' }}
          </p>
          <p v-if="phase === 'lost'" class="result__sub">Jawaban: {{ secret }}</p>
          <p class="result__streak">BERUNTUN {{ stats.streak }} · TERBAIK {{ stats.best }}</p>
          <button class="cta" type="button" @click="newGame">Main lagi ▸</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/solobar/result come from
   src/styles.css. */
.wordle {
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
  font-size: 34px;
}

/* base is global; only the margin is page-specific */
.stats {
  margin-bottom: 14px;
}
.stats b {
  color: var(--aqua-deep);
}

/* ---- Toast: overlays the top of the board so nothing shifts ---- */
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
  letter-spacing: 0.1em;
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

/* ---- Board ---- */
.board {
  width: 100%;
  max-width: 330px;
  margin: 4px auto 18px;
  display: grid;
  grid-template-rows: repeat(6, 1fr);
  gap: 6px;
}
.row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  perspective: 500px;
}
.tile {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: clamp(20px, 8vw, 30px);
  line-height: 1;
  text-transform: uppercase;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 10px;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.12s ease;
}
.tile.is-live {
  background: var(--tile-live);
  box-shadow: var(--pop-sm);
}
.tile.is-correct {
  background: #43c96b;
  color: var(--cream);
}
.tile.is-present {
  background: var(--sun);
  color: var(--ink);
}
.tile.is-absent {
  background: var(--absent);
  color: var(--ink);
}
.tile.is-reveal {
  animation: kh-flip 0.42s ease both;
  animation-delay: calc(var(--i) * 0.09s);
}
@keyframes kh-flip {
  0% {
    transform: rotateX(0deg);
  }
  50% {
    transform: rotateX(90deg);
  }
  100% {
    transform: rotateX(0deg);
  }
}

/* ---- On-screen keyboard ---- */
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
  font-size: 13px;
}
.key.is-correct {
  background: #43c96b;
  color: var(--cream);
}
.key.is-present {
  background: var(--sun);
  color: var(--ink);
}
.key.is-absent {
  background: var(--absent);
  color: var(--ink);
}

/* ---- Result ---- */
.result {
  width: 100%;
  text-align: center;
  padding-top: 4px;
}
.result__streak {
  margin: 0 0 14px;
}
</style>
