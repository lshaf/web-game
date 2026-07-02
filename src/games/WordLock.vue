<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { puzzles } from '../data/words.js'

const props = defineProps({
  // 'duo' = pass-and-play (Player 1 sets the word).
  // 'solo' = a random Indonesian word from the puzzle database.
  mode: { type: String, default: 'duo' },
})
const isSolo = props.mode === 'solo'

/* ---- Portable core (framework-agnostic, per the WordLock spec §4) ---- */

function cleanAnswer(raw) {
  return raw.toUpperCase().replace(/[^A-Z]/g, '')
}

// Wordle scoring with duplicate-letter handling: greens first, then present
// only while unmatched copies of a letter remain in the pool.
function scoreGuess(guess, answer) {
  const n = answer.length
  const states = new Array(n).fill('absent')
  const pool = {}
  for (const c of answer) pool[c] = (pool[c] || 0) + 1
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) {
      states[i] = 'correct'
      pool[guess[i]]--
    }
  }
  for (let i = 0; i < n; i++) {
    if (states[i] === 'correct') continue
    const c = guess[i]
    if (pool[c] > 0) {
      states[i] = 'present'
      pool[c]--
    }
  }
  return states
}

// Correct positions lock and carry into every future attempt.
function nextLocked(locked, guess, states) {
  return locked.map((l, i) => (states[i] === 'correct' ? guess[i] : l))
}

// The visible row: locked slots show their letter, the rest fill from `typed`.
function buildCurrent(typed, locked) {
  const out = []
  let t = 0
  for (let i = 0; i < locked.length; i++) {
    if (locked[i]) out.push(locked[i])
    else out.push(typed[t++] || '')
  }
  return out
}

const unlockedCount = (locked) => locked.filter((l) => !l).length

/* ---- Reactive round state ---- */

const phase = ref(isSolo ? 'play' : 'setup') // setup | handoff | play | won | lost
const clue = ref('')
const answer = ref('')
const maxAttempts = ref(6)
const guesses = ref([]) // { letters: string[], states: string[] }
const locked = ref([])
const typed = ref('')

// Setup form drafts (kept separate so the committed round stays clean).
const clueDraft = ref('')
const answerDraft = ref('')
const attemptsDraft = ref(6)
const showAnswer = ref(false)
const setupError = ref('')

// Solo mode: a random puzzle plus a little streak.
const streak = ref(0)
const bestStreak = ref(0)
let lastPuzzle = -1
const streakKey = 'dusk-sololock-best'

const inputEl = ref(null)
const shaking = ref(false)

const current = computed(() => buildCurrent(typed.value, locked.value))
const isFull = computed(() => current.value.every((c) => c !== ''))
const left = computed(() => maxAttempts.value - guesses.value.length)
const history = computed(() => [...guesses.value].reverse()) // newest first
const answerClean = computed(() => cleanAnswer(answerDraft.value))
const canLock = computed(
  () => clueDraft.value.trim().length > 0 && answerClean.value.length >= 2 && answerClean.value.length <= 11,
)
// Board sizing straight from the spec so long words shrink to fit.
const boardMax = computed(() => {
  const n = answer.value.length || 5
  return Math.min(460, n * 54 + (n - 1) * 7)
})

// Solo: pull a fresh random puzzle (never the same one twice in a row) and go
// straight to play.
function pickPuzzle() {
  let i = Math.floor(Math.random() * puzzles.length)
  if (puzzles.length > 1 && i === lastPuzzle) i = (i + 1) % puzzles.length
  lastPuzzle = i
  const p = puzzles[i]
  clue.value = p.clue
  answer.value = p.answer
  maxAttempts.value = p.attempts
  locked.value = Array(p.answer.length).fill(null)
  guesses.value = []
  typed.value = ''
  phase.value = 'play'
}

// Seed the first solo round before the initial render so the board isn't empty.
if (isSolo) pickPuzzle()

