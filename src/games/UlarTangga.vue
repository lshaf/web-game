<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Ular Tangga (Snakes & Ladders) — a 10x10 serpentine board. Roll the die and
// hop square by square; ladders lift you, snakes drop you. Two modes: solo vs a
// CPU that just throws the die at random, or pass-and-play for two. Classic
// rules kept for spice: you must land exactly on 100, rolling a 6 earns another
// throw, and three 6s in a row burns your turn.

// bottom -> top
const LADDERS = { 2: 23, 8: 30, 15: 47, 28: 65, 40: 59, 63: 81, 71: 90 }
// head -> tail
const SNAKES = { 25: 5, 33: 14, 56: 37, 64: 43, 78: 58, 87: 49, 99: 80 }
const SNAKE_COLORS = ['#33b06a', '#7b5be6', '#ff4d79']

// Pip layout per die face — indices into a 3x3 grid (0=top-left … 8=bottom-right).
const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

const STEP_MS = 145 // one hop
const DICE_MS = 600 // dice tumble

// Center of square n as a percentage of the board (viewBox is 0..100), with
// square 1 bottom-left and the rows snaking back and forth up to 100.
function coord(n) {
  const row = Math.floor((n - 1) / 10) // 0 = bottom row
  const posInRow = (n - 1) % 10
  const col = row % 2 === 0 ? posInRow : 9 - posInRow
  return { x: col * 10 + 5, y: (9 - row) * 10 + 5 }
}
function coordForPos(pos) {
  return pos <= 0 ? { x: 5, y: 99.5 } : coord(pos) // pos 0 = the start line
}

// The cells in visual order (top row first) for the CSS grid.
const CELLS = (() => {
  const out = []
  for (let vr = 0; vr < 10; vr++) {
    const row = 9 - vr
    for (let col = 0; col < 10; col++) {
      const posInRow = row % 2 === 0 ? col : 9 - col
      const n = row * 10 + posInRow + 1
      out.push({ n, dark: (vr + col) % 2 === 1, foot: n in LADDERS, head: n in SNAKES })
    }
  }
  return out
})()

// Two rails + rungs for each ladder, precomputed once.
const LADDER_SHAPES = Object.keys(LADDERS).map((k) => {
  const A = coord(+k)
  const B = coord(LADDERS[k])
  const dx = B.x - A.x
  const dy = B.y - A.y
  const len = Math.hypot(dx, dy) || 1
  const px = (-dy / len) * 2.3 // perpendicular offset = half rail separation
  const py = (dx / len) * 2.3
  const rails = [
    { x1: A.x + px, y1: A.y + py, x2: B.x + px, y2: B.y + py },
    { x1: A.x - px, y1: A.y - py, x2: B.x - px, y2: B.y - py },
  ]
  const rungCount = Math.max(2, Math.round(len / 7))
  const rungs = []
  for (let i = 1; i < rungCount; i++) {
    const t = i / rungCount
    const cx = A.x + dx * t
    const cy = A.y + dy * t
    rungs.push({ x1: cx + px, y1: cy + py, x2: cx - px, y2: cy - py })
  }
  return { rails, rungs }
})

// A curvy body + head + eyes for each snake, precomputed once.
const SNAKE_SHAPES = Object.keys(SNAKES).map((k, i) => {
  const H = coord(+k)
  const T = coord(SNAKES[k])
  const dx = T.x - H.x
  const dy = T.y - H.y
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len
  const py = dx / len
  const amp = Math.min(8, len * 0.22)
  const c1 = { x: H.x + dx * 0.33 + px * amp, y: H.y + dy * 0.33 + py * amp }
  const c2 = { x: H.x + dx * 0.66 - px * amp, y: H.y + dy * 0.66 - py * amp }
  const path = `M${H.x} ${H.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${T.x} ${T.y}`
  // eyes point from the head toward the first bend
  const hx = c1.x - H.x
  const hy = c1.y - H.y
  const hl = Math.hypot(hx, hy) || 1
  const ex = hx / hl
  const ey = hy / hl
  const eyes = [
    { x: H.x + ex * 0.4 - ey * 1.2, y: H.y + ey * 0.4 + ex * 1.2 },
    { x: H.x + ex * 0.4 + ey * 1.2, y: H.y + ey * 0.4 - ex * 1.2 },
  ]
  return { path, head: H, eyes, color: SNAKE_COLORS[i % SNAKE_COLORS.length] }
})

