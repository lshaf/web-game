<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Lompat — an endless Doodle-Jump-style vertical hopper (SOLO). The blob
// auto-bounces: gravity pulls it down, and whenever it's falling and its feet
// cross the top of a platform it springs back up. The player only steers
// left/right (and wraps around the edges). Platforms are generated procedurally
// upward, always within a single jump's reach; the camera follows the blob up
// and the score is the height climbed. Fall below the bottom of the view and
// it's over. Delta-timed physics so it runs the same on any refresh rate.

// ---- Logical world (rendered by % of the board, so it scales to any size) ----
// BW/BH matches the board's 9/14 aspect ratio, so the blob renders as a circle.
const BW = 90 // world width  (x: 0..BW, wraps horizontally)
const BH = 140 // world height visible in the board
const BLOB = 13 // blob diameter (world units)
const HALF = BLOB / 2
const PH = 6 // platform thickness
const G = 220 // gravity (units/s²)
const JUMP = 142 // bounce velocity — jump height ≈ JUMP²/2G ≈ 45.8 units
const ACCEL = 430 // horizontal acceleration while steering
const FRICTION = 9 // per-second velocity decay when not steering
const MAX_VX = 96 // horizontal speed clamp
const MIN_GAP = 22 // vertical spacing between platforms …
const MAX_GAP = 38 // … always < jump height, so every next one is reachable
const FOLLOW = 0.5 // blob sits this fraction up from the bottom while climbing
const UNIT = 5 // world units climbed per score point
const START_Y = 26 // top surface of the starting platform

const bestKey = 'dusk-lompat-best'

const phase = ref('ready') // ready | play | over
const best = ref(0)
const newBest = ref(false)

const blob = reactive({ x: BW / 2, y: START_Y + HALF })
const platforms = reactive([]) // { id, x, y, w, kind, dir, speed, broken }
const camY = ref(0) // world Y at the bottom edge of the view (only ever rises)

// Score = height climbed; monotonic because camY never scrolls back down.
const score = computed(() => Math.floor(camY.value / UNIT))

let vx = 0
let vy = 0
let pid = 0
let lastY = START_Y // highest platform generated so far
let rafId = 0
let lastT = 0

// Held inputs — plain (non-reactive) flags read by the physics loop each frame.
let keyLeft = false
let keyRight = false
let btnLeft = false
let btnRight = false
let boardSteer = 0 // -1 / 0 / +1 from tapping-and-holding a board half
let boardPressed = false

// ---- Procedural platform generation ----
// Add platforms upward until we've covered world Y `toY`. Every platform is at
// most MAX_GAP above the previous one (< jump height), so the next one can
// always be reached. Moving platforms and rare breakables ramp in with height.
function spawnUp(toY) {
  while (lastY < toY) {
    lastY += MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP)
    const w = 20 + Math.random() * 8
    const x = Math.random() * (BW - w)
    let kind = 'static'
    if (lastY > 70) {
      // gentle static start
      const r = Math.random()
      const moveP = Math.min(0.32, 0.05 + lastY * 0.00015)
      const breakP = lastY > 320 ? 0.06 : 0
      if (r < breakP) kind = 'break'
      else if (r < breakP + moveP) kind = 'moving'
    }
    platforms.push({
      id: ++pid,
      x,
      y: lastY,
      w,
      kind,
      dir: Math.random() < 0.5 ? -1 : 1,
      speed: 14 + Math.random() * 10,
      broken: false,
    })
  }
}

// Drop platforms that have scrolled well below the view so memory stays bounded.
function cull() {
  const cut = camY.value - 20
  for (let i = platforms.length - 1; i >= 0; i--) {
    if (platforms[i].y < cut) platforms.splice(i, 1)
  }
}

// Does the blob (which wraps) horizontally overlap this platform?
function overlapX(cx, p) {
  for (const c of [cx, cx - BW, cx + BW]) {
    if (c + HALF > p.x && c - HALF < p.x + p.w) return true
  }
  return false
}

