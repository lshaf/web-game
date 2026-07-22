<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'
import { startState, movesForDie, applyMove, winner, chooseTurn, rollDice } from '../data/backgammon.js'

// Backgammon (Backgammon). Race all fifteen checkers home and bear them off.
// Play Duo on one device or Solo as White against the CPU. White runs 24→1 and
// bears off past 1; Black runs 1→24 and bears off past 24. Land on a lone
// opponent checker to send it to the bar. The rules engine (bar entry, hitting,
// bearing off, doubles) is validated by self-play.

const MODES = [
  { key: 'solo', label: 'Solo' },
  { key: 'duo', label: 'Duo' },
]

// board geometry (SVG units)
const BW = 340
const BH = 300
const BAR = 22
const TRAY = 46
const PADX = 6
const PADY = 8
const PW = (BW - BAR - PADX * 2) / 12
const TRIH = BH * 0.42
const R = PW * 0.42
const VBW = BW + TRAY

const colX = (c) => PADX + (c < 6 ? c * PW : c * PW + BAR) + PW / 2
const pointCol = (p) => (p <= 12 ? 12 - p : p - 13)
const isTop = (p) => p >= 13
const pointCX = (p) => colX(pointCol(p))
const barX = PADX + 6 * PW + BAR / 2
const PIPS = {
  1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
}

// --- Game state -------------------------------------------------------------

const phase = ref('setup') // setup | play | over
const modeSel = ref(MODES[0])
const mode = ref('solo')
const gs = ref(null)
const remaining = ref([]) // dice left to play this turn
const selected = ref(null) // point number | 'bar' | null
const busy = ref(false)
const result = ref(null) // 'w' | 'b'
const noMove = ref(false)

let cpuTimer = 0

const turn = computed(() => (gs.value ? gs.value.turn : 'w'))
const humanTurn = computed(() => mode.value === 'duo' || turn.value === 'w')

// Legal destinations from the selected source, per remaining die.
const dests = computed(() => {
  if (!gs.value || selected.value == null) return []
  const out = []
  const seen = new Set()
  for (const d of remaining.value) {
    if (seen.has(d)) continue
    seen.add(d)
    for (const m of movesForDie(gs.value, d)) if (m.from === selected.value) out.push({ to: m.to, die: d, hit: m.hit })
  }
  return out
})
const destSet = computed(() => new Set(dests.value.map((d) => d.to)))

function anyLegal() {
  for (const d of new Set(remaining.value)) if (movesForDie(gs.value, d).length) return true
  return false
}

// checkers on a point → { n, color, discs:[y...] }
function stackOf(p) {
  const v = gs.value.points[p]
  if (!v) return null
  const n = Math.abs(v)
  const color = v > 0 ? 'w' : 'b'
  const top = isTop(p)
  const step = Math.min(2 * R - 3, (BH * 0.42 - 2 * R) / 4)
  const discs = []
  const shown = Math.min(n, 5)
  for (let k = 0; k < shown; k++) {
    const cy = top ? PADY + R + k * step : BH - PADY - R - k * step
    discs.push(cy)
  }
  return { n, color, discs, cx: pointCX(p), extra: n > 5 ? n : 0 }
}
const board = computed(() => {
  const arr = []
  for (let p = 1; p <= 24; p++) {
    const s = stackOf(p)
    if (s) arr.push({ p, ...s })
  }
  return arr
})
function triPoints(p) {
  const cx = pointCX(p)
  if (isTop(p)) return `${cx - PW / 2},${PADY} ${cx + PW / 2},${PADY} ${cx},${PADY + TRIH}`
  return `${cx - PW / 2},${BH - PADY} ${cx + PW / 2},${BH - PADY} ${cx},${BH - PADY - TRIH}`
}

