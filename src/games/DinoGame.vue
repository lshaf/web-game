<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, computed } from 'vue'
import DinoSprite from '../components/DinoSprite.vue'

// Fixed logical playfield — the whole board scales to fit its container so
// all game math stays in these coordinates regardless of screen size.
const W = 900
const H = 340
const GROUND = 300 // y of the ground line (baseline for feet)
const DINO_W = 50
const DINO_H = 56
const DINO_X = 96

const GRAVITY = 2600 // px/s^2
const JUMP_V = -900 // px/s
const START_SPEED = 380 // px/s
const MAX_SPEED = 900

const STATE = { READY: 'ready', RUNNING: 'running', DEAD: 'dead' }

const phase = ref(STATE.READY)
const score = ref(0)
const best = ref(0)
const dinoTop = ref(GROUND - DINO_H) // y of dino's top edge
const obstacles = reactive([]) // { id, x, w, h }
const scale = ref(1)

const board = ref(null)

let velY = 0
let speed = START_SPEED
let spawnIn = 0 // px of travel until next spawn
let nextId = 1
let rafId = 0
let lastT = 0

const bestKey = 'dusk-dino-best'
const isJumping = computed(() => dinoTop.value < GROUND - DINO_H - 0.5)

function resetGame() {
  obstacles.splice(0, obstacles.length)
  dinoTop.value = GROUND - DINO_H
  velY = 0
  speed = START_SPEED
  spawnIn = 260
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
    return
  }
  if (phase.value === STATE.DEAD) {
    start()
    return
  }
  // only jump from the ground
  if (!isJumping.value) velY = JUMP_V
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

function tick(t) {
  rafId = requestAnimationFrame(tick)
  if (!lastT) lastT = t
  let dt = (t - lastT) / 1000
  lastT = t
  if (dt > 0.05) dt = 0.05 // clamp after tab switch / hitch

  if (phase.value !== STATE.RUNNING) return

  // difficulty ramps with score
  speed = Math.min(MAX_SPEED, START_SPEED + score.value * 0.6)

  // dino physics
  velY += GRAVITY * dt
  let top = dinoTop.value + velY * dt
  if (top >= GROUND - DINO_H) {
    top = GROUND - DINO_H
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
    const oTop = GROUND - o.h
    if (
      dRight > o.x + 4 &&
      dLeft < o.x + o.w - 4 &&
      dBottom > oTop + 4 &&
      dTop < GROUND
    ) {
      gameOver()
      break
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
  const el = board.value
  if (!el) return
  const avail = el.clientWidth
  scale.value = Math.min(1, avail / W)
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    best.value = 0
  }
  resetGame()
  window.addEventListener('keydown', onKey, { passive: false })
  window.addEventListener('resize', fitScale)
  fitScale()
  rafId = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', fitScale)
})

const pad2 = (n) => String(Math.floor(n)).padStart(5, '0')
</script>

<template>
  <div class="dino-game" ref="board">
    <div class="viewport" :style="{ height: H * scale + 'px' }">
    <div
      class="stage"
      :style="{ width: W + 'px', height: H + 'px', transform: `scale(${scale})` }"
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
        <div class="ground" :style="{ top: GROUND + 'px' }" />

        <!-- obstacles -->
        <div
          v-for="o in obstacles"
          :key="o.id"
          class="cactus"
          :style="{
            left: o.x + 'px',
            top: GROUND - o.h + 'px',
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
  /* Rapid tapping to jump must never select text or pop a callout. */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* The stage is scaled as a whole; the viewport reserves the scaled height
   and clips overflow so the fixed-width board never spills on mobile. */
.viewport {
  width: 100%;
  overflow: hidden;
}

.stage {
  transform-origin: top left;
}

.field {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 16px;
  border: 1px solid rgba(255, 210, 122, 0.25);
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
  right: 20px;
  display: flex;
  gap: 18px;
  font-family: var(--font-mono);
  font-size: 20px;
  letter-spacing: 0.08em;
  color: var(--sand);
}

.hud__best {
  color: var(--muted);
}

.ground {
  position: absolute;
  left: 0;
  right: 0;
  height: 40px;
  background: var(--ink);
  border-top: 2px solid var(--glow);
  opacity: 0.92;
}

.dino-wrap {
  position: absolute;
  color: var(--ink);
}

.cactus {
  position: absolute;
  color: #2f6b3d;
}

.cactus__stalk,
.cactus__arm {
  position: absolute;
  background: currentColor;
  border-radius: 3px;
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
  background: rgba(23, 18, 40, 0.35);
  backdrop-filter: blur(1px);
}

.overlay__title {
  font-family: var(--font-display);
  font-size: 46px;
  margin: 0;
  color: var(--sand);
  text-shadow: 0 3px 0 rgba(255, 138, 76, 0.4);
}

.overlay__title--over {
  color: var(--horizon);
}

.overlay__hint {
  margin: 0;
  font-family: var(--font-mono);
  color: var(--sand);
  font-size: 15px;
}

kbd {
  font-family: var(--font-mono);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 1px 7px;
  font-size: 0.9em;
}

.controls {
  text-align: center;
  color: var(--muted);
  font-size: 14px;
  margin: 18px 0 0;
}
</style>