function lockIn() {
  const a = cleanAnswer(answerDraft.value)
  if (!clueDraft.value.trim()) {
    setupError.value = 'Add a clue for Player 2.'
    return
  }
  if (a.length < 2 || a.length > 11) {
    setupError.value = 'The answer needs 2–11 letters (A–Z only).'
    return
  }
  clue.value = clueDraft.value.trim()
  answer.value = a
  maxAttempts.value = attemptsDraft.value
  locked.value = Array(a.length).fill(null)
  guesses.value = []
  typed.value = ''
  setupError.value = ''
  phase.value = 'handoff'
}

function beginPlay() {
  phase.value = 'play'
  nextTick(focusInput)
}

function focusInput() {
  inputEl.value?.focus()
}

function onType(e) {
  typed.value = e.target.value
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, unlockedCount(locked.value))
}

function shake() {
  shaking.value = true
  setTimeout(() => (shaking.value = false), 400)
}

function submit() {
  if (phase.value !== 'play') return
  if (!isFull.value) {
    shake()
    return
  }
  const guess = current.value.join('')
  const states = scoreGuess(guess, answer.value)
  guesses.value.push({ letters: [...guess], states })
  locked.value = nextLocked(locked.value, guess, states)
  typed.value = ''
  if (guess === answer.value) {
    phase.value = 'won'
    if (isSolo) {
      streak.value++
      if (streak.value > bestStreak.value) {
        bestStreak.value = streak.value
        try {
          localStorage.setItem(streakKey, String(bestStreak.value))
        } catch (e) {
          /* storage may be blocked; keep in-memory best */
        }
      }
    }
  } else if (guesses.value.length >= maxAttempts.value) {
    phase.value = 'lost'
    if (isSolo) streak.value = 0
  } else {
    nextTick(focusInput)
  }
}

function newRound() {
  if (isSolo) {
    pickPuzzle()
    nextTick(focusInput)
    return
  }
  phase.value = 'setup'
  clueDraft.value = ''
  answerDraft.value = ''
  attemptsDraft.value = maxAttempts.value
  showAnswer.value = false
  setupError.value = ''
}

function boardTileClass(i) {
  if (locked.value[i]) return 'is-correct is-locked'
  if (current.value[i]) return 'is-typing'
  return 'is-empty'
}

const stateClass = (s) =>
  s === 'correct' ? 'is-correct' : s === 'present' ? 'is-present' : 'is-absent'

