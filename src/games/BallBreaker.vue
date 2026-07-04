<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Fixed logical playfield: a fixed-width, fixed-height portrait board scaled as
// a whole to fit the container (same viewport+stage+scale machinery as Dino
// Jump / Flappy). Everything below is in these logical pixels.
const W = 360
const H = 480

// Layout
const WALL = 8 // inner margin the ball bounces off (left/right/top)
const PADDLE_W = 74
const PADDLE_H = 14
const PADDLE_Y = H - 34 // top edge of the paddle
const BALL_R = 7

// Brick grid
const COLS = 7
const ROWS = 5
const BRICK_TOP = 58 // where the first row starts
const BRICK_GAP = 5
const BRICK_H = 20
const GRID_L = WALL + 6
const GRID_R = W - WALL - 6
const BRICK_W = (GRID_R - GRID_L - (COLS - 1) * BRICK_GAP) / COLS

// Ball speed (logical px/s). Ramps a little per level.
const BASE_SPEED = 232
const SPEED_STEP = 20 // added per cleared level
const MAX_SPEED = 360

const FPS = 60
const FRAME = 1 / FPS

const STATE = { READY: 'ready', RUNNING: 'running', DEAD: 'dead' }

// Row colors, top → bottom, from the palette.
const ROW_COLORS = ['var(--berry)', 'var(--sun-core)', 'var(--sun)', 'var(--aqua)', 'var(--grape)']

const phase = ref(STATE.READY)
const score = ref(0)
const best = ref(0)
const lives = ref(3)
const level = ref(1)
const scale = ref(1)

const paddleX = ref((W - PADDLE_W) / 2) // left edge of the paddle
const ball = reactive({ x: W / 2, y: PADDLE_Y - BALL_R, vx: 0, vy: 0 })
const bricks = reactive([]) // { id, x, y, w, h, color, alive }

const viewport = ref(null)

let speed = BASE_SPEED
let nextId = 1
let rafId = 0
let lastT = 0
let acc = 0
let ro = null

const bestKey = 'dusk-breaker-best'
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const pad = (n) => String(Math.floor(n)).padStart(5, '0')

const aliveCount = computed(() => bricks.reduce((n, b) => n + (b.alive ? 1 : 0), 0))

function buildWall() {
  bricks.splice(0, bricks.length)
  // Higher levels pack an extra row (up to a full board) for more challenge.
  const rows = Math.min(ROW_COLORS.length, ROWS + Math.floor((level.value - 1) / 2))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      bricks.push({
        id: nextId++,
        x: GRID_L + c * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        w: BRICK_W,
        h: BRICK_H,
        color: ROW_COLORS[r % ROW_COLORS.length],
        alive: true,
      })
    }
  }
}

function serveBall() {
  // Rest the ball on the paddle; it launches on tap/Space.
  ball.x = paddleX.value + PADDLE_W / 2
  ball.y = PADDLE_Y - BALL_R - 1
  ball.vx = 0
  ball.vy = 0
}

function launchBall() {
  const angle = (-Math.PI / 2) + (Math.random() * 0.5 - 0.25) // mostly up
  ball.vx = Math.cos(angle) * speed
  ball.vy = Math.sin(angle) * speed
}

function resetGame() {
  score.value = 0
  lives.value = 3
  level.value = 1
  speed = BASE_SPEED
  paddleX.value = (W - PADDLE_W) / 2
  buildWall()
  serveBall()
  acc = 0
  phase.value = STATE.READY
}

function start() {
  resetGame()
  phase.value = STATE.RUNNING
}

// Tap / Space handler: start from ready, launch a resting ball, or retry.
function fire() {
  if (phase.value === STATE.DEAD) {
    start()
    return
  }
  if (phase.value === STATE.READY) {
    start()
  }
  if (ball.vx === 0 && ball.vy === 0) launchBall()
}

function nextLevel() {
  level.value++
  speed = Math.min(MAX_SPEED, BASE_SPEED + (level.value - 1) * SPEED_STEP)
  buildWall()
  serveBall()
  sfx.win()
}