// bar + off stacks
const barW = computed(() => Array.from({ length: gs.value ? gs.value.bar.w : 0 }, (_, k) => BH / 2 + R + 6 + k * (2 * R - 3)))
const barB = computed(() => Array.from({ length: gs.value ? gs.value.bar.b : 0 }, (_, k) => BH / 2 - R - 6 - k * (2 * R - 3)))
const offW = computed(() => (gs.value ? gs.value.off.w : 0))
const offB = computed(() => (gs.value ? gs.value.off.b : 0))
const offX = BW + TRAY / 2

// dice faces to show (remaining)
const diceFaces = computed(() =>
  remaining.value.map((v, i) => ({
    v,
    x: barX - 26 + (i % 2) * 28,
    y: BH / 2 - 30 + ((i / 2) | 0) * 28,
  })),
)
function pipDots(face) {
  const D = 22
  const cols = [face.x + D * 0.26, face.x + D * 0.5, face.x + D * 0.74]
  const rows = [face.y + D * 0.26, face.y + D * 0.5, face.y + D * 0.74]
  return PIPS[face.v].map(([c, r]) => ({ cx: cols[c], cy: rows[r] }))
}

const statusText = computed(() => {
  if (result.value) return result.value === 'w' ? (mode.value === 'solo' ? 'Kamu menang!' : 'Putih menang!') : (mode.value === 'solo' ? 'CPU menang' : 'Hitam menang!')
  if (busy.value && mode.value === 'solo') return 'CPU bermain…'
  if (noMove.value) return 'Tak ada langkah'
  return 'Giliran ' + (turn.value === 'w' ? 'Putih' : 'Hitam')
})

// --- Flow -------------------------------------------------------------------

function startTurn() {
  selected.value = null
  noMove.value = false
  remaining.value = rollDice()
  if (mode.value === 'solo' && turn.value === 'b') {
    busy.value = true
    cpuTimer = setTimeout(cpuPlay, 650)
    return
  }
  if (!anyLegal()) {
    noMove.value = true
    cpuTimer = setTimeout(endTurn, 1000)
  }
}
function cpuPlay() {
  const best = chooseTurn(gs.value, remaining.value)
  let i = 0
  const step = () => {
    if (i >= best.moves.length) {
      busy.value = false
      if (checkWin()) return
      endTurn()
      return
    }
    gs.value = applyMove(gs.value, best.moves[i])
    remaining.value = [...remaining.value.slice(1)]
    i++
    sfx.tick()
    if (checkWin()) return
    cpuTimer = setTimeout(step, 560)
  }
  if (best.moves.length === 0) {
    busy.value = false
    noMove.value = true
    cpuTimer = setTimeout(endTurn, 900)
    return
  }
  step()
}
function endTurn() {
  if (result.value) return
  gs.value = { ...gs.value, turn: turn.value === 'w' ? 'b' : 'w' }
  startTurn()
}

function onPoint(p) {
  if (phase.value !== 'play' || busy.value || result.value || !humanTurn.value) return
  if (destSet.value.has(p)) return doMove(p)
  // must enter from the bar first
  if (gs.value.bar[turn.value] > 0) return
  const v = gs.value.points[p]
  if (v && (v > 0) === (turn.value === 'w')) {
    selected.value = selected.value === p ? null : p
  } else selected.value = null
}
function onBar() {
  if (phase.value !== 'play' || busy.value || result.value || !humanTurn.value) return
  if (gs.value.bar[turn.value] > 0) selected.value = selected.value === 'bar' ? null : 'bar'
}
function onOff() {
  if (destSet.value.has('off')) doMove('off')
}
function doMove(to) {
  const dd = dests.value.find((x) => x.to === to)
  if (!dd) return
  gs.value = applyMove(gs.value, { from: selected.value, to, hit: dd.hit })
  const idx = remaining.value.indexOf(dd.die)
  if (idx >= 0) remaining.value.splice(idx, 1)
  selected.value = null
  sfx.tick()
  if (checkWin()) return
  if (remaining.value.length === 0 || !anyLegal()) cpuTimer = setTimeout(endTurn, 450)
}

