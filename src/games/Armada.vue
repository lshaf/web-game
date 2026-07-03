<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Armada — a Battleship-style duel. Place your fleet, then take turns firing at
// the opponent's grid. A hit earns another shot; a miss passes the turn. First
// to sink the whole enemy fleet wins.
//   Solo: the CPU places at random and fires with a hunt/target AI.
//   2 Pemain: pass-and-play, with a hand-over screen between placements/turns.

const N = 6
const SHIPS = [4, 3, 2, 2]
const CELLS = Array.from({ length: N * N }, (_, i) => i)

const phase = ref('mode') // mode | place | handoff | play | over
const mode = ref('solo') // solo | duo

function emptyBoard() {
  return { occ: Array(N * N).fill(-1), ships: [], fired: Array(N * N).fill('') }
}
const boards = ref({ 1: emptyBoard(), 2: emptyBoard() })

// placement (drag-and-drop)
const placer = ref(1)
const dragOrient = ref('h')
const tray = ref([]) // remaining ships to place: { id, len }
const dragging = ref(null) // the ship being dragged: { id, len }
const hoverIdx = ref(null) // board cell under the pointer
const ghost = ref(null) // { x, y } floating piece position
let shipUid = 0

// play
const attacker = ref(1)
const busy = ref(false)
const winner = ref(0)

// handoff
const handoffTitle = ref('')
const handoffSub = ref('')
let resumeFn = null

// cpu hunt/target state
let cpuStack = []
let cpuHits = []
let cpuTimer = 0

const rc = (i) => [Math.floor(i / N), i % N]
const toIdx = (r, c) => r * N + c

function cellsFor(r, c, o, len) {
  const cells = []
  for (let k = 0; k < len; k++) {
    const rr = o === 'v' ? r + k : r
    const cc = o === 'h' ? c + k : c
    if (rr < 0 || rr >= N || cc < 0 || cc >= N) return null
    cells.push(toIdx(rr, cc))
  }
  return cells
}
const canPlace = (b, cells) => cells && cells.every((i) => b.occ[i] === -1)
function addShip(b, cells, len) {
  const si = b.ships.length
  b.ships.push({ cells, len, hits: 0 })
  cells.forEach((i) => (b.occ[i] = si))
}
function clearBoard(b) {
  b.occ.fill(-1)
  b.ships = []
}
function autoPlace(b) {
  clearBoard(b)
  for (const len of SHIPS) {
    let ok = false
    let t = 0
    while (!ok && t < 800) {
      t++
      const o = Math.random() < 0.5 ? 'h' : 'v'
      const cells = cellsFor(Math.floor(Math.random() * N), Math.floor(Math.random() * N), o, len)
      if (canPlace(b, cells)) {
        addShip(b, cells, len)
        ok = true
      }
    }
  }
}
function fireAt(b, idx) {
  if (b.fired[idx] !== '') return null
  const si = b.occ[idx]
  if (si >= 0) {
    b.fired[idx] = 'hit'
    const ship = b.ships[si]
    ship.hits++
    return { result: 'hit', sunk: ship.hits === ship.len }
  }
  b.fired[idx] = 'miss'
  return { result: 'miss' }
}
const fleetSunk = (b) => b.ships.length > 0 && b.ships.every((s) => s.hits === s.len)

/* ---- flow ---- */
function reset() {
  clearTimeout(cpuTimer)
  boards.value = { 1: emptyBoard(), 2: emptyBoard() }
  cpuStack = []
  cpuHits = []
  winner.value = 0
  busy.value = false
}
function chooseMode(m) {
  mode.value = m
  reset()
  if (m === 'solo') autoPlace(boards.value[2])
  startPlacement(1)
}
function restart() {
  chooseMode(mode.value)
}
function buildTray() {
  return SHIPS.map((len) => ({ id: shipUid++, len }))
}
function startPlacement(p) {
  placer.value = p
  clearBoard(boards.value[p])
  boards.value[p].fired.fill('')
  tray.value = buildTray()
  dragOrient.value = 'h'
  cancelDrag()
  phase.value = 'place'
}
const rotate = () => (dragOrient.value = dragOrient.value === 'h' ? 'v' : 'h')
function randomize() {
  autoPlace(boards.value[placer.value])
  tray.value = []
  cancelDrag()
}
function clearPlacement() {
  clearBoard(boards.value[placer.value])
  tray.value = buildTray()
  cancelDrag()
}

