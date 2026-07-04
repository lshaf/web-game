<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Dorong Kotak (Sokoban) with RANDOM, always-solvable levels + wall obstacles.
// Puzzles are built by reverse generation: start from the solved state (every
// crate on its target) and drag crates backwards with legal "pulls". Replaying
// those pulls forward is a guaranteed solution, so no level is ever impossible.
// Each new level is a little bigger with more crates and more obstacles.

const level = ref(1)
const grid = ref([]) // 2D 'wall' | 'floor' | 'goal'
const goals = ref([]) // [{r,c}]
const boxes = ref([]) // [{r,c}]
const player = ref({ r: 0, c: 0 })
const rows = ref(0)
const cols = ref(0)
const moves = ref(0)
const history = ref([])
let initial = null // snapshot to restore on reset

const key = (r, c) => r + ',' + c
const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

function boxIndex(r, c) {
  return boxes.value.findIndex((b) => b.r === r && b.c === c)
}
function isGoal(gs, r, c) {
  return gs.some((g) => g.r === r && g.c === c)
}

const solved = computed(
  () => goals.value.length > 0 && goals.value.every((g) => boxIndex(g.r, g.c) >= 0),
)

const flatCells = computed(() => {
  const out = []
  const g = grid.value
  for (let r = 0; r < rows.value; r++) {
    for (let c = 0; c < cols.value; c++) {
      out.push({
        base: g[r][c],
        goal: g[r][c] === 'goal',
        box: boxIndex(r, c) >= 0,
        player: player.value.r === r && player.value.c === c,
      })
    }
  }
  return out
})

/* ---- Random level generator (reverse pulls) ---- */

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

// Flood the floor cells reachable from `start` (walls + crates block).
function reachable(start, wall, boxKeys, H, W) {
  const seen = new Set([key(start.r, start.c)])
  const stack = [start]
  while (stack.length) {
    const { r, c } = stack.pop()
    for (const [dr, dc] of DIRS) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue
      const k = key(nr, nc)
      if (wall[nr][nc] || boxKeys.has(k) || seen.has(k)) continue
      seen.add(k)
      stack.push({ r: nr, c: nc })
    }
  }
  return seen
}

// Are all interior floor cells connected? (obstacles must not wall anything off)
function allFloorConnected(wall, H, W) {
  let start = null
  let total = 0
  for (let r = 1; r < H - 1; r++) {
    for (let c = 1; c < W - 1; c++) {
      if (!wall[r][c]) {
        total++
        if (!start) start = { r, c }
      }
    }
  }
  if (!start) return false
  const seen = reachable(start, wall, new Set(), H, W)
  let cnt = 0
  for (const k of seen) {
    const [r, c] = k.split(',').map(Number)
    if (r > 0 && c > 0 && r < H - 1 && c < W - 1 && !wall[r][c]) cnt++
  }
  return cnt === total
}

function tryGenerate(W, H, nBoxes, nObstacles, pulls) {
  const wall = Array.from({ length: H }, (_, r) =>
    Array.from({ length: W }, (_, c) => r === 0 || c === 0 || r === H - 1 || c === W - 1),
  )

  // Scatter interior wall obstacles, keeping the floor fully connected.
  const interior = []
  for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) interior.push([r, c])
  shuffle(interior)
  let placed = 0
  for (const [r, c] of interior) {
    if (placed >= nObstacles) break
    wall[r][c] = true
    if (!allFloorConnected(wall, H, W)) wall[r][c] = false
    else placed++
  }

  const floors = []
  for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) if (!wall[r][c]) floors.push({ r, c })
  if (floors.length < nBoxes + 2) return null
  shuffle(floors)

  // Solved state: crates sit on their goals.
  const goalsArr = floors.slice(0, nBoxes).map((f) => ({ ...f }))
  const boxesArr = goalsArr.map((g) => ({ ...g }))
  const boxKeys = new Set(boxesArr.map((b) => key(b.r, b.c)))
  let ply = floors.find((f) => !boxKeys.has(key(f.r, f.c)))
  if (!ply) return null
  ply = { ...ply }

  // Drag crates backwards with legal pulls.
  for (let step = 0; step < pulls; step++) {
    const reach = reachable(ply, wall, boxKeys, H, W)
    const cands = []
    for (let i = 0; i < boxesArr.length; i++) {
      const b = boxesArr[i]
      for (const [dr, dc] of DIRS) {
        const a1r = b.r + dr
        const a1c = b.c + dc // player stands here; crate moves here
        const a2r = b.r + 2 * dr
        const a2c = b.c + 2 * dc // player ends here
        if (a2r < 0 || a2c < 0 || a2r >= H || a2c >= W) continue
        if (wall[a1r][a1c] || wall[a2r][a2c]) continue
        const k1 = key(a1r, a1c)
        const k2 = key(a2r, a2c)
        if (boxKeys.has(k1) || boxKeys.has(k2)) continue
        if (!reach.has(k1)) continue
        cands.push({ i, a1r, a1c, a2r, a2c })
      }
    }
    if (!cands.length) break
    // Prefer dragging crates still on a goal, so they end up off it.
    const off = cands.filter((cd) => isGoal(goalsArr, boxesArr[cd.i].r, boxesArr[cd.i].c))
    const pool = off.length ? off : cands
    const cd = pool[Math.floor(Math.random() * pool.length)]
    const b = boxesArr[cd.i]
    boxKeys.delete(key(b.r, b.c))
    b.r = cd.a1r
    b.c = cd.a1c
    boxKeys.add(key(b.r, b.c))
    ply = { r: cd.a2r, c: cd.a2c }
  }

  // No crate may start on a target — the puzzle must begin fully unsolved.
  if (boxesArr.some((b) => isGoal(goalsArr, b.r, b.c))) return null
  if (boxKeys.has(key(ply.r, ply.c))) return null

  const g = wall.map((row) => row.map((w) => (w ? 'wall' : 'floor')))
  for (const go of goalsArr) g[go.r][go.c] = 'goal'
  return { grid: g, goals: goalsArr, boxes: boxesArr, player: ply }
}

