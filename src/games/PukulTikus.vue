<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Pukul Tikus (Whack-a-Mole) — no timer. Whack moles to score; tap a bomb and
// it's over. The higher your score, the faster moles pop, the more bombs mix
// in, and the more often a bomb springs up in a hole a mole just left — a trap
// for anyone machine-gun tapping one spot.

const HOLES = 16
const holeList = Array.from({ length: HOLES }, (_, i) => i)
const bestKey = 'dusk-tikus-best'

const phase = ref('ready') // ready | play | over
const holes = ref(Array(HOLES).fill('')) // '' | 'mole' | 'bomb'
const score = ref(0)
const best = ref(0)
const bump = ref(false) // score-pop flash

let running = false
let spawnTimer = 0
const holeTimer = Array(HOLES).fill(0)

// Difficulty curves — everything sharpens as the score climbs.
const spawnGap = () => Math.max(360, 820 - score.value * 7)
const upTime = () => Math.max(560, 1200 - score.value * 8)
const bombChance = () => Math.min(0.42, 0.09 + score.value * 0.006)
const trapChance = () => Math.min(0.55, 0.12 + score.value * 0.01)
// How many can pop at once — grows from 1 toward a crowded board.
const maxBurst = () => Math.min(6, 1 + Math.floor(score.value / 10))

function clearAll() {
  clearTimeout(spawnTimer)
  holeTimer.forEach((t) => clearTimeout(t))
}

function start() {
  clearAll()
  holes.value = Array(HOLES).fill('')
  score.value = 0
  phase.value = 'play'
  running = true
  scheduleSpawn()
}

function scheduleSpawn() {
  if (!running) return
  spawnTimer = setTimeout(() => {
    spawnBatch()
    scheduleSpawn()
  }, spawnGap())
}

// Pop a burst of moles/bombs into distinct empty holes at once.
function spawnBatch() {
  const empty = holes.value.map((h, i) => (h === '' ? i : -1)).filter((i) => i >= 0)
  if (!empty.length) return
  const count = Math.min(empty.length, 1 + Math.floor(Math.random() * maxBurst()))
  for (let n = 0; n < count; n++) {
    const hole = empty.splice(Math.floor(Math.random() * empty.length), 1)[0]
    showAt(hole, Math.random() < bombChance() ? 'bomb' : 'mole')
  }
}

function showAt(i, kind) {
  holes.value[i] = kind
  clearTimeout(holeTimer[i])
  holeTimer[i] = setTimeout(() => retreat(i, kind), kind === 'bomb' ? upTime() * 0.85 : upTime())
}

function retreat(i, kind) {
  if (holes.value[i] !== kind) return
  holes.value[i] = ''
  // The trap: a bomb may pop where a mole just was, moments later.
  if (kind === 'mole' && running && Math.random() < trapChance()) {
    holeTimer[i] = setTimeout(() => {
      if (running && holes.value[i] === '') showAt(i, 'bomb')
    }, 120 + Math.random() * 260)
  }
}

function whack(i) {
  if (phase.value !== 'play') return
  const k = holes.value[i]
  if (!k) return // empty hole — no penalty, keep swinging
  if (k === 'bomb') {
    gameOver()
    return
  }
  score.value++
  holes.value[i] = ''
  clearTimeout(holeTimer[i])
  sfx.jump()
  bump.value = true
  setTimeout(() => (bump.value = false), 130)
}

function gameOver() {
  running = false
  clearAll()
  phase.value = 'over'
  sfx.lose()
  if (score.value > best.value) {
    best.value = score.value
    try {
      localStorage.setItem(bestKey, String(best.value))
    } catch (e) {
      /* storage may be blocked */
    }
  }
}

function onKeydown(e) {
  if (e.key !== 'Enter') return
  if (phase.value !== 'play') {
    e.preventDefault()
    start()
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
  running = false
  clearAll()
})
</script>

