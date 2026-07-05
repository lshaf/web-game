<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Katak Menyeberang — an endless Crossy-Road-style hopper (SOLO). The frog hops
// forward through an endlessly generated ribbon of lanes — safe grass, ROADS
// with cars to dodge, and RIVERS you cross by riding drifting logs (the water is
// deadly). Every forward step scores +1 and the camera follows, so it never ends
// until a car flattens you or the river takes you. It speeds up the further you go.

const COLS = 9
const VIS = 13 // visible rows in the window (board aspect-ratio is COLS / VIS)
const FROG_OFFSET = 3 // the frog rides this many rows above the window's bottom edge
const START_ROW = 3 // frog's starting row, with grass below it

const CAR_COLORS = ['var(--berry)', 'var(--sun)', 'var(--grape)', 'var(--sun-core)']
const LOG_COLOR = '#b79a63'
const bestKey = 'dusk-katak-best'

const phase = ref('ready') // ready | play | over
const best = ref(0)
const newBest = ref(false)

const frog = reactive({ row: START_ROW, fx: Math.floor(COLS / 2) })
const base = ref(0) // absolute row shown at the window's bottom edge
const maxRow = ref(START_ROW)
const rowTypes = reactive({}) // absRow -> 'grass' | 'road' | 'river'
const lanes = reactive([]) // { row, kind, dir, speed, obs: [{ id, x, len, color }] }

const score = computed(() => Math.max(0, maxRow.value - START_ROW))
// Endless ramp: the further you get, the faster the traffic and current (capped).
const speedMul = computed(() => 1 + Math.min(score.value * 0.03, 1.2))

let obId = 0
let rafId = 0
let lastT = 0
let sx = 0
let sy = 0
let maxGen = -1
let consecDanger = 0
let riverStreak = 0

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const pct = (n, total) => (n / total) * 100 + '%'

// True when point p (0..COLS) lies inside an obstacle spanning [x, x+len),
// measured modulo the width so a piece straddling the edge still counts.
function spanContains(x, len, p) {
  const d = (((p - x) % COLS) + COLS) % COLS
  return d < len
}
function laneAt(row) {
  return lanes.find((l) => l.row === row)
}

// ---- Endless row generation ----
// Decide a row's terrain (with a safe start pad, a cap on consecutive danger, and
// a limit on river streaks) and, for road/river rows, lay out drifting obstacles.
function genRow(r) {
  let type
  if (r <= START_ROW + 1) type = 'grass'
  else if (consecDanger >= 3) type = 'grass'
  else {
    const roll = Math.random()
    type = roll < 0.44 ? 'road' : roll < 0.8 ? 'river' : 'grass'
    if (type === 'river' && riverStreak >= 2) type = Math.random() < 0.5 ? 'road' : 'grass'
  }
  rowTypes[r] = type
  if (type === 'grass') {
    consecDanger = 0
    riverStreak = 0
    return
  }
  consecDanger++
  riverStreak = type === 'river' ? riverStreak + 1 : 0
  const dir = Math.random() < 0.5 ? 1 : -1
  const speed = (type === 'river' ? 1.0 : 1.4) + Math.random() * (type === 'river' ? 0.9 : 1.3)
  const len = type === 'river' ? (Math.random() < 0.5 ? 3 : 2) : Math.random() < 0.35 ? 2 : 1
  const step = len + (type === 'river' ? 1.3 : 2.0) + Math.random() * (type === 'river' ? 0.9 : 1.8)
  const obs = []
  for (let x = Math.random() * step; x < COLS; x += step) {
    obs.push({
      id: ++obId,
      x: x % COLS,
      len,
      color: type === 'river' ? LOG_COLOR : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
    })
  }
  if (!obs.length) {
    obs.push({ id: ++obId, x: 0, len, color: type === 'river' ? LOG_COLOR : CAR_COLORS[0] })
  }
  lanes.push({ row: r, kind: type, dir, speed, obs })
}

function ensureRows(upto) {
  while (maxGen < upto) {
    maxGen++
    genRow(maxGen)
  }
}