// Keep the hidden input in charge of keystrokes: Enter submits, and any letter
// pressed on a physical keyboard pulls focus back to it.
function onKeydown(e) {
  if (phase.value !== 'play') return
  if (e.key === 'Enter') {
    e.preventDefault()
    submit()
    return
  }
  if (document.activeElement !== inputEl.value && /^[a-zA-Z]$/.test(e.key)) focusInput()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (isSolo) {
    try {
      bestStreak.value = Number(localStorage.getItem(streakKey)) || 0
    } catch (e) {
      bestStreak.value = 0
    }
    nextTick(focusInput)
  }
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="wordlock">
    <div class="panel">
      <!-- ===== Setup: Player 1 sets the word ===== -->
      <section v-if="phase === 'setup'" class="screen setup">
        <p class="brand"><span>WORD</span><span class="brand__lock">LOCK</span></p>
        <p class="eyebrow">PLAYER 1 · SET THE WORD</p>

        <label class="field">
          <span class="field__label">Clue</span>
          <input
            v-model="clueDraft"
            class="text-input"
            type="text"
            maxlength="60"
            placeholder="A hint for Player 2"
            @keydown.enter.prevent="lockIn"
          />
        </label>

        <div class="field">
          <span class="field__label">Answer</span>
          <div class="answer-row">
            <input
              v-model="answerDraft"
              class="text-input"
              :type="showAnswer ? 'text' : 'password'"
              placeholder="2–11 letters"
              autocapitalize="characters"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              @keydown.enter.prevent="lockIn"
            />
            <button class="ghost" type="button" @click="showAnswer = !showAnswer">
              {{ showAnswer ? 'Hide' : 'Show' }}
            </button>
          </div>
          <span class="counter">{{ answerClean.length }}/11 letters</span>
        </div>

        <div class="field">
          <span class="field__label">Guesses</span>
          <div class="count-picker">
            <button
              v-for="n in [4, 6, 8, 10]"
              :key="n"
              class="count"
              :class="{ 'is-on': attemptsDraft === n }"
              type="button"
              @click="attemptsDraft = n"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <p v-if="setupError" class="error">{{ setupError }}</p>
        <button class="cta" :disabled="!canLock" @click="lockIn">Lock it in ▸</button>
      </section>

      <!-- ===== Handoff: hide the answer, pass the device ===== -->
      <section v-else-if="phase === 'handoff'" class="screen handoff">
        <span class="lock-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.2" />
            <rect x="4.5" y="10" width="15" height="11.5" rx="2.5" fill="currentColor" />
          </svg>
        </span>
        <p class="handoff__title">Word locked</p>
        <p class="handoff__sub">Pass the device to Player 2. The answer stays hidden.</p>
        <button class="cta" @click="beginPlay">I'm ready ▸</button>
      </section>

      <!-- ===== Play: Player 2 guesses (duo) / you guess (solo) ===== -->
      <section v-else-if="phase === 'play'" class="screen play">
        <div v-if="isSolo" class="solobar">
          <span class="solobar__streak">STREAK <b>{{ streak }}</b></span>
          <span class="solobar__best">BEST {{ bestStreak }}</span>
        </div>
        <div class="play__head">
          <p class="clue"><span class="clue__label">CLUE</span>{{ clue }}</p>
          <p class="left" :class="{ 'is-low': left <= 2 }">
            <span class="left__n">{{ left }}</span> left
          </p>
        </div>

        <div class="board-wrap" :style="{ maxWidth: boardMax + 'px' }" @click="focusInput">
          <div class="board" :class="{ shake: shaking }">
            <div v-for="(ch, i) in current" :key="i" class="tile" :class="boardTileClass(i)">
              <span class="tile__ch">{{ ch }}</span>
              <svg v-if="locked[i]" class="tile__lock" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.4" />
                <rect x="4.5" y="10" width="15" height="11" rx="2" fill="currentColor" />
              </svg>
            </div>
          </div>
          <input
            ref="inputEl"
            class="hidden-input"
            type="text"
            :value="typed"
            enterkeyhint="go"
            inputmode="text"
            autocapitalize="characters"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            aria-label="Type your guess"
            @input="onType"
          />
        </div>

        <button class="cta" @click="submit">Enter guess</button>

        <div v-if="history.length" class="history" :style="{ maxWidth: boardMax + 'px' }">
          <div
            v-for="(g, r) in history"
            :key="guesses.length - r"
            class="hrow"
            :class="{ 'is-latest': r === 0 }"
          >
            <div
              v-for="(ch, i) in g.letters"
              :key="i"
              class="tile tile--sm"
              :class="stateClass(g.states[i])"
              :style="{ '--d': i * 90 + 'ms' }"
            >
              {{ ch }}
            </div>
          </div>
        </div>
      </section>

      <!-- ===== Result: won / lost ===== -->
      <section v-else class="screen result">
        <p class="result__title" :class="{ 'is-lost': phase === 'lost' }">
          {{ phase === 'won' ? 'Solved!' : 'Out of guesses' }}
        </p>
        <p class="result__sub">
          {{
            phase === 'won'
              ? `Cracked in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}.`
              : 'The word was'
          }}
        </p>
        <p v-if="isSolo" class="result__streak">STREAK {{ streak }} · BEST {{ bestStreak }}</p>
        <div class="board result__board" :style="{ maxWidth: boardMax + 'px' }">
          <div
            v-for="(ch, i) in answer"
            :key="i"
            class="tile"
            :class="phase === 'won' ? 'is-correct' : 'is-reveal'"
          >
            {{ ch }}
          </div>
        </div>
        <p class="result__clue"><span class="clue__label">CLUE</span>{{ clue }}</p>
        <button class="cta" @click="newRound">New word ▸</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.wordlock {
  /* Cartoon state colors on the cream panel: turquoise locks in, sun-yellow is
     close, muted plum is a miss. Every tile carries the same ink outline. */
  --wl-correct: var(--aqua);
  --wl-correct-edge: var(--ink);
  --wl-correct-ink: var(--ink);
  --wl-present: var(--sun);
  --wl-present-edge: var(--ink);
  --wl-present-ink: var(--ink);
  --wl-absent: #ccbfda;
  --wl-absent-edge: var(--ink);
  --wl-absent-ink: #6c5480;
  --wl-panel: var(--cream);
  --wl-screen: #fffaf0;
  --wl-cta-edge: var(--ink);

  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

.panel {
  background: var(--wl-panel);
  border: var(--line) solid var(--ink);
  border-radius: 22px;
  box-shadow: var(--pop);
  padding: 28px 22px 30px;
}

.screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: screen-in 0.28s ease both;
}

@keyframes screen-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

/* ---- Brand + labels ---- */
.brand {
  font-family: var(--font-display);
  font-size: 34px;
  letter-spacing: 0.02em;
  margin: 0;
  color: var(--ink);
}
.brand__lock {
  color: var(--aqua-deep);
}

.eyebrow {
  font-family: var(--font-mono);
  letter-spacing: 0.28em;
  font-size: 11px;
  color: var(--berry);
  margin: 10px 0 22px;
}

/* ---- Setup form ---- */
.field {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.field__label {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}

.text-input {
  width: 100%;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 16px; /* 16px keeps iOS from zooming on focus */
  color: var(--ink);
  background: var(--wl-screen);
  border: 2px solid var(--ink);
  border-radius: 12px;
  padding: 12px 14px;
  transition: box-shadow 0.12s ease;
}
.text-input::placeholder {
  color: var(--wl-absent-ink);
}
.text-input:focus {
  outline: none;
  box-shadow: var(--pop-sm);
}

.answer-row {
  display: flex;
  gap: 8px;
}
.answer-row .text-input {
  flex: 1;
  letter-spacing: 0.14em;
  font-family: var(--font-mono);
}

.ghost {
  flex-shrink: 0;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink);
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 12px;
  padding: 0 14px;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.ghost:hover,
.ghost:focus-visible {
  transform: translate(-1px, -1px);
  box-shadow: var(--pop-sm);
}

.counter {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--wl-absent-ink);
}

.count-picker {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.count {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--ink);
  background: var(--wl-screen);
  border: 2px solid var(--ink);
  border-radius: 12px;
  padding: 11px 0;
  transition: transform 0.1s ease, box-shadow 0.1s ease, background 0.1s ease;
}
.count.is-on {
  color: var(--ink);
  background: var(--sun);
  box-shadow: var(--pop-sm);
  font-weight: 700;
}

.error {
  width: 100%;
  font-size: 13px;
  color: var(--horizon);
  margin: 0 0 14px;
}

/* ---- CTA (chunky, arcade depth) ---- */
.cta {
  width: 100%;
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--ink);
  background: var(--aqua);
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  padding: 13px 20px;
  margin-top: 6px;
  box-shadow: var(--pop);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.cta:hover,
.cta:focus-visible {
  transform: translate(-2px, -2px);
  box-shadow: 7px 7px 0 var(--ink);
}
.cta:active {
  transform: translate(3px, 3px);
  box-shadow: 2px 2px 0 var(--ink);
}
.cta:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: var(--pop);
}

