<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { sfx } from '../sound.js'

// Menara — a one-tap tower stacker. A block slides left↔right across the top;
// tap / press Space / hit "Jatuhkan" to drop it onto the stack. The overlap
// with the block below becomes the new block; the overhang is trimmed off (and
// falls away). Miss entirely → the tower topples and it's game over. As the
// tower climbs the whole stack scrolls down so the active block stays pinned
// near the top, and the slide quickens as the score grows.
//
// Everything below is in a fixed logical playfield (W×H) scaled as a whole to
// fit the container — the same viewport/stage/scale trick as Ball Breaker.
const W = 320
const H = 480
const BLOCK_H = 30 // logical height of one stacked block
const BASE_W = 150 // starting block width
const TOP_MARGIN = 64 // where the active block pins once the camera engages
const PERFECT_EPS = 6 // |offset| under this counts as a perfect drop (no trim)

// Slide speed (logical px/s) — ramps gently with the tower height.
const BASE_SPEED = 120
const SPEED_STEP = 5
const MAX_SPEED = 300

// Cycling on-palette hues; each new block takes the next one, so neighbours
// always differ.
const HUES = [
  'var(--aqua)',
  'var(--berry)',
  'var(--sun)',
  'var(--grape)',
  'var(--sun-core)',
  'var(--aqua-deep)',
]
const colorAt = (i) => HUES[((i % HUES.length) + HUES.length) % HUES.length]

const bestKey = 'dusk-menara-best'

const phase = ref('ready') // ready | play | over
const best = ref(0)
const scale = ref(1)

const blocks = reactive([]) // { id, x, w, color } bottom-up; index 0 is the base
const mover = reactive({ x: 0, w: BASE_W, color: colorAt(1), dir: 1 })
const shards = reactive([]) // trimmed overhang falling away: { id, x, w, bottom, color }
const perfect = reactive({ id: 0, x: 0, bottom: 0, on: false })

const viewport = ref(null)

let nextId = 1
let rafId = 0
let lastT = 0
let ro = null
let moverSide = 1
const timers = new Set()

// Score = number of blocks stacked on top of the base.
const score = computed(() => Math.max(0, blocks.length - 1))

// Current slide speed for the active block.
const curSpeed = () => Math.min(MAX_SPEED, BASE_SPEED + score.value * SPEED_STEP)

// The active block's vertical slot (its bottom, in tower coords).
const moverBottom = computed(() => blocks.length * BLOCK_H)

// Scroll the stack down so the active block stays TOP_MARGIN from the top once
// the tower is tall enough to reach it. Positive = tower shifted down.
const camOffset = computed(() =>
  Math.max(0, (blocks.length + 1) * BLOCK_H - (H - TOP_MARGIN)),
)
const camStyle = computed(() => ({ transform: `translateY(${camOffset.value}px)` }))

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms)
  timers.add(id)
  return id
}

function spawnMover() {
  const below = blocks[blocks.length - 1]
  mover.w = below.w
  mover.color = colorAt(blocks.length)
  // Alternate the entry edge each time for variety.
  moverSide *= -1
  if (moverSide > 0) {
    mover.x = 0
    mover.dir = 1
  } else {
    mover.x = W - below.w
    mover.dir = -1
  }
}

function spawnShard(x, w, bottom, color) {
  const id = nextId++
  shards.push({ id, x, w, bottom, color })
  later(() => {
    const idx = shards.findIndex((s) => s.id === id)
    if (idx !== -1) shards.splice(idx, 1)
  }, 760)
}

function flashPerfect(cx, bottom) {
  perfect.id++
  perfect.x = cx
  perfect.bottom = bottom
  perfect.on = true
  later(() => {
    perfect.on = false
  }, 700)
}

function start() {
  // Wipe any leftover animations from a previous run.
  timers.forEach(clearTimeout)
  timers.clear()
  shards.splice(0, shards.length)
  perfect.on = false
  blocks.splice(0, blocks.length)
  blocks.push({ id: nextId++, x: (W - BASE_W) / 2, w: BASE_W, color: colorAt(0) })
  moverSide = 1
  spawnMover()
  phase.value = 'play'
  // The stage only exists once we leave the "ready" screen, so scale it (and
  // start watching for resizes) after it mounts — otherwise scale stays 1 and
  // the play area is undersized on anything wider than 320px.
  nextTick(() => {
    fitScale()
    if (viewport.value && ro) ro.observe(viewport.value)
  })
}

