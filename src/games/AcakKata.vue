<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { puzzles } from '../data/words.js'
import { sfx } from '../sound.js'

// Solo anagram game over the Indonesian word bank: the answer's letters are
// scrambled into a pool; tap (or type) to rearrange them into the word.

const bestKey = 'dusk-acakkata-best'

const clue = ref('')
const answer = ref('')
const pool = ref([]) // { id, ch, used }
const slots = ref([]) // pool id or null, one per answer letter
const phase = ref('play') // play | won
const streak = ref(0)
const best = ref(0)
const shaking = ref(false)
const wrong = ref(false)
let lastPuzzle = -1
let advanceTimer = 0

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Scramble, but never hand back the word already solved.
function scrambleLetters(word) {
  const letters = word.split('')
  if (letters.length < 2) return letters
  let s = shuffle(letters)
  let tries = 0
  while (s.join('') === word && tries < 24) {
    s = shuffle(letters)
    tries++
  }
  return s
}

function pick() {
  let i = Math.floor(Math.random() * puzzles.length)
  if (puzzles.length > 1 && i === lastPuzzle) i = (i + 1) % puzzles.length
  lastPuzzle = i
  const p = puzzles[i]
  clue.value = p.clue
  answer.value = p.answer
  pool.value = scrambleLetters(p.answer).map((ch, idx) => ({ id: idx, ch, used: false }))
  slots.value = Array(p.answer.length).fill(null)
  wrong.value = false
  phase.value = 'play'
}

// Seed the first round before the initial render so the board isn't empty.
pick()

const built = computed(() =>
  slots.value.map((id) => (id === null ? '' : pool.value[id].ch)).join(''),
)
const isFull = computed(() => slots.value.every((s) => s !== null))
const boardMax = computed(() => {
  const n = answer.value.length || 5
  return Math.min(460, n * 52 + (n - 1) * 7)
})

function shake() {
  shaking.value = true
  setTimeout(() => (shaking.value = false), 400)
}

function placeTile(tile) {
  if (phase.value !== 'play' || tile.used) return
  const idx = slots.value.findIndex((s) => s === null)
  if (idx === -1) return
  slots.value[idx] = tile.id
  tile.used = true
  wrong.value = false
  if (isFull.value) check()
}

function removeSlot(i) {
  if (phase.value !== 'play') return
  const id = slots.value[i]
  if (id === null) return
  pool.value[id].used = false
  slots.value[i] = null
  wrong.value = false
}

function removeLast() {
  for (let i = slots.value.length - 1; i >= 0; i--) {
    if (slots.value[i] !== null) {
      removeSlot(i)
      return
    }
  }
}

function check() {
  if (built.value === answer.value) {
    phase.value = 'won'
    sfx.win()
    streak.value++
    if (streak.value > best.value) {
      best.value = streak.value
      try {
        localStorage.setItem(bestKey, String(best.value))
      } catch (e) {
        /* storage may be blocked; keep in-memory best */
      }
    }
    advanceTimer = setTimeout(pick, 900)
  } else {
    wrong.value = true
    shake()
    sfx.wrong()
  }
}

// Return every tile and re-scramble the pool order.
function reshuffle() {
  if (phase.value !== 'play') return
  pool.value = scrambleLetters(answer.value).map((ch, idx) => ({ id: idx, ch, used: false }))
  slots.value = Array(answer.value.length).fill(null)
  wrong.value = false
}

function clearAll() {
  if (phase.value !== 'play') return
  pool.value.forEach((t) => (t.used = false))
  slots.value = Array(answer.value.length).fill(null)
  wrong.value = false
}

function skip() {
  streak.value = 0
  pick()
}