/* ---- Handoff ---- */
.handoff {
  gap: 4px;
  padding: 16px 0 6px;
}
.lock-badge {
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--ink);
  background: var(--sun);
  border: var(--line) solid var(--ink);
  box-shadow: var(--pop);
  margin-bottom: 18px;
}
.lock-badge svg {
  width: 38px;
  height: 38px;
}
.handoff__title {
  font-family: var(--font-display);
  font-size: 30px;
  color: var(--ink);
  margin: 0 0 8px;
}
.handoff__sub {
  font-size: 15px;
  color: var(--muted);
  text-align: center;
  margin: 0 0 22px;
  max-width: 300px;
}

/* ---- Solo streak bar ---- */
.solobar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--muted);
  margin-bottom: 16px;
}
.solobar b {
  color: var(--aqua-deep);
  font-weight: 700;
}
.solobar__best {
  color: var(--berry);
}
.result__streak {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--muted);
  margin: 0 0 18px;
}

/* ---- Play head ---- */
.play {
  width: 100%;
}
.play__head {
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 20px;
}
.clue {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--ink);
  line-height: 1.35;
}
.clue__label {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.28em;
  color: var(--berry);
  margin-bottom: 4px;
}
.left {
  margin: 0;
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--muted);
  text-align: right;
}
.left__n {
  display: inline-block;
  font-size: 22px;
  color: var(--ink);
  margin-right: 2px;
}
.left.is-low .left__n {
  color: var(--berry);
}