function gameOver() {
  phase.value = 'over'
  sfx.lose()
  if (score.value > best.value) {
    best.value = score.value
    try {
      localStorage.setItem(bestKey, String(best.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory best */
    }
  }
}

function drop() {
  if (phase.value !== 'play') return
  const below = blocks[blocks.length - 1]
  const left = Math.max(mover.x, below.x)
  const right = Math.min(mover.x + mover.w, below.x + below.w)
  const overlap = right - left
  const slot = moverBottom.value

  // No overlap → missed entirely: the block tumbles off and the game ends.
  if (overlap <= 0) {
    spawnShard(mover.x, mover.w, slot, mover.color)
    gameOver()
    return
  }

  let nx = left
  let nw = overlap
  if (Math.abs(mover.x - below.x) <= PERFECT_EPS) {
    // Near-exact: snap flush and keep the full width — no trim.
    nx = below.x
    nw = below.w
    flashPerfect(below.x + below.w / 2, slot + BLOCK_H)
    sfx.jump()
  } else {
    // Trim the overhang(s) and let the offcut fall away.
    if (mover.x < left) spawnShard(mover.x, left - mover.x, slot, mover.color)
    if (mover.x + mover.w > right) spawnShard(right, mover.x + mover.w - right, slot, mover.color)
    sfx.tick()
  }

  blocks.push({ id: nextId++, x: nx, w: nw, color: mover.color })
  spawnMover()
}

function onTap() {
  if (phase.value === 'play') drop()
  else if (phase.value === 'over') start()
}

// ---- Slide loop ----
function tick(t) {
  rafId = requestAnimationFrame(tick)
  if (!lastT) lastT = t
  let dt = (t - lastT) / 1000
  lastT = t
  if (dt > 0.1) dt = 0.1 // clamp after a tab switch / hitch
  if (phase.value !== 'play') return

  mover.x += mover.dir * curSpeed() * dt
  const maxX = W - mover.w
  if (mover.x <= 0) {
    mover.x = 0
    mover.dir = 1
  } else if (mover.x >= maxX) {
    mover.x = maxX
    mover.dir = -1
  }
}

function onKeyDown(e) {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault()
    if (phase.value === 'play') drop()
    else start()
  }
}

function fitScale() {
  const el = viewport.value
  if (!el) return
  const w = el.clientWidth
  if (w) scale.value = w / W
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    best.value = 0
  }
  window.addEventListener('keydown', onKeyDown, { passive: false })
  ro = new ResizeObserver(fitScale)
  if (viewport.value) ro.observe(viewport.value)
  fitScale()
  rafId = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('keydown', onKeyDown)
  if (ro) ro.disconnect()
  timers.forEach(clearTimeout)
  timers.clear()
})
</script>