function loseLife() {
  lives.value--
  if (lives.value <= 0) {
    gameOver()
    return
  }
  sfx.lose()
  serveBall()
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

// One fixed simulation slice.
function step(dt) {
  // A ball resting on the paddle follows the paddle until launched.
  if (ball.vx === 0 && ball.vy === 0) {
    ball.x = clamp(ball.x, paddleX.value + BALL_R, paddleX.value + PADDLE_W - BALL_R)
    ball.y = PADDLE_Y - BALL_R - 1
    return
  }

  // Substep so a fast ball can't tunnel through a brick or wall in one frame.
  const dist = Math.hypot(ball.vx, ball.vy) * dt
  const subs = Math.max(1, Math.ceil(dist / (BALL_R * 0.8)))
  const sdt = dt / subs
  for (let s = 0; s < subs; s++) {
    if (moveBall(sdt)) break // stop substepping if the ball fell out
  }
}

// Advance the ball one substep; returns true if the life ended.
function moveBall(dt) {
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt

  // Walls (left / right / top)
  if (ball.x - BALL_R < WALL) {
    ball.x = WALL + BALL_R
    ball.vx = Math.abs(ball.vx)
    sfx.tick()
  } else if (ball.x + BALL_R > W - WALL) {
    ball.x = W - WALL - BALL_R
    ball.vx = -Math.abs(ball.vx)
    sfx.tick()
  }
  if (ball.y - BALL_R < WALL) {
    ball.y = WALL + BALL_R
    ball.vy = Math.abs(ball.vy)
    sfx.tick()
  }

  // Paddle
  if (
    ball.vy > 0 &&
    ball.y + BALL_R >= PADDLE_Y &&
    ball.y + BALL_R <= PADDLE_Y + PADDLE_H + 6 &&
    ball.x >= paddleX.value - BALL_R &&
    ball.x <= paddleX.value + PADDLE_W + BALL_R
  ) {
    // Angle depends on where it hit: -1 (left edge) .. +1 (right edge).
    const hit = clamp((ball.x - (paddleX.value + PADDLE_W / 2)) / (PADDLE_W / 2), -1, 1)
    const angle = hit * (Math.PI * 0.4) // up to ~72° off vertical
    ball.vx = Math.sin(angle) * speed
    ball.vy = -Math.abs(Math.cos(angle) * speed)
    ball.y = PADDLE_Y - BALL_R - 0.5
    sfx.tick()
  }

  // Bricks — reflect off the first one hit this substep.
  for (const b of bricks) {
    if (!b.alive) continue
    if (
      ball.x + BALL_R > b.x &&
      ball.x - BALL_R < b.x + b.w &&
      ball.y + BALL_R > b.y &&
      ball.y - BALL_R < b.y + b.h
    ) {
      b.alive = false
      score.value += 10
      sfx.tick()
      // Decide reflection axis by shallowest overlap.
      const overlapL = ball.x + BALL_R - b.x
      const overlapR = b.x + b.w - (ball.x - BALL_R)
      const overlapT = ball.y + BALL_R - b.y
      const overlapB = b.y + b.h - (ball.y - BALL_R)
      const minX = Math.min(overlapL, overlapR)
      const minY = Math.min(overlapT, overlapB)
      if (minX < minY) {
        ball.vx = -ball.vx
      } else {
        ball.vy = -ball.vy
      }
      if (aliveCount.value === 0) nextLevel()
      break
    }
  }

  // Fell below the paddle → lose a life.
  if (ball.y - BALL_R > H) {
    loseLife()
    return true
  }
  return false
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

  // Fixed 60 fps simulation (same banking scheme as Dino Jump / Flappy).
  acc += frameDt
  let budget = 6
  while (acc >= FRAME && budget-- > 0) {
    step(FRAME)
    acc -= FRAME
    if (phase.value !== STATE.RUNNING) {
      acc = 0
      break
    }
  }
}

// ---- Controls ----
function movePaddleTo(logicalX) {
  paddleX.value = clamp(logicalX - PADDLE_W / 2, WALL, W - WALL - PADDLE_W)
}

function pointerX(e) {
  const el = viewport.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return (e.clientX - rect.left) / scale.value
}

function onPointerDown(e) {
  const x = pointerX(e)
  if (x != null) movePaddleTo(x)
  fire()
}

function onPointerMove(e) {
  if (e.buttons === 0 && e.pointerType === 'mouse') {
    // Follow the mouse even without a button held while running.
  }
  const x = pointerX(e)
  if (x != null) movePaddleTo(x)
}

let keyDir = 0
let keyRaf = 0
function keyLoop() {
  if (keyDir !== 0) {
    movePaddleTo(paddleX.value + PADDLE_W / 2 + keyDir * 9)
    keyRaf = requestAnimationFrame(keyLoop)
  } else {
    keyRaf = 0
  }
}

function onKeyDown(e) {
  if (e.code === 'ArrowLeft') {
    e.preventDefault()
    keyDir = -1
    if (!keyRaf) keyRaf = requestAnimationFrame(keyLoop)
  } else if (e.code === 'ArrowRight') {
    e.preventDefault()
    keyDir = 1
    if (!keyRaf) keyRaf = requestAnimationFrame(keyLoop)
  } else if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault()
    fire()
  }
}

function onKeyUp(e) {
  if ((e.code === 'ArrowLeft' && keyDir < 0) || (e.code === 'ArrowRight' && keyDir > 0)) {
    keyDir = 0
  }
}