// Drop rows that have scrolled off the bottom so memory stays bounded.
function prune() {
  const cut = base.value - 1
  for (const k of Object.keys(rowTypes)) if (Number(k) < cut) delete rowTypes[k]
  for (let i = lanes.length - 1; i >= 0; i--) if (lanes[i].row < cut) lanes.splice(i, 1)
}

// ---- Rendering (screen row = VIS-1 - (absRow - base); 0 = top, VIS-1 = bottom) ----
const visibleRows = computed(() => {
  const out = []
  for (let s = 0; s < VIS; s++) {
    const r = base.value + (VIS - 1 - s)
    out.push({ r, s, type: rowTypes[r] || 'grass' })
  }
  return out
})
const laneSegments = computed(() => {
  const out = []
  const top = base.value + VIS - 1
  for (const lane of lanes) {
    if (lane.row < base.value || lane.row > top) continue
    const s = VIS - 1 - (lane.row - base.value)
    for (const o of lane.obs) {
      const end = o.x + o.len
      if (end <= COLS) {
        out.push({ id: o.id + 'a', s, kind: lane.kind, color: o.color, left: o.x, w: o.len })
      } else {
        out.push({ id: o.id + 'a', s, kind: lane.kind, color: o.color, left: o.x, w: COLS - o.x })
        out.push({ id: o.id + 'b', s, kind: lane.kind, color: o.color, left: 0, w: end - COLS })
      }
    }
  }
  return out
})
function rowStyle(s) {
  return { top: pct(s, VIS), height: pct(1, VIS) }
}
function obStyle(seg) {
  return {
    top: pct(seg.s + 0.15, VIS),
    height: pct(0.7, VIS),
    left: pct(seg.left, COLS),
    width: pct(seg.w, COLS),
    backgroundColor: seg.color,
  }
}
const frogStyle = computed(() => {
  const s = VIS - 1 - (frog.row - base.value)
  return {
    top: pct(s + 0.1, VIS),
    height: pct(0.8, VIS),
    left: pct(frog.fx + 0.1, COLS),
    width: pct(0.8, COLS),
  }
})

function resetWorld() {
  lanes.splice(0, lanes.length)
  for (const k of Object.keys(rowTypes)) delete rowTypes[k]
  base.value = 0
  frog.row = START_ROW
  frog.fx = Math.floor(COLS / 2)
  maxRow.value = START_ROW
  maxGen = -1
  consecDanger = 0
  riverStreak = 0
  ensureRows(VIS + 2)
}

function start() {
  resetWorld()
  newBest.value = false
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

// One hop. Up = forward (+1 row; a new furthest row scores +1). Down = back, but
// never past the camera's bottom edge. fx stays a float only while riding a log;
// landing on grass/road snaps it back onto the grid.
function hop(dr, dc) {
  if (phase.value !== 'play') return
  if (dr !== 0) {
    const forward = dr < 0
    const nr = frog.row + (forward ? 1 : -1)
    if (!forward && nr < base.value) return
    frog.row = nr
    if (frog.row > maxRow.value) {
      maxRow.value = frog.row
      sfx.tick()
    }
    const nb = Math.max(base.value, frog.row - FROG_OFFSET)
    if (nb !== base.value) {
      base.value = nb
      ensureRows(nb + VIS + 2)
      prune()
    } else {
      ensureRows(base.value + VIS + 2)
    }
    if ((rowTypes[frog.row] || 'grass') !== 'river') frog.fx = clamp(Math.round(frog.fx), 0, COLS - 1)
  } else if (dc !== 0) {
    frog.fx = clamp(frog.fx + dc, 0, COLS - 1)
    sfx.tick()
  }
}

// ---- rAF loop with delta time ----
function frame(t) {
  rafId = requestAnimationFrame(frame)
  if (phase.value !== 'play') {
    lastT = t
    return
  }
  if (!lastT) lastT = t
  let dt = (t - lastT) / 1000
  lastT = t
  if (dt > 0.1) dt = 0.1 // clamp after a tab switch / hitch
  const mul = speedMul.value
  for (const lane of lanes) {
    for (const o of lane.obs) {
      o.x += lane.dir * lane.speed * mul * dt
      o.x = ((o.x % COLS) + COLS) % COLS
    }
  }
  updateFrog(dt, mul)
}

function updateFrog(dt, mul) {
  const type = rowTypes[frog.row] || 'grass'
  const center = frog.fx + 0.5
  if (type === 'river') {
    const lane = laneAt(frog.row)
    if (!lane) return
    const log = lane.obs.find((o) => spanContains(o.x, o.len, center))
    if (!log) return die() // no log underfoot → drown
    frog.fx += lane.dir * lane.speed * mul * dt // carried along by the log
    if (frog.fx < 0 || frog.fx > COLS - 1) return die() // pushed off the edge
  } else if (type === 'road') {
    const lane = laneAt(frog.row)
    if (lane && lane.obs.some((o) => spanContains(o.x, o.len, center))) return die() // hit by a car
  }
}

// ---- Controls ----
function press(dr, dc) {
  if (phase.value === 'play') hop(dr, dc)
}
function onKey(e) {
  const k = e.key
  let d = null
  if (k === 'ArrowUp' || k === 'w' || k === 'W') d = [-1, 0]
  else if (k === 'ArrowDown' || k === 's' || k === 'S') d = [1, 0]
  else if (k === 'ArrowLeft' || k === 'a' || k === 'A') d = [0, -1]
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') d = [0, 1]
  if (k.startsWith('Arrow')) e.preventDefault() // don't scroll the page
  if (d) {
    if (phase.value === 'ready') start()
    else if (phase.value === 'play') hop(d[0], d[1])
    return
  }
  if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
    e.preventDefault()
    if (phase.value !== 'play') start()
  }
}