function onKeydown(e) {
  if (phase.value !== 'play') return
  if (e.key === 'Backspace') {
    e.preventDefault()
    removeLast()
    return
  }
  if (/^[a-zA-Z]$/.test(e.key)) {
    const ch = e.key.toUpperCase()
    const tile = pool.value.find((t) => !t.used && t.ch === ch)
    if (tile) placeTile(tile)
  }
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
  <div class="acak">
    <div class="panel">
      <div class="solobar">
        <span class="solobar__streak">STREAK <b>{{ streak }}</b></span>
        <span class="solobar__best">BEST {{ best }}</span>
      </div>

      <p class="brand"><span>ACAK</span><span class="brand__b">KATA</span></p>
      <p class="clue"><span class="clue__label">CLUE</span>{{ clue }}</p>

      <!-- Answer slots: tap a filled tile to send it back. -->
      <div class="board" :class="{ shake: shaking }" :style="{ maxWidth: boardMax + 'px' }">
        <button
          v-for="(id, i) in slots"
          :key="i"
          class="tile slot"
          :class="{
            'is-filled': id !== null,
            'is-correct': phase === 'won',
            'is-wrong': wrong,
          }"
          type="button"
          @click="removeSlot(i)"
        >
          {{ id === null ? '' : pool[id].ch }}
        </button>
      </div>

      <p class="verdict" :class="{ 'is-on': phase === 'won' }">Benar!</p>

      <!-- Scrambled pool: tap a tile to drop it into the next slot. -->
      <div class="pool" :style="{ maxWidth: boardMax + 'px' }">
        <button
          v-for="t in pool"
          :key="t.id"
          class="tile pool-tile"
          :class="{ 'is-used': t.used }"
          type="button"
          @click="placeTile(t)"
        >
          {{ t.ch }}
        </button>
      </div>

      <div class="actions">
        <button class="btn" type="button" @click="reshuffle">Acak lagi</button>
        <button class="btn" type="button" @click="clearAll">Hapus</button>
        <button class="btn btn--skip" type="button" @click="skip">Lewati ▸</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.acak {
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
  padding: 22px 22px 26px;
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
  margin-bottom: 12px;
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
  font-size: 32px;
  letter-spacing: 0.02em;
  margin: 0 0 14px;
  color: var(--ink);
}
.brand__b {
  color: var(--berry);
}

.clue {
  margin: 0 0 20px;
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

/* ---- Tiles (shared look) ---- */
.board,
.pool {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  justify-content: center;
  margin: 0 auto;
}
.pool {
  margin-top: 4px;
}

.tile {
  position: relative;
  flex: 1 1 0;
  min-width: 34px;
  max-width: 52px;
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
  transition: transform 0.08s ease, box-shadow 0.1s ease, background 0.1s ease;
}

/* Answer slots */
.slot.is-filled {
  background: #fff3c4;
  box-shadow: 0 4px 0 var(--ink);
}
.slot:not(.is-filled) {
  background: transparent;
  border-color: rgba(44, 19, 56, 0.28);
  cursor: default;
}
.slot.is-wrong.is-filled {
  background: #ffd0dc;
}
.slot.is-correct {
  background: var(--aqua);
  box-shadow: 0 4px 0 var(--ink);
  color: var(--ink);
}

/* Pool tiles */
.pool-tile {
  background: var(--sun);
  box-shadow: 0 4px 0 var(--ink);
}
.pool-tile:hover,
.pool-tile:focus-visible {
  transform: translateY(-2px);
}
.pool-tile:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 var(--ink);
}
.pool-tile.is-used {
  visibility: hidden;
}

/* ---- Verdict line (reserves space so the board doesn't jump) ---- */
.verdict {
  height: 22px;
  margin: 12px 0 6px;
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--aqua-deep);
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.verdict.is-on {
  opacity: 1;
  transform: scale(1);
}

/* ---- Actions ---- */
.actions {
  width: 100%;
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.btn {
  flex: 1;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 14px;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  padding: 11px 8px;
  box-shadow: var(--pop-sm);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.btn:hover,
.btn:focus-visible {
  transform: translate(-2px, -2px);
  box-shadow: 5px 5px 0 var(--ink);
}
.btn:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--ink);
}
.btn--skip {
  background: var(--aqua);
}

/* ---- Motion ---- */
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
  .shake,
  .verdict {
    animation: none;
    transition: none;
  }
}
</style>
