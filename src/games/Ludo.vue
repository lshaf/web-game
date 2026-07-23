<script setup>
import { ref, reactive, computed, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

const CELL = 24
const B = CELL * 15

const LOOP = []
for (let i = 0; i < 6; i++) LOOP.push([i, 6])
for (let i = 5; i >= 0; i--) LOOP.push([6, i])
LOOP.push([7, 0])
for (let i = 0; i < 6; i++) LOOP.push([8, i])
for (let i = 9; i < 15; i++) LOOP.push([i, 6])
LOOP.push([14, 7])
for (let i = 14; i >= 9; i--) LOOP.push([i, 8])
for (let i = 9; i < 15; i++) LOOP.push([8, i])
LOOP.push([7, 14])
for (let i = 14; i >= 9; i--) LOOP.push([6, i])
for (let i = 5; i >= 0; i--) LOOP.push([i, 8])
LOOP.push([0, 7])

const SAFE = new Set([1, 9, 14, 22, 27, 35, 40, 48])

const SEATS = [
  {
    name: 'Merah',
    color: 'var(--berry)',
    tint: '#ffd9e4',
    start: 1,
    home: [
      [1, 7],
      [2, 7],
      [3, 7],
      [4, 7],
      [5, 7],
    ],
    yard: [0, 0],
    goal: [6.55, 7],
  },
  {
    name: 'Kuning',
    color: 'var(--sun-core)',
    tint: '#ffe6c9',
    start: 14,
    home: [
      [7, 1],
      [7, 2],
      [7, 3],
      [7, 4],
      [7, 5],
    ],
    yard: [9, 0],
    goal: [7, 6.55],
  },
  {
    name: 'Toska',
    color: 'var(--aqua-deep)',
    tint: '#c9f0e7',
    start: 27,
    home: [
      [13, 7],
      [12, 7],
      [11, 7],
      [10, 7],
      [9, 7],
    ],
    yard: [9, 9],
    goal: [7.45, 7],
  },
  {
    name: 'Ungu',
    color: 'var(--grape)',
    tint: '#e2daf8',
    start: 40,
    home: [
      [7, 13],
      [7, 12],
      [7, 11],
      [7, 10],
      [7, 9],
    ],
    yard: [0, 9],
    goal: [7, 7.45],
  },
]

const SEATS_FOR = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] }
const TOKEN_OFFS = [
  [-3.5, -3.5],
  [3.5, -3.5],
  [-3.5, 3.5],
  [3.5, 3.5],
]

const phase = ref('menu')
const mode = ref('cpu')
const nPlayers = ref(2)
const seats = ref([0, 2])
const turnPos = ref(0)
const tokens = reactive({})
const die = ref(6)
const rolling = ref(false)
const stage = ref('roll')
const winner = ref(null)
const movable = ref([])

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

const curSeat = computed(() => seats.value[turnPos.value])
const isCpu = (seat) => mode.value === 'cpu' && seat !== 0
const seatLabel = (seat) => (mode.value === 'cpu' && seat === 0 ? 'Kamu' : SEATS[seat].name)

const statusLabel = computed(() => {
  const s = curSeat.value
  if (stage.value === 'pass') return 'Tidak ada langkah — lewat'
  if (isCpu(s)) return `${SEATS[s].name} berpikir…`
  const who = mode.value === 'cpu' ? 'Giliranmu' : `Giliran ${SEATS[s].name}`
  if (stage.value === 'roll') return `${who} — kocok dadu`
  if (stage.value === 'pick') return `${who} — pilih bidak`
  return who
})

function cellCenter(c, r) {
  return [(c + 0.5) * CELL, (r + 0.5) * CELL]
}

function yardSpot(seat, ti) {
  const [ox, oy] = SEATS[seat].yard
  const sx = ox * CELL + (ti % 2 === 0 ? 48 : 96)
  const sy = oy * CELL + (ti < 2 ? 48 : 96)
  return [sx, sy]
}

function tokenPos(seat, ti) {
  const t = tokens[seat][ti]
  let base
  if (t.p === -1) base = yardSpot(seat, ti)
  else if (t.p === 56) base = cellCenter(SEATS[seat].goal[0] - 0.5, SEATS[seat].goal[1] - 0.5)
  else if (t.p <= 50) {
    const [c, r] = LOOP[(SEATS[seat].start + t.p) % 52]
    base = cellCenter(c, r)
  } else {
    const [c, r] = SEATS[seat].home[t.p - 51]
    base = cellCenter(c, r)
  }
  const [dx, dy] = t.p === -1 ? [0, 0] : TOKEN_OFFS[ti]
  return [base[0] + dx * 0.8, base[1] + dy * 0.8]
}

function legal(seat, ti, d) {
  const t = tokens[seat][ti]
  if (t.p === -1) return d === 6
  return t.p + d <= 56
}

