<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

const W = 360
const H = 430
const WORLD_W = 1080
const G = 340
const WIND_MAX = 60
const POWER_MAX = 640
const DRAG_MAX = 130
const PROJ_R = 6
const CHAR_R = 16
const HP_MAX = 100
const FRAME = 1 / 60
const CAT_X = 70
const DOG_X = WORLD_W - 70
const TSTEP = 6

const ITEM_DEFS = [
  { id: 'big', icon: '💣', label: 'Bom ×2' },
  { id: 'triple', icon: '🎯', label: 'Lempar 3' },
  { id: 'heal', icon: '❤️', label: 'Obat +25' },
]

const phase = ref('menu')
const mode = ref('cpu')
const turn = ref('cat')
const stage = ref('aim')
const wind = ref(0)
const windSeq = ref(0)
const hp = reactive({ cat: HP_MAX, dog: HP_MAX })
const used = reactive({
  cat: { big: false, triple: false, heal: false },
  dog: { big: false, triple: false, heal: false },
})
const armed = ref(null)
const winner = ref(null)
const terrain = ref([])
const shots = reactive([])
const booms = reactive([])
const floats = reactive([])
const leaves = reactive([])
const fx = reactive({ cat: '', dog: '' })
const aim = ref(null)
const scale = ref(1)
const camX = ref(0)
const viewport = ref(null)

let nextId = 1
let rafId = 0
let lastT = 0
let ro = null
let dragStart = null
let lastImpactX = null
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

const other = (who) => (who === 'cat' ? 'dog' : 'cat')
const isCpuTurn = computed(() => mode.value === 'cpu' && turn.value === 'dog')

function terrainY(x) {
  const pts = terrain.value
  if (!pts.length) return 370
  const f = Math.max(0, Math.min(pts.length - 1.001, x / TSTEP))
  const i = Math.floor(f)
  const k = f - i
  return pts[i] * (1 - k) + pts[i + 1] * k
}

const catFoot = computed(() => terrainY(CAT_X))
const dogFoot = computed(() => terrainY(DOG_X))
const activeX = computed(() => (turn.value === 'cat' ? CAT_X : DOG_X))
const activeFoot = computed(() => (turn.value === 'cat' ? catFoot.value : dogFoot.value))

const charCenter = (who) => ({
  x: who === 'cat' ? CAT_X : DOG_X,
  y: (who === 'cat' ? catFoot.value : dogFoot.value) - 18,
})
const throwOrigin = (who) => ({
  x: who === 'cat' ? CAT_X : DOG_X,
  y: (who === 'cat' ? catFoot.value : dogFoot.value) - 32,
})

function genTerrain() {
  const a1 = 10 + Math.random() * 20
  const a2 = 6 + Math.random() * 12
  const f1 = 2.5 + Math.random() * 3
  const f2 = 5 + Math.random() * 5
  const p1 = Math.random() * Math.PI * 2
  const p2 = Math.random() * Math.PI * 2
  const n = WORLD_W / TSTEP
  const pts = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    pts.push(366 - a1 * Math.sin(u * Math.PI * f1 + p1) - a2 * Math.sin(u * Math.PI * f2 + p2))
  }
  for (const cx of [CAT_X, DOG_X]) {
    const f = cx / TSTEP
    const fi = Math.floor(f)
    const py = pts[fi] * (1 - (f - fi)) + pts[fi + 1] * (f - fi)
    for (let i = 0; i <= n; i++) {
      const d = Math.abs(i * TSTEP - cx)
      if (d < 50) {
        const k = (d / 50) * (d / 50)
        pts[i] = py * (1 - k) + pts[i] * k
      }
    }
  }
  terrain.value = pts.map((y) => Math.max(300, Math.min(404, y)))
}

const groundPath = computed(() => {
  const pts = terrain.value
  if (!pts.length) return ''
  let d = `M -8 ${pts[0].toFixed(1)}`
  for (let i = 0; i < pts.length; i++) d += ` L ${i * TSTEP} ${pts[i].toFixed(1)}`
  return (
    d +
    ` L ${WORLD_W + 8} ${pts[pts.length - 1].toFixed(1)} L ${WORLD_W + 8} ${H + 8} L -8 ${H + 8} Z`
  )
})

function rollWind() {
  wind.value = Math.round((Math.random() * 2 - 1) * WIND_MAX)
  windSeq.value++
  rebuildLeaves()
}

