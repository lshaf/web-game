<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { puzzles } from '../data/words.js'
import { sfx } from '../sound.js'

// Hangman (Tebak Kata) over the Indonesian word bank: guess letters from the
// clue; six wrong guesses complete the gallows figure.

const MAX_WRONG = 6
const bestKey = 'dusk-hangman-best'
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const clue = ref('')
const answer = ref('')
const guessed = ref([]) // letters tried, in order
const phase = ref('play') // play | won | lost
const streak = ref(0)
const best = ref(0)
let lastPuzzle = -1
let advanceTimer = 0

const wrongLetters = computed(() =>
  guessed.value.filter((l) => !answer.value.includes(l)),
)
const wrong = computed(() => wrongLetters.value.length)
const livesLeft = computed(() => MAX_WRONG - wrong.value)
const boardMax = computed(() => {
  const n = answer.value.length || 5
  return Math.min(460, n * 46 + (n - 1) * 6)
})

function pick() {
  let i = Math.floor(Math.random() * puzzles.length)
  if (puzzles.length > 1 && i === lastPuzzle) i = (i + 1) % puzzles.length
  lastPuzzle = i
  const p = puzzles[i]
  clue.value = p.clue
  answer.value = p.answer
  guessed.value = []
  phase.value = 'play'
}

// Seed the first round before the initial render.
pick()

function solved() {
  return answer.value.split('').every((ch) => guessed.value.includes(ch))
}

function guess(letter) {
  if (phase.value !== 'play' || guessed.value.includes(letter)) return
  guessed.value.push(letter)
  const hit = answer.value.includes(letter)
  if (solved()) {
    phase.value = 'won'
    sfx.win()
    streak.value++
    if (streak.value > best.value) {
      best.value = streak.value
      try {
        localStorage.setItem(bestKey, String(best.value))
      } catch (e) {
        /* storage may be blocked */
      }
    }
    advanceTimer = setTimeout(pick, 1100)
  } else if (wrong.value >= MAX_WRONG) {
    phase.value = 'lost'
    sfx.lose()
    streak.value = 0
  } else if (!hit) {
    // Wrong letter — buzzer.
    sfx.wrong()
  }
}

function newWord() {
  clearTimeout(advanceTimer)
  pick()
}

function letterState(l) {
  if (!guessed.value.includes(l)) return ''
  return answer.value.includes(l) ? 'is-hit' : 'is-miss'
}

function slotChar(ch) {
  if (guessed.value.includes(ch)) return ch
  if (phase.value === 'lost') return ch
  return ''
}

function onKeydown(e) {
  if ((phase.value === 'won' || phase.value === 'lost') && e.key === 'Enter') {
    e.preventDefault()
    newWord()
    return
  }
  if (phase.value !== 'play') return
  if (/^[a-zA-Z]$/.test(e.key)) guess(e.key.toUpperCase())
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  try {
    best.value = Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    best.value = 0
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(advanceTimer)
})
</script>

<template>
  <div class="hangman">
    <div class="panel">
      <div class="solobar">
        <span class="solobar__streak">STREAK <b>{{ streak }}</b></span>
        <span class="solobar__best">BEST {{ best }}</span>
      </div>

      <p class="brand"><span>TEBAK</span><span class="brand__b">KATA</span></p>

      <!-- Gallows: parts appear as wrong guesses stack up. -->
      <svg class="gallows" viewBox="0 0 120 150" aria-hidden="true">
        <g class="frame" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round">
          <line x1="14" y1="144" x2="74" y2="144" />
          <line x1="30" y1="144" x2="30" y2="12" />
          <line x1="27" y1="12" x2="88" y2="12" />
          <line x1="88" y1="12" x2="88" y2="26" stroke-width="4" />
        </g>
        <g class="body" stroke="var(--ink)" stroke-width="4.5" stroke-linecap="round">
          <circle
            v-if="wrong >= 1"
            class="part"
            cx="88"
            cy="40"
            r="13"
            fill="var(--cream)"
          />
          <line v-if="wrong >= 2" class="part" x1="88" y1="53" x2="88" y2="92" />
          <line v-if="wrong >= 3" class="part" x1="88" y1="63" x2="72" y2="80" />
          <line v-if="wrong >= 4" class="part" x1="88" y1="63" x2="104" y2="80" />
          <line v-if="wrong >= 5" class="part" x1="88" y1="92" x2="74" y2="114" />
          <line v-if="wrong >= 6" class="part" x1="88" y1="92" x2="102" y2="114" />
        </g>
      </svg>

      <p class="lives" :class="{ 'is-low': livesLeft <= 2 }">
        <span class="lives__n">{{ livesLeft }}</span> nyawa
      </p>

      <p class="clue"><span class="clue__label">CLUE</span>{{ clue }}</p>

      <!-- The word, one slot per letter. -->
      <div class="word" :style="{ maxWidth: boardMax + 'px' }">
        <div
          v-for="(ch, i) in answer.split('')"
          :key="i"
          class="slot"
          :class="{
            'is-revealed': guessed.includes(ch),
            'is-missed': phase === 'lost' && !guessed.includes(ch),
            'is-win': phase === 'won',
          }"
        >
          {{ slotChar(ch) }}
        </div>
      </div>

      <p class="verdict" :class="{ 'is-win': phase === 'won', 'is-lose': phase === 'lost' }">
        {{ phase === 'won' ? 'Tepat!' : phase === 'lost' ? 'Gagal' : '' }}
      </p>

      <!-- On-screen keyboard (physical keys work too). -->
      <div v-if="phase === 'play'" class="keys">
        <button
          v-for="l in ALPHA"
          :key="l"
          class="key"
          :class="letterState(l)"
          type="button"
          :disabled="guessed.includes(l)"
          @click="guess(l)"
        >
          {{ l }}
        </button>
      </div>
      <button v-else class="cta" type="button" @click="newWord">Kata baru ▸</button>
    </div>
  </div>