const mode = ref(null) // null (picker) | 'cpu' | 'duo'
const players = ref([]) // [{ pos, name, color, sliding, sixStreak }]
const turn = ref(0) // active player index
const dice = ref(null) // last rolled face (1..6) or null
const rolling = ref(false) // die is tumbling
const busy = ref(false) // a throw/move is in progress — input locked
const winner = ref(null) // null | player index
const event = ref('') // last snake/ladder/six message

let rollTimer = 0
let settleTimer = 0
let hopTimer = 0
let slideTimer = 0
let slideDoneTimer = 0
let cpuTimer = 0
function clearTimers() {
  clearInterval(rollTimer)
  ;[settleTimer, hopTimer, slideTimer, slideDoneTimer, cpuTimer].forEach(clearTimeout)
}

const winnerSet = computed(() => winner.value !== null)
const diceFace = computed(() => (dice.value ? PIPS[dice.value] : []))
const canRoll = computed(
  () => !winnerSet.value && !busy.value && !(mode.value === 'cpu' && turn.value === 1),
)

const statusText = computed(() => {
  if (winnerSet.value) {
    if (mode.value === 'cpu') return winner.value === 0 ? 'Kamu menang! 🎉' : 'Komputer menang'
    return `${players.value[winner.value].name} menang! 🎉`
  }
  if (rolling.value) return 'Mengocok dadu…'
  if (mode.value === 'cpu') return turn.value === 0 ? 'Giliranmu' : 'Komputer jalan…'
  return `Giliran ${players.value[turn.value].name}`
})
const hint = computed(() => {
  if (winnerSet.value) return 'Papan selesai'
  if (rolling.value) return 'Dadu berputar…'
  if (busy.value) return 'Bidak berjalan…'
  if (mode.value === 'cpu' && turn.value === 1) return 'Giliran komputer'
  return 'Ketuk dadu untuk mengocok'
})

function pipsOn(idx) {
  return diceFace.value.includes(idx)
}
function tokenStyle(p, idx) {
  const c = coordForPos(p.pos)
  const off = idx === 0 ? -1.7 : 1.7 // nudge the two tokens apart when co-located
  return { left: `${c.x + off}%`, top: `${c.y + off}%` }
}

function chooseMode(m) {
  mode.value = m
  reset()
}
function backToModes() {
  clearTimers()
  mode.value = null
}
function reset() {
  clearTimers()
  const names = mode.value === 'cpu' ? ['Kamu', 'Komputer'] : ['Pemain 1', 'Pemain 2']
  players.value = [
    { pos: 0, name: names[0], color: 'a', sliding: null, sixStreak: 0 },
    { pos: 0, name: names[1], color: 'b', sliding: null, sixStreak: 0 },
  ]
  turn.value = 0
  dice.value = null
  rolling.value = false
  busy.value = false
  winner.value = null
  event.value = ''
}

function roll() {
  if (!canRoll.value) return
  startRoll()
}

// Tumble the die for a moment, then settle on a random face — the same throw
// for a human tap or the CPU's auto-roll.
function startRoll() {
  busy.value = true
  rolling.value = true
  event.value = ''
  const final = 1 + Math.floor(Math.random() * 6)
  rollTimer = setInterval(() => {
    dice.value = 1 + Math.floor(Math.random() * 6)
    sfx.tick()
  }, 80)
  settleTimer = setTimeout(() => {
    clearInterval(rollTimer)
    dice.value = final
    rolling.value = false
    afterRoll(final)
  }, DICE_MS)
}

function afterRoll(value) {
  const p = players.value[turn.value]
  if (value === 6) {
    p.sixStreak += 1
    if (p.sixStreak >= 3) {
      p.sixStreak = 0
      event.value = 'Tiga kali 6 — giliran hangus! 😵'
      sfx.wrong()
      endTurn(false)
      return
    }
  } else {
    p.sixStreak = 0
  }
  const target = p.pos + value
  if (target > 100) {
    event.value = 'Kelebihan — harus pas di 100!'
    sfx.wrong()
    endTurn(value === 6)
    return
  }
  hopTo(p, target, value)
}

