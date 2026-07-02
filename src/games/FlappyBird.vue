<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import BirdSprite from '../components/BirdSprite.vue'

// Same fill machinery as Dino Jump: width is fixed, height grows to fill the
// container (full-height on mobile). Because Flappy uses the WHOLE vertical
// space, every vertical quantity — bird size, gap, gravity, flap — is a
// fraction of the current board height, so the game plays identically at any
// screen size instead of the bird becoming a tiny dot on a tall board.
const W = 900
const H = 640 // default height (kept on desktop's portrait aspect)
const BIRD_X = 210 // fixed logical x of the bird

// Fractions of the board height:
const BIRD_K = 0.05 // bird height
const GAP_K = 0.27 // vertical gap between pipes
const GRAV_K = 2.4 // gravity (px/s^2 = GRAV_K * H)
const FLAP_K = 0.66 // flap impulse (px/s = -FLAP_K * H)
const GROUND_K = 0.94 // ground line as a fraction of height

const PIPE_W = 150 // logical px (horizontal, fixed)
const PIPE_SPEED = 260 // logical px/s
const PIPE_GAP_X = 440 // horizontal spacing between pipes

const FPS = 30
const FRAME = 1 / FPS

const STATE = { READY: 'ready', RUNNING: 'running', DEAD: 'dead' }

const phase = ref(STATE.READY)
const score = ref(0)
const best = ref(0)
const scale = ref(1)
const stageH = ref(H)
const birdY = ref(H * 0.42) // top edge of the bird
const birdTilt = ref(0)
const pipes = reactive([]) // { id, x, gapY (center), scored }

const groundY = computed(() => stageH.value * GROUND_K)
const gapPx = computed(() => stageH.value * GAP_K)
const birdH = computed(() => stageH.value * BIRD_K)
const birdW = computed(() => birdH.value * 1.35)

const viewport = ref(null)

let velY = 0
let spawnIn = 0
let nextId = 1
let rafId = 0
let lastT = 0
let acc = 0
let ro = null

const bestKey = 'dusk-flappy-best'
const grav = () => stageH.value * GRAV_K
const flapV = () => -stageH.value * FLAP_K

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const pad = (n) => String(Math.floor(n)).padStart(5, '0')

// Cheap varied spread without Date/Math.random reliance across the loop.
let spreadSeed = 13
function seededSpread() {
  spreadSeed = (spreadSeed * 9301 + 49297) % 233280
  return spreadSeed / 233280
}

function resetGame() {
  pipes.splice(0, pipes.length)
  birdY.value = stageH.value * 0.42
  velY = 0
  birdTilt.value = 0
  spawnIn = 520
  acc = 0
  score.value = 0
  phase.value = STATE.READY
}

function start() {
  resetGame()
  phase.value = STATE.RUNNING
}

function flap() {
  if (phase.value === STATE.RUNNING) {
    velY = flapV()
    return
  }
  // From the ready screen or after a crash: restart and give one flap.
  start()
  velY = flapV()
}

function spawnPipe() {
  const lo = stageH.value * 0.24
  const hi = stageH.value * 0.76
  const gapY = lo + seededSpread() * (hi - lo)
  pipes.push({ id: nextId++, x: W + 40, gapY, scored: false })
}

function step(dt) {
  const ground = groundY.value

  // bird physics
  velY += grav() * dt
  let y = birdY.value + velY * dt
  if (y < 0) {
    y = 0
    velY = 0
  }
  birdY.value = y
  birdTilt.value = clamp((velY / stageH.value) * 62, -24, 82)

  // pipes scroll left (speeding up a little with score)
  const speed = PIPE_SPEED + Math.min(170, score.value * 6)
  const dx = speed * dt
  for (const p of pipes) p.x -= dx
  while (pipes.length && pipes[0].x + PIPE_W < -20) pipes.shift()

  // spawn
  spawnIn -= dx
  if (spawnIn <= 0) {
    spawnPipe()
    spawnIn = PIPE_GAP_X
  }

  // score when a pipe clears the bird
  for (const p of pipes) {
    if (!p.scored && p.x + PIPE_W < BIRD_X) {
      p.scored = true
      score.value++
    }
  }

  // collision: ground, then pipes
  const bH = birdH.value
  const bW = birdW.value
  const top = y
  const bottom = y + bH
  if (bottom >= ground) {
    gameOver()
    return
  }
  const half = gapPx.value / 2
  const inset = 4
  for (const p of pipes) {
    if (BIRD_X + bW - inset > p.x + inset && BIRD_X + inset < p.x + PIPE_W - inset) {
      if (top < p.gapY - half + inset || bottom > p.gapY + half - inset) {
        gameOver()
        break
      }
    }
  }
}