function movableList(seat, d) {
  const out = []
  for (let ti = 0; ti < 4; ti++) if (legal(seat, ti, d)) out.push(ti)
  return out
}

function startGame(m) {
  clearTimers()
  mode.value = m
  seats.value = SEATS_FOR[nPlayers.value]
  for (const s of seats.value) tokens[s] = [{ p: -1 }, { p: -1 }, { p: -1 }, { p: -1 }]
  for (const s of Object.keys(tokens)) if (!seats.value.includes(+s)) delete tokens[s]
  turnPos.value = 0
  winner.value = null
  movable.value = []
  rolling.value = false
  die.value = 6
  phase.value = 'play'
  enterRoll()
}

function toMenu() {
  clearTimers()
  phase.value = 'menu'
}

function enterRoll() {
  stage.value = 'roll'
  movable.value = []
  if (isCpu(curSeat.value)) setT(doRoll, 850)
}

function doRoll() {
  if (phase.value !== 'play' || stage.value !== 'roll' || rolling.value) return
  rolling.value = true
  let flips = 6
  const flip = () => {
    die.value = 1 + Math.floor(Math.random() * 6)
    sfx.tick()
    if (--flips > 0) setT(flip, 75)
    else {
      rolling.value = false
      afterRoll()
    }
  }
  flip()
}

function afterRoll() {
  const s = curSeat.value
  const moves = movableList(s, die.value)
  if (moves.length === 0) {
    stage.value = 'pass'
    setT(() => advanceTurn(false), 950)
    return
  }
  if (moves.length === 1) {
    stage.value = 'anim'
    setT(() => doMove(moves[0]), 420)
    return
  }
  if (isCpu(s)) {
    stage.value = 'anim'
    setT(() => doMove(cpuChoose(s, die.value, moves)), 520)
  } else {
    movable.value = moves
    stage.value = 'pick'
  }
}

function landingCaptures(seat, np) {
  if (np > 50) return []
  const li = (SEATS[seat].start + np) % 52
  if (SAFE.has(li)) return []
  const out = []
  for (const s2 of seats.value) {
    if (s2 === seat) continue
    tokens[s2].forEach((t2, ti2) => {
      if (t2.p >= 0 && t2.p <= 50 && (SEATS[s2].start + t2.p) % 52 === li) out.push([s2, ti2])
    })
  }
  return out
}

function cpuChoose(seat, d, moves) {
  let best = moves[0]
  let bestScore = -1
  for (const ti of moves) {
    const t = tokens[seat][ti]
    const np = t.p === -1 ? 0 : t.p + d
    let sc = Math.random() * 8
    if (t.p === -1) sc += 55
    if (np === 56) sc += 70
    if (np > 50 && np < 56) sc += 35
    if (np <= 50) {
      if (landingCaptures(seat, np).length) sc += 100
      if (SAFE.has((SEATS[seat].start + np) % 52)) sc += 25
    }
    sc += Math.max(0, t.p) * 0.5
    if (sc > bestScore) {
      bestScore = sc
      best = ti
    }
  }
  return best
}

function pickToken(seat, ti) {
  if (phase.value !== 'play' || stage.value !== 'pick') return
  if (seat !== curSeat.value || isCpu(seat)) return
  if (!movable.value.includes(ti)) return
  movable.value = []
  doMove(ti)
}

function doMove(ti) {
  const s = curSeat.value
  const t = tokens[s][ti]
  stage.value = 'anim'
  if (t.p === -1) {
    t.p = 0
    sfx.tick()
    setT(() => resolveLanding(s, ti), 240)
    return
  }
  const target = t.p + die.value
  const hop = () => {
    t.p++
    sfx.tick()
    if (t.p < target) setT(hop, 150)
    else setT(() => resolveLanding(s, ti), 240)
  }
  hop()
}

function resolveLanding(s, ti) {
  const t = tokens[s][ti]
  let captured = false
  if (t.p <= 50) {
    for (const [s2, ti2] of landingCaptures(s, t.p)) {
      tokens[s2][ti2].p = -1
      captured = true
    }
    if (captured) sfx.wrong()
  }
  const finished = t.p === 56
  if (finished) sfx.jump()
  if (tokens[s].every((tk) => tk.p === 56)) {
    winner.value = s
    phase.value = 'over'
    if (mode.value === 'cpu') {
      if (s === 0) sfx.win()
      else sfx.lose()
    } else {
      sfx.win()
    }
    return
  }
  advanceTurn(die.value === 6 || captured || finished)
}

function advanceTurn(extra) {
  if (!extra) turnPos.value = (turnPos.value + 1) % seats.value.length
  enterRoll()
}

