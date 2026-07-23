<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { sfx } from '../sound.js'

// Gaple — block dominoes with the standard double-six set (28 tiles). Two modes:
// solo vs a simple CPU, or pass-and-play. Seat 0 and seat 1 hold 7 tiles each;
// the remaining 14 form the boneyard (tumpukan). The holder of the highest
// double opens; players then match one of the layout's two open ends, drawing
// from the boneyard when stuck and passing only when it is empty. A player who
// empties their hand wins; if the game blocks, the lower pip count wins.

// Which of a 3×3 grid's nine spots are lit for each pip value (row-major 0..8).
const PIPS = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}
function pipOn(value, i) {
  return PIPS[value].includes(i)
}

const mode = ref(null) // null (picker) | 'cpu' | 'duo'
const hands = ref([[], []]) // hands[seat] = array of { id, a, b }
const boneyard = ref([]) // face-down draw pile
const layout = ref([]) // placed tiles left→right, each { id, l, r } as displayed
const turn = ref(0) // whose seat is to move
const winner = ref(null) // null | 0 | 1 | 'draw'
const pending = ref(false) // an automated step (CPU / draw / pass) is running
const notice = ref('') // transient line: opening / draw / pass / blocked
const layoutEl = ref(null)
let timer = 0

const isOver = computed(() => winner.value !== null)
// In CPU mode the human is always seat 0; in duo the active seat is whoever's
// turn it is (pass-and-play shows the current player's own hand).
const activeSeat = computed(() => (mode.value === 'cpu' ? 0 : turn.value))
const oppSeat = computed(() => 1 - activeSeat.value)
const myHand = computed(() => hands.value[activeSeat.value])
const oppCount = computed(() => hands.value[oppSeat.value].length)
const leftEnd = computed(() => (layout.value.length ? layout.value[0].l : null))
const rightEnd = computed(() =>
  layout.value.length ? layout.value[layout.value.length - 1].r : null
)
// A human may tap only at a genuine wait state on their own seat.
const canAct = computed(
  () => !isOver.value && !pending.value && (mode.value !== 'cpu' || turn.value === 0)
)

function nameOf(seat) {
  if (mode.value === 'cpu') return seat === 0 ? 'Kamu' : 'Komputer'
  return `Pemain ${seat + 1}`
}
const oppName = computed(() => nameOf(oppSeat.value))
const handLabel = computed(() =>
  mode.value === 'cpu' ? 'Kartumu' : `Kartu Pemain ${activeSeat.value + 1}`
)

const statusText = computed(() => {
  if (winner.value === 'draw') return 'Seri!'
  if (winner.value !== null) {
    if (mode.value === 'cpu') return winner.value === 0 ? 'Kamu menang!' : 'Komputer menang'
    return `Pemain ${winner.value + 1} menang!`
  }
  if (mode.value === 'cpu') return turn.value === 0 ? 'Giliranmu' : 'Komputer berpikir...'
  return `Giliran Pemain ${turn.value + 1}`
})