// The footprint (in-bounds cells, for highlighting) and validity of the piece
// currently being dragged. The footprint still shows the in-bounds part when
// the ship hangs off the edge, so the player gets a red "won't fit" preview.
const previewCells = computed(() => {
  if (!dragging.value || hoverIdx.value == null) return []
  const [r, c] = rc(hoverIdx.value)
  const out = []
  for (let k = 0; k < dragging.value.len; k++) {
    const rr = dragOrient.value === 'v' ? r + k : r
    const cc = dragOrient.value === 'h' ? c + k : c
    if (rr >= 0 && rr < N && cc >= 0 && cc < N) out.push(toIdx(rr, cc))
  }
  return out
})
const previewValid = computed(() => {
  if (!dragging.value || hoverIdx.value == null) return false
  const [r, c] = rc(hoverIdx.value)
  return canPlace(boards.value[placer.value], cellsFor(r, c, dragOrient.value, dragging.value.len))
})
function placeCellClass(idx) {
  if (previewCells.value.includes(idx)) return previewValid.value ? 'is-preview' : 'is-bad'
  return boards.value[placer.value].occ[idx] >= 0 ? 'is-ship' : ''
}

function cellUnder(x, y) {
  const el = document.elementFromPoint(x, y)
  const cell = el && el.closest('[data-idx]')
  return cell ? Number(cell.dataset.idx) : null
}
function startDrag(ship, e) {
  dragging.value = ship
  ghost.value = { x: e.clientX, y: e.clientY }
  hoverIdx.value = cellUnder(e.clientX, e.clientY)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragUp)
  window.addEventListener('pointercancel', onDragUp)
  e.preventDefault()
}
function onDragMove(e) {
  if (!dragging.value) return
  ghost.value = { x: e.clientX, y: e.clientY }
  hoverIdx.value = cellUnder(e.clientX, e.clientY)
  e.preventDefault()
}
function onDragUp(e) {
  if (e.type !== 'pointercancel' && previewValid.value) {
    const [r, c] = rc(hoverIdx.value)
    const cells = cellsFor(r, c, dragOrient.value, dragging.value.len)
    addShip(boards.value[placer.value], cells, dragging.value.len)
    tray.value = tray.value.filter((s) => s.id !== dragging.value.id)
    sfx.tick()
  }
  cancelDrag()
}
function cancelDrag() {
  dragging.value = null
  hoverIdx.value = null
  ghost.value = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragUp)
  window.removeEventListener('pointercancel', onDragUp)
}

// Tap a placed ship to lift it back into the tray.
function removeShipAt(idx) {
  if (dragging.value) return
  const b = boards.value[placer.value]
  const si = b.occ[idx]
  if (si < 0) return
  const ship = b.ships[si]
  b.ships.splice(si, 1)
  b.occ.fill(-1)
  b.ships.forEach((s, i) => s.cells.forEach((k) => (b.occ[k] = i)))
  tray.value.push({ id: shipUid++, len: ship.len })
  sfx.tick()
}

function confirmPlacement() {
  if (tray.value.length) return
  if (mode.value === 'solo') {
    beginPlay()
  } else if (placer.value === 1) {
    goHandoff('Giliran Pemain 2', 'Susun armadamu — layar dirahasiakan.', () => startPlacement(2))
  } else {
    goHandoff('Semua siap', 'Pemain 1 menyerang lebih dulu.', beginPlay)
  }
}
function beginPlay() {
  attacker.value = 1
  busy.value = false
  phase.value = 'play'
}
function goHandoff(title, sub, fn) {
  handoffTitle.value = title
  handoffSub.value = sub
  resumeFn = fn
  phase.value = 'handoff'
}
function handoffReady() {
  const fn = resumeFn
  resumeFn = null
  if (fn) fn()
}

