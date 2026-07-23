<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

const B = 360
const RIM = 18
const POCKET_R = 14
const PUCK_R = 9.5
const STRIKER_R = 12.5
const DRAG_MAX = 120
const SHOT_MAX = 950
const BASE_A = 300
const BASE_B = 60
const BASE_MIN = 80
const BASE_MAX = 280
const POCKETS = [
  [26, 26],
  [334, 26],
  [26, 334],
  [334, 334],
]

const phase = ref('menu')
const mode = ref('cpu')
const turn = ref('a')
const stage = ref('aim')
const winner = ref(null)
const discs = reactive([])
const aim = ref(null)
const scale = ref(1)
const viewport = ref(null)

let rafId = 0
let lastT = 0
let ro = null
let nextId = 1
let dragMode = null
let dragStart = null
let turnPocketed = []
let strikerFoul = false
let lastTickAt = 0
const timers = new Set()

const setT = (fn, ms) => {
  const id = setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms)
  timers.add(id)
  return id
}
const clearTimers = () => {
  for (const id of timers) clearTimeout(id)
  timers.clear()
}

const striker = computed(() => discs.find((d) => d.type === 's'))
const other = (p) => (p === 'a' ? 'b' : 'a')
const isCpuTurn = computed(() => mode.value === 'cpu' && turn.value === 'b')
const baselineY = (p) => (p === 'a' ? BASE_A : BASE_B)
const aliveCount = (p) => discs.filter((d) => d.type === p && d.alive).length
const pocketedCount = (p) => 6 - aliveCount(p)
const playerLabel = (p) =>
  mode.value === 'cpu' ? (p === 'a' ? 'Kamu' : 'CPU') : p === 'a' ? 'P1' : 'P2'

const statusLabel = computed(() => {
  if (stage.value === 'roll') return 'Meluncur…'
  if (isCpuTurn.value) return 'CPU membidik…'
  if (mode.value === 'cpu') return 'Giliranmu — sentil strikernya'
  return turn.value === 'a' ? 'Giliran P1 (bawah)' : 'Giliran P2 (atas)'
})

function setupDiscs() {
  discs.splice(0, discs.length)
  discs.push({
    id: nextId++,
    type: 's',
    x: 180,
    y: BASE_A,
    vx: 0,
    vy: 0,
    r: STRIKER_R,
    m: 1.6,
    alive: true,
  })
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Math.PI / 6
    discs.push({
      id: nextId++,
      type: i % 2 === 0 ? 'a' : 'b',
      x: 180 + Math.cos(ang) * 21,
      y: 180 + Math.sin(ang) * 21,
      vx: 0,
      vy: 0,
      r: PUCK_R,
      m: 1,
      alive: true,
    })
  }
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2
    discs.push({
      id: nextId++,
      type: i % 2 === 0 ? 'b' : 'a',
      x: 180 + Math.cos(ang) * 41,
      y: 180 + Math.sin(ang) * 41,
      vx: 0,
      vy: 0,
      r: PUCK_R,
      m: 1,
      alive: true,
    })
  }
}

function startGame(m) {
  clearTimers()
  mode.value = m
  winner.value = null
  turn.value = 'a'
  aim.value = null
  dragMode = null
  setupDiscs()
  phase.value = 'play'
  enterAim()
}

function toMenu() {
  clearTimers()
  phase.value = 'menu'
}

function enterAim() {
  const s = striker.value
  s.alive = true
  s.vx = 0
  s.vy = 0
  s.x = 180
  s.y = baselineY(turn.value)
  turnPocketed = []
  strikerFoul = false
  aim.value = null
  stage.value = 'aim'
  if (isCpuTurn.value) setT(cpuShoot, 950)
}

