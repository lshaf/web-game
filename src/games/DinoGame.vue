<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, computed } from 'vue'
import DinoSprite from '../components/DinoSprite.vue'
import { sfx } from '../sound.js'

// Logical playfield. Width is fixed so horizontal game distance (and reaction
// time) never changes; height grows to fill the container, so the board is
// full-height on mobile — the ground stays pinned near the bottom and the extra
// space becomes sky above.
const W = 900
const H = 340 // default height (kept on desktop's wide aspect)
const GROUND_MARGIN = 40 // gap from the baseline to the bottom edge
const DINO_W = 50
const DINO_H = 56
const DINO_X = 96

const GRAVITY = 2600 // px/s^2
const JUMP_V = -900 // px/s
const START_SPEED = 380 // px/s
const MAX_SPEED = 900

const FPS = 30
const FRAME = 1 / FPS // fixed simulation step

const STATE = { READY: 'ready', RUNNING: 'running', DEAD: 'dead' }

const phase = ref(STATE.READY)
const score = ref(0)
const best = ref(0)
const scale = ref(1)
const stageH = ref(H) // logical board height, grown to fill the container
const groundY = computed(() => stageH.value - GROUND_MARGIN) // feet baseline
const dinoTop = ref(H - GROUND_MARGIN - DINO_H) // y of dino's top edge
const obstacles = reactive([]) // { id, x, w, h }

const viewport = ref(null)

let velY = 0
let speed = START_SPEED
let spawnIn = 0 // px of travel until next spawn
let nextId = 1
let rafId = 0
let lastT = 0
let acc = 0 // banked real time for the 30 fps step
let ro = null

const bestKey = 'dusk-dino-best'
const isJumping = computed(() => dinoTop.value < groundY.value - DINO_H - 0.5)

function resetGame() {
  obstacles.splice(0, obstacles.length)
  dinoTop.value = groundY.value - DINO_H
  velY = 0
  speed = START_SPEED
  spawnIn = 260
  acc = 0
  score.value = 0
  phase.value = STATE.READY
}

function start() {
  resetGame()
  phase.value = STATE.RUNNING
}

function jump() {
  if (phase.value === STATE.READY) {
    start()
    velY = JUMP_V
    sfx.jump()
    return
  }
  if (phase.value === STATE.DEAD) {
    start()
    return
  }
  // only jump from the ground
  if (!isJumping.value) {
    velY = JUMP_V
    sfx.jump()
  }
}

function spawnObstacle() {
  // Cactus clusters: 1–3 stalks, varying height.
  const tall = Math.floor(seededSpread() * 3) // 0..2 extra
  const h = 40 + tall * 8
  const w = 20 + (tall > 1 ? 22 : tall * 8)
  obstacles.push({ id: nextId++, x: W + 20, w, h })
}

// Cheap varied spread without Date/Math.random reliance across the loop.
let spreadSeed = 7
function seededSpread() {
  spreadSeed = (spreadSeed * 9301 + 49297) % 233280
  return spreadSeed / 233280
}

