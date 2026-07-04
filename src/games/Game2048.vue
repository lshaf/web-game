<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// 2048 — single player. A 4×4 grid of powers of two. A move slides every tile
// toward one edge; equal neighbours merge once each into their sum. If anything
// moved, one new 2 (90%) or 4 spawns in a random empty cell. Reach 2048 to win;
// no empty cell and no possible merge means game over.

const SIZE = 4
const CELLS = SIZE * SIZE
const bestKey = 'dusk-2048-best'

// board[i] — tile value at cell i (0 = empty). anim[i] — one-shot animation
// tag for this move ('spawn' | 'merge' | ''). bump[i] — a counter bumped on
// spawn/merge so the tile's :key changes and the pop animation replays.
const board = ref(new Array(CELLS).fill(0))
const anim = ref(new Array(CELLS).fill(''))
const bump = ref(new Array(CELLS).fill(0))
const score = ref(0)
const best = ref(0)
const phase = ref('play') // play | lost
const won = ref(false) // a 2048 has been reached at least once
const showWin = ref(false) // the "you won — keep going?" banner is up

// The four board indices of each line, ordered from the edge tiles slide
// toward outward, so one compressor handles every direction.
function lineIndices(dir) {
  const lines = []
  for (let k = 0; k < SIZE; k++) {
    const idx = []
    for (let j = 0; j < SIZE; j++) {
      let r, c
      if (dir === 'left') { r = k; c = j }
      else if (dir === 'right') { r = k; c = SIZE - 1 - j }
      else if (dir === 'up') { r = j; c = k }
      else { r = SIZE - 1 - j; c = k } // down
      idx.push(r * SIZE + c)
    }
    lines.push(idx)
  }
  return lines
}

// Compress one line toward its edge, merging equal neighbours once each.
function slideLine(vals) {
  const packed = vals.filter((v) => v)
  const result = []
  const merged = []
  let gained = 0
  let i = 0
  while (i < packed.length) {
    if (i + 1 < packed.length && packed[i] === packed[i + 1]) {
      const sum = packed[i] * 2
      result.push(sum)
      merged.push(true)
      gained += sum
      i += 2
    } else {
      result.push(packed[i])
      merged.push(false)
      i += 1
    }
  }
  while (result.length < SIZE) {
    result.push(0)
    merged.push(false)
  }
  return { result, merged, gained }
}

// Drop a fresh 2/4 into a random empty cell of `b`; returns its index or -1.
function spawn(b) {
  const empties = []
  for (let i = 0; i < CELLS; i++) if (!b[i]) empties.push(i)
  if (!empties.length) return -1
  const idx = empties[Math.floor(Math.random() * empties.length)]
  b[idx] = Math.random() < 0.9 ? 2 : 4
  return idx
}

// No empty cell and no equal orthogonal neighbour anywhere → dead board.
function isGameOver(b) {
  for (let i = 0; i < CELLS; i++) if (!b[i]) return false
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = b[r * SIZE + c]
      if (c < SIZE - 1 && b[r * SIZE + c + 1] === v) return false
      if (r < SIZE - 1 && b[(r + 1) * SIZE + c] === v) return false
    }
  }
  return true
}