function rebuildLeaves() {
  leaves.splice(0, leaves.length)
  const n = Math.round((Math.abs(wind.value) / WIND_MAX) * 22)
  for (let i = 0; i < n; i++) {
    leaves.push({
      id: nextId++,
      x: Math.random() * WORLD_W,
      y: 30 + Math.random() * 290,
      t: Math.random() * 10,
      freq: 1.5 + Math.random() * 2,
      k: 0.7 + Math.random() * 0.6,
      spin: (Math.random() - 0.5) * 260,
      rot: Math.random() * 360,
    })
  }
}

function stepLeaves(dt) {
  const speed = wind.value * 2.4
  for (const lf of leaves) {
    lf.x += speed * lf.k * dt
    lf.t += dt
    lf.rot += lf.spin * dt
    if (speed > 0 && lf.x > WORLD_W + 24) lf.x = -24
    else if (speed < 0 && lf.x < -24) lf.x = WORLD_W + 24
  }
}

const windLabel = computed(() => {
  const s = Math.round(Math.abs(wind.value) / 6)
  if (s === 0) return '· 0'
  return (wind.value < 0 ? '←' : '→') + ' ' + s
})

const statusLabel = computed(() => {
  if (stage.value === 'switch') return 'Ganti giliran…'
  if (mode.value === 'cpu') return turn.value === 'cat' ? 'Giliranmu' : 'CPU membidik…'
  return turn.value === 'cat' ? 'Giliran Kucing' : 'Giliran Anjing'
})

function startGame(m) {
  clearTimers()
  mode.value = m
  hp.cat = HP_MAX
  hp.dog = HP_MAX
  for (const who of ['cat', 'dog']) {
    used[who].big = false
    used[who].triple = false
    used[who].heal = false
  }
  winner.value = null
  armed.value = null
  aim.value = null
  dragStart = null
  lastImpactX = null
  shots.splice(0, shots.length)
  booms.splice(0, booms.length)
  floats.splice(0, floats.length)
  fx.cat = ''
  fx.dog = ''
  genTerrain()
  turn.value = 'cat'
  rollWind()
  stage.value = 'aim'
  camX.value = Math.max(0, Math.min(WORLD_W - W, CAT_X - W / 2))
  phase.value = 'play'
}

function toMenu() {
  clearTimers()
  shots.splice(0, shots.length)
  aim.value = null
  dragStart = null
  phase.value = 'menu'
}

function setFx(who, kind, ms) {
  fx[who] = kind
  setT(() => {
    if (fx[who] === kind) fx[who] = ''
  }, ms)
}

function addFloat(pos, text, kind) {
  const id = nextId++
  floats.push({ id, x: pos.x, y: pos.y - 30, text, kind })
  setT(() => {
    const i = floats.findIndex((f) => f.id === id)
    if (i >= 0) floats.splice(i, 1)
  }, 900)
}

function useItem(id) {
  if (phase.value !== 'play' || stage.value !== 'aim' || isCpuTurn.value) return
  const who = turn.value
  if (used[who][id]) return
  if (id === 'heal') {
    used[who].heal = true
    hp[who] = Math.min(HP_MAX, hp[who] + 25)
    addFloat(charCenter(who), '+25', 'heal')
    sfx.tick()
    return
  }
  armed.value = armed.value === id ? null : id
  sfx.tick()
}

function fire(who, vx, vy) {
  const o = throwOrigin(who)
  const triple = armed.value === 'triple'
  const big = armed.value === 'big'
  if (armed.value) used[who][armed.value] = true
  armed.value = null
  const spreads = triple ? [-0.12, 0, 0.12] : [0]
  for (const da of spreads) {
    const cs = Math.cos(da)
    const sn = Math.sin(da)
    shots.push({
      id: nextId++,
      kind: who,
      x: o.x,
      y: o.y,
      vx: vx * cs - vy * sn,
      vy: vx * sn + vy * cs,
      t: 0,
      big,
      mult: triple ? 0.65 : 1,
      cleared: false,
      whistled: false,
    })
  }
  setFx(who, 'throw', 380)
  stage.value = 'fly'
  sfx.jump()
}