function generateLevel(lv) {
  const size = Math.min(8, 5 + Math.floor((lv - 1) / 3)) // interior side (10×10 board max)
  const W = size + 2
  const H = size + 2
  const nBoxes = Math.min(4, 2 + Math.floor((lv - 1) / 3))
  const nObstacles = Math.min(Math.floor(size * size * 0.16), 1 + Math.floor(lv / 2))
  const pulls = size * nBoxes * 4 + lv * 3
  for (let attempt = 0; attempt < 80; attempt++) {
    const res = tryGenerate(W, H, nBoxes, nObstacles, pulls)
    if (res) return res
  }
  // Fallback (extremely rare): a one-crate push.
  return {
    grid: [
      ['wall', 'wall', 'wall', 'wall', 'wall'],
      ['wall', 'floor', 'floor', 'goal', 'wall'],
      ['wall', 'wall', 'wall', 'wall', 'wall'],
    ],
    goals: [{ r: 1, c: 3 }],
    boxes: [{ r: 1, c: 2 }],
    player: { r: 1, c: 1 },
  }
}

function applyState(g) {
  grid.value = g.grid.map((r) => r.slice())
  goals.value = g.goals.map((x) => ({ ...x }))
  boxes.value = g.boxes.map((x) => ({ ...x }))
  player.value = { ...g.player }
  rows.value = g.grid.length
  cols.value = g.grid[0].length
  moves.value = 0
  history.value = []
}

function loadLevel(lv) {
  const g = generateLevel(lv)
  initial = {
    grid: g.grid.map((r) => r.slice()),
    goals: g.goals.map((x) => ({ ...x })),
    boxes: g.boxes.map((x) => ({ ...x })),
    player: { ...g.player },
  }
  applyState(initial)
}

function snapshot() {
  history.value.push({
    boxes: boxes.value.map((b) => ({ ...b })),
    player: { ...player.value },
    moves: moves.value,
  })
}

function move(dr, dc) {
  if (solved.value) return
  const p = player.value
  const nr = p.r + dr
  const nc = p.c + dc
  if (grid.value[nr]?.[nc] === 'wall' || grid.value[nr]?.[nc] === undefined) return

  const bi = boxIndex(nr, nc)
  if (bi >= 0) {
    const br = nr + dr
    const bc = nc + dc
    if (grid.value[br]?.[bc] === 'wall' || grid.value[br]?.[bc] === undefined || boxIndex(br, bc) >= 0) return
    snapshot()
    boxes.value = boxes.value.map((b, i) => (i === bi ? { r: br, c: bc } : b))
    player.value = { r: nr, c: nc }
    moves.value++
    if (solved.value) sfx.win()
    else sfx.tick()
  } else {
    snapshot()
    player.value = { r: nr, c: nc }
    moves.value++
    sfx.tick()
  }
}

function undo() {
  const last = history.value.pop()
  if (!last) return
  boxes.value = last.boxes
  player.value = last.player
  moves.value = last.moves
}

function reset() {
  applyState(initial)
}

function nextLevel() {
  level.value++
  loadLevel(level.value)
}

// ---- swipe ----
let sx = 0
let sy = 0
let sactive = false
function onDown(e) {
  sx = e.clientX
  sy = e.clientY
  sactive = true
}
function onUp(e) {
  if (!sactive) return
  sactive = false
  const dx = e.clientX - sx
  const dy = e.clientY - sy
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (Math.max(ax, ay) < 24) return
  if (ax > ay) move(0, dx > 0 ? 1 : -1)
  else move(dy > 0 ? 1 : -1, 0)
}

function onKeydown(e) {
  const k = e.key
  if (solved.value && k === 'Enter') {
    e.preventDefault()
    nextLevel()
    return
  }
  const map = {
    ArrowUp: [-1, 0], w: [-1, 0], ArrowDown: [1, 0], s: [1, 0],
    ArrowLeft: [0, -1], a: [0, -1], ArrowRight: [0, 1], d: [0, 1],
  }
  if (map[k]) {
    e.preventDefault()
    move(...map[k])
  } else if (k === 'z') undo()
  else if (k === 'r') reset()
}