// Walk the token forward one square at a time.
function hopTo(p, target, value) {
  if (p.pos >= target) {
    resolveLand(p, value)
    return
  }
  p.pos += 1
  sfx.tick()
  hopTimer = setTimeout(() => hopTo(p, target, value), STEP_MS)
}

function resolveLand(p, value) {
  if (p.pos === 100) {
    win(p)
    return
  }
  const ladder = LADDERS[p.pos]
  const snake = SNAKES[p.pos]
  if (ladder) {
    event.value = `Naik tangga! ${p.pos} → ${ladder} 🪜`
    slideTo(p, ladder, 'ladder', value)
  } else if (snake) {
    event.value = `Kena ular! ${p.pos} → ${snake} 🐍`
    slideTo(p, snake, 'snake', value)
  } else {
    endTurn(value === 6)
  }
}

// Glide (rather than hop) along a snake or ladder to its far end.
function slideTo(p, dest, kind, value) {
  p.sliding = kind
  slideTimer = setTimeout(() => {
    p.pos = dest
    if (kind === 'ladder') sfx.jump()
    else sfx.wrong()
    slideDoneTimer = setTimeout(() => {
      p.sliding = null
      if (p.pos === 100) win(p)
      else endTurn(value === 6)
    }, 460)
  }, 60)
}

function win(p) {
  winner.value = turn.value
  event.value = `${p.name} sampai puncak! 🎉`
  busy.value = false
  sfx.win()
}

function endTurn(extra) {
  if (winnerSet.value) {
    busy.value = false
    return
  }
  if (extra) {
    event.value = event.value ? `${event.value} — lempar lagi!` : 'Dapat 6, lempar lagi!'
  } else {
    turn.value = turn.value === 0 ? 1 : 0
  }
  busy.value = false
  maybeCpu()
}

// If it's the CPU's turn, throw for it after a beat.
function maybeCpu() {
  if (mode.value === 'cpu' && turn.value === 1 && !winnerSet.value) {
    cpuTimer = setTimeout(startRoll, 700)
  }
}

function onKeydown(e) {
  if (!mode.value) return
  if (e.key === 'Enter' && winnerSet.value) {
    e.preventDefault()
    reset()
    return
  }
  if ((e.key === ' ' || e.key === 'Enter') && canRoll.value) {
    e.preventDefault()
    roll()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimers()
})
</script>