function explode(s) {
  const r0 = s.big ? 20 : 14
  const r1 = s.big ? 76 : 54
  const full = (s.big ? 50 : 30) * s.mult
  let hitAny = false
  for (const who of ['cat', 'dog']) {
    const c = charCenter(who)
    const d = Math.hypot(s.x - c.x, s.y - c.y)
    let dmg = d <= r0 ? full : d >= r1 ? 0 : full * (1 - (d - r0) / (r1 - r0))
    dmg = Math.round(dmg)
    if (dmg > 0) {
      hp[who] = Math.max(0, hp[who] - dmg)
      addFloat(c, '-' + dmg, 'hurt')
      setFx(who, 'hurt', 550)
      hitAny = true
    }
  }
  lastImpactX = s.x
  const id = nextId++
  booms.push({ id, x: s.x, y: s.y, r: r1 })
  setT(() => {
    const i = booms.findIndex((b) => b.id === id)
    if (i >= 0) booms.splice(i, 1)
  }, 560)
  if (hitAny) sfx.wrong()
  else sfx.tick()
}

function stepShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]
    s.t += dt
    s.vy += G * dt
    s.vx += wind.value * dt
    if (!s.whistled && s.vy > 0) {
      s.whistled = true
      sfx.whistle()
    }
    let done = false
    for (let sub = 0; sub < 2 && !done; sub++) {
      s.x += (s.vx * dt) / 2
      s.y += (s.vy * dt) / 2
      if (s.y + PROJ_R >= terrainY(s.x)) {
        s.y = terrainY(s.x)
        explode(s)
        done = true
        break
      }
      for (const who of ['cat', 'dog']) {
        const c = charCenter(who)
        const d = Math.hypot(s.x - c.x, s.y - c.y)
        if (who === s.kind && !s.cleared) {
          if (d > CHAR_R + PROJ_R + 6) s.cleared = true
          continue
        }
        if (d < CHAR_R + PROJ_R) {
          explode(s)
          done = true
          break
        }
      }
      if (!done && (s.x < -60 || s.x > WORLD_W + 60 || s.y > H + 60 || s.t > 9)) {
        lastImpactX = Math.max(0, Math.min(WORLD_W, s.x))
        done = true
      }
    }
    if (done) shots.splice(i, 1)
  }
  if (stage.value === 'fly' && shots.length === 0) endTurn()
}

function endTurn() {
  stage.value = 'switch'
  setT(() => {
    lastImpactX = null
    if (hp.cat <= 0 || hp.dog <= 0) {
      finish()
      return
    }
    turn.value = other(turn.value)
    rollWind()
    stage.value = 'aim'
    if (isCpuTurn.value) setT(cpuPlay, 900)
  }, 1600)
}

function finish() {
  const t = turn.value
  const o = other(t)
  winner.value = hp[o] <= 0 && hp[t] > 0 ? t : o
  phase.value = 'over'
  if (mode.value === 'cpu') {
    if (winner.value === 'cat') sfx.win()
    else sfx.lose()
  } else {
    sfx.win()
  }
}

const resultTitle = computed(() => {
  if (winner.value === 'cat') return mode.value === 'cpu' ? 'Kamu menang!' : 'Kucing menang!'
  return mode.value === 'cpu' ? 'CPU menang.' : 'Anjing menang!'
})
const resultLost = computed(() => mode.value === 'cpu' && winner.value === 'dog')
const resultSub = computed(
  () => `Sisa HP ${hp[winner.value] ?? 0} · ${mode.value === 'cpu' ? 'Solo' : 'Duo'}`,
)

function simMiss(vx, vy) {
  const o = throwOrigin('dog')
  const target = charCenter('cat')
  let x = o.x
  let y = o.y
  let cvx = vx
  let cvy = vy
  const dt = 1 / 50
  for (let t = 0; t < 6; t += dt) {
    cvy += G * dt
    cvx += wind.value * dt
    x += cvx * dt
    y += cvy * dt
    if (Math.hypot(x - target.x, y - target.y) < CHAR_R + PROJ_R) return 0
    if (y + PROJ_R >= terrainY(x)) return Math.hypot(x - target.x, y - target.y)
    if (x < -60 || x > WORLD_W + 60 || y > H + 60) return 9999
  }
  return 9999
}