/* ---- play ---- */
const viewer = computed(() => (mode.value === 'solo' ? 1 : attacker.value))
const enemyId = computed(() => (viewer.value === 1 ? 2 : 1))
const enemyBoard = computed(() => boards.value[enemyId.value])
const ownBoard = computed(() => boards.value[viewer.value])
const isOver = computed(() => phase.value === 'over')
const myTurn = computed(
  () => phase.value === 'play' && !busy.value && (mode.value === 'duo' || attacker.value === 1),
)
const status = computed(() => {
  if (mode.value === 'solo') return attacker.value === 1 ? 'Giliranmu — pilih petak' : 'Komputer menyerang...'
  return `Giliran Pemain ${attacker.value}`
})
const outcomeText = computed(() => {
  if (mode.value === 'solo') return winner.value === 1 ? 'Armada lawan tenggelam!' : 'Armadamu tenggelam'
  return `Pemain ${winner.value} menang!`
})
const outcomeLost = computed(() => mode.value === 'solo' && winner.value === 2)

function win(w) {
  winner.value = w
  busy.value = false
  clearTimeout(cpuTimer)
  phase.value = 'over'
  if (mode.value === 'solo') (w === 1 ? sfx.win : sfx.lose)()
  else sfx.win()
}
function endTurn() {
  const next = attacker.value === 1 ? 2 : 1
  attacker.value = next
  if (mode.value === 'solo') {
    if (next === 2) scheduleCpu()
  } else {
    goHandoff(`Giliran Pemain ${next}`, 'Serahkan perangkat — layar dirahasiakan.', () => (phase.value = 'play'))
  }
}
function fire(idx) {
  if (!myTurn.value) return
  const res = fireAt(enemyBoard.value, idx)
  if (!res) return
  if (res.result === 'hit') {
    sfx.tick()
    if (fleetSunk(enemyBoard.value)) win(viewer.value)
    // otherwise the same player fires again (myTurn stays true)
  } else {
    sfx.wrong()
    endTurn()
  }
}

/* ---- CPU AI (solo): hunt randomly, then target around hits along a line ---- */
function scheduleCpu() {
  busy.value = true
  cpuTimer = setTimeout(cpuFire, 650)
}
function cpuPick(b) {
  while (cpuStack.length) {
    const idx = cpuStack.pop()
    if (b.fired[idx] === '') return idx
  }
  const un = []
  const parity = []
  for (let i = 0; i < N * N; i++) {
    if (b.fired[i] === '') {
      un.push(i)
      const [r, c] = rc(i)
      if ((r + c) % 2 === 0) parity.push(i)
    }
  }
  const pool = parity.length ? parity : un
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
}
function cpuAddTargets(b, idx) {
  const rows = cpuHits.map((i) => rc(i)[0])
  const cols = cpuHits.map((i) => rc(i)[1])
  const sameRow = cpuHits.length >= 2 && rows.every((x) => x === rows[0])
  const sameCol = cpuHits.length >= 2 && cols.every((x) => x === cols[0])
  let cands
  if (sameRow) {
    cpuStack = [] // commit to the row line, drop perpendicular guesses
    cands = [[rows[0], Math.min(...cols) - 1], [rows[0], Math.max(...cols) + 1]]
  } else if (sameCol) {
    cpuStack = []
    cands = [[Math.min(...rows) - 1, cols[0]], [Math.max(...rows) + 1, cols[0]]]
  } else {
    const [r, c] = rc(idx)
    cands = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
  }
  for (const [rr, cc] of cands) {
    if (rr >= 0 && rr < N && cc >= 0 && cc < N) {
      const i = toIdx(rr, cc)
      if (b.fired[i] === '' && !cpuStack.includes(i)) cpuStack.push(i)
    }
  }
}
function cpuFire() {
  if (phase.value !== 'play' || attacker.value !== 2) {
    busy.value = false
    return
  }
  const b = boards.value[1]
  const idx = cpuPick(b)
  if (idx == null) {
    busy.value = false
    return
  }
  const res = fireAt(b, idx)
  if (res.result === 'hit') {
    sfx.tick()
    cpuHits.push(idx)
    if (res.sunk) {
      cpuStack = []
      cpuHits = []
    } else {
      cpuAddTargets(b, idx)
    }
    if (fleetSunk(b)) {
      win(2)
      return
    }
    cpuTimer = setTimeout(cpuFire, 650) // hit — fire again
  } else {
    sfx.wrong()
    busy.value = false
    attacker.value = 1
  }
}

