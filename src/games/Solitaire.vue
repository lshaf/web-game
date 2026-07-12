<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { sfx } from '../sound.js'

// Solitaire (Klondike) — build the four foundations up by suit from Ace to King.
// Fan the tableau down in alternating colours, move Kings to empty columns, and
// turn the stock for more cards. Tap a face-up card to pick it up (with the run
// beneath it), then tap where it should go; tap it again to send it home to a
// foundation. Draw count and redeals set the difficulty.

const SOLVED_KEY = 'dusk-solitaire-solved'
const BEST_KEY = 'dusk-solitaire-best'

const LEVELS = [
  { key: 'mudah', label: 'Mudah', draw: 1, redeals: Infinity, info: 'Tarik 1 kartu' },
  { key: 'sedang', label: 'Sedang', draw: 3, redeals: Infinity, info: 'Tarik 3 kartu' },
  { key: 'sulit', label: 'Sulit', draw: 3, redeals: 2, info: 'Tarik 3 · daur 2×' },
]

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const isRed = (suit) => suit === 1 || suit === 2
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// --- Game state -------------------------------------------------------------

const phase = ref('setup') // setup | play | won
const sel = ref(LEVELS[0])
const level = ref(LEVELS[0])

const stock = ref([])
const waste = ref([])
const foundations = ref([[], [], [], []]) // one pile per suit
const tableau = ref([[], [], [], [], [], [], []])
const redealsLeft = ref(Infinity)
const drag = ref(null) // { cards, src, col, idx, offX, offY, curX, curY, moved, pid }
const moves = ref(0)
const cardW = ref(46)
const elapsed = ref(0)
const solvedCount = ref(0)
const bestTime = ref(0)

const stageRef = ref(null)
let timer = 0
let startAt = 0
let uid = 0

const cardH = computed(() => Math.round(cardW.value * 1.42))
const downGap = computed(() => Math.round(cardH.value * 0.17))
const upGap = computed(() => Math.round(cardH.value * 0.3))

const timeLabel = computed(() => fmt(elapsed.value))
function fmt(s) {
  const m = Math.floor(s / 60)
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

// Cards currently being carried (dimmed at their origin while the ghost drags).
const dragIds = computed(() => {
  const set = new Set()
  if (drag.value) for (const c of drag.value.cards) set.add(c.id)
  return set
})

// Stacked y-offset of each card in a tableau column.
function colTops(col) {
  const tops = []
  let y = 0
  for (let i = 0; i < col.length; i++) {
    tops.push(y)
    y += col[i].faceUp ? upGap.value : downGap.value
  }
  return tops
}
function colHeight(col) {
  if (!col.length) return cardH.value
  const tops = colTops(col)
  return tops[tops.length - 1] + cardH.value
}

// --- Rules ------------------------------------------------------------------

function canOnTableau(card, col) {
  if (!col.length) return card.rank === 13 // empty column takes a King
  const top = col[col.length - 1]
  return top.faceUp && isRed(top.suit) !== isRed(card.suit) && top.rank === card.rank + 1
}
function canOnFoundation(card) {
  const f = foundations.value[card.suit]
  return f.length ? f[f.length - 1].rank === card.rank - 1 : card.rank === 1
}

// Turn over a newly exposed tableau card.
function flipExposed(col) {
  const c = tableau.value[col]
  if (c.length && !c[c.length - 1].faceUp) c[c.length - 1].faceUp = true
}

function removeFrom(d) {
  if (d.src === 'waste') waste.value.pop()
  else tableau.value[d.col].splice(d.idx)
}

// --- Stock (a plain click) --------------------------------------------------

function tapStock() {
  if (phase.value !== 'play') return
  if (!stock.value.length) {
    if (!waste.value.length || redealsLeft.value <= 0) {
      sfx.wrong()
      return
    }
    while (waste.value.length) {
      const c = waste.value.pop()
      c.faceUp = false
      stock.value.push(c)
    }
    if (redealsLeft.value !== Infinity) redealsLeft.value -= 1
    sfx.tick()
    return
  }
  for (let i = 0; i < level.value.draw && stock.value.length; i++) {
    const c = stock.value.pop()
    c.faceUp = true
    waste.value.push(c)
  }
  sfx.tick()
}

// --- Drag & drop ------------------------------------------------------------

// Pick up a face-up card (and the run beneath it) and drag it. A press that
// never moves is treated as a tap → send that single card home to a foundation.
function onCardDown(e, src, col, idx) {
  if (phase.value !== 'play' || e.button > 0) return
  const card = src === 'waste' ? waste.value[waste.value.length - 1] : tableau.value[col][idx]
  if (!card || !card.faceUp) return
  if (src === 'waste' && idx !== waste.value.length - 1) return
  const cards = src === 'waste' ? [card] : tableau.value[col].slice(idx)
  const rect = e.currentTarget.getBoundingClientRect()
  drag.value = {
    cards,
    src,
    col,
    idx,
    offX: e.clientX - rect.left,
    offY: e.clientY - rect.top,
    startX: e.clientX,
    startY: e.clientY,
    curX: e.clientX,
    curY: e.clientY,
    moved: false,
    pid: e.pointerId,
  }
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch (err) {
    /* capture unsupported */
  }
}
function onCardMove(e) {
  const d = drag.value
  if (!d) return
  d.curX = e.clientX
  d.curY = e.clientY
  if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5) d.moved = true
  if (d.moved) e.preventDefault()
}
function onCardUp(e) {
  const d = drag.value
  if (!d) return
  drag.value = null
  if (!d.moved) {
    // A tap: send the single top card straight to its foundation if it fits.
    if (d.cards.length === 1 && canOnFoundation(d.cards[0])) dropOnFoundation(d)
    return
  }
  // Where did we let go? Resolve the pile under the pointer.
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const target = el && el.closest('[data-drop]')
  if (target) {
    const [kind, n] = target.dataset.drop.split('-')
    if (kind === 'tableau') dropOnTableau(d, Number(n))
    else if (kind === 'foundation') dropOnFoundation(d)
    else sfx.wrong()
  } else {
    sfx.wrong()
  }
}