<template>
  <div class="ular">
    <div class="panel">
      <!-- Mode picker -->
      <section v-if="!mode" class="screen">
        <p class="brand">ULAR<span class="brand__accent">TANGGA</span></p>
        <p class="eyebrow">PILIH MODE</p>
        <button class="cta" type="button" @click="chooseMode('cpu')">Lawan Komputer ▸</button>
        <button class="cta cta--alt" type="button" @click="chooseMode('duo')">2 Pemain ▸</button>
      </section>

      <!-- Game -->
      <section v-else class="screen">
        <div class="topbar">
          <button class="mini" type="button" @click="backToModes">← Mode</button>
          <span class="status" :class="{ 'is-over': winnerSet }">{{ statusText }}</span>
          <span class="mini mini--ghost" aria-hidden="true" />
        </div>

        <div class="board-wrap">
          <div class="board">
            <span
              v-for="c in CELLS"
              :key="c.n"
              class="cell"
              :class="{ 'is-dark': c.dark, 'is-foot': c.foot, 'is-head': c.head }"
              >{{ c.n }}</span
            >

            <svg class="overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <g v-for="(l, i) in LADDER_SHAPES" :key="'l' + i">
                <line
                  v-for="(r, ri) in l.rails"
                  :key="'ki' + ri"
                  class="rail-ink"
                  :x1="r.x1"
                  :y1="r.y1"
                  :x2="r.x2"
                  :y2="r.y2"
                />
                <line
                  v-for="(g, gi) in l.rungs"
                  :key="'gi' + gi"
                  class="rung-ink"
                  :x1="g.x1"
                  :y1="g.y1"
                  :x2="g.x2"
                  :y2="g.y2"
                />
                <line
                  v-for="(r, ri) in l.rails"
                  :key="'kw' + ri"
                  class="rail-wood"
                  :x1="r.x1"
                  :y1="r.y1"
                  :x2="r.x2"
                  :y2="r.y2"
                />
                <line
                  v-for="(g, gi) in l.rungs"
                  :key="'gw' + gi"
                  class="rung-wood"
                  :x1="g.x1"
                  :y1="g.y1"
                  :x2="g.x2"
                  :y2="g.y2"
                />
              </g>

              <g v-for="(s, i) in SNAKE_SHAPES" :key="'s' + i">
                <path class="snake-ink" :d="s.path" />
                <path class="snake-body" :d="s.path" :stroke="s.color" />
                <circle
                  :cx="s.head.x"
                  :cy="s.head.y"
                  r="2.4"
                  :fill="s.color"
                  stroke="var(--ink)"
                  stroke-width="0.7"
                />
                <circle v-for="(e, ei) in s.eyes" :key="ei" :cx="e.x" :cy="e.y" r="0.55" fill="var(--ink)" />
              </g>
            </svg>
          </div>

          <div class="tokens" aria-hidden="true">
            <div
              v-for="(p, idx) in players"
              :key="idx"
              class="token"
              :class="[
                'token--' + p.color,
                { 'is-sliding': p.sliding, 'is-active': idx === turn && !winnerSet },
              ]"
              :style="tokenStyle(p, idx)"
            />
          </div>
        </div>

        <div class="hud">
          <div
            v-for="(p, idx) in players"
            :key="idx"
            class="pawn-chip"
            :class="{ 'is-turn': idx === turn && !winnerSet, 'is-win': idx === winner }"
          >
            <span class="pawn" :class="'pawn--' + p.color" />
            <span class="pawn-chip__name">{{ p.name }}</span>
            <span class="pawn-chip__sq">{{ p.pos || '–' }}</span>
          </div>
        </div>

        <div class="roller">
          <button
            class="die"
            type="button"
            :class="{ 'is-rolling': rolling, 'is-empty': dice == null }"
            :disabled="!canRoll"
            aria-label="Kocok dadu"
            @click="roll"
          >
            <span class="die__face">
              <span v-for="i in 9" :key="i" class="pip" :class="{ on: pipsOn(i - 1) }" />
            </span>
            <span v-if="dice == null" class="die__q" aria-hidden="true">🎲</span>
          </button>
          <span class="roller__hint">{{ hint }}</span>
        </div>

        <p class="event" aria-live="polite">{{ event }}</p>

        <button class="cta" type="button" @click="reset">
          {{ winnerSet ? 'Main lagi ▸' : 'Ulang papan' }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel, screen, brand, eyebrow, cta, topbar, mini come
   from src/styles.css (see docs/STYLE.md). */
.ular {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

.panel {
  padding: 22px 18px 24px;
}

.brand {
  font-size: 30px;
}

/* ---- The board ---- */
.board-wrap {
  position: relative;
  width: 100%;
  margin-top: 2px;
}
.board {
  position: relative;
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  grid-template-rows: repeat(10, 1fr);
  aspect-ratio: 1;
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--pop);
}
.cell {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 2px 0 0 3px;
  font-family: var(--font-mono);
  font-size: clamp(7px, 2.1vw, 11px);
  line-height: 1;
  color: var(--muted);
  box-shadow: inset -1px -1px 0 rgba(44, 19, 56, 0.06);
}
.cell.is-dark {
  background: rgba(123, 91, 230, 0.08);
}
.cell.is-foot {
  background: rgba(51, 176, 106, 0.2);
}
.cell.is-head {
  background: rgba(255, 77, 121, 0.16);
}

/* ---- Snakes & ladders overlay (stroke widths are in board-percent units) ---- */
.overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.rail-ink {
  stroke: var(--ink);
  stroke-width: 1.4;
  stroke-linecap: round;
}
.rail-wood {
  stroke: #d98a3d;
  stroke-width: 0.75;
  stroke-linecap: round;
}
.rung-ink {
  stroke: var(--ink);
  stroke-width: 1.15;
  stroke-linecap: round;
}
.rung-wood {
  stroke: #e8a24e;
  stroke-width: 0.55;
  stroke-linecap: round;
}
.snake-ink {
  fill: none;
  stroke: var(--ink);
  stroke-width: 2.2;
  stroke-linecap: round;
}
.snake-body {
  fill: none;
  stroke-width: 1.45;
  stroke-linecap: round;
}

/* ---- Player tokens (sit above the overlay, in an unclipped sibling layer) ---- */
.tokens {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.token {
  position: absolute;
  width: 7.4%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 2.5px solid var(--ink);
  box-shadow: 0 2px 0 rgba(44, 19, 56, 0.3);
  transition: left 0.13s linear, top 0.13s linear;
  z-index: 3;
}
.token::after {
  content: '';
  position: absolute;
  inset: 20% 30% 45% 22%;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.45);
}
.token--a {
  background: var(--aqua);
}
.token--b {
  background: var(--berry);
}
.token.is-sliding {
  transition: left 0.42s ease-in-out, top 0.42s ease-in-out;
  z-index: 4;
}
.token.is-active {
  animation: token-pulse 1s ease-in-out infinite;
}
@keyframes token-pulse {
  0%,
  100% {
    box-shadow: 0 2px 0 rgba(44, 19, 56, 0.3), 0 0 0 0 rgba(44, 19, 56, 0.4);
  }
  50% {
    box-shadow: 0 2px 0 rgba(44, 19, 56, 0.3), 0 0 0 5px rgba(44, 19, 56, 0);
  }
}

/* ---- Player HUD chips ---- */
.hud {
  width: 100%;
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.pawn-chip {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 2px solid var(--ink);
  border-radius: 12px;
  background: var(--paper-lit);
  box-shadow: var(--pop-sm);
}
.pawn-chip.is-turn {
  background: var(--tile-live);
}
.pawn-chip.is-win {
  background: var(--sun);
}
.pawn {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--ink);
  flex: none;
}
.pawn--a {
  background: var(--aqua);
}
.pawn--b {
  background: var(--berry);
}
.pawn-chip__name {
  font-weight: 700;
  font-size: 13px;
}
.pawn-chip__sq {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--muted);
}
.pawn-chip.is-turn .pawn-chip__sq,
.pawn-chip.is-win .pawn-chip__sq {
  color: var(--ink);
}