/* ---- Board + tiles ---- */
.board-wrap {
  position: relative;
  width: 100%;
  margin: 0 auto 18px;
}
.board {
  display: flex;
  gap: 7px;
  justify-content: center;
}
.result__board {
  width: 100%;
  margin: 8px auto 20px;
}

.tile {
  position: relative;
  flex: 1 1 0;
  max-width: 54px;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 9px;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: clamp(18px, 6vw, 26px);
  color: var(--ink);
  border: 2.5px solid var(--ink);
  background: var(--cream);
  transition: transform 0.08s ease;
}
.tile--sm {
  max-width: 40px;
  font-size: clamp(14px, 5vw, 20px);
  border-radius: 9px;
}

.tile.is-empty {
  background: transparent;
  border-color: rgba(44, 19, 56, 0.28);
}
.tile.is-typing {
  border-color: var(--ink);
  background: #fff3c4;
  animation: pop 0.12s ease;
}
.tile.is-correct {
  background: var(--wl-correct);
  color: var(--wl-correct-ink);
  box-shadow: 0 4px 0 var(--wl-correct-edge);
}
.tile.is-present {
  background: var(--wl-present);
  color: var(--wl-present-ink);
  box-shadow: 0 4px 0 var(--wl-present-edge);
}
.tile.is-absent {
  background: var(--wl-absent);
  color: var(--wl-absent-ink);
  box-shadow: 0 4px 0 var(--wl-absent-edge);
}
.tile.is-reveal {
  color: var(--ink);
  background: #ffe39a;
}
.tile.is-locked {
  animation: lock-glow 2.4s ease-in-out infinite;
}
.tile__lock {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 10px;
  height: 10px;
  color: var(--wl-correct-ink);
  opacity: 0.7;
}

.hidden-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: transparent;
  caret-color: transparent;
  font-size: 16px;
  cursor: pointer;
}

/* ---- History (newest first; only the newest row flips in) ---- */
.history {
  width: 100%;
  margin: 22px auto 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hrow {
  display: flex;
  gap: 6px;
  justify-content: center;
}
.hrow.is-latest .tile {
  animation: flip-in 0.4s ease both;
  animation-delay: var(--d);
}

/* ---- Result ---- */
.result {
  padding: 8px 0 4px;
}
.result__title {
  font-family: var(--font-display);
  font-size: 36px;
  color: var(--aqua-deep);
  margin: 0 0 8px;
}
.result__title.is-lost {
  color: var(--berry);
}
.result__sub {
  font-size: 15px;
  font-weight: 500;
  color: var(--muted);
  margin: 0 0 6px;
}
.result__clue {
  margin: 0 0 22px;
  font-size: 14px;
  color: var(--ink);
  text-align: center;
}
.result__clue .clue__label {
  text-align: center;
}

/* ---- Motion ---- */
@keyframes pop {
  from {
    transform: scale(0.9);
  }
}
@keyframes flip-in {
  0% {
    transform: rotateX(-90deg);
    opacity: 0;
  }
  60% {
    transform: rotateX(12deg);
    opacity: 1;
  }
  100% {
    transform: rotateX(0);
  }
}
@keyframes lock-glow {
  0%,
  100% {
    box-shadow: 0 4px 0 var(--wl-correct-edge);
  }
  50% {
    box-shadow: 0 4px 0 var(--wl-correct-edge), 0 0 14px rgba(35, 201, 176, 0.7);
  }
}
.shake {
  animation: shake 0.4s ease;
}
@keyframes shake {
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

@media (prefers-reduced-motion: reduce) {
  .screen,
  .tile,
  .hrow.is-latest .tile,
  .tile.is-locked,
  .shake {
    animation: none;
  }
}
</style>