/* ---- cell classes ---- */
function enemyClass(idx) {
  const f = enemyBoard.value.fired[idx]
  if (f === 'hit') return 'is-hit'
  if (f === 'miss') return 'is-miss'
  if (isOver.value && enemyBoard.value.occ[idx] >= 0) return 'is-reveal'
  return ''
}
function ownClass(idx) {
  const b = ownBoard.value
  const f = b.fired[idx]
  if (f === 'hit') return 'is-hit'
  if (f === 'miss') return 'is-miss'
  return b.occ[idx] >= 0 ? 'is-ship' : ''
}

function onKeydown(e) {
  if (e.key !== 'Enter') return
  if (phase.value === 'handoff') {
    e.preventDefault()
    handoffReady()
  } else if (phase.value === 'over') {
    e.preventDefault()
    restart()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(cpuTimer)
  cancelDrag()
})
</script>

<template>
  <div class="armada">
    <div class="panel">
      <!-- Mode picker -->
      <section v-if="phase === 'mode'" class="screen">
        <p class="brand">ARMA<span class="brand__accent">DA</span></p>
        <p class="eyebrow">PILIH MODE</p>
        <button class="cta" type="button" @click="chooseMode('solo')">Lawan Komputer ▸</button>
        <button class="cta cta--alt" type="button" @click="chooseMode('duo')">2 Pemain ▸</button>
      </section>

      <!-- Placement (drag ships from the tray onto the board) -->
      <section v-else-if="phase === 'place'" class="screen">
        <div class="backbar"><button class="mini" type="button" @click="phase = 'mode'">← Mode</button></div>
        <p class="brand">ARMA<span class="brand__accent">DA</span></p>
        <p class="eyebrow">PEMAIN {{ placer }} · SUSUN ARMADA</p>

        <div class="board board--place">
          <button
            v-for="i in CELLS"
            :key="i"
            class="cell"
            :class="placeCellClass(i)"
            :data-idx="i"
            type="button"
            @click="removeShipAt(i)"
          />
        </div>

        <div v-if="tray.length" class="tray">
          <div
            v-for="s in tray"
            :key="s.id"
            class="tray-ship"
            :class="{ 'is-v': dragOrient === 'v', 'is-dragging': dragging && dragging.id === s.id }"
            @pointerdown="startDrag(s, $event)"
          >
            <span v-for="k in s.len" :key="k" class="tray-cell" />
          </div>
        </div>

        <div class="place-bar">
          <button class="mini" type="button" @click="rotate">Putar {{ dragOrient === 'h' ? '↔' : '↕' }}</button>
          <button class="mini" type="button" @click="randomize">Acak</button>
          <button class="mini" type="button" @click="clearPlacement">Ulang</button>
        </div>
        <p class="hint">{{ tray.length ? 'Seret kapal ke papan · ketuk kapal untuk mengangkat' : 'Semua kapal siap' }}</p>
        <button class="cta" :disabled="tray.length > 0" type="button" @click="confirmPlacement">Siap ▸</button>

        <!-- floating piece that follows the pointer while dragging -->
        <div
          v-if="dragging"
          class="ghost"
          :class="{ 'is-v': dragOrient === 'v' }"
          :style="{ left: ghost.x + 'px', top: ghost.y + 'px' }"
        >
          <span v-for="k in dragging.len" :key="k" class="ghost-cell" />
        </div>
      </section>

      <!-- Handoff -->
      <section v-else-if="phase === 'handoff'" class="screen handoff">
        <span class="lock-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.2" />
            <rect x="4.5" y="10" width="15" height="11.5" rx="2.5" fill="currentColor" />
          </svg>
        </span>
        <p class="handoff__title">{{ handoffTitle }}</p>
        <p class="handoff__sub">{{ handoffSub }}</p>
        <button class="cta" type="button" @click="handoffReady">Siap ▸</button>
      </section>

      <!-- Play / Over -->
      <section v-else class="screen play">
        <div class="backbar"><button class="mini" type="button" @click="phase = 'mode'">← Mode</button></div>

        <p v-if="isOver" class="outcome" :class="{ 'is-lost': outcomeLost }">{{ outcomeText }}</p>
        <p v-else class="hint hint--turn">{{ status }}</p>

        <span class="board-label">Papan lawan</span>
        <div class="board board--fire">
          <button
            v-for="i in CELLS"
            :key="i"
            class="cell"
            :class="enemyClass(i)"
            type="button"
            :disabled="!myTurn || enemyBoard.fired[i] !== ''"
            @click="fire(i)"
          >
            <span v-if="enemyBoard.fired[i] === 'hit'" class="mark mark--hit" />
            <span v-else-if="enemyBoard.fired[i] === 'miss'" class="mark mark--miss" />
          </button>
        </div>

        <span class="board-label">Armadamu</span>
        <div class="board board--mini">
          <div v-for="i in CELLS" :key="i" class="cell" :class="ownClass(i)">
            <span v-if="ownBoard.fired[i] === 'hit'" class="mark mark--hit" />
            <span v-else-if="ownBoard.fired[i] === 'miss'" class="mark mark--miss" />
          </div>
        </div>

        <button v-if="isOver" class="cta" type="button" @click="restart">Main lagi ▸</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/backbar/handoff come
   from src/styles.css (see docs/STYLE.md). */
