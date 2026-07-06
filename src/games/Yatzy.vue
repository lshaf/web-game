<script setup>
import { ref, computed, onMounted } from 'vue'
import { sfx } from '../sound.js'

// Yatzy — the dice game. Roll five dice up to three times a turn, holding the
// ones you like between rolls, then bank them into one of thirteen categories.
// Fill the upper section past 63 for a +35 bonus. Play solo (chase your best
// total) or pass-and-play against a friend. Thirteen turns each; highest total
// wins.

const BEST_KEY = 'dusk-yatzy-best'

// Longest run of consecutive faces present, for the straights.
function hasRun(counts, len) {
  let best = 0
  let run = 0
  for (let i = 0; i < 6; i++) {
    if (counts[i] > 0) {
      run++
      best = Math.max(best, run)
    } else {
      run = 0
    }
  }
  return best >= len
}

// The scorecard. `up` marks the six upper-section boxes; `fn(counts, sum)` gives
// the score the current dice would bank in that box.
const CATS = [
  { key: 's1', label: 'Angka 1', up: true, fn: (c) => c[0] * 1 },
  { key: 's2', label: 'Angka 2', up: true, fn: (c) => c[1] * 2 },
  { key: 's3', label: 'Angka 3', up: true, fn: (c) => c[2] * 3 },
  { key: 's4', label: 'Angka 4', up: true, fn: (c) => c[3] * 4 },
  { key: 's5', label: 'Angka 5', up: true, fn: (c) => c[4] * 5 },
  { key: 's6', label: 'Angka 6', up: true, fn: (c) => c[5] * 6 },
  { key: 'k3', label: '3 Sama', fn: (c, s) => (c.some((x) => x >= 3) ? s : 0) },
  { key: 'k4', label: '4 Sama', fn: (c, s) => (c.some((x) => x >= 4) ? s : 0) },
  { key: 'fh', label: 'Full House', fn: (c) => (c.includes(2) && c.includes(3) ? 25 : 0) },
  { key: 'ss', label: 'Straight Kecil', fn: (c) => (hasRun(c, 4) ? 30 : 0) },
  { key: 'ls', label: 'Straight Besar', fn: (c) => (hasRun(c, 5) ? 40 : 0) },
  { key: 'yz', label: 'Yatzy', fn: (c) => (c.some((x) => x === 5) ? 50 : 0) },
  { key: 'ch', label: 'Bebas', fn: (c, s) => s },
]
const UPPER_KEYS = CATS.filter((c) => c.up).map((c) => c.key)

// Pip layout per face on a 3×3 grid (index 0..8, row-major).
const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

const mode = ref(null) // null (picker) | 'solo' | 'duo'
const current = ref(0) // active player index
const dice = ref([]) // { value, held }
const rollsLeft = ref(3)
const rolled = ref(false) // has the turn's first roll happened
const sheets = ref([{}, {}]) // per-player: category key -> banked score
const phase = ref('play') // play | over
const best = ref(0) // best solo total

function freshDice() {
  return Array.from({ length: 5 }, () => ({ value: 1, held: false }))
}

function startGame(m) {
  mode.value = m
  current.value = 0
  sheets.value = [{}, {}]
  phase.value = 'play'
  newTurn()
}

function newTurn() {
  dice.value = freshDice()
  rollsLeft.value = 3
  rolled.value = false
}

const playerCount = computed(() => (mode.value === 'duo' ? 2 : 1))

// Face counts [ones..sixes] and pip sum of the current dice.
const counts = computed(() => {
  const c = [0, 0, 0, 0, 0, 0]
  for (const d of dice.value) c[d.value - 1]++
  return c
})
const pipSum = computed(() => dice.value.reduce((a, d) => a + d.value, 0))

function roll() {
  if (phase.value !== 'play' || rollsLeft.value <= 0) return
  for (const d of dice.value) if (!d.held) d.value = 1 + Math.floor(Math.random() * 6)
  rollsLeft.value -= 1
  rolled.value = true
  sfx.tick()
}

function toggleHold(i) {
  if (!rolled.value || phase.value !== 'play') return
  dice.value[i].held = !dice.value[i].held
}

// The score a category would bank right now (null until the dice are rolled).
function preview(cat) {
  if (!rolled.value) return null
  return cat.fn(counts.value, pipSum.value)
}

function banked(player, key) {
  const v = sheets.value[player][key]
  return v === undefined ? null : v
}

function upperTotal(player) {
  return UPPER_KEYS.reduce((a, k) => a + (sheets.value[player][k] || 0), 0)
}
function bonus(player) {
  return upperTotal(player) >= 63 ? 35 : 0
}
function total(player) {
  const s = sheets.value[player]
  let sum = bonus(player)
  for (const k in s) sum += s[k]
  return sum
}
function filledCount(player) {
  return Object.keys(sheets.value[player]).length
}