function dropOnTableau(d, col) {
  if (!canOnTableau(d.cards[0], tableau.value[col])) {
    sfx.wrong()
    return
  }
  removeFrom(d)
  for (const c of d.cards) tableau.value[col].push(c)
  if (d.src === 'tableau') flipExposed(d.col)
  after()
}
function dropOnFoundation(d) {
  if (d.cards.length !== 1 || !canOnFoundation(d.cards[0])) {
    sfx.wrong()
    return
  }
  removeFrom(d)
  foundations.value[d.cards[0].suit].push(d.cards[0])
  if (d.src === 'tableau') flipExposed(d.col)
  after()
}

function after() {
  moves.value += 1
  sfx.tick()
  checkWin()
}

function checkWin() {
  if (foundations.value.reduce((n, f) => n + f.length, 0) === 52) win()
}

// --- Lifecycle --------------------------------------------------------------

function computeCard() {
  const avail = (stageRef.value ? stageRef.value.clientWidth : 360) - 2
  const gap = 5
  const w = Math.floor((avail - 6 * gap) / 7)
  return clamp(w, 34, 64)
}
function layout() {
  cardW.value = computeCard()
}

function deal() {
  const deck = []
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ id: uid++, suit: s, rank: r, faceUp: false })
  shuffle(deck)
  const cols = [[], [], [], [], [], [], []]
  for (let c = 0; c < 7; c++) {
    for (let k = 0; k <= c; k++) {
      const card = deck.pop()
      card.faceUp = k === c
      cols[c].push(card)
    }
  }
  tableau.value = cols
  stock.value = deck // rest, all face-down
  waste.value = []
  foundations.value = [[], [], [], []]
  redealsLeft.value = level.value.redeals
  drag.value = null
  moves.value = 0
  elapsed.value = 0
  phase.value = 'play'
  nextTick(layout)
}
function start() {
  level.value = sel.value
  deal()
  startTimer()
}
function newGame() {
  deal()
  startTimer()
}
function toSetup() {
  stopTimer()
  phase.value = 'setup'
}

function win() {
  phase.value = 'won'
  stopTimer()
  sfx.win()
  solvedCount.value += 1
  persist(SOLVED_KEY, solvedCount.value)
  if (bestTime.value === 0 || elapsed.value < bestTime.value) {
    bestTime.value = elapsed.value
    persist(BEST_KEY, bestTime.value)
  }
}

function startTimer() {
  stopTimer()
  startAt = Date.now()
  elapsed.value = 0
  timer = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startAt) / 1000)
  }, 1000)
}
function stopTimer() {
  if (timer) clearInterval(timer)
  timer = 0
}
function persist(k, v) {
  try {
    localStorage.setItem(k, String(v))
  } catch (e) {
    /* storage may be blocked; keep in-memory */
  }
}

// The up-to-three waste cards to show (only the last is playable).
const wasteShown = computed(() => waste.value.slice(-3))