function cpuPlay() {
  if (phase.value !== 'play' || stage.value !== 'aim' || turn.value !== 'dog') return
  if (!used.dog.heal && hp.dog <= 45) {
    used.dog.heal = true
    hp.dog = Math.min(HP_MAX, hp.dog + 25)
    addFloat(charCenter('dog'), '+25', 'heal')
    sfx.tick()
  }
  let best = null
  for (let ang = 20; ang <= 75; ang += 5) {
    for (let p = 280; p <= POWER_MAX; p += 30) {
      const rad = (ang * Math.PI) / 180
      const vx = -Math.cos(rad) * p
      const vy = -Math.sin(rad) * p
      const miss = simMiss(vx, vy)
      if (!best || miss < best.miss) best = { vx, vy, miss }
    }
  }
  const err = 1 + (Math.random() * 0.14 - 0.07)
  const vx = best.vx * err
  const vy = best.vy * err
  if (best.miss < 22) {
    if (!used.dog.big && Math.random() < 0.75) armed.value = 'big'
    else if (!used.dog.triple && Math.random() < 0.4) armed.value = 'triple'
  } else if (!used.dog.triple && Math.random() < 0.3) {
    armed.value = 'triple'
  }
  aim.value = { vx, vy, power: Math.min(1, Math.hypot(vx, vy) / POWER_MAX) }
  setT(() => {
    aim.value = null
    fire('dog', vx, vy)
  }, 550)
}

const previewDots = computed(() => {
  const a = aim.value
  if (!a) return []
  const o = throwOrigin(turn.value)
  const dots = []
  for (let i = 1; i <= 8; i++) {
    const t = i * 0.08
    dots.push({
      x: o.x + a.vx * t,
      y: o.y + a.vy * t + 0.5 * G * t * t,
    })
  }
  return dots
})

const aimDeg = computed(() => {
  const a = aim.value
  if (!a) return 0
  return Math.max(-89, Math.min(89, Math.round((Math.atan2(-a.vy, Math.abs(a.vx)) * 180) / Math.PI)))
})

const aimArrow = computed(() => {
  const a = aim.value
  if (!a) return null
  const o = throwOrigin(turn.value)
  const len = Math.hypot(a.vx, a.vy) || 1
  const r = 26 + a.power * 46
  return {
    x1: o.x,
    y1: o.y,
    x2: o.x + (a.vx / len) * r,
    y2: o.y + (a.vy / len) * r,
  }
})

function stagePoint(e) {
  const el = viewport.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return { x: (e.clientX - rect.left) / scale.value, y: (e.clientY - rect.top) / scale.value }
}

function onPointerDown(e) {
  if (phase.value !== 'play' || stage.value !== 'aim' || isCpuTurn.value) return
  dragStart = stagePoint(e)
  aim.value = null
  e.currentTarget.setPointerCapture(e.pointerId)
}

function onPointerMove(e) {
  if (!dragStart) return
  const p = stagePoint(e)
  if (!p) return
  const dx = dragStart.x - p.x
  const dy = dragStart.y - p.y
  const len = Math.hypot(dx, dy)
  if (len < 10) {
    aim.value = null
    return
  }
  const power = Math.min(len, DRAG_MAX) / DRAG_MAX
  aim.value = { vx: (dx / len) * power * POWER_MAX, vy: (dy / len) * power * POWER_MAX, power }
}

function onPointerUp() {
  if (!dragStart) return
  dragStart = null
  const a = aim.value
  aim.value = null
  if (!a || a.power < 0.1) return
  fire(turn.value, a.vx, a.vy)
}

function barColor(h) {
  if (h > 50) return 'var(--aqua-deep)'
  if (h > 25) return 'var(--sun-core)'
  return 'var(--berry)'
}

function itemDisabled(it) {
  return (
    phase.value !== 'play' || stage.value !== 'aim' || isCpuTurn.value || used[turn.value][it.id]
  )
}

function camTargetX() {
  let cx = activeX.value
  if (stage.value === 'fly' && shots.length) cx = shots[0].x
  else if (stage.value === 'switch' && lastImpactX != null) cx = lastImpactX
  return Math.max(0, Math.min(WORLD_W - W, cx - W / 2))
}

function tick(t) {
  rafId = requestAnimationFrame(tick)
  if (!lastT) lastT = t
  let frameDt = (t - lastT) / 1000
  lastT = t
  if (frameDt > 0.1) frameDt = 0.1
  if (phase.value !== 'play') return
  stepLeaves(frameDt)
  if (stage.value === 'fly') {
    let rest = frameDt
    while (rest > 0 && stage.value === 'fly') {
      const d = Math.min(rest, FRAME)
      stepShots(d)
      rest -= d
    }
  }
  camX.value += (camTargetX() - camX.value) * Math.min(1, frameDt * 7)
}