/* ---- The die ---- */
.roller {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
}
.die {
  position: relative;
  width: 88px;
  height: 88px;
  padding: 13px;
  background: var(--paper-lit);
  border: var(--line) solid var(--ink);
  border-radius: 18px;
  box-shadow: var(--pop);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.die:hover:not(:disabled),
.die:focus-visible:not(:disabled) {
  transform: translate(-2px, -2px);
  box-shadow: 7px 7px 0 var(--ink);
}
.die:active:not(:disabled) {
  transform: translate(3px, 3px);
  box-shadow: 2px 2px 0 var(--ink);
}
.die:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.die__face {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 4px;
  width: 100%;
  height: 100%;
}
.die.is-empty .die__face {
  opacity: 0;
}
.pip {
  border-radius: 50%;
}
.pip.on {
  background: var(--ink);
  box-shadow: inset 0 -1.5px 0 rgba(255, 255, 255, 0.25);
}
.die__q {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 40px;
}
.die.is-rolling {
  animation: die-tumble 0.6s ease-in-out;
}
@keyframes die-tumble {
  0% {
    transform: rotate(0) scale(1);
  }
  25% {
    transform: rotate(-20deg) scale(1.08);
  }
  50% {
    transform: rotate(18deg) scale(0.95);
  }
  75% {
    transform: rotate(-12deg) scale(1.05);
  }
  100% {
    transform: rotate(0) scale(1);
  }
}
.roller__hint {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--muted);
}

.event {
  min-height: 22px;
  margin: 12px 0 4px;
  font-weight: 600;
  font-size: 14px;
  text-align: center;
  color: var(--ink);
}
</style>