function physStep(bs, dt, quiet) {
  for (const b of bs) {
    if (!b.alive) continue
    const sp = Math.hypot(b.vx, b.vy)
    if (sp > 0) {
      const f = Math.exp(-1.35 * dt)
      b.vx *= f
      b.vy *= f
      if (Math.hypot(b.vx, b.vy) < 8) {
        b.vx = 0
        b.vy = 0
      }
    }
    b.x += b.vx * dt
    b.y += b.vy * dt
    for (const [px, py] of POCKETS) {
      if (Math.hypot(b.x - px, b.y - py) < POCKET_R) {
        b.alive = false
        b.vx = 0
        b.vy = 0
        if (!quiet) onPocket(b)
        break
      }
    }
    if (!b.alive) continue
    if (b.x - b.r < RIM) {
      b.x = RIM + b.r
      b.vx = Math.abs(b.vx) * 0.72
      if (!quiet) wallTick(b)
    } else if (b.x + b.r > B - RIM) {
      b.x = B - RIM - b.r
      b.vx = -Math.abs(b.vx) * 0.72
      if (!quiet) wallTick(b)
    }
    if (b.y - b.r < RIM) {
      b.y = RIM + b.r
      b.vy = Math.abs(b.vy) * 0.72
      if (!quiet) wallTick(b)
    } else if (b.y + b.r > B - RIM) {
      b.y = B - RIM - b.r
      b.vy = -Math.abs(b.vy) * 0.72
      if (!quiet) wallTick(b)
    }
  }
  for (let i = 0; i < bs.length; i++) {
    const p = bs[i]
    if (!p.alive) continue
    for (let j = i + 1; j < bs.length; j++) {
      const q = bs[j]
      if (!q.alive) continue
      const dx = q.x - p.x
      const dy = q.y - p.y
      const dist = Math.hypot(dx, dy)
      const min = p.r + q.r
      if (dist === 0 || dist >= min) continue
      const nx = dx / dist
      const ny = dy / dist
      const push = (min - dist) / 2
      p.x -= nx * push
      p.y -= ny * push
      q.x += nx * push
      q.y += ny * push
      const rvx = q.vx - p.vx
      const rvy = q.vy - p.vy
      const rel = rvx * nx + rvy * ny
      if (rel >= 0) continue
      const imp = (-(1 + 0.93) * rel) / (1 / p.m + 1 / q.m)
      p.vx -= (imp / p.m) * nx
      p.vy -= (imp / p.m) * ny
      q.vx += (imp / q.m) * nx
      q.vy += (imp / q.m) * ny
      if (!quiet && Math.abs(rel) > 40) collTick()
    }
  }
}

function collTick() {
  const now = performance.now()
  if (now - lastTickAt > 70) {
    lastTickAt = now
    sfx.tick()
  }
}

function wallTick(b) {
  if (Math.hypot(b.vx, b.vy) > 60) collTick()
}

function onPocket(b) {
  if (b.type === 's') {
    strikerFoul = true
    sfx.wrong()
  } else {
    turnPocketed.push(b.type)
    sfx.jump()
  }
}

function allStopped() {
  return discs.every((d) => !d.alive || (d.vx === 0 && d.vy === 0))
}

function freeCenterSpot() {
  const spots = [
    [180, 180],
    [180, 156],
    [180, 204],
    [156, 180],
    [204, 180],
    [156, 156],
    [204, 204],
    [156, 204],
    [204, 156],
  ]
  for (const [x, y] of spots) {
    if (discs.every((d) => !d.alive || Math.hypot(d.x - x, d.y - y) > d.r + PUCK_R + 2)) {
      return [x, y]
    }
  }
  return [180, 132]
}

function resolveTurn() {
  const me = turn.value
  const ownNow = turnPocketed.filter((c) => c === me).length
  if (strikerFoul) {
    const backDisc = discs.find((d) => d.type === me && !d.alive)
    if (backDisc) {
      const [x, y] = freeCenterSpot()
      backDisc.alive = true
      backDisc.x = x
      backDisc.y = y
    }
  }
  if (aliveCount(me) === 0) {
    finish(me)
    return
  }
  if (aliveCount(other(me)) === 0) {
    finish(other(me))
    return
  }
  if (!(ownNow > 0 && !strikerFoul)) turn.value = other(me)
  setT(enterAim, 500)
  stage.value = 'switch'
}

function finish(w) {
  winner.value = w
  phase.value = 'over'
  if (mode.value === 'cpu') {
    if (w === 'a') sfx.win()
    else sfx.lose()
  } else {
    sfx.win()
  }
}

function shoot(vx, vy) {
  const s = striker.value
  s.vx = vx
  s.vy = vy
  aim.value = null
  stage.value = 'roll'
  sfx.flap()
}