// Swipe / tap on the board.
function onDown(e) {
  sx = e.clientX
  sy = e.clientY
}
function onUp(e) {
  const dx = e.clientX - sx
  const dy = e.clientY - sy
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (adx < 18 && ady < 18) {
    if (phase.value !== 'play') start() // a tap starts / restarts
    return
  }
  const d = adx > ady ? [0, dx > 0 ? 1 : -1] : [dy > 0 ? 1 : -1, 0]
  if (phase.value === 'ready') start()
  else if (phase.value === 'play') hop(d[0], d[1])
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    best.value = 0
  }
  window.addEventListener('keydown', onKey, { passive: false })
  rafId = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="katak">
    <div class="panel">
      <!-- Ready -->
      <section v-if="phase === 'ready'" class="screen">
        <p class="brand">KATAK<span class="brand__accent"> MENYEBERANG</span></p>
        <p class="eyebrow">LOMPAT TANPA HENTI</p>
        <p class="howto">
          Lompat maju sejauh mungkin — tiap langkah maju +1. Hindari mobil, dan seberangi sungai
          dengan naik batang kayu.
        </p>
        <div class="solobar katak__bar">
          <span>MODE SOLO</span>
          <span class="solobar__best">REKOR <b>{{ best }}</b></span>
        </div>
        <button class="cta" type="button" @click="start">Main ▸</button>
      </section>

      <!-- Play / Over -->
      <section v-else class="screen">
        <div class="solobar katak__bar">
          <span>SKOR <b>{{ score }}</b></span>
          <span class="solobar__best">REKOR <b>{{ best }}</b></span>
        </div>

        <div class="board" @pointerdown.prevent="onDown" @pointerup.prevent="onUp">
          <!-- lane backdrops -->
          <div
            v-for="row in visibleRows"
            :key="'row' + row.r"
            class="row"
            :class="'row--' + row.type"
            :style="rowStyle(row.s)"
          />

          <!-- cars & logs -->
          <div
            v-for="seg in laneSegments"
            :key="seg.id"
            class="ob"
            :class="seg.kind === 'river' ? 'ob--log' : 'ob--car'"
            :style="obStyle(seg)"
          />

          <!-- the frog -->
          <div class="frog" :style="frogStyle" />

          <div v-if="phase === 'over'" class="board__over">
            <p class="over__title">TAMAT</p>
          </div>
        </div>

        <!-- Touch d-pad -->
        <div v-if="phase === 'play'" class="pad">
          <button class="key key--up" type="button" aria-label="Maju" @pointerdown.prevent="press(-1, 0)">▲</button>
          <button class="key key--left" type="button" aria-label="Kiri" @pointerdown.prevent="press(0, -1)">◀</button>
          <button class="key key--down" type="button" aria-label="Mundur" @pointerdown.prevent="press(1, 0)">▼</button>
          <button class="key key--right" type="button" aria-label="Kanan" @pointerdown.prevent="press(0, 1)">▶</button>
        </div>
        <p v-if="phase === 'play'" class="hint">Geser papan atau pakai tombol untuk melompat.</p>

        <!-- Over -->
        <template v-if="phase === 'over'">
          <div class="result screen">
            <p class="result__title is-lost">Tamat!</p>
            <p class="result__sub">Skor {{ score }} · rekor {{ best }}</p>
            <p class="result__streak">{{ newBest ? 'REKOR BARU!' : 'SKOR TERTINGGI ' + best }}</p>
          </div>
          <button class="cta" type="button" @click="start">Main lagi ▸</button>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.katak {
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
  font-size: 30px;
  text-align: center;
  line-height: 1.05;
}