<template>
  <div class="tikus">
    <div class="panel">
      <!-- Ready -->
      <section v-if="phase === 'ready'" class="screen">
        <p class="brand">PUKUL <span class="brand__accent">TIKUS</span></p>
        <p class="eyebrow">PUKUL SEBANYAKNYA</p>
        <div class="intro">
          <span class="intro__demo"><svg viewBox="0 0 44 44"><use href="#tk-mole" /></svg></span>
          <span class="intro__vs">vs</span>
          <span class="intro__demo"><svg viewBox="0 0 44 44"><use href="#tk-bomb" /></svg></span>
        </div>
        <p class="hint">Pukul tikus, jangan sentuh bom. Makin lama makin cepat!</p>
        <p v-if="best" class="hint hint--best">TERBAIK {{ best }}</p>
        <button class="cta" type="button" @click="start">Mulai ▸</button>
      </section>

      <!-- Play / Over -->
      <section v-else class="screen play">
        <div class="solobar">
          <span class="skor" :class="{ 'is-bump': bump }">SKOR <b>{{ score }}</b></span>
          <span class="solobar__best">TERBAIK {{ best }}</span>
        </div>

        <p v-if="phase === 'over'" class="verdict">Kena bom! Skor {{ score }}</p>

        <div class="grid" :class="{ 'is-over': phase === 'over' }">
          <button
            v-for="i in holeList"
            :key="i"
            class="hole"
            type="button"
            :aria-label="'Lubang ' + (i + 1)"
            @pointerdown.prevent="whack(i)"
          >
            <span class="pit" />
            <span v-if="holes[i]" class="critter" :class="holes[i]">
              <svg viewBox="0 0 44 44"><use :href="holes[i] === 'mole' ? '#tk-mole' : '#tk-bomb'" /></svg>
            </span>
            <span class="lip" />
          </button>
        </div>

        <button v-if="phase === 'over'" class="cta" type="button" @click="start">Main lagi ▸</button>
        <p v-else class="hint">Awas bom bisa muncul di bekas tikus!</p>
      </section>
    </div>
  </div>

  <!-- Reusable mole & bomb art via a hidden SVG defs sprite -->
  <svg class="defs" aria-hidden="true">
    <defs>
      <g id="tk-mole">
        <ellipse cx="22" cy="22" rx="17.5" ry="16" fill="#9b5b3a" stroke="#2c1338" stroke-width="2.6" />
        <ellipse cx="22" cy="27.5" rx="9" ry="6.5" fill="#d9a679" stroke="#2c1338" stroke-width="2" />
        <circle cx="15" cy="17" r="4.6" fill="#fff" stroke="#2c1338" stroke-width="1.8" />
        <circle cx="29" cy="17" r="4.6" fill="#fff" stroke="#2c1338" stroke-width="1.8" />
        <circle cx="15.6" cy="18" r="2" fill="#2c1338" />
        <circle cx="28.4" cy="18" r="2" fill="#2c1338" />
        <ellipse cx="22" cy="25" rx="2.7" ry="2.1" fill="#ff4d79" stroke="#2c1338" stroke-width="1.3" />
        <rect x="20" y="29.5" width="4" height="4" rx="1" fill="#fff" stroke="#2c1338" stroke-width="1.1" />
      </g>
      <g id="tk-bomb">
        <path d="M28 12 q6 -7 9 -2" fill="none" stroke="#2c1338" stroke-width="2.6" stroke-linecap="round" />
        <circle class="spark" cx="38" cy="9" r="3.6" fill="#ffd23f" stroke="#2c1338" stroke-width="1.6" />
        <rect x="24" y="10" width="7" height="6" rx="1.6" fill="#2c1338" stroke="#2c1338" stroke-width="2" />
        <circle cx="21" cy="27" r="15" fill="#3a2b4a" stroke="#2c1338" stroke-width="2.6" />
        <circle cx="15" cy="21" r="3.4" fill="rgba(255,255,255,0.4)" />
      </g>
    </defs>
  </svg>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/solobar come from
   src/styles.css (see docs/STYLE.md). */
.tikus {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 20px 26px;
}
.brand {
  font-size: 30px;
}
.play {
  width: 100%;
}
.defs {
  position: absolute;
  width: 0;
  height: 0;
}

/* ---- Ready intro ---- */
.intro {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 6px 0 16px;
}
.intro__demo {
  position: relative;
  width: 58px;
  height: 58px;
}
.intro__vs {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--muted);
}

.hint {
  margin: 0 0 14px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--muted);
  text-align: center;
  max-width: 300px;
}
.hint--best {
  color: var(--berry);
  letter-spacing: 0.12em;
}

/* ---- Score bar ---- */
.skor b {
  color: var(--aqua-deep);
  font-weight: 700;
  font-size: 15px;
}
.skor.is-bump b {
  animation: pop-score 0.13s ease;
}
@keyframes pop-score {
  50% {
    transform: scale(1.5);
  }
}

.verdict {
  margin: 8px 0 12px;
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--berry);
  text-align: center;
}

/* ---- Board ---- */
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  width: 100%;
  margin: 8px 0 16px;
}
.grid.is-over {
  pointer-events: none;
  opacity: 0.85;
}

.hole {
  position: relative;
  aspect-ratio: 1;
  padding: 0;
  border: var(--line) solid var(--ink);
  border-radius: 18px;
  background: var(--cream);
  overflow: hidden;
  cursor: pointer;
}
/* dark hole opening near the bottom */
.pit {
  position: absolute;
  left: 15%;
  right: 15%;
  bottom: 13%;
  height: 30%;
  background: var(--ink);
  border-radius: 50%;
  z-index: 0;
}
/* the mole / bomb that rises out of the pit */
.critter {
  position: absolute;
  left: 17%;
  right: 17%;
  bottom: 17%;
  z-index: 1;
  aspect-ratio: 1;
  transform-origin: bottom center;
  animation: pop 0.15s ease-out;
}
.critter svg,
.intro__demo svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
/* front dirt lip that hides the critter's base for the "in a hole" look */
.lip {
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: 11%;
  height: 16%;
  background: var(--grape);
  border: 2.5px solid var(--ink);
  border-radius: 50%;
  z-index: 2;
}

@keyframes pop {
  from {
    transform: translateY(75%) scale(0.9);
  }
}
</style>