// Bank the current dice into a category for the active player, then hand off.
function choose(cat) {
  if (phase.value !== 'play' || !rolled.value) return
  if (banked(current.value, cat.key) !== null) return
  sheets.value[current.value][cat.key] = cat.fn(counts.value, pipSum.value)
  sfx.tick()
  const done = Array.from({ length: playerCount.value }, (_, p) => filledCount(p)).every(
    (n) => n >= CATS.length,
  )
  if (done) {
    endGame()
    return
  }
  if (mode.value === 'duo') current.value = 1 - current.value
  newTurn()
}

function endGame() {
  phase.value = 'over'
  sfx.win()
  if (mode.value === 'solo' && total(0) > best.value) {
    best.value = total(0)
    try {
      localStorage.setItem(BEST_KEY, String(best.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory */
    }
  }
}

const rollLabel = computed(() => {
  if (rollsLeft.value === 3) return 'Kocok dadu'
  if (rollsLeft.value === 0) return 'Pilih kotak nilai'
  return `Kocok lagi (${rollsLeft.value})`
})

const result = computed(() => {
  if (mode.value === 'solo') return { title: 'Selesai!', sub: `Skor ${total(0)}` }
  const a = total(0)
  const b = total(1)
  if (a === b) return { title: 'Seri!', sub: `${a} — ${b}` }
  return { title: a > b ? 'Pemain 1 menang!' : 'Pemain 2 menang!', sub: `${a} — ${b}` }
})

function isCurrent(player) {
  return mode.value === 'duo' && current.value === player
}
// A category cell is tappable for the active player once the dice are rolled and
// the box is still empty.
function cellActive(player, key) {
  return (
    phase.value === 'play' &&
    rolled.value &&
    player === current.value &&
    banked(player, key) === null
  )
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(BEST_KEY)) || 0
  } catch (e) {
    best.value = 0
  }
})
</script>

<template>
  <div class="yatzy">
    <div class="panel">
      <section class="screen">
        <p class="brand">YAT<span class="brand__accent">ZY</span></p>
        <p class="eyebrow">{{ mode ? 'KOCOK LIMA DADU, KEJAR SKOR' : 'PILIH MODE' }}</p>

        <!-- Mode picker: full-width stacked CTAs, like ConnectFour/Suit. -->
        <template v-if="!mode">
          <button class="cta" type="button" @click="startGame('solo')">Solo ▸</button>
          <button class="cta cta--alt" type="button" @click="startGame('duo')">Duo ▸</button>
          <p class="modes__best">TERBAIK {{ best }}</p>
        </template>

        <template v-else>
          <div class="solobar hud">
            <span v-if="mode === 'solo'">SKOR <b>{{ total(0) }}</b></span>
            <span v-else :class="{ 'hud__turn': isCurrent(0) }">P1 <b>{{ total(0) }}</b></span>
            <span v-if="mode === 'solo'" class="solobar__best">TERBAIK {{ best }}</span>
            <span v-else :class="{ 'hud__turn': isCurrent(1) }">P2 <b>{{ total(1) }}</b></span>
          </div>

          <!-- Dice + roll -->
          <div class="dicerow">
            <button
              v-for="(d, i) in dice"
              :key="i"
              class="die"
              type="button"
              :class="{ 'is-held': d.held, 'is-idle': !rolled }"
              @click="toggleHold(i)"
            >
              <span
                v-for="p in 9"
                :key="p"
                class="pip"
                :class="{ 'is-on': rolled && PIPS[d.value].includes(p - 1) }"
              />
            </button>
          </div>

          <button
            v-if="phase === 'play'"
            class="cta"
            type="button"
            :disabled="rollsLeft <= 0"
            @click="roll"
          >
            {{ rollLabel }}
          </button>
          <p v-if="phase === 'play'" class="tip">
            {{ rolled ? 'Ketuk dadu untuk tahan, lalu isi satu kotak.' : 'Kocok untuk memulai giliran.' }}
          </p>

          <!-- Scorecard -->
          <div class="card" :class="{ 'card--duo': mode === 'duo' }">
            <div v-for="cat in CATS" :key="cat.key" class="crow">
              <span class="crow__label">{{ cat.label }}</span>
              <template v-if="mode === 'solo'">
                <button
                  class="crow__cell"
                  type="button"
                  :class="{ 'is-open': cellActive(0, cat.key), 'is-set': banked(0, cat.key) !== null }"
                  :disabled="!cellActive(0, cat.key)"
                  @click="choose(cat)"
                >
                  <template v-if="banked(0, cat.key) !== null">{{ banked(0, cat.key) }}</template>
                  <template v-else-if="cellActive(0, cat.key)">{{ preview(cat) }}</template>
                </button>
              </template>
              <template v-else>
                <button
                  v-for="p in 2"
                  :key="p"
                  class="crow__cell"
                  type="button"
                  :class="{
                    'is-open': cellActive(p - 1, cat.key),
                    'is-set': banked(p - 1, cat.key) !== null,
                  }"
                  :disabled="!cellActive(p - 1, cat.key)"
                  @click="choose(cat)"
                >
                  <template v-if="banked(p - 1, cat.key) !== null">{{ banked(p - 1, cat.key) }}</template>
                  <template v-else-if="cellActive(p - 1, cat.key)">{{ preview(cat) }}</template>
                </button>
              </template>
            </div>
            <div class="crow crow--sum">
              <span class="crow__label">Bonus atas (≥63)</span>
              <span v-if="mode === 'solo'" class="crow__cell is-sum">{{ bonus(0) }}</span>
              <template v-else>
                <span class="crow__cell is-sum">{{ bonus(0) }}</span>
                <span class="crow__cell is-sum">{{ bonus(1) }}</span>
              </template>
            </div>
          </div>

          <div v-if="phase === 'over'" class="result">
            <p class="result__title">{{ result.title }}</p>
            <p class="result__streak">{{ result.sub }}</p>
            <button class="cta" type="button" @click="startGame(mode)">Main lagi ▸</button>
            <button class="mini modes__again" type="button" @click="mode = null">
              Ganti mode
            </button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/solobar/result come
   from src/styles.css. */