function checkWin() {
  const w = winner(gs.value)
  if (w) {
    result.value = w
    phase.value = 'over'
    busy.value = false
    sfx.win()
    return true
  }
  return false
}

// --- Lifecycle --------------------------------------------------------------

function start() {
  mode.value = modeSel.value.key
  deal()
}
function deal() {
  clearTimeout(cpuTimer)
  gs.value = startState()
  selected.value = null
  result.value = null
  busy.value = false
  phase.value = 'play'
  startTurn()
}
function newGame() {
  deal()
}
function toSetup() {
  clearTimeout(cpuTimer)
  phase.value = 'setup'
}

const resultTitle = computed(() => statusText.value)

onBeforeUnmount(() => clearTimeout(cpuTimer))
</script>

<template>
  <div class="bg">
    <div class="panel">
      <section class="screen">
        <!-- ===== Setup ===== -->
        <template v-if="phase === 'setup'">
          <p class="brand">BACK<span class="brand__accent">GAMMON</span></p>
          <p class="eyebrow">PILIH MODE</p>
          <div class="picker picker--2 setup__picker">
            <button
              v-for="md in MODES"
              :key="md.key"
              class="pick"
              type="button"
              :class="{ 'is-on': md.key === modeSel.key }"
              @click="modeSel = md"
            >
              {{ md.label }}
            </button>
          </div>
          <p class="setup__info">{{ modeSel.key === 'solo' ? 'Kamu Putih melawan CPU' : 'Dua pemain bergantian' }}</p>
          <button class="cta" type="button" @click="start">Mulai ▸</button>
        </template>

        <!-- ===== Play / Over ===== -->
        <template v-else>
          <div class="topbar">
            <button class="mini" type="button" @click="toSetup">← Mode</button>
            <span class="status" :class="{ 'is-over': result }">{{ statusText }}</span>
            <button class="mini" type="button" @click="newGame">Baru</button>
          </div>

          <div class="stage">
            <svg class="board" :class="{ locked: busy || result }" :viewBox="`0 0 ${VBW} ${BH}`">
              <rect x="0" y="0" :width="BW" :height="BH" rx="8" class="felt" />
              <rect :x="barX - BAR / 2" y="0" :width="BAR" :height="BH" class="bar" />
              <rect :x="BW" y="0" :width="TRAY" :height="BH" class="tray" />

              <!-- point triangles -->
              <polygon
                v-for="p in 24"
                :key="'t' + p"
                :points="triPoints(p)"
                class="pt"
                :class="[(p + (p > 12 ? 1 : 0)) % 2 === 0 ? 'pt--a' : 'pt--b', { 'pt--dest': destSet.has(p) }]"
                @click="onPoint(p)"
              />

              <!-- checkers -->
              <g v-for="col in board" :key="'c' + col.p" @click="onPoint(col.p)">
                <circle
                  v-for="(cy, k) in col.discs"
                  :key="k"
                  :cx="col.cx"
                  :cy="cy"
                  :r="R"
                  class="chk"
                  :class="col.color === 'w' ? 'chk--w' : 'chk--b'"
                />
                <text v-if="col.extra" :x="col.cx" :y="col.discs[col.discs.length - 1]" class="chk__n" text-anchor="middle" dominant-baseline="central">{{ col.extra }}</text>
                <circle v-if="selected === col.p" :cx="col.cx" :cy="col.discs[0]" :r="R + 2" class="sel" />
              </g>

              <!-- bar checkers -->
              <g @click="onBar">
                <circle v-for="(cy, k) in barW" :key="'bw' + k" :cx="barX" :cy="cy" :r="R" class="chk chk--w" />
                <circle v-for="(cy, k) in barB" :key="'bb' + k" :cx="barX" :cy="cy" :r="R" class="chk chk--b" />
                <circle v-if="selected === 'bar'" :cx="barX" :cy="turn === 'w' ? BH / 2 + R + 6 : BH / 2 - R - 6" :r="R + 2" class="sel" />
              </g>

              <!-- off tray -->
              <g @click="onOff">
                <rect v-if="destSet.has('off')" :x="BW + 4" y="4" :width="TRAY - 8" :height="BH - 8" rx="6" class="off-dest" />
                <rect v-for="k in offW" :key="'ow' + k" :x="BW + 8" :y="BH - 12 - k * 10" :width="TRAY - 16" height="7" rx="2" class="chk--w off-bar" />
                <rect v-for="k in offB" :key="'ob' + k" :x="BW + 8" :y="4 + (k - 1) * 10" :width="TRAY - 16" height="7" rx="2" class="chk--b off-bar" />
              </g>

              <!-- dice -->
              <g v-for="(f, i) in diceFaces" :key="'d' + i">
                <rect :x="f.x" :y="f.y" width="22" height="22" rx="4" class="die" />
                <circle v-for="(pd, j) in pipDots(f)" :key="j" :cx="pd.cx" :cy="pd.cy" r="2" class="pip" />
              </g>
            </svg>
          </div>

          <p class="tip">Ketuk bidak lalu titik tujuan · masukkan dari bar dulu · buang semua untuk menang.</p>

          <div class="tools">
            <button class="mini" type="button" @click="newGame">Baru</button>
          </div>

          <div v-if="result" class="result">
            <p class="result__title" :class="{ 'is-lost': mode === 'solo' && result === 'b' }">{{ resultTitle }}</p>
            <button class="cta" type="button" @click="newGame">Main lagi ▸</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/topbar/status/picker/
   pick/result come from src/styles.css. */
