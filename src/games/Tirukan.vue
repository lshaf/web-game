<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { sfx, muted } from '../sound.js'

// Tirukan — Simon / memory sequence (solo). Each round the game flashes a
// growing sequence of the four pads; the player must tap it back in order.
// Round n plays a sequence of length n (one new random pad appended each
// round). A wrong tap ends the game. Score = highest round reached.

const bestKey = 'dusk-tirukan-best'

// Pad order: top-left, top-right, bottom-left, bottom-right.
const PADS = [
  { id: 0, color: 'aqua', name: 'Toska', freq: 330 },
  { id: 1, color: 'berry', name: 'Merah muda', freq: 392 },
  { id: 2, color: 'sun', name: 'Kuning', freq: 494 },
  { id: 3, color: 'grape', name: 'Ungu', freq: 587 },
]

// Flash timing (ms).
const START_DELAY = 480
const STEP = 560
const LIT = 340
const PRESS_LIT = 220
const NEXT_DELAY = 720

const phase = ref('start') // start | play | lost
const watching = ref(false) // true while the sequence plays (input locked)
const round = ref(1)
const active = ref(-1) // currently lit pad id, -1 = none
const seq = ref([])
const inputIndex = ref(0)
const best = ref(0)

// Timers: the scheduled flash steps, the press-release, and the round advance.
let timers = []
let pressTimer = 0
let nextTimer = 0

// Tiny self-contained WebAudio tone per pad (distinct pitch). Offline-safe and
// respects the shared mute flag; falls back silently if audio is unavailable.
let audioCtx = null
function tone(id) {
  if (muted.value || typeof window === 'undefined') return
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    if (!audioCtx) audioCtx = new AC()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const pad = PADS[id]
    if (!pad) return
    const t0 = audioCtx.currentTime
    const osc = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(pad.freq, t0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32)
    osc.connect(g).connect(audioCtx.destination)
    osc.start(t0)
    osc.stop(t0 + 0.36)
  } catch (e) {
    /* audio unavailable — visual flash still carries the game */
  }
}

function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
  clearTimeout(pressTimer)
  pressTimer = 0
  clearTimeout(nextTimer)
  nextTimer = 0
}

function randPad() {
  return Math.floor(Math.random() * PADS.length)
}

// Schedule the whole current sequence flashing, then unlock for the player.
function playSequence() {
  clearTimers()
  watching.value = true
  active.value = -1
  inputIndex.value = 0
  const arr = seq.value
  arr.forEach((id, i) => {
    const at = START_DELAY + i * STEP
    timers.push(
      setTimeout(() => {
        active.value = id
        tone(id)
      }, at),
    )
    timers.push(
      setTimeout(() => {
        if (active.value === id) active.value = -1
      }, at + LIT),
    )
  })
  timers.push(
    setTimeout(() => {
      watching.value = false
    }, START_DELAY + arr.length * STEP),
  )
}

function start() {
  clearTimers()
  round.value = 1
  seq.value = [randPad()]
  phase.value = 'play'
  playSequence()
}

function nextRound() {
  round.value++
  seq.value = [...seq.value, randPad()]
  playSequence()
}

// Brief light + tone for a manual press (separate from the flash schedule).
function lightPad(id) {
  active.value = id
  tone(id)
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    if (active.value === id) active.value = -1
  }, PRESS_LIT)
}

function press(id) {
  if (phase.value !== 'play' || watching.value) return
  lightPad(id)
  if (id === seq.value[inputIndex.value]) {
    inputIndex.value++
    if (inputIndex.value >= seq.value.length) {
      // Full sequence repeated — lock input and advance after a short beat.
      watching.value = true
      clearTimeout(nextTimer)
      nextTimer = setTimeout(nextRound, NEXT_DELAY)
    }
  } else {
    gameOver()
  }
}

function gameOver() {
  clearTimers()
  watching.value = false
  active.value = -1
  phase.value = 'lost'
  if (round.value > best.value) {
    best.value = round.value
    try {
      localStorage.setItem(bestKey, String(best.value))
    } catch (e) {
      /* storage may be blocked */
    }
  }
  sfx.lose()
}

function toStart() {
  clearTimers()
  watching.value = false
  active.value = -1
  phase.value = 'start'
}