function cpuShoot() {
  if (phase.value !== 'play' || stage.value !== 'aim' || turn.value !== 'b') return
  const s = striker.value
  let best = null
  for (const px of [120, 180, 240]) {
    for (const p of discs) {
      if (p.type !== 'b' || !p.alive) continue
      for (const [kx, ky] of POCKETS) {
        const toPocket = Math.hypot(p.x - kx, p.y - ky) || 1
        const gx = p.x + ((p.x - kx) / toPocket) * (STRIKER_R + PUCK_R)
        const gy = p.y + ((p.y - ky) / toPocket) * (STRIKER_R + PUCK_R)
        const dl = Math.hypot(gx - px, gy - BASE_B) || 1
        const dirx = (gx - px) / dl
        const diry = (gy - BASE_B) / dl
        if (diry < 0.05) continue
        for (const speed of [540, 720, 920]) {
          const sim = discs.map((d) => ({ ...d }))
          const ss = sim.find((d) => d.type === 's')
          ss.x = px
          ss.y = BASE_B
          ss.vx = dirx * speed
          ss.vy = diry * speed
          for (let t = 0; t < 4; t += 1 / 90) {
            physStep(sim, 1 / 90, true)
            if (sim.every((d) => !d.alive || (d.vx === 0 && d.vy === 0))) break
          }
          const ownPot = sim.filter((d) => d.type === 'b' && !d.alive).length - pocketedCount('b')
          const oppPot = sim.filter((d) => d.type === 'a' && !d.alive).length - pocketedCount('a')
          const foul = !sim.find((d) => d.type === 's').alive
          let score = ownPot * 100 - (foul ? 150 : 0) - oppPot * 45 + Math.random() * 10
          let minDist = 999
          for (const d of sim) {
            if (d.type !== 'b' || !d.alive) continue
            for (const [qx, qy] of POCKETS) {
              minDist = Math.min(minDist, Math.hypot(d.x - qx, d.y - qy))
            }
          }
          score -= minDist * 0.08
          if (!best || score > best.score) best = { score, px, vx: dirx * speed, vy: diry * speed }
        }
      }
    }
  }
  if (!best) {
    best = { px: 180, vx: (Math.random() - 0.5) * 300, vy: 520 }
  }
  s.x = best.px
  const err = 1 + (Math.random() * 0.05 - 0.025)
  aim.value = { power: 0.7 }
  setT(() => shoot(best.vx * err, best.vy * err), 480)
}

function stagePoint(e) {
  const el = viewport.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return { x: (e.clientX - rect.left) / scale.value, y: (e.clientY - rect.top) / scale.value }
}

function onPointerDown(e) {
  if (phase.value !== 'play' || stage.value !== 'aim' || isCpuTurn.value) return
  const pt = stagePoint(e)
  if (!pt) return
  const s = striker.value
  dragStart = pt
  dragMode = Math.hypot(pt.x - s.x, pt.y - s.y) < 36 ? 'place' : 'aim'
  aim.value = null
  e.currentTarget.setPointerCapture(e.pointerId)
}

function onPointerMove(e) {
  if (!dragMode) return
  const pt = stagePoint(e)
  if (!pt) return
  const s = striker.value
  if (dragMode === 'place') {
    s.x = Math.max(BASE_MIN, Math.min(BASE_MAX, pt.x))
    return
  }
  const dx = dragStart.x - pt.x
  const dy = dragStart.y - pt.y
  const len = Math.hypot(dx, dy)
  if (len < 10) {
    aim.value = null
    return
  }
  const power = Math.min(len, DRAG_MAX) / DRAG_MAX
  aim.value = { dx: dx / len, dy: dy / len, power }
}

function onPointerUp() {
  if (!dragMode) return
  const wasAim = dragMode === 'aim'
  dragMode = null
  dragStart = null
  const a = aim.value
  if (!wasAim || !a || a.power < 0.12) {
    aim.value = null
    return
  }
  shoot(a.dx * a.power * SHOT_MAX, a.dy * a.power * SHOT_MAX)
}

const aimLine = computed(() => {
  const a = aim.value
  const s = striker.value
  if (!a || a.dx === undefined || !s) return null
  const len = 30 + a.power * 62
  return { x1: s.x, y1: s.y, x2: s.x + a.dx * len, y2: s.y + a.dy * len }
})