.howto {
  font-size: 14px;
  color: var(--muted);
  text-align: center;
  max-width: 300px;
  line-height: 1.4;
  margin: 0 0 16px;
}

.katak__bar {
  margin-bottom: 12px;
}

/* ---- Board ---- */
.board {
  position: relative;
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  aspect-ratio: 9 / 13;
  border: var(--line) solid var(--ink);
  border-radius: 16px;
  overflow: hidden;
  background: #cdeccb;
  box-shadow: var(--pop);
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.row {
  position: absolute;
  left: 0;
  width: 100%;
}
.row--grass {
  background: #cdeccb;
}
.row--river {
  background: #bfe3ff;
  box-shadow: inset 0 3px 0 rgba(44, 19, 56, 0.05);
}
.row--road {
  background-color: #5c4f6b;
  background-image: repeating-linear-gradient(
    90deg,
    rgba(255, 243, 223, 0.55) 0 10px,
    transparent 10px 26px
  );
  background-size: 100% 3px;
  background-position: 0 50%;
  background-repeat: no-repeat;
}

/* Obstacles — cars (bright, ink-outlined) and logs (brown, grained). */
.ob {
  position: absolute;
  border: var(--line) solid var(--ink);
  border-radius: 8px;
  box-sizing: border-box;
}
.ob--car {
  box-shadow: inset 0 -4px 0 rgba(44, 19, 56, 0.22), inset 0 5px 0 rgba(255, 255, 255, 0.3);
}
.ob--log {
  border-radius: 9px;
  background-image: repeating-linear-gradient(90deg, rgba(44, 19, 56, 0.14) 0 2px, transparent 2px 15px);
  box-shadow: inset 0 -4px 0 rgba(44, 19, 56, 0.24), inset 0 4px 0 rgba(255, 255, 255, 0.16);
}

/* The frog — chunky aqua body, two eye dots and a belly patch. */
.frog {
  position: absolute;
  z-index: 5;
  border: var(--line) solid var(--ink);
  border-radius: 46% 46% 50% 50%;
  background:
    radial-gradient(circle at 34% 30%, var(--ink) 0 13%, transparent 15%),
    radial-gradient(circle at 66% 30%, var(--ink) 0 13%, transparent 15%),
    radial-gradient(circle at 50% 76%, var(--aqua-deep) 0 28%, transparent 30%),
    var(--aqua);
  box-shadow: inset 0 -4px 0 rgba(44, 19, 56, 0.2), 2px 2px 0 rgba(44, 19, 56, 0.18);
}

.board__over {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: grid;
  place-items: center;
  background: rgba(44, 19, 56, 0.44);
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

/* ---- Touch d-pad (mirrors Snake) ---- */
.pad {
  display: grid;
  grid-template-columns: repeat(3, 52px);
  grid-template-rows: repeat(2, 52px);
  gap: 8px;
  justify-content: center;
  margin-top: 16px;
}
.key {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 20px;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
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
.key--up {
  grid-column: 2;
  grid-row: 1;
}
.key--left {
  grid-column: 1;
  grid-row: 2;
}
.key--down {
  grid-column: 2;
  grid-row: 2;
}
.key--right {
  grid-column: 3;
  grid-row: 2;
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