const resultTitle = computed(() => {
  if (winner.value == null) return ''
  if (mode.value === 'cpu') return winner.value === 0 ? 'Kamu menang!' : `${SEATS[winner.value].name} menang.`
  return `${SEATS[winner.value].name} menang!`
})
const resultLost = computed(() => mode.value === 'cpu' && winner.value !== 0)

const PIPS = {
  1: [[20, 20]],
  2: [
    [12, 12],
    [28, 28],
  ],
  3: [
    [11, 11],
    [20, 20],
    [29, 29],
  ],
  4: [
    [12, 12],
    [28, 12],
    [12, 28],
    [28, 28],
  ],
  5: [
    [12, 12],
    [28, 12],
    [20, 20],
    [12, 28],
    [28, 28],
  ],
  6: [
    [12, 11],
    [28, 11],
    [12, 20],
    [28, 20],
    [12, 29],
    [28, 29],
  ],
}

onBeforeUnmount(clearTimers)
</script>

<template>
  <div class="ludo">
    <div class="panel">
      <section v-if="phase === 'menu'" class="screen">
        <p class="brand">LU<span class="brand__accent">DO</span></p>
        <p class="eyebrow">PILIH MODE</p>

        <div class="field">
          <span class="field__label">Jumlah pemain</span>
          <div class="picker">
            <button
              v-for="n in [2, 3, 4]"
              :key="n"
              class="pick"
              :class="{ 'is-on': nPlayers === n }"
              type="button"
              @click="nPlayers = n"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <button class="cta" type="button" @click="startGame('cpu')">Solo ▸</button>
        <button class="cta cta--alt" type="button" @click="startGame('duo')">Duo ▸</button>
      </section>

      <section v-else class="screen play">
        <div class="topbar">
          <button class="mini" type="button" @click="toMenu">← Mode</button>
          <span class="status" :class="{ 'is-over': phase === 'over' }">
            {{ phase === 'over' ? 'Selesai' : statusLabel }}
          </span>
          <button class="mini" type="button" @click="startGame(mode)">Baru</button>
        </div>

        <svg class="board" :viewBox="`0 0 ${B} ${B}`">
          <rect x="0" y="0" :width="B" :height="B" rx="14" fill="var(--paper-lit)" />

          <g v-for="s in seats" :key="'yard' + s">
            <rect
              :x="SEATS[s].yard[0] * CELL + 3"
              :y="SEATS[s].yard[1] * CELL + 3"
              :width="6 * CELL - 6"
              :height="6 * CELL - 6"
              rx="12"
              :fill="SEATS[s].tint"
              stroke="var(--ink)"
              stroke-width="2.4"
            />
            <rect
              :x="SEATS[s].yard[0] * CELL + 30"
              :y="SEATS[s].yard[1] * CELL + 30"
              :width="6 * CELL - 60"
              :height="6 * CELL - 60"
              rx="10"
              fill="var(--paper-lit)"
              stroke="var(--ink)"
              stroke-width="2"
            />
            <circle
              v-for="ti in 4"
              :key="ti"
              :cx="yardSpot(s, ti - 1)[0]"
              :cy="yardSpot(s, ti - 1)[1]"
              r="10"
              fill="none"
              :stroke="SEATS[s].color"
              stroke-width="2.5"
              stroke-dasharray="4 3"
            />
          </g>

          <g>
            <rect
              v-for="(c, i) in LOOP"
              :key="'t' + i"
              :x="c[0] * CELL"
              :y="c[1] * CELL"
              :width="CELL"
              :height="CELL"
              fill="#fff"
              stroke="rgba(44, 19, 56, 0.35)"
              stroke-width="1.2"
            />
            <rect
              v-for="s in seats"
              :key="'st' + s"
              :x="LOOP[SEATS[s].start][0] * CELL"
              :y="LOOP[SEATS[s].start][1] * CELL"
              :width="CELL"
              :height="CELL"
              :fill="SEATS[s].tint"
              stroke="rgba(44, 19, 56, 0.35)"
              stroke-width="1.2"
            />
            <g v-for="s in seats" :key="'hc' + s">
              <rect
                v-for="(hc, i) in SEATS[s].home"
                :key="i"
                :x="hc[0] * CELL"
                :y="hc[1] * CELL"
                :width="CELL"
                :height="CELL"
                :fill="SEATS[s].tint"
                stroke="rgba(44, 19, 56, 0.35)"
                stroke-width="1.2"
              />
            </g>
            <text
              v-for="i in [9, 22, 35, 48]"
              :key="'s' + i"
              :x="LOOP[i][0] * CELL + 12"
              :y="LOOP[i][1] * CELL + 17"
              text-anchor="middle"
              font-size="13"
              fill="rgba(44, 19, 56, 0.45)"
            >
              ✦
            </text>
          </g>

          <g>
            <polygon
              :points="`${6 * CELL},${6 * CELL} ${6 * CELL},${9 * CELL} ${7.5 * CELL},${7.5 * CELL}`"
              :fill="SEATS[0].color"
              stroke="var(--ink)"
              stroke-width="1.6"
            />
            <polygon
              :points="`${6 * CELL},${6 * CELL} ${9 * CELL},${6 * CELL} ${7.5 * CELL},${7.5 * CELL}`"
              :fill="SEATS[1].color"
              stroke="var(--ink)"
              stroke-width="1.6"
            />
            <polygon
              :points="`${9 * CELL},${6 * CELL} ${9 * CELL},${9 * CELL} ${7.5 * CELL},${7.5 * CELL}`"
              :fill="SEATS[2].color"
              stroke="var(--ink)"
              stroke-width="1.6"
            />
            <polygon
              :points="`${6 * CELL},${9 * CELL} ${9 * CELL},${9 * CELL} ${7.5 * CELL},${7.5 * CELL}`"
              :fill="SEATS[3].color"
              stroke="var(--ink)"
              stroke-width="1.6"
            />
          </g>

          <rect
            x="1.5"
            y="1.5"
            :width="B - 3"
            :height="B - 3"
            rx="13"
            fill="none"
            stroke="var(--ink)"
            stroke-width="3"
          />

          <g v-for="s in seats" :key="'tok' + s">
            <g
              v-for="ti in 4"
              :key="ti"
              class="token"
              :class="{ 'is-movable': s === curSeat && stage === 'pick' && movable.includes(ti - 1) }"
              @click="pickToken(s, ti - 1)"
            >
              <circle
                :cx="tokenPos(s, ti - 1)[0]"
                :cy="tokenPos(s, ti - 1)[1]"
                r="9"
                :fill="SEATS[s].color"
                stroke="var(--ink)"
                stroke-width="2.2"
              />
              <circle
                :cx="tokenPos(s, ti - 1)[0] - 2.5"
                :cy="tokenPos(s, ti - 1)[1] - 2.5"
                r="2.6"
                fill="rgba(255, 255, 255, 0.65)"
              />
            </g>
          </g>
        </svg>

        <div class="dicebar">
          <span
            v-for="s in seats"
            :key="'chip' + s"
            class="chip"
            :class="{ 'is-turn': s === curSeat && phase === 'play' }"
          >
            <i class="chip__dot" :style="{ background: SEATS[s].color }" />
            {{ seatLabel(s) }}
            <b>{{ tokens[s] ? tokens[s].filter((t) => t.p === 56).length : 0 }}/4</b>
          </span>
        </div>

        <div class="rollrow">
          <svg class="die" :class="{ 'is-rolling': rolling }" viewBox="0 0 40 40">
            <rect x="2" y="2" width="36" height="36" rx="9" fill="var(--paper-lit)" stroke="var(--ink)" stroke-width="2.6" />
            <circle v-for="(p, i) in PIPS[die]" :key="i" :cx="p[0]" :cy="p[1]" r="3.4" fill="var(--ink)" />
          </svg>
          <button
            class="cta cta--roll"
            type="button"
            :disabled="stage !== 'roll' || rolling || isCpu(curSeat) || phase !== 'play'"
            @click="doRoll"
          >
            Kocok ▸
          </button>
        </div>

        <div v-if="phase === 'over'" class="doneband">
          <p class="result__title" :class="{ 'is-lost': resultLost }">{{ resultTitle }}</p>
          <button class="cta" type="button" @click="startGame(mode)">Main lagi ▸</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ludo {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

.panel {
  padding: 18px 16px 22px;
}

.brand {
  font-size: 34px;
}

.play {
  width: 100%;
}

.board {
  width: 100%;
  aspect-ratio: 1;
  display: block;
  border-radius: 14px;
  box-shadow: var(--pop-sm);
  margin-bottom: 12px;
}

.token {
  cursor: pointer;
}

.token circle {
  transition: cx 0.13s ease, cy 0.13s ease;
}

.token.is-movable circle:first-child {
  animation: ludo-pulse 0.7s ease-in-out infinite alternate;
}

@keyframes ludo-pulse {
  from {
    stroke-width: 2.2;
  }
  to {
    stroke-width: 4.5;
  }
}

.dicebar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-bottom: 10px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--ink);
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 999px;
  padding: 3px 9px;
}

.chip.is-turn {
  background: var(--tile-live);
}

.chip__dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  border: 1.5px solid var(--ink);
}

.rollrow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.die {
  width: 44px;
  height: 44px;
}

.die.is-rolling {
  animation: ludo-shake 0.15s linear infinite;
}

@keyframes ludo-shake {
  0%,
  100% {
    transform: rotate(-8deg);
  }
  50% {
    transform: rotate(8deg);
  }
}

.cta--roll {
  padding: 10px 26px;
}

.doneband {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
</style>