function gameOver() {
  phase.value = STATE.DEAD
  if (score.value > best.value) {
    best.value = score.value
    try {
      localStorage.setItem(bestKey, String(best.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory best */
    }
  }
}

function tick(t) {
  rafId = requestAnimationFrame(tick)
  if (!lastT) lastT = t
  let frameDt = (t - lastT) / 1000
  lastT = t
  if (frameDt > 0.1) frameDt = 0.1 // clamp after a tab switch / hitch

  if (phase.value !== STATE.RUNNING) {
    acc = 0
    return
  }

  // Fixed 30 fps simulation (same as Dino Jump).
  acc += frameDt
  let budget = 5
  while (acc >= FRAME && budget-- > 0) {
    step(FRAME)
    acc -= FRAME
    if (phase.value !== STATE.RUNNING) {
      acc = 0
      break
    }
  }
}

function onKey(e) {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ') {
    e.preventDefault()
    flap()
  }
}

function onPointer() {
  flap()
}

function fitScale() {
  const el = viewport.value
  if (!el) return
  const w = el.clientWidth
  const h = el.clientHeight
  if (!w || !h) return
  const prev = stageH.value
  scale.value = w / W
  stageH.value = h / scale.value
  // Keep the bird and pipes at the same relative height when the board resizes.
  const r = stageH.value / prev
  if (isFinite(r) && r > 0 && r !== 1) {
    birdY.value *= r
    for (const p of pipes) p.gapY *= r
  }
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    best.value = 0
  }
  resetGame()
  window.addEventListener('keydown', onKey, { passive: false })
  ro = new ResizeObserver(fitScale)
  if (viewport.value) ro.observe(viewport.value)
  fitScale()
  rafId = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('keydown', onKey)
  if (ro) ro.disconnect()
})
</script>

<template>
  <div class="flappy-game">
    <div class="viewport" ref="viewport">
      <div
        class="stage"
        :style="{ width: W + 'px', height: stageH + 'px', transform: `scale(${scale})` }"
        @pointerdown.prevent="onPointer"
      >
        <div class="sky field">
          <span class="sky__sun field__sun" />

          <!-- pipes -->
          <div
            v-for="p in pipes"
            :key="p.id"
            class="pipe"
            :style="{ left: p.x + 'px', width: PIPE_W + 'px' }"
          >
            <div class="pipe__seg pipe__seg--top" :style="{ height: Math.max(0, p.gapY - gapPx / 2) + 'px' }" />
            <div
              class="pipe__seg pipe__seg--bottom"
              :style="{ top: p.gapY + gapPx / 2 + 'px', height: Math.max(0, groundY - (p.gapY + gapPx / 2)) + 'px' }"
            />
          </div>

          <!-- ground -->
          <div class="ground" :style="{ top: groundY + 'px' }" />

          <!-- bird -->
          <div
            class="bird-wrap"
            :class="{ 'is-ready': phase === STATE.READY }"
            :style="{
              left: BIRD_X + 'px',
              top: birdY + 'px',
              width: birdW + 'px',
              height: birdH + 'px',
              transform: phase === STATE.READY ? undefined : `rotate(${birdTilt}deg)`,
            }"
          >
            <BirdSprite :dead="phase === STATE.DEAD" />
          </div>

          <!-- live score -->
          <div v-if="phase === STATE.RUNNING" class="bigscore">{{ score }}</div>

          <!-- HUD -->
          <div class="hud"><span class="hud__best">HI {{ pad(best) }}</span></div>

          <!-- overlays -->
          <div v-if="phase === STATE.READY" class="overlay">
            <p class="overlay__title">FLAPPY</p>
            <p class="overlay__hint">Press <kbd>Space</kbd> / tap to flap</p>
          </div>
          <div v-else-if="phase === STATE.DEAD" class="overlay">
            <p class="overlay__title overlay__title--over">GAME OVER</p>
            <p class="overlay__hint">Score {{ score }} · Best {{ best }} · tap to retry</p>
          </div>
        </div>
      </div>
    </div>

    <p class="controls"><kbd>Space</kbd> or <kbd>↑</kbd> · tap the screen to flap</p>
  </div>
