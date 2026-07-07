<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Dam Tiga (Nine Men's Morris) — place nine pieces each, then slide them along the
// lines. Line up three on a line to form a mill and take one of the opponent's
// pieces. Cut a player to two pieces, or leave them with no move, and you win.
// Down to three pieces you may "fly" anywhere. Play the CPU or pass-and-play.

// Board points on a 0–6 grid: outer square, middle square, inner square.
const POINTS = [
  [0, 0], [3, 0], [6, 0], [6, 3], [6, 6], [3, 6], [0, 6], [0, 3],
  [1, 1], [3, 1], [5, 1], [5, 3], [5, 5], [3, 5], [1, 5], [1, 3],
  [2, 2], [3, 2], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [2, 3],
]
const ADJ = [
  [1, 7], [0, 2, 9], [1, 3], [2, 4, 11], [3, 5], [4, 6, 13], [5, 7], [6, 0, 15],
  [9, 15], [8, 10, 1, 17], [9, 11], [10, 12, 3, 19], [11, 13], [12, 14, 5, 21], [13, 15], [14, 8, 7, 23],
  [17, 23], [16, 18, 9], [17, 19], [18, 20, 11], [19, 21], [20, 22, 13], [21, 23], [22, 16, 15],
]
const MILLS = [
  [0, 1, 2], [2, 3, 4], [4, 5, 6], [6, 7, 0],
  [8, 9, 10], [10, 11, 12], [12, 13, 14], [14, 15, 8],
  [16, 17, 18], [18, 19, 20], [20, 21, 22], [22, 23, 16],
  [1, 9, 17], [3, 11, 19], [5, 13, 21], [7, 15, 23],
]
// Unique lines between adjacent points, for drawing the board.
const LINES = []
ADJ.forEach((ns, a) => ns.forEach((b) => a < b && LINES.push([a, b])))

const sx = (i) => 6 + POINTS[i][0] * (88 / 6)
const sy = (i) => 6 + POINTS[i][1] * (88 / 6)

const mode = ref(null) // null (picker) | 'cpu' | 'duo'
const board = ref(Array(24).fill(0)) // 0 empty, 1 you/P1, 2 cpu/P2
const turn = ref(1)
const hand = ref([0, 9, 9]) // pieces left to place, indexed by player
const selected = ref(-1)
const mustRemove = ref(false)
const winner = ref(0)
let cpuTimer = 0

const onBoard = (p) => board.value.filter((x) => x === p).length
const placing = computed(() => hand.value[1] > 0 || hand.value[2] > 0)
const flying = (p) => !placing.value && onBoard(p) === 3
const isCpuTurn = computed(() => mode.value === 'cpu' && turn.value === 2 && !winner.value)

// Every mill fully owned by `p` that runs through point `i`.
function millThrough(b, i, p) {
  return MILLS.some((m) => m.includes(i) && m.every((x) => b[x] === p))
}
function completesMill(b, i, p) {
  return MILLS.some((m) => m.includes(i) && m.every((x) => x === i || b[x] === p))
}

// Opponent pieces that may be captured: those outside a mill, unless every one
// of them is in a mill (then any is fair game).
function removable(p) {
  const opp = 3 - p
  const idx = []
  for (let i = 0; i < 24; i++) if (board.value[i] === opp) idx.push(i)
  const open = idx.filter((i) => !millThrough(board.value, i, opp))
  return open.length ? open : idx
}

function legalMoves(b, p) {
  const moves = []
  const fly = onBoard(p) === 3
  for (let i = 0; i < 24; i++) {
    if (b[i] !== p) continue
    const targets = fly ? b.map((v, j) => (v === 0 ? j : -1)).filter((j) => j >= 0) : ADJ[i].filter((j) => b[j] === 0)
    for (const t of targets) moves.push([i, t])
  }
  return moves
}

// --- Turn flow --------------------------------------------------------------

function startGame(m) {
  mode.value = m
  board.value = Array(24).fill(0)
  turn.value = 1
  hand.value = [0, 9, 9]
  selected.value = -1
  mustRemove.value = false
  winner.value = 0
  clearTimeout(cpuTimer)
}
function toMenu() {
  clearTimeout(cpuTimer)
  mode.value = null
}

// After a placement/move that formed a mill, the mover captures a piece.
function afterMill(mover) {
  mustRemove.value = true
  if (mode.value === 'cpu' && mover === 2) cpuTimer = setTimeout(cpuRemove, 550)
}

function place(i) {
  board.value[i] = turn.value
  hand.value[turn.value]--
  sfx.tick()
  if (completesMill(board.value, i, turn.value)) afterMill(turn.value)
  else endTurn()
}

function moveTo(i) {
  const from = selected.value
  board.value[from] = 0
  board.value[i] = turn.value
  selected.value = -1
  sfx.tick()
  if (completesMill(board.value, i, turn.value)) afterMill(turn.value)
  else endTurn()
}

function remove(i) {
  board.value[i] = 0
  mustRemove.value = false
  sfx.tick()
  endTurn()
}

function endTurn() {
  const next = 3 - turn.value
  // Loss checks apply once the placing phase is over.
  if (hand.value[1] === 0 && hand.value[2] === 0) {
    if (onBoard(next) < 3 || legalMoves(board.value, next).length === 0) {
      winner.value = turn.value
      sfx.win()
      return
    }
  }
  turn.value = next
  if (isCpuTurn.value) cpuTimer = setTimeout(cpuAct, 550)
}

// --- Player input -----------------------------------------------------------

function tap(i) {
  if (winner.value || isCpuTurn.value) return
  if (mustRemove.value) {
    if (removable(turn.value).includes(i)) remove(i)
    return
  }
  if (placing.value) {
    if (board.value[i] === 0) place(i)
    return
  }
  // Moving phase
  if (board.value[i] === turn.value) {
    selected.value = selected.value === i ? -1 : i
    return
  }
  if (selected.value >= 0 && board.value[i] === 0) {
    const canFly = flying(turn.value)
    if (canFly || ADJ[selected.value].includes(i)) moveTo(i)
  }
}

// --- CPU (greedy: make mills, block mills, else improve) --------------------

function scorePlace(b, i, p) {
  if (completesMill(b, i, p)) return 100
  if (completesMill(b, i, 3 - p)) return 60 // block
  // reward spots that build our own two-in-a-lines and sit on busy junctions
  let s = ADJ[i].length
  for (const m of MILLS) {
    if (!m.includes(i)) continue
    const mine = m.filter((x) => b[x] === p).length
    const opp = m.filter((x) => b[x] === 3 - p).length
    if (opp === 0) s += mine * 3
  }
  return s
}

function cpuAct() {
  if (winner.value || turn.value !== 2) return
  const b = board.value
  if (placing.value) {
    let best = -1
    let bestScore = -Infinity
    for (let i = 0; i < 24; i++) {
      if (b[i] !== 0) continue
      const s = scorePlace(b, i, 2)
      if (s > bestScore) {
        bestScore = s
        best = i
      }
    }
    if (best >= 0) place(best)
    return
  }
  // Moving: pick the move with the best resulting score.
  const moves = legalMoves(b, 2)
  if (!moves.length) {
    winner.value = 1
    sfx.win()
    return
  }
  let bestMove = moves[0]
  let bestScore = -Infinity
  for (const [from, to] of moves) {
    const nb = b.slice()
    nb[from] = 0
    nb[to] = 2
    let s = 0
    if (completesMill(nb, to, 2)) s += 100
    if (completesMill(b, to, 1)) s += 40 // moving onto a square the player wanted
    for (const m of MILLS) {
      if (!m.includes(to)) continue
      const mine = m.filter((x) => nb[x] === 2).length
      if (m.filter((x) => nb[x] === 1).length === 0) s += mine * 3
    }
    if (s > bestScore) {
      bestScore = s
      bestMove = [from, to]
    }
  }
  selected.value = bestMove[0]
  moveTo(bestMove[1])
}

function cpuRemove() {
  const opts = removable(2)
  // Prefer removing a player piece that threatens a mill, else the busiest.
  let best = opts[0]
  let bestScore = -Infinity
  for (const i of opts) {
    let s = ADJ[i].length
    for (const m of MILLS) {
      if (!m.includes(i)) continue
      if (m.filter((x) => board.value[x] === 1).length === 2 && m.some((x) => board.value[x] === 0)) s += 20
    }
    if (s > bestScore) {
      bestScore = s
      best = i
    }
  }
  remove(best)
}

// --- Presentation -----------------------------------------------------------

const status = computed(() => {
  if (winner.value) {
    if (mode.value === 'cpu') return winner.value === 1 ? 'Kamu menang!' : 'CPU menang.'
    return `Pemain ${winner.value} menang!`
  }
  const who = mode.value === 'cpu' ? (turn.value === 1 ? 'Kamu' : 'CPU') : `Pemain ${turn.value}`
  if (isCpuTurn.value) return 'CPU berpikir…'
  if (mustRemove.value) return `${who} — ambil bidak lawan`
  if (placing.value) return `${who} — taruh bidak`
  return `${who} — jalankan bidak`
})
const removeSet = computed(() => (mustRemove.value && !isCpuTurn.value ? new Set(removable(turn.value)) : new Set()))
const moveTargets = computed(() => {
  if (winner.value || isCpuTurn.value || mustRemove.value || placing.value || selected.value < 0) return new Set()
  const canFly = flying(turn.value)
  return new Set(
    board.value.map((v, j) => (v === 0 && (canFly || ADJ[selected.value].includes(j)) ? j : -1)).filter((j) => j >= 0),
  )
})

function pointClass(i) {
  return {
    'pt--p1': board.value[i] === 1,
    'pt--p2': board.value[i] === 2,
    'pt--sel': selected.value === i,
    'pt--target': moveTargets.value.has(i),
    'pt--removable': removeSet.value.has(i),
  }
}

onBeforeUnmount(() => clearTimeout(cpuTimer))
</script>

<template>
  <div class="dam">
    <div class="panel">
      <section class="screen">
        <p class="brand">DAM<span class="brand__accent"> TIGA</span></p>

        <template v-if="!mode">
          <p class="eyebrow">PILIH MODE</p>
          <button class="cta" type="button" @click="startGame('cpu')">Solo ▸</button>
          <button class="cta cta--alt" type="button" @click="startGame('duo')">Duo ▸</button>
        </template>

        <template v-else>
          <p class="eyebrow">SUSUN TIGA, AMBIL BIDAK</p>

          <div class="solobar hud">
            <span :class="{ hud__on: turn === 1 && !winner }">
              {{ mode === 'cpu' ? 'KAMU' : 'P1' }} <b>{{ onBoard(1) + hand[1] }}</b>
            </span>
            <span :class="{ hud__on: turn === 2 && !winner }">
              {{ mode === 'cpu' ? 'CPU' : 'P2' }} <b>{{ onBoard(2) + hand[2] }}</b>
            </span>
          </div>

          <p class="status" :class="{ 'status--over': winner }">{{ status }}</p>

          <svg class="board" viewBox="0 0 100 100">
            <g stroke="var(--ink)" stroke-width="1.4" stroke-linecap="round">
              <line v-for="(l, i) in LINES" :key="i" :x1="sx(l[0])" :y1="sy(l[0])" :x2="sx(l[1])" :y2="sy(l[1])" />
            </g>
            <g>
              <circle
                v-for="(v, i) in board"
                :key="i"
                class="pt"
                :class="pointClass(i)"
                :cx="sx(i)"
                :cy="sy(i)"
                :r="v === 0 ? 3 : 5"
                @click="tap(i)"
              />
            </g>
          </svg>

          <div class="tools">
            <button class="mini" type="button" @click="startGame(mode)">Ulang</button>
            <button class="mini" type="button" @click="toMenu">Ganti mode</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/solobar come from
   src/styles.css. */
.dam {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 18px 26px;
}
.brand {
  font-size: 30px;
}
.hud {
  margin: 12px 0 6px;
}
.hud b {
  color: var(--aqua-deep);
}
.hud__on {
  color: var(--sun-core);
  font-weight: 800;
}
.status {
  margin: 4px 0 10px;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 15px;
  color: var(--ink);
  text-align: center;
}
.status--over {
  color: var(--berry);
  font-size: 18px;
}

/* ---- Board ---- */
.board {
  width: 100%;
  max-width: 320px;
  margin: 0 auto 14px;
  display: block;
  overflow: visible;
}
.pt {
  fill: var(--cream);
  stroke: var(--ink);
  stroke-width: 1.5;
  cursor: pointer;
  transition: r 0.1s ease, fill 0.1s ease;
}
.pt--p1 {
  fill: var(--sun);
}
.pt--p2 {
  fill: var(--aqua);
}
.pt--sel {
  stroke: var(--berry);
  stroke-width: 3;
}
.pt--target {
  fill: #d9f6ef;
  stroke-dasharray: 2 2;
}
.pt--removable {
  stroke: var(--berry);
  stroke-width: 3;
}

/* ---- Tools ---- */
.tools {
  display: flex;
  justify-content: center;
  gap: 10px;
}
.cta--alt {
  margin-top: 10px;
}
</style>