.armada {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 20px 26px;
}
.brand {
  font-size: 34px;
}
.play {
  width: 100%;
}

.hint {
  margin: 0 0 14px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--muted);
  text-align: center;
}
.hint--turn {
  font-family: var(--font-display);
  font-size: 16px;
  color: var(--ink);
  letter-spacing: 0;
}

.outcome {
  margin: 0 0 14px;
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--aqua-deep);
}
.outcome.is-lost {
  color: var(--berry);
}

.board-label {
  align-self: flex-start;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 6px;
}

/* ---- Board ---- */
.board {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  padding: 6px;
  margin-bottom: 16px;
  background: #3f78e0;
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  box-shadow: var(--pop);
}
.board--mini {
  max-width: 66%;
  align-self: center;
  box-shadow: var(--pop-sm);
}

.cell {
  aspect-ratio: 1;
  padding: 0;
  display: grid;
  place-items: center;
  background: #bcd6ff;
  border: 2px solid var(--ink);
  border-radius: 6px;
}
.board--fire .cell:not(:disabled) {
  cursor: pointer;
}
.board--fire .cell:not(:disabled):hover {
  background: var(--sun);
}
.cell.is-ship {
  background: var(--grape);
}
.cell.is-reveal {
  background: rgba(123, 91, 230, 0.55);
}
.cell.is-hit {
  background: var(--berry);
}

.mark {
  border-radius: 50%;
}
.mark--hit {
  width: 42%;
  height: 42%;
  background: var(--ink);
}
.mark--miss {
  width: 26%;
  height: 26%;
  background: var(--muted);
}

/* ---- Placement (drag & drop) ---- */
.board--place {
  touch-action: none; /* the drag owns the gesture — don't scroll the page */
}
.board--place .cell {
  cursor: pointer;
}
.cell.is-preview {
  background: var(--aqua);
}
.cell.is-bad {
  background: var(--berry);
}

.tray {
  width: 100%;
  min-height: 30px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  align-items: center;
  margin-bottom: 12px;
}
.tray-ship {
  display: flex;
  gap: 3px;
  padding: 4px;
  border-radius: 8px;
  background: rgba(123, 91, 230, 0.12);
  cursor: grab;
  touch-action: none;
}
.tray-ship.is-v {
  flex-direction: column;
}
.tray-ship.is-dragging {
  opacity: 0.35;
}
.tray-cell {
  width: 22px;
  height: 22px;
  background: var(--grape);
  border: 2px solid var(--ink);
  border-radius: 5px;
}

/* The floating piece under the pointer while dragging. */
.ghost {
  position: fixed;
  z-index: 60;
  transform: translate(-50%, -50%);
  display: flex;
  gap: 3px;
  pointer-events: none;
}
.ghost.is-v {
  flex-direction: column;
}
.ghost-cell {
  width: 30px;
  height: 30px;
  background: var(--grape);
  border: 2.5px solid var(--ink);
  border-radius: 6px;
  box-shadow: var(--pop-sm);
}

.place-bar {
  width: 100%;
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 10px;
}
</style>