function fitScale() {
  const el = viewport.value
  if (!el) return
  const w = el.clientWidth
  if (!w) return
  scale.value = w / W
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    best.value = 0
  }
  resetGame()
  window.addEventListener('keydown', onKeyDown, { passive: false })
  window.addEventListener('keyup', onKeyUp)
  ro = new ResizeObserver(fitScale)
  if (viewport.value) ro.observe(viewport.value)
  fitScale()
  rafId = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  if (keyRaf) cancelAnimationFrame(keyRaf)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  if (ro) ro.disconnect()
})
</script>

<template>
  <div class="breaker">
    <div class="panel">
      <div class="viewport" ref="viewport">
        <div
          class="stage"
          :style="{ width: W + 'px', height: H + 'px', transform: `scale(${scale})` }"
          @pointerdown.prevent="onPointerDown"
          @pointermove.prevent="onPointerMove"
        >
          <div class="sky field">
            <span class="sky__sun field__sun" />

            <!-- HUD -->
            <div class="hud">
              <span class="hud__item">SKOR {{ pad(score) }}</span>
              <span class="hud__item hud__item--best">TERBAIK {{ pad(best) }}</span>
              <span class="hud__lives">
                <span
                  v-for="n in 3"
                  :key="n"
                  class="pip"
                  :class="{ 'pip--off': n > lives }"
                />
              </span>
            </div>

            <!-- bricks -->
            <div
              v-for="b in bricks"
              :key="b.id"
              v-show="b.alive"
              class="brick"
              :style="{
                left: b.x + 'px',
                top: b.y + 'px',
                width: b.w + 'px',
                height: b.h + 'px',
                background: b.color,
              }"
            />

            <!-- paddle -->
            <div
              class="paddle"
              :style="{
                left: paddleX + 'px',
                top: PADDLE_Y + 'px',
                width: PADDLE_W + 'px',
                height: PADDLE_H + 'px',
              }"
            />

            <!-- ball -->
            <div
              class="ball"
              :style="{
                left: ball.x - BALL_R + 'px',
                top: ball.y - BALL_R + 'px',
                width: BALL_R * 2 + 'px',
                height: BALL_R * 2 + 'px',
              }"
            />

            <!-- overlays -->
            <div v-if="phase === STATE.READY" class="overlay">
              <p class="overlay__title">BALL<br />BREAKER</p>
              <p class="overlay__hint">Tap / <kbd>Space</kbd> untuk mulai</p>
            </div>
            <div v-else-if="phase === STATE.DEAD" class="overlay">
              <p class="overlay__title overlay__title--over">GAME OVER</p>
              <p class="overlay__hint">
                SKOR {{ pad(score) }} · TERBAIK {{ pad(best) }} · tap untuk main lagi
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p class="controls">
      Geser jari / mouse · <kbd>←</kbd> <kbd>→</kbd> gerak · <kbd>Space</kbd> lepas bola
    </p>
  </div>
</template>

<style scoped>
.breaker {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 0 max(12px, env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom))
    max(12px, env(safe-area-inset-left));
  display: flex;
  flex-direction: column;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.panel {
  padding: 14px;
  display: flex;
  flex-direction: column;
}

/* Fixed portrait board; the stage scales to fit and the viewport clips it. */
.viewport {
  width: 100%;
  aspect-ratio: 360 / 480;
  min-height: 0;
  overflow: hidden;
  border: var(--line) solid var(--ink);
  border-radius: 18px;
  box-shadow: var(--pop);
}

.stage {
  transform-origin: top left;
}

.field {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: none;
  cursor: pointer;
}

.field__sun {
  width: 130px;
  height: 130px;
  bottom: 4%;
}

.hud {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--ink);
  z-index: 3;
  pointer-events: none;
}

.hud__item {
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 999px;
  padding: 2px 8px;
  box-shadow: var(--pop-sm);
}

.hud__item--best {
  color: var(--berry);
}

.hud__lives {
  margin-left: auto;
  display: flex;
  gap: 4px;
  align-items: center;
}

.pip {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--berry);
  border: 2px solid var(--ink);
  box-shadow: var(--pop-sm);
}

.pip--off {
  background: var(--cream);
  opacity: 0.55;
}

.brick {
  position: absolute;
  border: 2px solid var(--ink);
  border-radius: 5px;
  box-shadow: inset 0 -3px 0 rgba(44, 19, 56, 0.22);
}

.paddle {
  position: absolute;
  background: var(--grape);
  border: var(--line) solid var(--ink);
  border-radius: 999px;
  box-shadow: var(--pop-sm);
  z-index: 2;
}

.ball {
  position: absolute;
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 999px;
  box-shadow: var(--pop-sm);
  z-index: 2;
}

/* ---- Overlays (shared look with Dino Jump / Flappy) ---- */
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 0 18px;
  text-align: center;
  background: rgba(44, 19, 56, 0.4);
  backdrop-filter: blur(1px);
  z-index: 4;
}

.overlay__title {
  font-family: var(--font-display);
  font-size: 46px;
  line-height: 0.95;
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
  font-size: 14px;
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
  font-size: 13px;
  margin: 16px 0 0;
}
</style>