<template>
  <div class="menara">
    <div class="panel">
      <!-- Ready -->
      <section v-if="phase === 'ready'" class="screen">
        <p class="brand">MEN<span class="brand__accent">ARA</span></p>
        <p class="eyebrow">TUMPUK SETINGGI MUNGKIN</p>
        <button class="cta" type="button" @click="start">Mulai ▸</button>
      </section>

      <!-- Play / Over -->
      <section v-else class="screen">
        <div class="solobar">
          <span>TINGGI <b>{{ score }}</b></span>
          <span class="solobar__best">TERBAIK <b>{{ best }}</b></span>
        </div>

        <div
          class="stage-wrap"
          ref="viewport"
          @pointerdown.prevent="onTap"
        >
          <div
            class="stage sky"
            :style="{ width: W + 'px', height: H + 'px', transform: `scale(${scale})` }"
          >
            <span class="sky__sun" />

            <div class="tower" :style="camStyle">
              <!-- settled stack -->
              <div
                v-for="(b, i) in blocks"
                :key="b.id"
                class="block"
                :style="{
                  left: b.x + 'px',
                  bottom: i * BLOCK_H + 'px',
                  width: b.w + 'px',
                  height: BLOCK_H + 'px',
                  background: b.color,
                }"
              />

              <!-- trimmed offcuts falling away -->
              <div
                v-for="s in shards"
                :key="s.id"
                class="shard"
                :style="{
                  left: s.x + 'px',
                  bottom: s.bottom + 'px',
                  width: s.w + 'px',
                  height: BLOCK_H + 'px',
                  background: s.color,
                }"
              />

              <!-- active sliding block -->
              <div
                v-if="phase === 'play'"
                class="block block--mover"
                :style="{
                  left: mover.x + 'px',
                  bottom: moverBottom + 'px',
                  width: mover.w + 'px',
                  height: BLOCK_H + 'px',
                  background: mover.color,
                }"
              />

              <!-- perfect-drop feedback -->
              <span
                v-if="perfect.on"
                :key="perfect.id"
                class="perfect"
                :style="{ left: perfect.x + 'px', bottom: perfect.bottom + 4 + 'px' }"
              >PAS!</span>
            </div>
          </div>
        </div>

        <!-- Play controls -->
        <template v-if="phase === 'play'">
          <button class="cta cta--alt" type="button" @pointerdown.prevent="drop">
            Jatuhkan
          </button>
          <p class="hint">Ketuk layar / tombol · <kbd>Spasi</kbd> untuk menjatuhkan</p>
        </template>

        <!-- Result -->
        <template v-else>
          <div class="result">
            <p class="result__title is-lost">ROBOH!</p>
            <p class="result__sub">Menara setinggi {{ score }} tingkat</p>
            <p class="result__streak">TERBAIK {{ best }} TINGKAT</p>
          </div>
          <button class="cta" type="button" @click="start">Main lagi ▸</button>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.menara {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.panel {
  padding: 18px 16px 22px;
}

.brand {
  font-size: 40px;
}

.solobar {
  margin-bottom: 12px;
}

/* Fixed portrait play area; the stage scales to fit and the wrap clips it. */
.stage-wrap {
  position: relative; /* anchor for the absolutely-positioned .stage inside */
  width: 100%;
  aspect-ratio: 320 / 480;
  overflow: hidden;
  border: var(--line) solid var(--ink);
  border-radius: 18px;
  box-shadow: var(--pop);
  cursor: pointer;
  touch-action: manipulation;
  background: var(--cream);
}

.stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}

/* Shrink the shared sun disc to sit low behind the rising tower. */
.sky__sun {
  width: 120px;
  height: 120px;
  bottom: -6%;
  opacity: 0.9;
}

.tower {
  position: absolute;
  inset: 0;
  transition: transform 0.35s ease;
  will-change: transform;
  pointer-events: none;
}

/* Chunky ink-outlined block with a soft offset shadow + a bit of top sheen. */
.block {
  position: absolute;
  border: var(--line) solid var(--ink);
  border-radius: 9px;
  box-shadow: inset 0 -5px 0 rgba(44, 19, 56, 0.18), 3px 4px 0 rgba(44, 19, 56, 0.16);
}

/* The active block eases vertically with the same timing as the camera scroll,
   so it stays pinned near the top while the stack slides beneath it. */
.block--mover {
  transition: bottom 0.35s ease;
  z-index: 3;
  box-shadow: inset 0 -5px 0 rgba(44, 19, 56, 0.18), 4px 6px 0 rgba(44, 19, 56, 0.22);
  animation: menara-bob 1.2s ease-in-out infinite;
}

.shard {
  position: absolute;
  border: var(--line) solid var(--ink);
  border-radius: 9px;
  z-index: 2;
  animation: menara-fall 0.72s ease-in forwards;
}

.perfect {
  position: absolute;
  transform: translateX(-50%);
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--sun);
  -webkit-text-stroke: 3px var(--ink);
  paint-order: stroke fill;
  white-space: nowrap;
  z-index: 4;
  pointer-events: none;
  animation: menara-pop 0.7s ease forwards;
}

.result {
  padding: 14px 0 4px;
  text-align: center;
}

.hint {
  text-align: center;
  color: var(--muted);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 13px;
  margin: 12px 0 0;
}

kbd {
  font-family: var(--font-mono);
  background: var(--cream);
  color: var(--ink);
  border: 2px solid var(--ink);
  border-radius: 6px;
  padding: 1px 7px;
  font-size: 0.9em;
  box-shadow: 0 2px 0 var(--ink);
}

@keyframes menara-bob {
  50% {
    transform: translateY(-3px);
  }
}

@keyframes menara-fall {
  to {
    transform: translateY(220px) rotate(38deg);
    opacity: 0;
  }
}

@keyframes menara-pop {
  0% {
    transform: translateX(-50%) translateY(6px) scale(0.6);
    opacity: 0;
  }
  35% {
    transform: translateX(-50%) translateY(-6px) scale(1.1);
    opacity: 1;
  }
  100% {
    transform: translateX(-50%) translateY(-20px) scale(1);
    opacity: 0;
  }
}
</style>
