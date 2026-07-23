<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Ingatan (Memory) — flip two cards to find matching pairs.
//   Solo: match every pair before you run out of wrong flips.
//   2 Pemain: a match lets you go again and scores a point; most matches wins.

const POOL = ['🌞', '⭐', '🍎', '🍌', '🌵', '🦕', '🐦', '🍭', '🎈', '🎮', '🍩', '🌈']
const PAIRS_OPTS = [4, 6, 8, 10]
const WRONG_OPTS = [6, 8, 10, 12]
const COLS = 4

const phase = ref('mode') // mode | config | play | over
const mode = ref('solo') // solo | duo

const pairsCount = ref(8)
const maxWrong = ref(8)

const cards = ref([]) // { id, sym, up, matched }
const flipped = ref([]) // indices of the up, unmatched cards (max 2)
const busy = ref(false)
const totalPairs = ref(0)
const matched = ref(0)
const wrongLeft = ref(0)
const scores = ref({ 1: 0, 2: 0 })
const turn = ref(1)
let flipTimer = 0

const isOver = computed(() => phase.value === 'over')
const soloWon = computed(() => mode.value === 'solo' && matched.value === totalPairs.value)
const duoWinner = computed(() => {
  if (scores.value[1] === scores.value[2]) return 0
  return scores.value[1] > scores.value[2] ? 1 : 2
})
const outcomeText = computed(() => {
  if (mode.value === 'solo') return soloWon.value ? 'Semua pasangan cocok!' : 'Kesempatan habis'
  return duoWinner.value === 0 ? 'Seri!' : `Pemain ${duoWinner.value} menang!`
})
const outcomeLost = computed(() => mode.value === 'solo' && !soloWon.value)

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function startGame() {
  clearTimeout(flipTimer)
  const syms = POOL.slice(0, pairsCount.value)
  cards.value = shuffle([...syms, ...syms]).map((sym, i) => ({
    id: i,
    sym,
    up: false,
    matched: false,
  }))
  totalPairs.value = pairsCount.value
  matched.value = 0
  wrongLeft.value = maxWrong.value
  scores.value = { 1: 0, 2: 0 }
  turn.value = 1
  flipped.value = []
  busy.value = false
  phase.value = 'play'
}

function chooseMode(m) {
  mode.value = m
  if (m === 'solo') {
    phase.value = 'config'
  } else {
    pairsCount.value = POOL.length // biggest possible board for pass-and-play
    startGame()
  }
}

function finish() {
  phase.value = 'over'
  if (mode.value === 'solo') (soloWon.value ? sfx.win : sfx.lose)()
  else sfx.win()
}

function flip(i) {
  if (busy.value || phase.value !== 'play') return
  const c = cards.value[i]
  if (c.up || c.matched) return
  c.up = true
  sfx.tick()
  flipped.value.push(i)
  if (flipped.value.length < 2) return

  busy.value = true
  const [a, b] = flipped.value
  if (cards.value[a].sym === cards.value[b].sym) {
    // Match — lock the pair in after a beat so the second card registers.
    flipTimer = setTimeout(() => {
      cards.value[a].matched = true
      cards.value[b].matched = true
      matched.value++
      if (mode.value === 'duo') scores.value[turn.value]++
      flipped.value = []
      busy.value = false
      if (matched.value === totalPairs.value) finish()
    }, 420)
  } else {
    // Miss — flip both back, spend a life (solo) or pass the turn (duo).
    sfx.wrong()
    if (mode.value === 'solo') wrongLeft.value--
    flipTimer = setTimeout(() => {
      cards.value[a].up = false
      cards.value[b].up = false
      flipped.value = []
      busy.value = false
      if (mode.value === 'solo') {
        if (wrongLeft.value <= 0) finish()
      } else {
        turn.value = turn.value === 1 ? 2 : 1
      }
    }, 820)
  }
}

function backToModes() {
  clearTimeout(flipTimer)
  phase.value = 'mode'
}

function onKeydown(e) {
  if (e.key === 'Enter' && isOver.value) {
    e.preventDefault()
    startGame()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(flipTimer)
})
</script>