function tick(t) {
  rafId = requestAnimationFrame(tick)
  if (!lastT) lastT = t
  let frameDt = (t - lastT) / 1000
  lastT = t
  if (frameDt > 0.1) frameDt = 0.1
  if (phase.value !== 'play' || stage.value !== 'roll') return
  let rest = frameDt
  while (rest > 0) {
    const d = Math.min(rest, 1 / 120)
    physStep(discs, d, false)
    rest -= d
  }
  if (allStopped()) resolveTurn()
}

function fitScale() {
  const el = viewport.value
  if (!el) return
  const w = el.getBoundingClientRect().width - 6
  if (w <= 0) return
  scale.value = w / B
  el.style.height = (B * scale.value + 6).toFixed(2) + 'px'
}

watch(viewport, (el) => {
  if (!ro) return
  ro.disconnect()
  if (el) {
    ro.observe(el)
    fitScale()
  }
})

onMounted(() => {
  ro = new ResizeObserver(fitScale)
  if (viewport.value) {
    ro.observe(viewport.value)
    fitScale()
  }
  rafId = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  clearTimers()
  if (ro) ro.disconnect()
})
</script>

<template>
  <div class="karambol">
    <div class="panel">
      <section v-if="phase === 'menu'" class="screen">
        <p class="brand">KARAM<span class="brand__accent">BOL</span></p>
        <p class="eyebrow">PILIH MODE</p>
        <button class="cta" type="button" @click="startGame('cpu')">Solo ▸</button>
        <button class="cta cta--alt" type="button" @click="startGame('duo')">Duo ▸</button>
        <p class="menu-note">
          Sentil striker dari garis dasarmu. Masukkan keenam kepingmu ke kantong pojok lebih dulu.
          Striker masuk kantong = pelanggaran!
        </p>
      </section>

      <section v-else class="screen play">
        <div class="topbar">
          <button class="mini" type="button" @click="toMenu">← Mode</button>
          <span class="status" :class="{ 'is-over': phase === 'over' }">
            {{ phase === 'over' ? 'Selesai' : statusLabel }}
          </span>
          <button class="mini" type="button" @click="startGame(mode)">Baru</button>
        </div>

        <div class="scorebar">
          <span class="plate" :class="{ 'is-turn': turn === 'a' && phase === 'play' }">
            {{ playerLabel('a') }}
            <i v-for="n in 6" :key="n" class="pip pip--a" :class="{ 'is-in': n <= pocketedCount('a') }" />
          </span>
          <span class="plate" :class="{ 'is-turn': turn === 'b' && phase === 'play' }">
            {{ playerLabel('b') }}
            <i v-for="n in 6" :key="n" class="pip pip--b" :class="{ 'is-in': n <= pocketedCount('b') }" />
          </span>
        </div>

        <div class="viewport" ref="viewport">
          <div
            class="stage"
            :style="{ width: B + 'px', height: B + 'px', transform: `scale(${scale})` }"
            @pointerdown.prevent="onPointerDown"
            @pointermove.prevent="onPointerMove"
            @pointerup.prevent="onPointerUp"
            @pointercancel.prevent="onPointerUp"
          >
            <svg class="boardsvg" :viewBox="`0 0 ${B} ${B}`">
              <rect x="0" y="0" :width="B" :height="B" rx="16" fill="#f7dfb2" />
              <rect
                x="9"
                y="9"
                :width="B - 18"
                :height="B - 18"
                rx="10"
                fill="#fdf0d5"
                stroke="var(--ink)"
                stroke-width="2.4"
              />
              <circle
                v-for="([px, py], i) in POCKETS"
                :key="'p' + i"
                :cx="px"
                :cy="py"
                :r="POCKET_R"
                fill="#4a3355"
                stroke="var(--ink)"
                stroke-width="2.6"
              />
              <circle cx="180" cy="180" r="42" fill="none" stroke="rgba(44, 19, 56, 0.3)" stroke-width="2" />
              <circle cx="180" cy="180" r="7" fill="none" stroke="rgba(44, 19, 56, 0.3)" stroke-width="2" />
              <line
                :x1="BASE_MIN"
                :y1="BASE_A"
                :x2="BASE_MAX"
                :y2="BASE_A"
                stroke="var(--aqua-deep)"
                stroke-width="3"
                stroke-linecap="round"
                stroke-dasharray="7 6"
                :opacity="turn === 'a' ? 0.9 : 0.25"
              />
              <line
                :x1="BASE_MIN"
                :y1="BASE_B"
                :x2="BASE_MAX"
                :y2="BASE_B"
                stroke="var(--berry)"
                stroke-width="3"
                stroke-linecap="round"
                stroke-dasharray="7 6"
                :opacity="turn === 'b' ? 0.9 : 0.25"
              />
              <line
                v-if="aimLine"
                :x1="aimLine.x1"
                :y1="aimLine.y1"
                :x2="aimLine.x2"
                :y2="aimLine.y2"
                stroke="var(--berry)"
                stroke-width="4"
                stroke-linecap="round"
                stroke-dasharray="7 5"
              />
              <rect
                x="1.5"
                y="1.5"
                :width="B - 3"
                :height="B - 3"
                rx="15"
                fill="none"
                stroke="var(--ink)"
                stroke-width="3"
              />
            </svg>

            <div
              v-for="d in discs"
              v-show="d.alive"
              :key="d.id"
              class="disc"
              :class="'disc--' + d.type"
              :style="{
                width: d.r * 2 + 'px',
                height: d.r * 2 + 'px',
                transform: `translate3d(${d.x - d.r}px, ${d.y - d.r}px, 0)`,
              }"
            />

            <div
              v-if="aim && striker"
              class="power"
              :style="{ left: striker.x - 26 + 'px', top: striker.y - 46 + 'px' }"
            >
              {{ Math.round(aim.power * 100) }}%
            </div>

            <div v-if="phase === 'over'" class="overlay">
              <p class="overlay__title" :class="{ 'overlay__title--over': mode === 'cpu' && winner === 'b' }">
                {{ winner === 'a' ? playerLabel('a') : playerLabel('b') }} menang!
              </p>
              <button class="cta" type="button" @click="startGame(mode)">Main lagi ▸</button>
            </div>
          </div>
        </div>

        <p class="hint">
          Tarik dekat striker untuk menggesernya · tarik dari mana pun lalu lepas untuk menyentil
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.karambol {
  width: 100%;
  max-width: 440px;
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
  font-size: 30px;
}