function fitScale() {
  const el = viewport.value
  if (!el) return
  const w = el.getBoundingClientRect().width - 6
  if (w <= 0) return
  scale.value = w / W
  el.style.height = (H * scale.value + 6).toFixed(2) + 'px'
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
  <div class="kucing">
    <div class="panel">
      <section v-if="phase === 'menu'" class="screen">
        <p class="brand">KUCING <span class="brand__accent">VS ANJING</span></p>
        <p class="eyebrow">PILIH MODE</p>
        <button class="cta" type="button" @click="startGame('cpu')">Solo ▸</button>
        <button class="cta cta--alt" type="button" @click="startGame('duo')">Duo ▸</button>
        <p class="menu-note">
          Tarik &amp; lepas untuk melempar. Perhatikan angin! Tiap pemain punya
          💣 bom ganda, 🎯 lemparan tiga, dan ❤️ obat — sekali pakai.
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

        <div class="viewport" ref="viewport">
          <div
            class="stage"
            :style="{ width: W + 'px', height: H + 'px', transform: `scale(${scale})` }"
            @pointerdown.prevent="onPointerDown"
            @pointermove.prevent="onPointerMove"
            @pointerup.prevent="onPointerUp"
            @pointercancel.prevent="onPointerUp"
          >
            <div class="sky field">
              <span class="sky__sun field__sun" />

              <div
                class="world"
                :style="{
                  width: WORLD_W + 'px',
                  height: H + 'px',
                  transform: `translate3d(${-camX}px, 0, 0)`,
                }"
              >
              <svg class="layer" :width="WORLD_W" :height="H" :viewBox="`0 0 ${WORLD_W} ${H}`">
                <path :d="groundPath" fill="#ffe2a8" stroke="var(--ink)" stroke-width="3" />
              </svg>

              <div
                class="char"
                :class="{ 'is-hurt': fx.cat === 'hurt', 'is-throw': fx.cat === 'throw' }"
                :style="{ left: CAT_X - 20 + 'px', top: catFoot - 40 + 'px' }"
              >
                <svg viewBox="0 0 40 40" width="40" height="40">
                  <path
                    d="M9 31 q-7 -2 -5 -11"
                    fill="none"
                    stroke="var(--ink)"
                    stroke-width="2.6"
                    stroke-linecap="round"
                  />
                  <ellipse
                    cx="20"
                    cy="31"
                    rx="11"
                    ry="8"
                    fill="#cbbcf2"
                    stroke="var(--ink)"
                    stroke-width="2.4"
                  />
                  <polygon
                    points="11,10 14,1 19,8"
                    fill="#cbbcf2"
                    stroke="var(--ink)"
                    stroke-width="2.2"
                    stroke-linejoin="round"
                  />
                  <polygon
                    points="21,8 26,1 29,10"
                    fill="#cbbcf2"
                    stroke="var(--ink)"
                    stroke-width="2.2"
                    stroke-linejoin="round"
                  />
                  <circle
                    cx="20"
                    cy="15"
                    r="10"
                    fill="#cbbcf2"
                    stroke="var(--ink)"
                    stroke-width="2.4"
                  />
                  <circle cx="18" cy="13.5" r="1.6" fill="var(--ink)" />
                  <circle cx="25" cy="13.5" r="1.6" fill="var(--ink)" />
                  <path
                    d="M20 17.5 q1.6 1.8 3.4 0"
                    fill="none"
                    stroke="var(--ink)"
                    stroke-width="1.6"
                    stroke-linecap="round"
                  />
                  <g stroke="var(--ink)" stroke-width="1.2" stroke-linecap="round">
                    <line x1="28" y1="16" x2="34" y2="15" />
                    <line x1="28" y1="18.5" x2="34" y2="19" />
                  </g>
                </svg>
              </div>

              <div
                class="char"
                :class="{ 'is-hurt': fx.dog === 'hurt', 'is-throw': fx.dog === 'throw' }"
                :style="{ left: DOG_X - 20 + 'px', top: dogFoot - 40 + 'px' }"
              >
                <svg viewBox="0 0 40 40" width="40" height="40">
                  <path
                    d="M31 31 q7 -2 5 -10"
                    fill="none"
                    stroke="var(--ink)"
                    stroke-width="2.6"
                    stroke-linecap="round"
                  />
                  <ellipse
                    cx="20"
                    cy="31"
                    rx="11"
                    ry="8"
                    fill="#c9895a"
                    stroke="var(--ink)"
                    stroke-width="2.4"
                  />
                  <circle
                    cx="20"
                    cy="15"
                    r="10"
                    fill="#c9895a"
                    stroke="var(--ink)"
                    stroke-width="2.4"
                  />
                  <ellipse
                    cx="11"
                    cy="13"
                    rx="3.6"
                    ry="6.5"
                    fill="#9b5b3a"
                    stroke="var(--ink)"
                    stroke-width="2"
                  />
                  <ellipse
                    cx="29"
                    cy="13"
                    rx="3.6"
                    ry="6.5"
                    fill="#9b5b3a"
                    stroke="var(--ink)"
                    stroke-width="2"
                  />
                  <circle cx="16" cy="13.5" r="1.6" fill="var(--ink)" />
                  <circle cx="23" cy="13.5" r="1.6" fill="var(--ink)" />
                  <ellipse
                    cx="17"
                    cy="18.5"
                    rx="4.6"
                    ry="3.4"
                    fill="#f3d9b8"
                    stroke="var(--ink)"
                    stroke-width="1.6"
                  />
                  <ellipse cx="15.5" cy="17.5" rx="1.9" ry="1.5" fill="var(--ink)" />
                </svg>
              </div>

              <div
                v-if="phase === 'play' && stage === 'aim'"
                class="marker"
                :style="{ left: activeX - 7 + 'px', top: activeFoot - 60 + 'px' }"
              >
                ▼
              </div>

              <svg
                v-if="aim"
                class="layer layer--aim"
                :width="WORLD_W"
                :height="H"
                :viewBox="`0 0 ${WORLD_W} ${H}`"
              >
                <circle
                  v-for="(d, i) in previewDots"
                  :key="i"
                  :cx="d.x"
                  :cy="d.y"
                  :r="3 - i * 0.22"
                  fill="var(--cream)"
                  stroke="var(--ink)"
                  stroke-width="1.2"
                />
                <line
                  v-if="aimArrow"
                  :x1="aimArrow.x1"
                  :y1="aimArrow.y1"
                  :x2="aimArrow.x2"
                  :y2="aimArrow.y2"
                  stroke="var(--berry)"
                  stroke-width="4"
                  stroke-linecap="round"
                  stroke-dasharray="7 5"
                />
              </svg>

              <div
                v-if="aim"
                class="power"
                :style="{ left: activeX - 46 + 'px', top: activeFoot - 124 + 'px' }"
              >
                {{ aimDeg }}° · {{ Math.round(aim.power * 100) }}%
              </div>

              <div
                v-for="s in shots"
                :key="s.id"
                class="shot"
                :style="{ transform: `translate3d(${s.x - 10}px, ${s.y - 6}px, 0)` }"
              >
                <svg v-if="s.kind === 'cat'" viewBox="0 0 20 12" width="20" height="12">
                  <polygon
                    points="13,6 20,1.5 20,10.5"
                    fill="var(--aqua)"
                    stroke="var(--ink)"
                    stroke-width="1.8"
                    stroke-linejoin="round"
                  />
                  <ellipse
                    cx="8"
                    cy="6"
                    rx="7"
                    ry="4.6"
                    fill="var(--aqua)"
                    stroke="var(--ink)"
                    stroke-width="1.8"
                  />
                  <circle cx="5" cy="5" r="1.1" fill="var(--ink)" />
                </svg>
                <svg v-else viewBox="0 0 20 12" width="20" height="12">
                  <circle cx="4" cy="3.5" r="3" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
                  <circle cx="4" cy="8.5" r="3" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
                  <circle cx="16" cy="3.5" r="3" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
                  <circle cx="16" cy="8.5" r="3" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
                  <rect x="4" y="4.4" width="12" height="3.2" fill="var(--cream)" stroke="var(--ink)" stroke-width="1.6" />
                </svg>
              </div>

              <div
                v-for="b in booms"
                :key="b.id"
                class="boom"
                :style="{
                  left: b.x - b.r + 'px',
                  top: b.y - b.r + 'px',
                  width: b.r * 2 + 'px',
                  height: b.r * 2 + 'px',
                }"
              />

              <span
                v-for="f in floats"
                :key="f.id"
                class="float"
                :class="'float--' + f.kind"
                :style="{ left: f.x - 20 + 'px', top: f.y + 'px' }"
              >
                {{ f.text }}
              </span>

              <div
                v-for="lf in leaves"
                :key="lf.id"
                class="leaf"
                :style="{
                  transform: `translate3d(${lf.x}px, ${lf.y + Math.sin(lf.t * lf.freq) * 10}px, 0) rotate(${lf.rot}deg)`,
                }"
              >
                <svg viewBox="0 0 14 10" width="14" height="10">
                  <path
                    d="M1 5 Q7 -2 13 5 Q7 12 1 5 Z"
                    fill="var(--aqua)"
                    stroke="var(--ink)"
                    stroke-width="1.4"
                  />
                  <line x1="3" y1="5" x2="11" y2="5" stroke="var(--ink)" stroke-width="1" />
                </svg>
              </div>
              </div>

              <div class="hud">
                <div class="plate" :class="{ 'is-active': turn === 'cat' && phase === 'play' }">
                  <span class="plate__name">🐱 {{ mode === 'cpu' ? 'Kamu' : 'P1' }} {{ hp.cat }}</span>
                  <span class="bar"><i :style="{ width: hp.cat + '%', background: barColor(hp.cat) }" /></span>
                </div>
                <div class="wind" :key="windSeq">
                  <span class="wind__label">ANGIN</span>
                  <b>{{ windLabel }}</b>
                </div>
                <div class="plate plate--right" :class="{ 'is-active': turn === 'dog' && phase === 'play' }">
                  <span class="plate__name">🐶 {{ mode === 'cpu' ? 'CPU' : 'P2' }} {{ hp.dog }}</span>
                  <span class="bar"><i :style="{ width: hp.dog + '%', background: barColor(hp.dog) }" /></span>
                </div>
              </div>

              <div class="minimap">
                <i
                  class="minimap__view"
                  :style="{
                    left: (camX / WORLD_W) * 100 + '%',
                    width: (W / WORLD_W) * 100 + '%',
                  }"
                />
                <i class="minimap__dot minimap__dot--cat" :style="{ left: (CAT_X / WORLD_W) * 100 + '%' }" />
                <i class="minimap__dot minimap__dot--dog" :style="{ left: (DOG_X / WORLD_W) * 100 + '%' }" />
                <i
                  v-if="shots.length"
                  class="minimap__dot minimap__dot--shot"
                  :style="{
                    left: (Math.max(0, Math.min(WORLD_W, shots[0].x)) / WORLD_W) * 100 + '%',
                  }"
                />
              </div>

              <div v-if="phase === 'over'" class="overlay">
                <p class="overlay__title" :class="{ 'overlay__title--over': resultLost }">
                  {{ resultTitle }}
                </p>
                <p class="overlay__hint">{{ resultSub }}</p>
                <button class="cta" type="button" @click="startGame(mode)">Main lagi ▸</button>
              </div>
            </div>
          </div>
        </div>

        <div class="items">
          <button
            v-for="it in ITEM_DEFS"
            :key="it.id"
            class="item"
            :class="{ 'is-armed': armed === it.id, 'is-used': used[turn][it.id] }"
            type="button"
            :disabled="itemDisabled(it)"
            @click="useItem(it.id)"
          >
            <span class="item__icon">{{ it.icon }}</span>
            <span>{{ it.label }}</span>
          </button>
        </div>

        <p class="hint">Tarik ke belakang lalu lepas untuk melempar — makin jauh, makin kencang</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.kucing {
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
  font-size: 26px;
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

.viewport {
  width: 100%;
  aspect-ratio: 360 / 430;
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
  cursor: crosshair;
}

.field__sun {
  width: 120px;
  height: 120px;
  bottom: 18%;
}

.world {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

.layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.layer--aim {
  z-index: 4;
}

.char {
  position: absolute;
  width: 40px;
  height: 40px;
  z-index: 2;
  pointer-events: none;
}

.char svg {
  display: block;
  transform-origin: 50% 100%;
}

.char.is-hurt svg {
  animation: kucing-hurt 0.55s ease;
}

@keyframes kucing-hurt {
  0%,
  100% {
    transform: translateX(0);
    filter: none;
  }
  15% {
    transform: translateX(-4px);
    filter: brightness(1.7) saturate(3);
  }
  35% {
    transform: translateX(4px);
    filter: brightness(1.4);
  }
  55% {
    transform: translateX(-3px);
    filter: brightness(1.6) saturate(2);
  }
  80% {
    transform: translateX(2px);
  }
}

.char.is-throw svg {
  animation: kucing-throw 0.38s ease;
}

@keyframes kucing-throw {
  0% {
    transform: scale(1, 1);
  }
  35% {
    transform: scale(1.12, 0.8);
  }
  70% {
    transform: scale(0.94, 1.1);
  }
  100% {
    transform: scale(1, 1);
  }
}

.marker {
  position: absolute;
  z-index: 3;
  font-size: 14px;
  color: var(--berry);
  text-shadow: 0 1px 0 var(--ink);
  animation: kucing-bob 0.8s ease-in-out infinite;
  pointer-events: none;
}

@keyframes kucing-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

.power {
  position: absolute;
  z-index: 5;
  width: 92px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 999px;
  padding: 4px 0;
  pointer-events: none;
}

.shot {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 3;
  will-change: transform;
  pointer-events: none;
}

.leaf {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 3;
  opacity: 0.85;
  will-change: transform;
  pointer-events: none;
}

.leaf svg {
  display: block;
}

.shot svg {
  display: block;
  animation: kucing-spin 0.7s linear infinite;
}

@keyframes kucing-spin {
  to {
    transform: rotate(360deg);
  }
}

.boom {
  position: absolute;
  z-index: 4;
  border-radius: 999px;
  background: radial-gradient(circle, var(--sun) 0 30%, var(--sun-core) 52%, transparent 68%);
  animation: kucing-boom 0.55s ease-out forwards;
  pointer-events: none;
}

@keyframes kucing-boom {
  from {
    transform: scale(0.15);
    opacity: 0.95;
  }
  to {
    transform: scale(1);
    opacity: 0;
  }
}

.float {
  position: absolute;
  z-index: 5;
  width: 40px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  text-shadow:
    -1px -1px 0 var(--cream),
    1px -1px 0 var(--cream),
    -1px 1px 0 var(--cream),
    1px 1px 0 var(--cream);
  animation: kucing-float 0.9s ease-out forwards;
  pointer-events: none;
}

.float--hurt {
  color: var(--berry);
}

.float--heal {
  color: var(--aqua-deep);
}

@keyframes kucing-float {
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(-28px);
    opacity: 0;
  }
}

.hud {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  z-index: 6;
  pointer-events: none;
}

.plate {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 10px;
  padding: 4px 7px;
  box-shadow: var(--pop-sm);
}

.plate--right {
  align-items: flex-end;
}

.plate.is-active {
  background: var(--tile-live);
}

.plate__name {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ink);
  white-space: nowrap;
}