<template>
  <div class="ingatan">
    <div class="panel">
      <!-- Mode picker -->
      <section v-if="phase === 'mode'" class="screen">
        <p class="brand">INGA<span class="brand__accent">TAN</span></p>
        <p class="eyebrow">PILIH MODE</p>
        <button class="cta" type="button" @click="chooseMode('solo')">Solo ▸</button>
        <button class="cta cta--alt" type="button" @click="chooseMode('duo')">Duo ▸</button>
      </section>

      <!-- Solo config -->
      <section v-else-if="phase === 'config'" class="screen">
        <div class="backbar"><button class="mini" type="button" @click="backToModes">← Mode</button></div>
        <p class="brand">INGA<span class="brand__accent">TAN</span></p>
        <p class="eyebrow">ATUR PERMAINAN</p>

        <div class="field">
          <span class="field__label">Jumlah pasangan</span>
          <div class="picker">
            <button
              v-for="n in PAIRS_OPTS"
              :key="n"
              class="pick"
              :class="{ 'is-on': pairsCount === n }"
              type="button"
              @click="pairsCount = n"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <div class="field">
          <span class="field__label">Batas salah</span>
          <div class="picker">
            <button
              v-for="n in WRONG_OPTS"
              :key="n"
              class="pick"
              :class="{ 'is-on': maxWrong === n }"
              type="button"
              @click="maxWrong = n"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <button class="cta" type="button" @click="startGame">Mulai ▸</button>
      </section>

      <!-- Play -->
      <section v-else class="screen play">
        <div class="backbar"><button class="mini" type="button" @click="backToModes">← Mode</button></div>

        <!-- Duo scoreboard -->
        <div v-if="mode === 'duo'" class="scores">
          <span class="score" :class="{ 'is-active': isOver ? duoWinner === 1 : turn === 1 }">
            Pemain 1 · <b>{{ scores[1] }}</b>
          </span>
          <span class="score" :class="{ 'is-active': isOver ? duoWinner === 2 : turn === 2 }">
            Pemain 2 · <b>{{ scores[2] }}</b>
          </span>
        </div>
        <!-- Solo stats -->
        <div v-else class="solobar">
          <span class="lives" :class="{ 'is-low': wrongLeft <= 2 }">SALAH <b>{{ wrongLeft }}</b> sisa</span>
          <span>PASANGAN {{ matched }}/{{ totalPairs }}</span>
        </div>

        <p v-if="isOver" class="outcome" :class="{ 'is-lost': outcomeLost }">{{ outcomeText }}</p>

        <div class="grid">
          <button
            v-for="(c, i) in cards"
            :key="c.id"
            class="card"
            :class="{ 'is-up': c.up || c.matched, 'is-matched': c.matched }"
            type="button"
            :disabled="busy || isOver || c.up || c.matched"
            @click="flip(i)"
          >
            <span class="card__inner">
              <span class="card__face card__cover">?</span>
              <span class="card__face card__symbol">{{ c.sym }}</span>
            </span>
          </button>
        </div>

        <button class="cta" type="button" @click="startGame">
          {{ isOver ? 'Main lagi ▸' : 'Ulang papan' }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/backbar/picker/
   solobar come from src/styles.css (see docs/STYLE.md). */
.ingatan {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 20px 26px;
}
.brand {
  font-size: 34px;
}
.play {
  width: 100%;
}

/* ---- Duo scoreboard ---- */
.scores {
  width: 100%;
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}
.score {
  flex: 1;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--muted);
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 12px;
  padding: 8px 4px;
  transition: background 0.12s ease, color 0.12s ease;
}
.score b {
  font-size: 16px;
  color: var(--ink);
}
.score.is-active {
  background: var(--sun);
  color: var(--ink);
  box-shadow: var(--pop-sm);
}

/* ---- Solo stats ---- */
.solobar {
  margin-bottom: 14px;
}
.lives b {
  color: var(--aqua-deep);
  font-weight: 700;
}
.lives.is-low b {
  color: var(--berry);
}

/* ---- Outcome banner ---- */
.outcome {
  margin: 0 0 12px;
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--aqua-deep);
}
.outcome.is-lost {
  color: var(--berry);
}

/* ---- Card grid ---- */
.grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 18px;
}
.card {
  aspect-ratio: 1;
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: 12px;
  box-shadow: 0 4px 0 var(--ink);
  perspective: 600px;
  transition: transform 0.1s ease;
}
.card:not(:disabled):hover {
  transform: translateY(-2px);
}
.card__inner {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.3s ease;
}
.card.is-up .card__inner {
  transform: rotateY(180deg);
}
.card__face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 2.5px solid var(--ink);
  backface-visibility: hidden;
}
.card__cover {
  background: var(--grape);
  color: var(--sun);
  font-family: var(--font-display);
  font-size: clamp(20px, 7vw, 30px);
}
.card__symbol {
  background: var(--paper-lit);
  transform: rotateY(180deg);
  font-size: clamp(22px, 8vw, 34px);
  line-height: 1;
}
.card.is-matched .card__symbol {
  background: var(--aqua);
}
</style>