.play {
  width: 100%;
}

.menu-note {
  margin: 14px 0 0;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 13px;
  color: var(--muted);
  text-align: center;
  max-width: 300px;
}

.scorebar {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.plate {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--ink);
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 999px;
  padding: 4px 10px;
}

.plate.is-turn {
  background: var(--tile-live);
}

.pip {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  border: 1.5px solid var(--ink);
  background: var(--paper-lit);
  opacity: 0.5;
}

.pip.is-in {
  opacity: 1;
}

.pip--a.is-in {
  background: var(--aqua);
}

.pip--b.is-in {
  background: var(--berry);
}

.viewport {
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border: var(--line) solid var(--ink);
  border-radius: 18px;
  box-shadow: var(--pop);
}

.stage {
  position: relative;
  transform-origin: top left;
  touch-action: none;
  cursor: crosshair;
}

.boardsvg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.disc {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 999px;
  border: 2.2px solid var(--ink);
  will-change: transform;
  pointer-events: none;
}

.disc--a {
  background: radial-gradient(circle at 35% 32%, #7fe3d0, var(--aqua) 70%);
}

.disc--b {
  background: radial-gradient(circle at 35% 32%, #ff9ab8, var(--berry) 70%);
}

.disc--s {
  background: radial-gradient(circle at 35% 32%, #ffffff, var(--cream) 75%);
  box-shadow: inset 0 0 0 3px rgba(44, 19, 56, 0.15);
}

.power {
  position: absolute;
  z-index: 4;
  width: 52px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 999px;
  padding: 3px 0;
  pointer-events: none;
}

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
  z-index: 5;
}

.overlay__title {
  font-family: var(--font-display);
  font-size: 36px;
  line-height: 0.95;
  margin: 0;
  color: var(--sun);
  -webkit-text-stroke: 3px var(--ink);
  paint-order: stroke fill;
  text-shadow: var(--pop);
}

.overlay__title--over {
  color: var(--berry);
}

.hint {
  text-align: center;
  color: var(--muted);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 12px;
  margin: 12px 0 0;
}
</style>