onMounted(() => {
  try {
    solvedCount.value = Number(localStorage.getItem(SOLVED_KEY)) || 0
    bestTime.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch (e) {
    solvedCount.value = 0
    bestTime.value = 0
  }
  window.addEventListener('resize', layout)
})
onBeforeUnmount(() => {
  stopTimer()
  window.removeEventListener('resize', layout)
})
</script>

<template>
  <div class="solitaire">
    <div class="panel">
      <section class="screen">
        <!-- ===== Setup ===== -->
        <template v-if="phase === 'setup'">
          <p class="brand">SOLI<span class="brand__accent">TAIRE</span></p>
          <p class="eyebrow">PILIH TINGKAT</p>
          <div class="picker picker--3 setup__picker">
            <button
              v-for="lv in LEVELS"
              :key="lv.key"
              class="pick"
              type="button"
              :class="{ 'is-on': lv.key === sel.key }"
              @click="sel = lv"
            >
              {{ lv.label }}
            </button>
          </div>
          <p class="setup__info">{{ sel.info }} · SELESAI {{ solvedCount }}</p>
          <button class="cta" type="button" @click="start">Mulai ▸</button>
        </template>

        <!-- ===== Play / Won ===== -->
        <template v-else>
          <div class="backbar">
            <button class="mini" type="button" @click="toSetup">← Tingkat</button>
          </div>
          <p class="brand brand--sm">SOLI<span class="brand__accent">TAIRE</span></p>

          <div class="solobar hud">
            <span>WAKTU <b>{{ timeLabel }}</b></span>
            <span>LANGKAH {{ moves }}</span>
            <span class="solobar__best">SELESAI {{ solvedCount }}</span>
          </div>

          <div class="stage" ref="stageRef" :style="{ '--cw': cardW + 'px', '--ch': cardH + 'px' }">
            <!-- Top row: stock, waste, foundations -->
            <div class="top">
              <div class="slot stock" @click="tapStock">
                <div v-if="stock.length" class="card back">
                  <span class="back__pip" />
                </div>
                <div v-else class="slot__empty">{{ redealsLeft > 0 ? '↻' : '✕' }}</div>
              </div>

              <div class="slot waste">
                <div v-if="!waste.length" class="slot__empty" />
                <div
                  v-for="(c, i) in wasteShown"
                  :key="c.id"
                  class="card"
                  :class="{ red: isRed(c.suit), dragging: dragIds.has(c.id) }"
                  :style="{ left: i * Math.round(cardW * 0.26) + 'px' }"
                  @pointerdown="onCardDown($event, 'waste', -1, waste.length - 1)"
                  @pointermove="onCardMove"
                  @pointerup="onCardUp"
                >
                  <span class="card__rank">{{ RANKS[c.rank] }}</span>
                  <span class="card__suit">{{ SUITS[c.suit] }}</span>
                </div>
              </div>

              <div class="spacer" />

              <div
                v-for="(f, s) in foundations"
                :key="'f' + s"
                class="slot foundation"
                :data-drop="'foundation-' + s"
              >
                <div v-if="!f.length" class="slot__empty foundation__ghost">{{ SUITS[s] }}</div>
                <div v-else class="card" :class="{ red: isRed(f[f.length - 1].suit) }">
                  <span class="card__rank">{{ RANKS[f[f.length - 1].rank] }}</span>
                  <span class="card__suit">{{ SUITS[f[f.length - 1].suit] }}</span>
                </div>
              </div>
            </div>

            <!-- Tableau columns -->
            <div class="tableau">
              <div
                v-for="(col, ci) in tableau"
                :key="'c' + ci"
                class="column"
                :data-drop="'tableau-' + ci"
                :style="{ height: colHeight(col) + 'px' }"
              >
                <div v-if="!col.length" class="slot__empty column__empty" />
                <div
                  v-for="(c, i) in col"
                  :key="c.id"
                  class="card"
                  :class="{ red: isRed(c.suit), back: !c.faceUp, dragging: dragIds.has(c.id) }"
                  :style="{ top: colTops(col)[i] + 'px' }"
                  @pointerdown="onCardDown($event, 'tableau', ci, i)"
                  @pointermove="onCardMove"
                  @pointerup="onCardUp"
                >
                  <template v-if="c.faceUp">
                    <span class="card__rank">{{ RANKS[c.rank] }}</span>
                    <span class="card__suit">{{ SUITS[c.suit] }}</span>
                  </template>
                  <span v-else class="back__pip" />
                </div>
              </div>
            </div>

            <!-- Drag ghost: the carried run, following the pointer -->
            <div
              v-if="drag && drag.moved"
              class="ghost"
              :style="{ left: drag.curX - drag.offX + 'px', top: drag.curY - drag.offY + 'px' }"
            >
              <div
                v-for="(c, i) in drag.cards"
                :key="c.id"
                class="card"
                :class="{ red: isRed(c.suit) }"
                :style="{ top: i * upGap + 'px' }"
              >
                <span class="card__rank">{{ RANKS[c.rank] }}</span>
                <span class="card__suit">{{ SUITS[c.suit] }}</span>
              </div>
            </div>
          </div>

          <p class="tip">Seret kartu untuk memindahkan · ketuk kartu untuk kirim ke fondasi.</p>

          <div class="tools">
            <button class="mini" type="button" @click="newGame">Baru</button>
          </div>

          <div v-if="phase === 'won'" class="result">
            <p class="result__title">Menang!</p>
            <p class="result__streak">WAKTU {{ timeLabel }} · {{ moves }} langkah</p>
            <button class="cta" type="button" @click="newGame">Main lagi ▸</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/backbar/picker/pick/
   solobar/result come from src/styles.css. */
.solitaire {
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 4px max(12px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(12px, env(safe-area-inset-left));
}
.panel {
  padding: 20px 14px 24px;
}
.brand {
  font-size: 28px;
}
.brand--sm {
  font-size: 22px;
  margin-top: 2px;
}
.picker--3 {
  grid-template-columns: repeat(3, 1fr);
  width: 100%;
}
.setup__picker {
  margin-bottom: 14px;
}
.setup__info {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--muted);
  text-align: center;
  margin-bottom: 20px;
}
.hud {
  margin: 12px 0 14px;
}
.hud b {
  color: var(--aqua-deep);
}

/* ---- Board ---- */
.stage {
  width: 100%;
  margin-bottom: 10px;
}
.top {
  display: grid;
  grid-template-columns: repeat(7, var(--cw));
  gap: 5px;
  justify-content: space-between;
  margin-bottom: 10px;
}
.spacer {
  /* the gap column between waste and foundations */
}
.slot {
  width: var(--cw);
  height: var(--ch);
  position: relative;
  cursor: pointer;
}
.slot__empty {
  width: var(--cw);
  height: var(--ch);
  border: 2px dashed rgba(44, 19, 56, 0.35);
  border-radius: calc(var(--cw) * 0.14);
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: calc(var(--cw) * 0.4);
}
.foundation__ghost {
  font-size: calc(var(--cw) * 0.5);
  color: rgba(44, 19, 56, 0.3);
}

.tableau {
  display: grid;
  grid-template-columns: repeat(7, var(--cw));
  gap: 5px;
  justify-content: space-between;
  max-height: 52vh;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
}
.column {
  position: relative;
  width: var(--cw);
  min-height: var(--ch);
}
.column__empty {
  position: absolute;
  top: 0;
  left: 0;
}

/* ---- Cards ---- */
.card {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--cw);
  height: var(--ch);
  border-radius: calc(var(--cw) * 0.14);
  border: 1.5px solid var(--ink);
  background: var(--paper-lit);
  box-shadow: 0 1px 0 rgba(44, 19, 56, 0.25);
  color: var(--ink);
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}
/* Cards in the top row aren't absolutely stacked in a column. */
.slot .card,
.waste .card {
  position: absolute;
  top: 0;
}
.card.red {
  color: #d3315d;
}
.card__rank {
  position: absolute;
  top: 2px;
  left: 4px;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: calc(var(--cw) * 0.34);
  line-height: 1;
}
.card__suit {
  position: absolute;
  bottom: 2px;
  right: 4px;
  font-size: calc(var(--cw) * 0.4);
  line-height: 1;
}
.card.back {
  background: repeating-linear-gradient(45deg, var(--grape) 0 5px, var(--aqua-deep) 5px 10px);
  border-color: var(--ink);
}
.back__pip {
  position: absolute;
  inset: 18%;
  border-radius: 50%;
  border: 2px solid rgba(255, 243, 223, 0.6);
}
.card.dragging {
  opacity: 0.3;
}

/* The lifted run that follows the pointer. */
.ghost {
  position: fixed;
  z-index: 60;
  width: var(--cw);
  pointer-events: none;
}
.ghost .card {
  box-shadow: 0 5px 12px rgba(44, 19, 56, 0.45);
  outline: 2px solid var(--sun);
  outline-offset: -1px;
}

/* ---- Tip + tools + result ---- */
.tip {
  margin: 6px 0 10px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.02em;
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
  padding-top: 12px;
}
.result__streak {
  margin: 6px 0 14px;
}
</style>