function saveBest() {
  if (score.value > best.value) {
    best.value = score.value
    try {
      localStorage.setItem(bestKey, String(best.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory best */
    }
  }
}

function move(dir) {
  if (phase.value !== 'play' || showWin.value) return
  const next = board.value.slice()
  const merges = []
  let changed = false
  let gained = 0
  for (const idx of lineIndices(dir)) {
    const { result, merged, gained: g } = slideLine(idx.map((i) => board.value[i]))
    gained += g
    for (let j = 0; j < SIZE; j++) {
      if (next[idx[j]] !== result[j]) changed = true
      next[idx[j]] = result[j]
      if (merged[j]) merges.push(idx[j])
    }
  }
  if (!changed) return // nothing slid → not a legal move, no spawn/sound

  const nextAnim = new Array(CELLS).fill('')
  const nextBump = bump.value.slice()
  for (const i of merges) {
    nextAnim[i] = 'merge'
    nextBump[i] += 1
  }
  const spawnIdx = spawn(next)
  if (spawnIdx >= 0) {
    nextAnim[spawnIdx] = 'spawn'
    nextBump[spawnIdx] += 1
  }

  board.value = next
  anim.value = nextAnim
  bump.value = nextBump
  score.value += gained
  saveBest()
  sfx.tick()

  if (!won.value && next.some((v) => v >= 2048)) {
    won.value = true
    showWin.value = true
    sfx.win()
    return
  }
  if (isGameOver(next)) {
    phase.value = 'lost'
    sfx.lose()
  }
}

function newGame() {
  const b = new Array(CELLS).fill(0)
  const a = new Array(CELLS).fill('')
  const bmp = bump.value.slice() // keep counting so the new tiles' keys change
  for (let n = 0; n < 2; n++) {
    const i = spawn(b)
    a[i] = 'spawn'
    bmp[i] += 1
  }
  board.value = b
  anim.value = a
  bump.value = bmp
  score.value = 0
  won.value = false
  showWin.value = false
  phase.value = 'play'
}

function continuePlay() {
  showWin.value = false
}

// Class list for cell i: its value swatch and this move's one-shot pop. The
// font is one size for every tile (sized to fit 4 digits — see .tile), so a
// "2048" reads the same as a "2" and the block never changes shape.
function tileClass(v, i) {
  if (!v) return 'is-empty'
  const swatch = v > 2048 ? 'v-super' : 'v-' + v
  const a = anim.value[i]
  return [swatch, a ? 'is-' + a : '']
}

// ---- Input: keyboard (arrows + WASD) and board swipe ----
function onKey(e) {
  const k = e.key
  let dir = null
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') dir = 'left'
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') dir = 'right'
  else if (k === 'ArrowUp' || k === 'w' || k === 'W') dir = 'up'
  else if (k === 'ArrowDown' || k === 's' || k === 'S') dir = 'down'
  if (!dir) return
  e.preventDefault() // stop the page scrolling on arrow keys
  move(dir)
}

let touchX = 0
let touchY = 0
let touching = false
function onTouchStart(e) {
  const t = e.touches[0]
  touchX = t.clientX
  touchY = t.clientY
  touching = true
}
function onTouchEnd(e) {
  if (!touching) return
  touching = false
  const t = e.changedTouches[0]
  const dx = t.clientX - touchX
  const dy = t.clientY - touchY
  const TH = 24 // ignore taps / tiny drags
  if (Math.abs(dx) < TH && Math.abs(dy) < TH) return
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left')
  else move(dy > 0 ? 'down' : 'up')
}

onMounted(() => {
  try {
    best.value = Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    best.value = 0
  }
  window.addEventListener('keydown', onKey, { passive: false })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})

// First deal — synchronous so the opening board paints with tiles, not empty.
newGame()
</script>

<template>
  <div class="g2048">
    <div class="panel">
      <section class="screen">
        <p class="brand">20<span class="brand__accent">48</span></p>
        <p class="eyebrow">GABUNG ANGKANYA</p>

        <div class="hud">
          <div class="hud__stat">
            <span class="hud__label">SKOR</span>
            <b class="hud__value">{{ score }}</b>
          </div>
          <div class="hud__stat">
            <span class="hud__label">TERBAIK</span>
            <b class="hud__value">{{ best }}</b>
          </div>
          <button class="mini hud__btn" type="button" @click="newGame">Ulang</button>
        </div>

        <div
          class="board"
          @touchstart.passive="onTouchStart"
          @touchmove.prevent
          @touchend="onTouchEnd"
        >
          <div
            v-for="(v, i) in board"
            :key="i + '-' + bump[i]"
            class="tile"
            :class="tileClass(v, i)"
          >
            <span v-if="v">{{ v }}</span>
          </div>

          <div v-if="showWin" class="board__over">
            <p class="over__title">2048!</p>
            <p class="over__sub">Kamu menang!</p>
            <button class="cta cta--alt over__btn" type="button" @click="continuePlay">
              Lanjut ▸
            </button>
          </div>
        </div>

        <!-- On-screen d-pad for desktop-without-keyboard. -->
        <div v-if="phase === 'play'" class="pad">
          <button class="key key--up" type="button" aria-label="Atas" @click="move('up')">▲</button>
          <button class="key key--left" type="button" aria-label="Kiri" @click="move('left')">◀</button>
          <button class="key key--down" type="button" aria-label="Bawah" @click="move('down')">▼</button>
          <button class="key key--right" type="button" aria-label="Kanan" @click="move('right')">▶</button>
        </div>

        <div v-if="phase === 'lost'" class="result">
          <p class="result__title is-lost">Yah, mentok!</p>
          <p class="result__sub">Skor {{ score }} · Terbaik {{ best }}</p>
          <button class="cta" type="button" @click="newGame">Main lagi ▸</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/result come from
   src/styles.css (see docs/STYLE.md). */
.g2048 {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 18px 26px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* Give the column a definite width so the board's width:100% (and the board's
   container query) resolve against a real width rather than shrink-to-fit. */
.screen {
  width: 100%;
}
.brand {
  font-size: 46px;
}

/* ---- Score / best / restart bar ---- */
.hud {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.hud__stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hud__label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--muted);
}
.hud__value {
  font-family: var(--font-display);
  font-size: 24px;
  line-height: 1;
  color: var(--ink);
}
.hud__btn {
  margin-left: auto;
}

/* ---- Board ---- */
.board {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 8px;
  padding: 8px;
  background: var(--ink);
  border: var(--line) solid var(--ink);
  border-radius: 16px;
  box-shadow: var(--pop);
  margin-bottom: 16px;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  /* Query container so tile text can be sized off the real board width. */
  container-type: inline-size;
}
.tile {
  display: grid;
  place-items: center;
  border-radius: 10px;
  font-family: var(--font-display);
  /* One size for every tile, scaled to the board so a 4-digit "2048" always
     fits the square with room to spare (a tile is ~22% of the board wide). */
  font-size: 7.6cqw;
  line-height: 1;
  color: var(--ink);
  background: rgba(255, 243, 223, 0.14); /* recessed empty slot */
}
.tile:not(.is-empty) {
  border: var(--line) solid var(--ink);
  box-shadow: inset 0 -3px 0 rgba(44, 19, 56, 0.22);
}

/* Value swatches — cool for the small ones, warming toward berry up top. */
.tile.v-2 {
  background: var(--paper-lit);
}
.tile.v-4 {
  background: var(--tile-live);
}
.tile.v-8 {
  background: color-mix(in srgb, var(--aqua) 45%, var(--cream));
}
.tile.v-16 {
  background: var(--aqua);
}
.tile.v-32 {
  background: var(--aqua-deep);
  color: var(--cream);
}
.tile.v-64 {
  background: var(--grape);
  color: var(--cream);
}
.tile.v-128 {
  background: var(--sun);
}
.tile.v-256 {
  background: color-mix(in srgb, var(--sun) 55%, var(--sun-core));
}
.tile.v-512 {
  background: var(--sun-core);
  color: var(--cream);
}
.tile.v-1024 {
  background: color-mix(in srgb, var(--sun-core) 50%, var(--berry));
  color: var(--cream);
}
.tile.v-2048 {
  background: var(--berry);
  color: var(--cream);
}
.tile.v-super {
  background: color-mix(in srgb, var(--berry) 62%, var(--ink));
  color: var(--cream);
}

/* Pops: a small one on spawn, a bigger one on merge. */
.tile.is-spawn {
  animation: g2048-pop 0.18s ease;
}
.tile.is-merge {
  animation: g2048-merge 0.2s ease;
}
@keyframes g2048-pop {
  0% {
    transform: scale(0.1);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
@keyframes g2048-merge {
  0% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.24);
  }
  100% {
    transform: scale(1);
  }
}

/* ---- Win banner over the board ---- */
.board__over {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  background: rgba(44, 19, 56, 0.62);
  border-radius: 16px;
}
.over__title {
  font-family: var(--font-display);
  font-size: 44px;
  margin: 0;
  color: var(--sun);
  -webkit-text-stroke: 3px var(--ink);
  paint-order: stroke fill;
  text-shadow: var(--pop-sm);
}
.over__sub {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.16em;
  color: var(--cream);
  margin: 0 0 4px;
}
.over__btn {
  width: auto;
  min-width: 156px;
}

/* ---- On-screen d-pad ---- */
.pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-areas:
    ". up ."
    "left down right";
  gap: 8px;
  width: 100%;
  max-width: 260px;
  margin: 0 auto;
}
.key {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 18px;
  color: var(--ink);
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  padding: 11px 0;
  box-shadow: 0 4px 0 var(--ink);
  touch-action: manipulation;
  -webkit-user-select: none;
  user-select: none;
  transition: transform 0.06s ease, box-shadow 0.06s ease;
}
.key:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--ink);
}
.key--up {
  grid-area: up;
}
.key--left {
  grid-area: left;
}
.key--down {
  grid-area: down;
}
.key--right {
  grid-area: right;
}

/* ---- Loss result ---- */
.result {
  width: 100%;
  text-align: center;
}
</style>