.bg {
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 4px max(12px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(12px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 14px 26px;
}
.brand {
  font-size: 24px;
}
.picker--2 {
  grid-template-columns: repeat(2, 1fr);
  width: 100%;
}
.setup__picker {
  margin-bottom: 14px;
}
.setup__info {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.05em;
  color: var(--muted);
  text-align: center;
  margin: 14px 0 20px;
}

/* ---- Board ---- */
.stage {
  width: 100%;
  margin: 12px 0;
}
.board {
  width: 100%;
  height: auto;
  border: var(--line) solid var(--ink);
  border-radius: 10px;
  box-shadow: var(--pop-sm);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.board.locked {
  pointer-events: none;
}
.felt {
  fill: #2f7d5b;
}
.bar,
.tray {
  fill: #245c43;
}
.pt {
  cursor: pointer;
}
.pt--a {
  fill: #e7cfa0;
}
.pt--b {
  fill: #c58a54;
}
.pt--dest {
  fill: var(--sun);
}
.chk {
  stroke: var(--ink);
  stroke-width: 1.4;
}
.chk--w {
  fill: #f4ead2;
}
.chk--b {
  fill: #37243f;
}
.chk__n {
  fill: var(--ink);
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 12px;
  pointer-events: none;
}
.chk--b + .chk__n,
.off-bar.chk--b {
  stroke: var(--ink);
  stroke-width: 1;
}
.sel {
  fill: none;
  stroke: var(--sun);
  stroke-width: 3;
  pointer-events: none;
}
.off-bar {
  stroke: var(--ink);
  stroke-width: 1;
}
.off-dest {
  fill: rgba(255, 210, 63, 0.35);
  stroke: var(--sun);
  stroke-width: 2;
}
.die {
  fill: var(--cream);
  stroke: var(--ink);
  stroke-width: 1.6;
}
.pip {
  fill: var(--ink);
}

/* ---- Tip + tools + result ---- */
.tip {
  margin: 0 0 10px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.01em;
  color: var(--muted);
  text-align: center;
  line-height: 1.5;
}
.tools {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
.result {
  width: 100%;
  text-align: center;
  padding-top: 10px;
}
</style>