onMounted(() => {
  loadLevel(1)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="sokoban">
    <div class="panel">
      <div class="topbar">
        <span class="lvl">Level {{ level }}</span>
        <span class="moves">{{ moves }} langkah</span>
      </div>

      <div class="board-wrap">
        <div class="board" :style="{ '--cols': cols }" @pointerdown="onDown" @pointerup="onUp">
          <div v-for="(cell, i) in flatCells" :key="i" class="cell" :class="'cell--' + cell.base">
            <span v-if="cell.goal && !cell.box && !cell.player" class="goal-dot" />
            <span v-if="cell.box" class="crate" :class="{ 'on-goal': cell.goal }" />
            <svg v-if="cell.player" class="pusher" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="var(--berry)" stroke="var(--ink)" stroke-width="2" />
              <circle cx="9" cy="11" r="1.6" fill="var(--cream)" />
              <circle cx="15" cy="11" r="1.6" fill="var(--cream)" />
              <path d="M9 15 Q12 17 15 15" fill="none" stroke="var(--cream)" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </div>
        </div>

        <div v-if="solved" class="done">
          <p class="done__title">Selesai!</p>
          <button class="cta" type="button" @click="nextLevel">Level berikutnya ▸</button>
        </div>
      </div>

      <div class="controls">
        <div class="dpad">
          <button class="dbtn up" type="button" aria-label="Atas" @click="move(-1, 0)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5 18.5 17 H5.5 Z" /></svg>
          </button>
          <button class="dbtn left" type="button" aria-label="Kiri" @click="move(0, -1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5 18.5 17 H5.5 Z" /></svg>
          </button>
          <button class="dbtn right" type="button" aria-label="Kanan" @click="move(0, 1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5 18.5 17 H5.5 Z" /></svg>
          </button>
          <button class="dbtn down" type="button" aria-label="Bawah" @click="move(1, 0)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5 18.5 17 H5.5 Z" /></svg>
          </button>
        </div>
        <div class="side">
          <button class="mini" type="button" :disabled="!history.length || solved" @click="undo">↶ Undo</button>
          <button class="mini" type="button" @click="reset">↺ Ulang</button>
        </div>
      </div>

      <p class="hint">Geser papan atau pakai tombol · dorong tiap kotak ke titik</p>
    </div>
  </div>
</template>

<style scoped>
.sokoban {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 20px 18px 22px;
}

.topbar {
  margin-bottom: 14px;
}
.lvl {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--ink);
}
.moves {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.board-wrap {
  position: relative;
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}
.board {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  gap: 4px;
  width: 100%;
  max-width: calc(var(--cols) * 52px);
  padding: 6px;
  background: var(--ink);
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  touch-action: none;
}
.cell {
  aspect-ratio: 1;
  position: relative;
  display: grid;
  place-items: center;
  border-radius: 6px;
}
.cell--wall {
  background: #4a3363;
}
.cell--floor,
.cell--goal {
  background: var(--paper-lit);
}

.goal-dot {
  width: 34%;
  height: 34%;
  border-radius: 50%;
  border: 3px solid var(--aqua-deep);
}
.crate {
  width: 82%;
  height: 82%;
  border-radius: 6px;
  background: var(--sun);
  border: 2.5px solid var(--ink);
  box-shadow: inset 0 -3px 0 rgba(44, 19, 56, 0.14);
  position: relative;
  transition: background 0.12s ease;
}
.crate::after {
  content: '';
  position: absolute;
  inset: 20%;
  border: 2px solid rgba(44, 19, 56, 0.28);
  border-radius: 2px;
}
.crate.on-goal {
  background: var(--aqua);
}
.pusher {
  width: 76%;
  height: 76%;
}

.done {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 20px;
  background: rgba(255, 243, 223, 0.86);
  border-radius: 14px;
}
.done__title {
  font-family: var(--font-display);
  font-size: 34px;
  color: var(--aqua-deep);
  margin: 0;
}
.done .cta {
  width: auto;
  padding: 12px 22px;
}

/* ---- Controls ---- */
.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.dpad {
  display: grid;
  grid-template-columns: repeat(3, 44px);
  grid-template-rows: repeat(3, 44px);
  gap: 6px;
}
.dbtn {
  display: grid;
  place-items: center;
  color: var(--ink);
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 12px;
  box-shadow: 0 3px 0 var(--ink);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.dbtn svg {
  width: 21px;
  height: 21px;
  display: block;
}
.dbtn svg path {
  fill: currentColor;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.dbtn:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 var(--ink);
}
.dbtn.up {
  grid-area: 1 / 2;
}
.dbtn.left {
  grid-area: 2 / 1;
}
.dbtn.left svg {
  transform: rotate(-90deg);
}
.dbtn.right {
  grid-area: 2 / 3;
}
.dbtn.right svg {
  transform: rotate(90deg);
}
.dbtn.down {
  grid-area: 3 / 2;
}
.dbtn.down svg {
  transform: rotate(180deg);
}
.side {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hint {
  margin: 14px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--muted);
  text-align: center;
}
</style>
