<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'
import { KBBI } from '../data/kbbi.js'

// Sambung Kata (Shiritori) — a word-chain duel. Each word must begin with the
// last letter of the one before it, be at least three letters, sit in the KBBI
// dictionary, and never repeat — all before the clock runs out. Play against the
// CPU (run it out of words to win) or pass-and-play against a friend (whoever
// stalls first loses). Longest chain persists.

const BEST_KEY = 'dusk-sambung-best'
const MIN_LEN = 3
const TURN_SECONDS = 25

// Group every dictionary word by its first letter, once, so both the CPU and
// the "is this letter answerable" checks are instant.
const INDEX = new Map()
for (const w of KBBI) {
  const f = w[0]
  if (!INDEX.has(f)) INDEX.set(f, [])
  INDEX.get(f).push(w)
}
// Letters that begin at least a few dictionary words make fair opening letters.
const OPENERS = [...INDEX.entries()].filter(([, arr]) => arr.length >= 40).map(([l]) => l)

const mode = ref(null) // null (picker) | 'cpu' | 'duo'
const chain = ref([]) // { word, by: 'you' | 'cpu' | 0 | 1 }
const used = ref(new Set())
const reqLetter = ref('')
const turn = ref('you') // cpu mode: 'you' | 'cpu'; duo mode: 0 | 1
const phase = ref('play') // play | over
const outcome = ref(null) // { title, reason, lost }
const draft = ref('')
const note = ref('') // transient validation toast
const timeLeft = ref(TURN_SECONDS)
const best = ref(0)

let noteTimer = 0
let cpuTimer = 0
let clock = 0
const input = ref(null)

const chainLen = computed(() => chain.value.length)
// Whose turn it is to TYPE — both duo players do; in CPU mode only you.
const isHuman = computed(() => (mode.value === 'duo' ? true : turn.value === 'you'))

const eyebrow = computed(() =>
  !mode.value
    ? 'PILIH MODE'
    : mode.value === 'cpu'
      ? 'RANTAI KATA LAWAN KOMPUTER'
      : 'RANTAI KATA DUA PEMAIN',
)
const turnLabel = computed(() =>
  mode.value === 'duo' ? `GILIRAN P${turn.value + 1}` : turn.value === 'you' ? 'GILIRANMU' : 'CPU…',
)
const placeholder = computed(() =>
  mode.value === 'duo'
    ? `Pemain ${turn.value + 1}: kata dari ${reqLetter.value}…`
    : `kata dari ${reqLetter.value}…`,
)
const lowTime = computed(() => phase.value === 'play' && isHuman.value && timeLeft.value <= 5)

function randOpener() {
  return OPENERS[Math.floor(Math.random() * OPENERS.length)] || 'A'
}
function unusedFrom(letter) {
  const arr = INDEX.get(letter)
  return arr ? arr.filter((w) => !used.value.has(w)) : []
}

// --- Lifecycle --------------------------------------------------------------

function startGame(m) {
  mode.value = m
  restart()
}
function restart() {
  clearTimers()
  chain.value = []
  used.value = new Set()
  reqLetter.value = randOpener()
  turn.value = mode.value === 'duo' ? 0 : 'you'
  phase.value = 'play'
  outcome.value = null
  draft.value = ''
  note.value = ''
  startClock()
  nextTick(() => input.value?.focus())
}
function toMenu() {
  clearTimers()
  mode.value = null
  phase.value = 'play'
}

function startClock() {
  clearInterval(clock)
  timeLeft.value = TURN_SECONDS
  clock = setInterval(() => {
    timeLeft.value -= 1
    if (timeLeft.value <= 0) {
      clearInterval(clock)
      timeUp()
    }
  }, 1000)
}
function clearTimers() {
  clearInterval(clock)
  clearTimeout(cpuTimer)
  clearTimeout(noteTimer)
}

function toast(msg) {
  note.value = msg
  clearTimeout(noteTimer)
  noteTimer = setTimeout(() => (note.value = ''), 1600)
  sfx.wrong()
}

// --- Play -------------------------------------------------------------------