function start() {
  platforms.splice(0, platforms.length)
  pid = 0
  camY.value = 0
  lastY = START_Y
  // A wide, centered starting platform so the first bounce is guaranteed.
  platforms.push({ id: ++pid, x: (BW - 30) / 2, y: START_Y, w: 30, kind: 'static', dir: 1, speed: 0, broken: false })
  blob.x = BW / 2
  blob.y = START_Y + HALF
  vx = 0
  vy = JUMP // launch immediately
  keyLeft = keyRight = btnLeft = btnRight = false
  boardSteer = 0
  boardPressed = false
  newBest.value = false
  spawnUp(camY.value + BH + 20)
  lastT = 0
  phase.value = 'play'
}

function die() {
  if (phase.value !== 'play') return
  phase.value = 'over'
  sfx.lose()
  if (score.value > best.value) {
    best.value = score.value
    newBest.value = true
    try {
      localStorage.setItem(bestKey, String(best.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory best */
    }
  }
}

// ---- One physics step (delta-timed) ----
function step(dt) {
  // Horizontal: accelerate toward the steer direction, else drift to a stop.
  const left = keyLeft || btnLeft || boardSteer === -1
  const right = keyRight || btnRight || boardSteer === 1
  const steer = (right ? 1 : 0) - (left ? 1 : 0)
  if (steer !== 0) vx += steer * ACCEL * dt
  else vx *= Math.max(0, 1 - FRICTION * dt)
  if (vx > MAX_VX) vx = MAX_VX
  else if (vx < -MAX_VX) vx = -MAX_VX

  const prevBottom = blob.y - HALF
  vy -= G * dt
  blob.y += vy * dt
  blob.x += vx * dt
  if (blob.x < 0) blob.x += BW
  else if (blob.x >= BW) blob.x -= BW

  // Slide moving platforms; let broken ones fall away.
  for (const p of platforms) {
    if (p.kind === 'moving' && !p.broken) {
      p.x += p.dir * p.speed * dt
      if (p.x < 0) {
        p.x = 0
        p.dir = 1
      } else if (p.x > BW - p.w) {
        p.x = BW - p.w
        p.dir = -1
      }
    }
    if (p.broken) p.y -= 150 * dt
  }

  // Bounce: only while falling, when the feet cross a platform's top surface.
  if (vy < 0) {
    const nb = blob.y - HALF
    for (const p of platforms) {
      if (p.broken) continue
      if (prevBottom >= p.y && nb <= p.y && overlapX(blob.x, p)) {
        blob.y = p.y + HALF
        vy = JUMP
        sfx.tick()
        if (p.kind === 'break') p.broken = true // one-use: gone after this bounce
        break
      }
    }
  }

  // Camera follows upward only, keeping the blob anchored partway up the view.
  const anchor = BH * FOLLOW
  if (blob.y - anchor > camY.value) camY.value = blob.y - anchor

  spawnUp(camY.value + BH + 20)
  cull()

  if (blob.y + HALF < camY.value) die() // fell below the bottom edge
}

function frame(t) {
  rafId = requestAnimationFrame(frame)
  if (phase.value !== 'play') {
    lastT = t
    return
  }
  if (!lastT) lastT = t
  let dt = (t - lastT) / 1000
  lastT = t
  if (dt > 0.05) dt = 0.05 // clamp after a tab switch / hitch
  step(dt)
}

// ---- Rendering helpers (world → % of the board) ----
function platStyle(p) {
  return {
    left: (p.x / BW) * 100 + '%',
    width: (p.w / BW) * 100 + '%',
    top: (1 - (p.y - camY.value) / BH) * 100 + '%',
    height: (PH / BH) * 100 + '%',
  }
}
// The blob's own x plus a wrapped ghost copy when it straddles an edge.
const blobXs = computed(() => {
  const xs = [blob.x]
  if (blob.x - HALF < 0) xs.push(blob.x + BW)
  else if (blob.x + HALF > BW) xs.push(blob.x - BW)
  return xs
})
function blobStyle(x) {
  return {
    left: ((x - HALF) / BW) * 100 + '%',
    width: (BLOB / BW) * 100 + '%',
    top: (1 - (blob.y + HALF - camY.value) / BH) * 100 + '%',
    height: (BLOB / BH) * 100 + '%',
  }
}

// ---- Controls ----
function onKeyDown(e) {
  const k = e.key
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
    e.preventDefault()
    if (phase.value === 'ready') start()
    keyLeft = true
  } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
    e.preventDefault()
    if (phase.value === 'ready') start()
    keyRight = true
  } else if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
    e.preventDefault()
    if (phase.value !== 'play') start()
  }
}
function onKeyUp(e) {
  const k = e.key
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keyLeft = false
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') keyRight = false
}