.bar {
  display: block;
  width: 88px;
  height: 8px;
  border: 2px solid var(--ink);
  border-radius: 999px;
  background: var(--paper-lit);
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  transition: width 0.3s ease;
}

.wind {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 10px;
  padding: 3px 9px;
  box-shadow: var(--pop-sm);
  font-family: var(--font-mono);
  color: var(--ink);
  animation: kucing-pulse 0.5s ease;
}

.wind__label {
  font-size: 8px;
  letter-spacing: 0.1em;
  color: var(--muted);
}

.wind b {
  font-size: 13px;
}

@keyframes kucing-pulse {
  0% {
    transform: scale(1.25);
  }
  100% {
    transform: scale(1);
  }
}

.minimap {
  position: absolute;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  width: 180px;
  height: 12px;
  background: color-mix(in srgb, var(--cream) 78%, transparent);
  border: 2px solid var(--ink);
  border-radius: 999px;
  z-index: 6;
  pointer-events: none;
}

.minimap__view {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(35, 201, 173, 0.35);
  border-radius: 999px;
}

.minimap__dot {
  position: absolute;
  top: 50%;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  border: 1.5px solid var(--ink);
  transform: translate(-50%, -50%);
}

.minimap__dot--cat {
  background: #cbbcf2;
}

.minimap__dot--dog {
  background: #c9895a;
}

.minimap__dot--shot {
  background: var(--berry);
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
  z-index: 7;
}

.overlay__title {
  font-family: var(--font-display);
  font-size: 38px;
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

.items {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 14px;
}

.item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--ink);
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 12px;
  padding: 9px 4px;
  box-shadow: 0 3px 0 var(--ink);
  cursor: pointer;
  transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.08s ease;
}

.item:hover:not(:disabled),
.item:focus-visible:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 0 var(--ink);
}

.item:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 1px 0 var(--ink);
}

.item.is-armed {
  background: var(--sun);
}

.item.is-used,
.item:disabled {
  opacity: 0.45;
  box-shadow: none;
  cursor: default;
}

.item__icon {
  font-size: 14px;
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