.yatzy {
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 18px 26px;
}
.brand {
  font-size: 32px;
}

/* ---- Mode picker (shared .cta buttons, stacked) ---- */
.modes__best {
  margin-top: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.modes__again {
  margin-top: 10px;
}

.hud {
  margin-bottom: 14px;
}
.hud b {
  color: var(--aqua-deep);
}
.hud__turn {
  color: var(--sun-core);
  font-weight: 800;
}

/* ---- Dice ---- */
.dicerow {
  display: flex;
  justify-content: center;
  gap: clamp(6px, 2.4vw, 12px);
  margin: 6px 0 14px;
}
.die {
  --d: clamp(44px, 15vw, 58px);
  width: var(--d);
  height: var(--d);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 2px;
  padding: 7px;
  background: var(--cream);
  border: 2.5px solid var(--ink);
  border-radius: 12px;
  box-shadow: var(--pop-sm);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.09s ease, background 0.12s ease, box-shadow 0.09s ease;
}
.die.is-held {
  background: var(--sun);
  transform: translateY(4px);
  box-shadow: 2px 2px 0 var(--ink);
}
.die.is-idle {
  opacity: 0.55;
}
.pip {
  border-radius: 50%;
  background: transparent;
}
.pip.is-on {
  background: var(--ink);
}

/* ---- Roll + tip ---- */
.tip {
  margin: 12px 0;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--muted);
  text-align: center;
}

/* ---- Scorecard ---- */
.card {
  width: 100%;
  border: 2px solid var(--ink);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--pop-sm);
}
.crow {
  display: grid;
  grid-template-columns: 1fr 56px;
  align-items: stretch;
  border-bottom: 1.5px solid rgba(44, 19, 56, 0.18);
}
.card--duo .crow {
  grid-template-columns: 1fr 52px 52px;
}
.crow:last-child {
  border-bottom: none;
}
.crow__label {
  display: flex;
  align-items: center;
  padding: 0 12px;
  min-height: 32px;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink);
}
.crow__cell {
  display: grid;
  place-items: center;
  min-height: 32px;
  font-family: var(--font-display);
  font-size: 16px;
  color: var(--ink);
  background: var(--paper-lit);
  border: none;
  border-left: 1.5px solid rgba(44, 19, 56, 0.18);
  -webkit-tap-highlight-color: transparent;
}
.crow__cell.is-open {
  background: #d9f6ef;
  color: var(--aqua-deep);
  cursor: pointer;
}
.crow__cell.is-set {
  background: var(--cream);
}
.crow--sum {
  background: rgba(44, 19, 56, 0.05);
}
.crow--sum .crow__label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.crow__cell.is-sum {
  background: transparent;
  font-size: 14px;
  color: var(--muted);
}

/* ---- Result ---- */
.result {
  width: 100%;
  text-align: center;
  padding-top: 14px;
}
.result__streak {
  margin: 6px 0 14px;
  font-size: 18px;
}
</style>