// On-screen ◀ ▶ pair (hold to keep steering).
function btnDown(dir) {
  if (phase.value !== 'play') return
  if (dir < 0) btnLeft = true
  else btnRight = true
}
function btnUp() {
  btnLeft = false
  btnRight = false
}

// Tap / hold a half of the board to steer that way; a tap on over restarts.
function boardHalf(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  boardSteer = e.clientX - rect.left < rect.width / 2 ? -1 : 1
}
function boardDown(e) {
  if (phase.value !== 'play') {
    start()
    return
  }
  boardPressed = true
  boardHalf(e)
}
function boardMove(e) {
  if (boardPressed) boardHalf(e)
}
function boardUp() {
  boardPressed = false
  boardSteer = 0
}

// Any release anywhere clears held inputs, even if it lands off the control.
function releaseAll() {
  btnLeft = btnRight = false
  boardPressed = false
  boardSteer = 0
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    best.value = 0
  }
  window.addEventListener('keydown', onKeyDown, { passive: false })
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('pointerup', releaseAll)
  window.addEventListener('pointercancel', releaseAll)
  rafId = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('pointerup', releaseAll)
  window.removeEventListener('pointercancel', releaseAll)
})
</script>

<template>
  <div class="lompat">
    <div class="panel">
      <!-- Ready -->
      <section v-if="phase === 'ready'" class="screen">
        <p class="brand">LOM<span class="brand__accent">PAT</span></p>
        <p class="eyebrow">PANTUL TERUS KE ATAS</p>
        <p class="howto">Miringkan? Cukup geser kiri–kanan. Pantul terus ke atas!</p>
        <div class="solobar lompat__bar">
          <span>MODE SOLO</span>
          <span class="solobar__best">REKOR <b>{{ best }}</b></span>
        </div>
        <button class="cta" type="button" @click="start">Main ▸</button>
      </section>

      <!-- Play / Over -->
      <section v-else class="screen">
        <div class="solobar lompat__bar">
          <span>TINGGI <b>{{ score }}</b></span>
          <span class="solobar__best">REKOR <b>{{ best }}</b></span>
        </div>

        <div
          class="board"
          @pointerdown.prevent="boardDown"
          @pointermove.prevent="boardMove"
          @pointerup.prevent="boardUp"
          @pointerleave="boardUp"
        >
          <!-- platforms -->
          <div
            v-for="p in platforms"
            :key="p.id"
            class="plat"
            :class="{ 'plat--moving': p.kind === 'moving', 'plat--break': p.kind === 'break', 'is-broken': p.broken }"
            :style="platStyle(p)"
          />

          <!-- the blob (+ a wrapped ghost at the edges) -->
          <div v-for="(x, i) in blobXs" :key="'b' + i" class="blob" :style="blobStyle(x)" />

          <div v-if="phase === 'over'" class="board__over">
            <p class="over__title">JATUH!</p>
          </div>
        </div>

        <!-- Steer buttons -->
        <div v-if="phase === 'play'" class="pad">
          <button
            class="key"
            type="button"
            aria-label="Kiri"
            @pointerdown.prevent="btnDown(-1)"
            @pointerup.prevent="btnUp"
            @pointerleave="btnUp"
          >◀</button>
          <button
            class="key"
            type="button"
            aria-label="Kanan"
            @pointerdown.prevent="btnDown(1)"
            @pointerup.prevent="btnUp"
            @pointerleave="btnUp"
          >▶</button>
        </div>
        <p v-if="phase === 'play'" class="hint">Geser layar atau tekan ◀ ▶ untuk mengarahkan.</p>

        <!-- Over -->
        <template v-if="phase === 'over'">
          <div class="result screen">
            <p class="result__title is-lost">Jatuh!</p>
            <p class="result__sub">Tinggi {{ score }} · rekor {{ best }}</p>
            <p class="result__streak">{{ newBest ? 'REKOR BARU!' : 'REKOR ' + best }}</p>
          </div>
          <button class="cta" type="button" @click="start">Main lagi ▸</button>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.lompat {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
}