function commit(word, by) {
  chain.value.push({ word, by })
  used.value.add(word)
  reqLetter.value = word[word.length - 1]
  if (chainLen.value > best.value) {
    best.value = chainLen.value
    try {
      localStorage.setItem(BEST_KEY, String(best.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory */
    }
  }
}

function submit() {
  if (phase.value !== 'play' || !isHuman.value) return
  const w = draft.value.trim().toUpperCase()
  if (w.length < MIN_LEN) return toast(`Minimal ${MIN_LEN} huruf`)
  if (!/^[A-Z]+$/.test(w)) return toast('Huruf saja')
  if (w[0] !== reqLetter.value) return toast(`Harus mulai huruf ${reqLetter.value}`)
  if (used.value.has(w)) return toast('Sudah dipakai')
  if (!KBBI.has(w)) return toast('Bukan kata KBBI')
  clearInterval(clock)
  commit(w, mode.value === 'duo' ? turn.value : 'you')
  draft.value = ''
  sfx.tick()
  if (mode.value === 'duo') {
    turn.value = 1 - turn.value // pass the device to the other player
    startClock()
    nextTick(() => input.value?.focus())
  } else {
    turn.value = 'cpu'
    cpuTimer = setTimeout(cpuMove, 850)
  }
}

function cpuMove() {
  if (phase.value !== 'play') return
  const pool = unusedFrom(reqLetter.value)
  // Prefer replies that leave you a live letter, so the game keeps going.
  const fair = pool.filter((w) => unusedFrom(w[w.length - 1]).length > 0)
  const from = fair.length ? fair : pool
  if (!from.length) {
    return end({ title: 'Kamu menang!', reason: 'Komputer kehabisan kata!', lost: false })
  }
  const pick = from[Math.floor(Math.random() * from.length)]
  commit(pick, 'cpu')
  sfx.tick()
  turn.value = 'you'
  startClock()
  nextTick(() => input.value?.focus())
}

// The player whose turn it is fails, so in duo the other player wins.
function timeUp() {
  if (mode.value === 'duo') {
    return end({
      title: `Pemain ${2 - turn.value} menang!`,
      reason: `Pemain ${turn.value + 1} kehabisan waktu`,
      lost: false,
    })
  }
  end({ title: 'Kalah', reason: 'Waktu habis!', lost: true })
}
function giveUp() {
  if (phase.value !== 'play') return
  if (mode.value === 'duo') {
    return end({
      title: `Pemain ${2 - turn.value} menang!`,
      reason: `Pemain ${turn.value + 1} menyerah`,
      lost: false,
    })
  }
  end({ title: 'Kalah', reason: 'Kamu menyerah', lost: true })
}

function end(o) {
  phase.value = 'over'
  outcome.value = o
  clearTimers()
  o.lost ? sfx.lose() : sfx.win()
}

// --- Presentation -----------------------------------------------------------

// Newest first, so the live end of the chain is always on top on a phone.
const feed = computed(() => chain.value.slice().reverse())
function byLabel(by) {
  return by === 'you' ? 'Kamu' : by === 'cpu' ? 'CPU' : 'P' + (by + 1)
}
// Right-aligned bubble for you / Player 1; left for the CPU / Player 2.
function byRight(by) {
  return by === 'you' || by === 0
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch (e) {
    best.value = 0
  }
})
onBeforeUnmount(clearTimers)
</script>

<template>
  <div class="sambung">
    <div class="panel">
      <section class="screen">
        <p class="brand">SAMBUNG<span class="brand__accent"> KATA</span></p>
        <p class="eyebrow">{{ eyebrow }}</p>

        <!-- Mode picker: full-width stacked CTAs, like the other games. -->
        <template v-if="!mode">
          <button class="cta" type="button" @click="startGame('cpu')">Solo ▸</button>
          <button class="cta cta--alt" type="button" @click="startGame('duo')">Duo ▸</button>
          <p class="modes__best">TERPANJANG {{ best }}</p>
        </template>

        <template v-else>
          <div class="solobar hud">
            <span>RANTAI <b>{{ chainLen }}</b></span>
            <span :class="{ hud__turn: mode === 'duo' }">{{ turnLabel }}</span>
            <span class="solobar__best">TERPANJANG {{ best }}</span>
          </div>

          <!-- The required letter + the current turn's countdown. -->
          <div v-if="phase === 'play'" class="cue">
            <div class="cue__letter">
              <span class="cue__cap">Kata berikutnya</span>
              <span class="cue__big">{{ reqLetter }}…</span>
            </div>
            <div class="cue__timer" :class="{ 'is-low': lowTime }">
              <span>{{ isHuman ? timeLeft + 's' : '…' }}</span>
            </div>
          </div>

          <div class="toastwrap">
            <transition name="toast">
              <span v-if="note" class="toast">{{ note }}</span>
            </transition>
          </div>

          <!-- The chain, newest word on top; a hint line until the first move. -->
          <div v-if="feed.length" class="feed">
            <div
              v-for="(item, i) in feed"
              :key="chainLen - i"
              class="word"
              :class="byRight(item.by) ? 'word--you' : 'word--cpu'"
            >
              <span class="word__by">{{ byLabel(item.by) }}</span>
              <span class="word__text">{{ item.word }}</span>
            </div>
          </div>
          <p v-else-if="phase === 'play'" class="feed__hint">
            Mulai dari huruf <b>{{ reqLetter }}</b> — ketik kata lalu kirim.
          </p>

          <!-- Input while playing, result otherwise. -->
          <template v-if="phase === 'play'">
            <form class="entry" @submit.prevent="submit">
              <input
                ref="input"
                v-model="draft"
                class="entry__input"
                type="text"
                :placeholder="placeholder"
                inputmode="text"
                autocapitalize="characters"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                :disabled="!isHuman"
              />
              <button class="cta" type="submit" :disabled="!isHuman">Kirim ▸</button>
            </form>
            <div class="tools">
              <button class="mini" type="button" @click="giveUp">Menyerah</button>
            </div>
          </template>

          <div v-else class="result">
            <p class="result__title" :class="{ 'is-lost': outcome.lost }">{{ outcome.title }}</p>
            <p class="result__sub">{{ outcome.reason }}</p>
            <p class="result__streak">RANTAI {{ chainLen }} · TERPANJANG {{ best }}</p>
            <button class="cta" type="button" @click="restart">Main lagi ▸</button>
            <button class="mini modes__again" type="button" @click="toMenu">Ganti mode</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/solobar/result come
   from src/styles.css. */
.sambung {
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
  font-size: 25px;
}
.modes__best {
  margin-top: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.modes__again {
  margin-top: 10px;
}
.hud {
  margin-bottom: 14px;
}
.hud b {
  color: var(--aqua-deep);
}
.hud__turn {
  color: var(--sun-core);
  font-weight: 800;
}

/* ---- Required-letter cue + timer ---- */
.cue {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 12px;
  box-shadow: var(--pop-sm);
  margin-bottom: 12px;
}
.cue__letter {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cue__cap {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.cue__big {
  font-family: var(--font-display);
  font-size: 28px;
  line-height: 1;
  color: var(--aqua-deep);
}
.cue__timer {
  min-width: 54px;
  text-align: center;
  padding: 8px 10px;
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--ink);
  background: var(--sun);
  border: 2px solid var(--ink);
  border-radius: 10px;
}
.cue__timer.is-low {
  background: var(--berry);
  color: var(--cream);
  animation: pulse 0.6s ease infinite alternate;
}
@keyframes pulse {
  to {
    transform: scale(1.08);
  }
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

/* ---- Chain feed (chat-style; sized to show at least the last 6 words) ---- */
.feed {
  width: 100%;
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  margin: 10px 0 12px;
  background: rgba(44, 19, 56, 0.04);
  border-radius: 12px;
}
.feed__hint {
  width: 100%;
  padding: 22px 6px;
  margin: 10px 0 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
  text-align: center;
}
.word {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border: 2px solid var(--ink);
  border-radius: 10px;
  box-shadow: var(--pop-sm);
}
.word--you {
  background: var(--tile-live);
  align-self: flex-end;
}
.word--cpu {
  background: var(--cream);
  align-self: flex-start;
}
.word__by {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.word__text {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--ink);
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
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 16px;
  text-transform: uppercase;
  color: var(--ink);
  background: var(--paper-lit);
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  box-shadow: var(--pop-sm);
}
.entry__input::placeholder {
  color: var(--muted);
  font-weight: 600;
}
.entry__input:focus {
  outline: none;
  background: var(--tile-live);
}
.entry__input:disabled {
  opacity: 0.6;
}
.tools {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

/* ---- Result ---- */
.result {
  width: 100%;
  text-align: center;
  padding-top: 4px;
}
.result__sub {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}
.result__streak {
  margin: 8px 0 14px;
}
</style>