</template>

<style scoped>
.flappy-game {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 0 max(12px, env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom))
    max(12px, env(safe-area-inset-left));
  display: flex;
  flex-direction: column;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* Portrait board on desktop; fills the screen on mobile (below). */
.viewport {
  width: 100%;
  aspect-ratio: 3 / 4;
  min-height: 0;
  overflow: hidden;
  border: var(--line) solid var(--ink);
  border-radius: 20px;
  box-shadow: var(--pop);
}

@media (max-width: 560px) {
  .flappy-game {
    flex: 1;
    min-height: 0;
  }
  .viewport {
    flex: 1;
    aspect-ratio: auto;
  }
}

.stage {
  transform-origin: top left;
}

.field {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: manipulation;
  cursor: pointer;
}

.field__sun {
  width: 150px;
  height: 150px;
  bottom: 2%;
}

/* ---- Pipes ---- */
.pipe {
  position: absolute;
  top: 0;
  bottom: 0;
}
.pipe__seg {
  position: absolute;
  left: 0;
  right: 0;
  background: #57cc5f;
  border: var(--line) solid var(--ink);
  border-radius: 8px;
}
.pipe__seg::after {
  content: '';
  position: absolute;
  left: -8px;
  right: -8px;
  height: 26px;
  background: #57cc5f;
  border: var(--line) solid var(--ink);
  border-radius: 8px;
}
.pipe__seg--top {
  top: 0;
}
.pipe__seg--top::after {
  bottom: -4px;
}
.pipe__seg--bottom::after {
  top: -4px;
}

.ground {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: #f4b24d;
  border-top: var(--line) solid var(--ink);
}

.bird-wrap {
  position: absolute;
  z-index: 2;
}
.bird-wrap.is-ready {
  animation: bob 1.4s ease-in-out infinite;
}
@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-9px);
  }
}

.bigscore {
  position: absolute;
  top: 5%;
  left: 0;
  right: 0;
  text-align: center;
  font-family: var(--font-display);
  font-size: 64px;
  color: var(--cream);
  -webkit-text-stroke: 4px var(--ink);
  paint-order: stroke fill;
  text-shadow: var(--pop);
  pointer-events: none;
}

.hud {
  position: absolute;
  top: 16px;
  right: 18px;
  font-family: var(--font-mono);
  font-size: 16px;
  letter-spacing: 0.06em;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 999px;
  padding: 4px 12px;
  box-shadow: var(--pop-sm);
}
.hud__best {
  color: var(--berry);
}

/* ---- Overlays (shared look with Dino Jump) ---- */
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(44, 19, 56, 0.4);
  backdrop-filter: blur(1px);
}
.overlay__title {
  font-family: var(--font-display);
  font-size: 54px;
  margin: 0;
  letter-spacing: 0.02em;
  color: var(--sun);
  -webkit-text-stroke: 3px var(--ink);
  paint-order: stroke fill;
  text-shadow: var(--pop);
}
.overlay__title--over {
  color: var(--berry);
}
.overlay__hint {
  margin: 0;
  font-family: var(--font-body);
  font-weight: 600;
  color: var(--cream);
  font-size: 15px;
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

.controls {
  text-align: center;
  color: var(--muted);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 14px;
  margin: 18px 0 0;
}
</style>