</template>

<style scoped>
.hangman {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

.panel {
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 22px;
  box-shadow: var(--pop);
  padding: 20px 20px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.solobar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--muted);
  margin-bottom: 8px;
}
.solobar b {
  color: var(--aqua-deep);
  font-weight: 700;
}
.solobar__best {
  color: var(--berry);
}

.brand {
  font-family: var(--font-display);
  font-size: 30px;
  letter-spacing: 0.02em;
  margin: 0 0 8px;
  color: var(--ink);
}
.brand__b {
  color: var(--berry);
}

.gallows {
  width: 150px;
  height: 188px;
}
.part {
  transform-origin: center;
  animation: pop-part 0.22s ease both;
}
@keyframes pop-part {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
}

.lives {
  margin: 2px 0 14px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.lives__n {
  font-size: 20px;
  color: var(--ink);
  margin-right: 2px;
}
.lives.is-low .lives__n {
  color: var(--berry);
}

.clue {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 500;
  color: var(--ink);
  text-align: center;
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

/* ---- Word slots ---- */
.word {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin: 0 auto;
}
.slot {
  flex: 1 1 0;
  min-width: 28px;
  max-width: 46px;
  aspect-ratio: 0.82;
  display: grid;
  place-items: center;
  border-radius: 8px;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: clamp(16px, 5.5vw, 24px);
  color: var(--ink);
  border: 2.5px solid var(--ink);
  background: transparent;
  border-top-color: transparent;
  border-left-color: transparent;
  border-right-color: transparent;
  border-radius: 0;
}
.slot.is-revealed {
  border: 2.5px solid var(--ink);
  border-radius: 8px;
  background: var(--aqua);
  box-shadow: 0 4px 0 var(--ink);
}
.slot.is-missed {
  border: 2.5px solid var(--ink);
  border-radius: 8px;
  background: #ffd0dc;
  color: var(--berry);
  box-shadow: 0 4px 0 var(--ink);
}

/* ---- Verdict ---- */
.verdict {
  height: 26px;
  margin: 14px 0 8px;
  font-family: var(--font-display);
  font-size: 24px;
}
.verdict.is-win {
  color: var(--aqua-deep);
}
.verdict.is-lose {
  color: var(--berry);
}

/* ---- Keyboard ---- */
.keys {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 7px;
}
.key {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 16px;
  color: var(--ink);
  background: var(--cream);
  border: 2.5px solid var(--ink);
  border-radius: 10px;
  padding: 10px 0;
  box-shadow: 0 3px 0 var(--ink);
  transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.1s ease;
}
.key:hover:not(:disabled),
.key:focus-visible:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 0 var(--ink);
}
.key:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 1px 0 var(--ink);
}
.key:disabled {
  cursor: default;
  box-shadow: none;
}
.key.is-hit {
  background: var(--aqua);
  color: var(--ink);
  opacity: 1;
}
.key.is-miss {
  background: var(--wl-absent, #ccbfda);
  color: #6c5480;
  opacity: 0.75;
}

/* ---- New word CTA ---- */
.cta {
  width: 100%;
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
  background: var(--aqua);
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  padding: 13px 20px;
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

@media (prefers-reduced-motion: reduce) {
  .part {
    animation: none;
  }
}
</style>