// ---- Set / deal --------------------------------------------------------------
function makeSet() {
  const tiles = []
  for (let i = 0; i <= 6; i++)
    for (let j = i; j <= 6; j++) tiles.push({ id: `${i}-${j}`, a: i, b: j })
  return tiles
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// The opener: the highest double held (so [6-6] leads when present); with no
// double in either hand, the player with the heaviest single tile leads.
function chooseOpening() {
  let best = null
  const consider = (seat, tile, key) => {
    if (!best || key > best.key) best = { seat, tile, key }
  }
  for (let seat = 0; seat < 2; seat++)
    for (const t of hands.value[seat]) if (t.a === t.b) consider(seat, t, 1000 + t.a)
  if (best) return best
  for (let seat = 0; seat < 2; seat++)
    for (const t of hands.value[seat])
      consider(seat, t, (t.a + t.b) * 10 + Math.max(t.a, t.b))
  return best
}

// ---- Layout / legality -------------------------------------------------------
function isPlayable(tile) {
  if (layout.value.length === 0) return true
  const L = leftEnd.value
  const R = rightEnd.value
  return tile.a === L || tile.b === L || tile.a === R || tile.b === R
}
function hasPlayable(seat) {
  return hands.value[seat].some(isPlayable)
}
function pipCount(seat) {
  return hands.value[seat].reduce((s, t) => s + t.a + t.b, 0)
}

// Attach a tile, orienting so the matching pip meets the end. A tile matching
// both ends goes on the right (kept deliberately simple — no end-choice UI).
function placeTile(tile) {
  const { a, b, id } = tile
  if (layout.value.length === 0) {
    layout.value.push({ id, l: a, r: b })
    return
  }
  const R = rightEnd.value
  const L = leftEnd.value
  let side
  if (a === R || b === R) {
    if (a === R) layout.value.push({ id, l: a, r: b })
    else layout.value.push({ id, l: b, r: a })
    side = 'right'
  } else {
    if (a === L) layout.value.unshift({ id, l: b, r: a })
    else layout.value.unshift({ id, l: a, r: b })
    side = 'left'
  }
  nextTick(() => {
    const el = layoutEl.value
    if (el) el.scrollLeft = side === 'left' ? 0 : el.scrollWidth
  })
}

function removeFromHand(seat, tile) {
  const arr = hands.value[seat]
  const i = arr.findIndex((t) => t.id === tile.id)
  if (i >= 0) arr.splice(i, 1)
}

function setWinner(w) {
  winner.value = w
  pending.value = false
  if (w === 'draw') sfx.lose()
  else if (mode.value === 'cpu') (w === 0 ? sfx.win : sfx.lose)()
  else sfx.win()
}

// ---- Turn engine -------------------------------------------------------------
function doPlay(seat, tile) {
  placeTile(tile)
  removeFromHand(seat, tile)
  sfx.tick()
  notice.value = mode.value === 'cpu' && seat === 1 ? 'Komputer jalan' : ''
  if (hands.value[seat].length === 0) {
    setWinner(seat)
    return
  }
  turn.value = 1 - seat
  advance()
}

function playHuman(tile) {
  if (!canAct.value || !isPlayable(tile)) return
  doPlay(activeSeat.value, tile)
}

function chooseCpuTile() {
  const playable = hands.value[1].filter(isPlayable)
  if (!playable.length) return null
  // Prefer a double, then the heaviest tile — a fine, always-legal heuristic.
  playable.sort((x, y) => {
    const dx = x.a === x.b ? 1 : 0
    const dy = y.a === y.b ? 1 : 0
    if (dx !== dy) return dy - dx
    return y.a + y.b - (x.a + x.b)
  })
  return playable[0]
}
function cpuPlay() {
  if (isOver.value || turn.value !== 1) return
  const tile = chooseCpuTile()
  if (tile) doPlay(1, tile)
}

// Route the current seat: ready-to-play (wait for a human or schedule the CPU),
// or unable to play (draw one at a time, then pass — visibly, on a timer).
function advance() {
  if (isOver.value) return
  const me = turn.value
  if (hasPlayable(me)) {
    if (mode.value === 'cpu' && me === 1) {
      pending.value = true
      timer = setTimeout(cpuPlay, 520)
    } else {
      pending.value = false
    }
    return
  }
  pending.value = true
  timer = setTimeout(drawStep, 560)
}

function drawStep() {
  if (isOver.value) return
  const me = turn.value
  if (!hasPlayable(me) && boneyard.value.length) {
    hands.value[me].push(boneyard.value.pop())
    notice.value = `${nameOf(me)} mengambil dari tumpukan`
    sfx.tick()
    timer = setTimeout(drawStep, 500)
    return
  }
  if (hasPlayable(me)) {
    advance()
    return
  }
  // Cannot play and the boneyard is empty → pass.
  notice.value = `${nameOf(me)} pass`
  sfx.wrong()
  if (!hasPlayable(1 - me)) {
    resolveBlocked()
    return
  }
  turn.value = 1 - me
  timer = setTimeout(advance, 640)
}

function resolveBlocked() {
  const p0 = pipCount(0)
  const p1 = pipCount(1)
  if (p0 < p1) setWinner(0)
  else if (p1 < p0) setWinner(1)
  else setWinner('draw')
  notice.value = 'Buntu! Sisa pip menentukan pemenang.'
}

// ---- Round / mode control ----------------------------------------------------
function newRound() {
  clearTimeout(timer)
  pending.value = true
  winner.value = null
  notice.value = ''
  const deck = shuffle(makeSet())
  hands.value = [deck.slice(0, 7), deck.slice(7, 14)]
  boneyard.value = deck.slice(14)
  layout.value = []
  const open = chooseOpening()
  placeTile(open.tile)
  removeFromHand(open.seat, open.tile)
  notice.value = `${nameOf(open.seat)} membuka dengan ${open.tile.a}-${open.tile.b}`
  turn.value = 1 - open.seat
  timer = setTimeout(advance, 620)
}
function chooseMode(m) {
  mode.value = m
  newRound()
}
function backToModes() {
  clearTimeout(timer)
  pending.value = false
  mode.value = null
}

function onKeydown(e) {
  if (e.key === 'Enter' && isOver.value) {
    e.preventDefault()
    newRound()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(timer)
})
</script>

<template>
  <div class="gaple">
    <div class="panel">
      <!-- Mode picker -->
      <section v-if="!mode" class="screen">
        <p class="brand">GA<span class="brand__accent">PLE</span></p>
        <p class="eyebrow">PILIH MODE</p>
        <button class="cta" type="button" @click="chooseMode('cpu')">Solo ▸</button>
        <button class="cta cta--alt" type="button" @click="chooseMode('duo')">Duo ▸</button>
      </section>

      <!-- Game -->
      <section v-else class="screen">
        <div class="topbar">
          <button class="mini" type="button" @click="backToModes">← Mode</button>
          <span class="status" :class="{ 'is-over': isOver }">{{ statusText }}</span>
          <span class="mini mini--ghost" aria-hidden="true" />
        </div>

        <!-- Opponent's concealed hand -->
        <div class="gaple-opp">
          <span class="gaple-opp__name">{{ oppName }}</span>
          <span class="gaple-facedowns" aria-hidden="true">
            <span v-for="i in oppCount" :key="i" class="gaple-fd" />
          </span>
          <span class="gaple-opp__count">{{ oppCount }} kartu</span>
        </div>

        <!-- Open-end values -->
        <div v-if="layout.length" class="gaple-ends">
          <span class="gaple-endchip">Kiri <b>{{ leftEnd }}</b></span>
          <span class="gaple-endchip">Kanan <b>{{ rightEnd }}</b></span>
        </div>

        <!-- Layout: scrolls horizontally when long -->
        <div ref="layoutEl" class="gaple-layout">
          <div
            v-for="(t, i) in layout"
            :key="t.id"
            class="dom dom--h"
          >
            <span class="dom__cell" :class="{ 'is-end': i === 0 }">
              <span v-for="p in 9" :key="p" class="pip" :class="{ 'is-on': pipOn(t.l, p - 1) }" />
            </span>
            <span class="dom__div" />
            <span class="dom__cell" :class="{ 'is-end': i === layout.length - 1 }">
              <span v-for="p in 9" :key="p" class="pip" :class="{ 'is-on': pipOn(t.r, p - 1) }" />
            </span>
          </div>
        </div>

        <p class="gaple-notice" :class="{ 'is-block': isOver && winner === 'draw' }">{{ notice }}</p>

        <!-- Boneyard + whose hand -->
        <div class="gaple-info">
          <span class="gaple-bone"><span class="gaple-fd gaple-fd--bone" aria-hidden="true" />Tumpukan <b>{{ boneyard.length }}</b></span>
          <span class="gaple-you">{{ handLabel }}</span>
        </div>

        <!-- Your hand: tap a playable tile -->
        <div class="gaple-hand">
          <button
            v-for="t in myHand"
            :key="t.id"
            type="button"
            class="dom dom--v"
            :class="{ 'is-dead': !(canAct && isPlayable(t)) }"
            :disabled="!(canAct && isPlayable(t))"
            :aria-label="`Kartu ${t.a}-${t.b}`"
            @click="playHuman(t)"
          >
            <span class="dom__cell">
              <span v-for="p in 9" :key="p" class="pip" :class="{ 'is-on': pipOn(t.a, p - 1) }" />
            </span>
            <span class="dom__div" />
            <span class="dom__cell">
              <span v-for="p in 9" :key="p" class="pip" :class="{ 'is-on': pipOn(t.b, p - 1) }" />
            </span>
          </button>
        </div>

        <button class="cta" type="button" @click="newRound">
          {{ isOver ? 'Main lagi ▸' : 'Ulang' }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel, screen, brand, eyebrow, cta, topbar, mini come
   from src/styles.css (see docs/STYLE.md). */
.gaple {
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
  font-size: 34px;
}

/* ---- Opponent's concealed hand ---- */
.gaple-opp {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.gaple-opp__name {
  font-family: var(--font-display);
  font-size: 15px;
  color: var(--ink);
}
.gaple-facedowns {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  flex: 1;
}
.gaple-fd {
  width: 11px;
  height: 18px;
  border-radius: 2.5px;
  background: var(--grape);
  border: 1.5px solid var(--ink);
  box-shadow: inset 0 0 0 1.5px rgba(255, 243, 223, 0.35);
}
.gaple-opp__count {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--muted);
  white-space: nowrap;
}

/* ---- Open ends ---- */
.gaple-ends {
  display: flex;
  gap: 10px;
  margin-bottom: 6px;
}
.gaple-endchip {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 999px;
  padding: 4px 12px;
  box-shadow: var(--pop-sm);
}
.gaple-endchip b {
  color: var(--aqua-deep);
  font-size: 14px;
  margin-left: 4px;
}

/* ---- The table / layout ---- */
.gaple-layout {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 62px;
  padding: 12px 10px;
  background: #f3e6d0;
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  box-shadow: inset 0 3px 0 rgba(44, 19, 56, 0.08);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

/* ---- Domino tile ---- */
.dom {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  padding: 0;
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 8px;
  box-shadow: var(--pop-sm);
}
.dom--h {
  animation: gaple-place 0.22s ease;
}
.dom--v {
  flex-direction: column;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.dom__cell {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  place-items: center;
  padding: 3px;
  border-radius: 6px;
}
.dom--h .dom__cell {
  width: 30px;
  height: 30px;
}
.dom--v .dom__cell {
  width: 34px;
  height: 34px;
}
.dom__cell.is-end {
  box-shadow: inset 0 0 0 2px var(--aqua-deep);
  background: rgba(35, 201, 173, 0.14);
}
.dom__div {
  align-self: stretch;
  background: var(--ink);
}
.dom--h .dom__div {
  width: 2px;
}
.dom--v .dom__div {
  height: 2px;
}
.pip {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: transparent;
}
.pip.is-on {
  background: var(--ink);
}

/* ---- Notice line ---- */
.gaple-notice {
  width: 100%;
  min-height: 18px;
  margin: 8px 0 2px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.gaple-notice.is-block {
  color: var(--berry);
}

/* ---- Boneyard + hand label ---- */
.gaple-info {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 6px 0 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.gaple-bone {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.gaple-bone b,
.gaple-you {
  color: var(--aqua-deep);
  font-weight: 700;
}
.gaple-fd--bone {
  width: 13px;
  height: 20px;
}

/* ---- Your hand ---- */
.gaple-hand {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-bottom: 18px;
  min-height: 74px;
}
.gaple-hand .dom {
  animation: gaple-place 0.2s ease;
}
.gaple-hand .dom:not(:disabled) {
  cursor: pointer;
}
.gaple-hand .dom:not(:disabled):hover,
.gaple-hand .dom:not(:disabled):focus-visible {
  transform: translate(-2px, -2px);
  box-shadow: 5px 5px 0 var(--ink);
}
.gaple-hand .dom:not(:disabled):active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--ink);
}
.dom.is-dead {
  opacity: 0.4;
  cursor: not-allowed;
}

@keyframes gaple-place {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
}
</style>