.panel {
  padding: 22px 18px 26px;
}

.brand {
  font-size: 40px;
}

.howto {
  font-size: 14px;
  color: var(--muted);
  text-align: center;
  max-width: 300px;
  line-height: 1.4;
  margin: 0 0 16px;
}

.lompat__bar {
  margin-bottom: 12px;
}

/* ---- Board: a tall portrait sky the camera scrolls through ---- */
.board {
  position: relative;
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
  aspect-ratio: 9 / 14;
  overflow: hidden;
  border: var(--line) solid var(--ink);
  border-radius: 16px;
  box-shadow: var(--pop);
  background:
    radial-gradient(circle at 50% 14%, rgba(255, 211, 120, 0.6), transparent 42%),
    linear-gradient(to bottom, #9a86ea 0%, #d59ad0 46%, #ffbf8f 82%, #ffd98a 100%);
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

/* Rounded, ink-outlined platform bars. */
.plat {
  position: absolute;
  background: #8fd694;
  border: var(--line) solid var(--ink);
  border-radius: 8px;
  box-shadow: inset 0 -3px 0 rgba(44, 19, 56, 0.2), inset 0 3px 0 rgba(255, 255, 255, 0.35);
}
.plat--moving {
  background: var(--sun);
}
.plat--break {
  background: var(--berry);
  border-style: dashed;
}
.plat.is-broken {
  opacity: 0.45;
}

/* The springy blob — round hot-pink body with two ink eyes. */
.blob {
  position: absolute;
  border-radius: 50%;
  border: var(--line) solid var(--ink);
  background:
    radial-gradient(circle at 38% 40%, var(--ink) 0 10%, transparent 12%),
    radial-gradient(circle at 62% 40%, var(--ink) 0 10%, transparent 12%),
    radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.55) 0 12%, transparent 16%),
    var(--berry);
  box-shadow: inset 0 -4px 0 rgba(44, 19, 56, 0.22), 2px 2px 0 rgba(44, 19, 56, 0.18);
  z-index: 5;
}

.board__over {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: grid;
  place-items: center;
  background: rgba(44, 19, 56, 0.44);
  pointer-events: none;
}
.over__title {
  font-family: var(--font-display);
  font-size: 32px;
  margin: 0;
  color: var(--berry);
  -webkit-text-stroke: 3px var(--ink);
  paint-order: stroke fill;
  text-shadow: var(--pop-sm);
}

/* ---- Steer buttons (mirrors the Snake/Katak d-pad styling) ---- */
.pad {
  display: grid;
  grid-template-columns: repeat(2, 72px);
  gap: 12px;
  justify-content: center;
  margin-top: 16px;
}
.key {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 22px;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  padding: 12px 0;
  box-shadow: 0 4px 0 var(--ink);
  cursor: pointer;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  transition: transform 0.06s ease, box-shadow 0.06s ease;
}
.key:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--ink);
}

.hint {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--muted);
  text-align: center;
  margin: 12px 0 0;
}

.result {
  margin-top: 14px;
}
</style>