// One fixed simulation slice (dt is always FRAME).
function step(dt) {
  const ground = groundY.value

  // difficulty ramps with score
  speed = Math.min(MAX_SPEED, START_SPEED + score.value * 0.6)

  // dino physics
  velY += GRAVITY * dt
  let top = dinoTop.value + velY * dt
  if (top >= ground - DINO_H) {
    top = ground - DINO_H
    velY = 0
  }
  dinoTop.value = top

  // move obstacles
  const dx = speed * dt
  for (const o of obstacles) o.x -= dx
  while (obstacles.length && obstacles[0].x + obstacles[0].w < -10) {
    obstacles.shift()
  }

  // spawn
  spawnIn -= dx
  if (spawnIn <= 0) {
    spawnObstacle()
    const gap = 320 + seededSpread() * 260 + Math.min(180, score.value * 0.4)
    spawnIn = gap
  }

  // score
  score.value += Math.round(dx * 0.35)

  // collision (AABB with a little forgiveness)
  const pad = 8
  const dLeft = DINO_X + pad
  const dRight = DINO_X + DINO_W - pad
  const dBottom = top + DINO_H
  const dTop = top + pad
  for (const o of obstacles) {
    const oTop = ground - o.h
    if (
      dRight > o.x + 4 &&
      dLeft < o.x + o.w - 4 &&
      dBottom > oTop + 4 &&
      dTop < ground
    ) {
      gameOver()
      break
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

  // Fixed 30 fps simulation: bank real time and advance in constant slices, so
  // the game runs at 30 updates/sec regardless of the display's refresh rate.
  acc += frameDt
  let budget = 5 // cap catch-up so a long hitch can't spiral
  while (acc >= FRAME && budget-- > 0) {
    step(FRAME)
    acc -= FRAME
    if (phase.value !== STATE.RUNNING) {
      acc = 0
      break
    }
  }
}

function gameOver() {
  phase.value = STATE.DEAD
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

function onKey(e) {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ') {
    e.preventDefault()
    jump()
  }
}

function onPointer() {
  jump()
}

function fitScale() {
  const el = viewport.value
  if (!el) return
  const w = el.clientWidth
  const h = el.clientHeight
  if (!w || !h) return
  const prevGround = groundY.value
  scale.value = w / W
  stageH.value = h / scale.value
  // Keep the dino the same height above the ground when the board resizes.
  dinoTop.value += groundY.value - prevGround
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    best.value = 0
  }
  resetGame()
  window.addEventListener('keydown', onKey, { passive: false })
  // Track the container's actual box so the board fills it (and re-fits when the
  // mobile URL bar shows/hides or the device rotates).
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

const pad2 = (n) => String(Math.floor(n)).padStart(5, '0')
</script>

<template>
  <div class="dino-game">
    <div class="viewport" ref="viewport">
    <div
      class="stage"
      :style="{ width: W + 'px', height: stageH + 'px', transform: `scale(${scale})` }"
      @pointerdown.prevent="onPointer"
    >
      <div class="sky field">
        <span class="sky__sun field__sun" />

        <!-- HUD -->
        <div class="hud">
          <span class="hud__best">HI {{ pad2(best) }}</span>
          <span class="hud__score">{{ pad2(score) }}</span>
        </div>

        <!-- ground -->
        <div class="ground" :style="{ top: groundY + 'px' }" />

        <!-- obstacles -->
        <div
          v-for="o in obstacles"
          :key="o.id"
          class="cactus"
          :style="{
            left: o.x + 'px',
            top: groundY - o.h + 'px',
            width: o.w + 'px',
            height: o.h + 'px',
          }"
        >
          <span class="cactus__stalk" />
          <span class="cactus__arm cactus__arm--l" />
          <span class="cactus__arm cactus__arm--r" />
        </div>

        <!-- dino -->
        <div
          class="dino-wrap"
          :style="{ left: DINO_X + 'px', top: dinoTop + 'px', width: DINO_W + 'px', height: DINO_H + 'px' }"
        >
          <DinoSprite :run="phase === STATE.RUNNING && !isJumping" :dead="phase === STATE.DEAD" />
        </div>

        <!-- overlays -->
        <div v-if="phase === STATE.READY" class="overlay">
          <p class="overlay__title">DINO JUMP</p>
          <p class="overlay__hint">Press <kbd>Space</kbd> / tap to leap</p>
        </div>
        <div v-else-if="phase === STATE.DEAD" class="overlay">
          <p class="overlay__title overlay__title--over">GAME OVER</p>
          <p class="overlay__hint">Score {{ pad2(score) }} · Press <kbd>Space</kbd> to retry</p>
        </div>
      </div>
    </div>
    </div>

    <p class="controls">
      <kbd>Space</kbd> or <kbd>↑</kbd> to jump · tap the screen on mobile
    </p>
  </div>
</template>

<style scoped>
.dino-game {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 0 max(12px, env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom))
    max(12px, env(safe-area-inset-left));
  display: flex;
  flex-direction: column;
  /* Rapid tapping to jump must never select text or pop a callout. */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* The stage is scaled as a whole; the viewport clips overflow so the
   fixed-width board never spills. Its box sets the board size — a wide aspect
   on desktop, and the full available height on mobile (see below). */
.viewport {
  width: 100%;
  aspect-ratio: 900 / 340;
  min-height: 0;
  overflow: hidden;
  /* Frame lives here (unscaled) so the cartoon outline stays chunky on mobile
     even as the stage inside scales down. */
  border: var(--line) solid var(--ink);
  border-radius: 20px;
  box-shadow: var(--pop);
}

/* Mobile: fill the whole screen height with the playfield. */
@media (max-width: 560px) {
  .dino-game {
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

.hud {
  position: absolute;
  top: 16px;
  right: 18px;
  display: flex;
  gap: 14px;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 18px;
  letter-spacing: 0.06em;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 999px;
  padding: 5px 15px;
  box-shadow: var(--pop-sm);
}

.hud__best {
  color: var(--berry);
}

.ground {
  position: absolute;
  left: 0;
  right: 0;
  height: 44px;
  background: #f4b24d;
  border-top: var(--line) solid var(--ink);
}

.dino-wrap {
  position: absolute;
  color: #43c96b;
}

.cactus {
  position: absolute;
  color: #2fa85f;
}

.cactus__stalk,
.cactus__arm {
  position: absolute;
  background: currentColor;
  border: 2px solid var(--ink);
  border-radius: 4px;
}

.cactus__stalk {
  left: 50%;
  transform: translateX(-50%);
  width: 34%;
  height: 100%;
}

.cactus__arm {
  width: 22%;
  height: 34%;
  top: 30%;
}

.cactus__arm--l {
  left: 8%;
  border-radius: 3px 3px 3px 3px;
}

.cactus__arm--r {
  right: 8%;
  top: 20%;
}

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