onMounted(() => {
  try {
    const n = parseInt(localStorage.getItem(bestKey), 10)
    best.value = Number.isFinite(n) && n > 0 ? n : 0
  } catch (e) {
    best.value = 0
  }
})

onBeforeUnmount(() => {
  clearTimers()
})
</script>

<template>
  <div class="tirukan">
    <div class="panel">
      <!-- ===== Start ===== -->
      <section v-if="phase === 'start'" class="screen">
        <p class="brand">TIRU<span class="brand__accent">KAN</span></p>
        <p class="eyebrow">IKUTI URUTAN WARNANYA</p>

        <p class="intro">
          Perhatikan pad yang menyala, lalu ketuk kembali dengan urutan yang sama.
          Setiap ronde urutannya bertambah satu warna.
        </p>

        <div class="solobar startbar">
          <span>MEMORI WARNA</span>
          <span>TERBAIK <b class="solobar__best">{{ best > 0 ? best : '—' }}</b></span>
        </div>

        <button class="cta" type="button" @click="start">Mulai ▸</button>
      </section>

      <!-- ===== Play ===== -->
      <section v-else-if="phase === 'play'" class="screen play">
        <div class="topbar">
          <button class="mini" type="button" @click="toStart">← Keluar</button>
          <span class="status">Ronde {{ round }}</span>
          <span class="mini mini--ghost" aria-hidden="true">← Keluar</span>
        </div>

        <p class="cue" :class="{ 'is-watch': watching }">
          {{ watching ? 'Perhatikan…' : 'Ulangi!' }}
        </p>

        <div class="board">
          <button
            v-for="p in PADS"
            :key="p.id"
            class="pad"
            :class="[`pad--${p.color}`, { 'is-lit': active === p.id }]"
            type="button"
            :disabled="watching"
            :aria-label="p.name"
            @click="press(p.id)"
          ></button>
        </div>

        <div class="solobar">
          <span>TIRUKAN</span>
          <span>TERBAIK <b class="solobar__best">{{ best > 0 ? best : '—' }}</b></span>
        </div>
      </section>

      <!-- ===== Result ===== -->
      <section v-else class="screen result">
        <div class="backbar">
          <button class="mini" type="button" @click="toStart">← Keluar</button>
        </div>
        <p class="result__title is-lost">Kalah!</p>
        <p class="result__sub">Kamu mencapai Ronde {{ round }} — {{ round }} warna</p>
        <p class="result__streak">TERBAIK Ronde {{ best > 0 ? best : '—' }}</p>
        <button class="cta" type="button" @click="start">Main lagi ▸</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/backbar/topbar/
   status/solobar/result come from src/styles.css (see docs/STYLE.md). */
.tirukan {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 24px 20px 28px;
}
.brand {
  font-size: 34px;
}
.play {
  width: 100%;
}

/* Start-screen blurb. */
.intro {
  font-size: 15px;
  line-height: 1.45;
  color: var(--muted);
  text-align: center;
  max-width: 320px;
  margin: 0 0 20px;
}
.startbar {
  margin-bottom: 18px;
}

/* Watch / repeat cue line. */
.cue {
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--aqua-deep);
  margin: 0 0 14px;
}
.cue.is-watch {
  color: var(--berry);
  animation: tirukan-pulse 1.1s ease-in-out infinite;
}

/* ---- Pads ---- */
.board {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}
.pad {
  aspect-ratio: 1;
  border: var(--line) solid var(--ink);
  border-radius: 22px;
  background: var(--c);
  filter: brightness(0.66) saturate(0.82);
  box-shadow: var(--pop-sm);
  transition: filter 0.12s ease, transform 0.12s ease, box-shadow 0.12s ease;
}
.pad:disabled {
  cursor: default;
}
.pad.is-lit {
  filter: brightness(1.16) saturate(1.16);
  transform: translate(-1px, -1px) scale(1.04);
  box-shadow: var(--pop-sm), 0 0 22px 5px color-mix(in srgb, var(--c) 62%, transparent);
}

.pad--aqua {
  --c: var(--aqua);
}
.pad--berry {
  --c: var(--berry);
}
.pad--sun {
  --c: var(--sun);
}
.pad--grape {
  --c: var(--grape);
}

@keyframes tirukan-pulse {
  50% {
    opacity: 0.45;
  }
}
</style>
