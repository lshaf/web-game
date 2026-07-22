<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { sfx } from '../sound.js'

// Mahjong (Mahjong Solitaire) — clear the layered board by matching pairs of
// free tiles. A tile is free when nothing sits on top of it and one of its left
// / right sides is open. The board is dealt by peeling two free tiles at a time
// from a full layout and giving each pair its own face, so every deal has a
// guaranteed solution (unique-pair faces + only-frees-up removals mean any order
// of legal matches clears it).

const SOLVED_KEY = 'dusk-mahjong-solved'
const BEST_KEY = 'dusk-mahjong-best'

// Step-pyramid layouts: [w, h] per layer, each centred on the base.
const LEVELS = [
  { key: 'mudah', label: 'Mudah', layers: [[6, 4], [4, 2]] },
  { key: 'sedang', label: 'Sedang', layers: [[8, 6], [6, 4], [4, 2]] },
  { key: 'sulit', label: 'Sulit', layers: [[10, 6], [8, 4], [6, 2], [2, 2]] },
]

// One distinct face per pair — plenty for the largest board (54 pairs).
const EMOJI = [
  '🍎', '🍊', '🍋', '🍉', '🍇', '🍓', '🍒', '🍑', '🥝', '🍍', '🥥', '🍅', '🥑', '🥕', '🌽',
  '🍄', '🥜', '🍞', '🧀', '🥚', '🍗', '🍤', '🍙', '🍚', '🍩', '🍪', '🍰', '🍫', '🍬', '🍭',
  '🍯', '🥛', '🍵', '🍺', '🍟', '🍕', '🍔', '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
  '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦆', '🦉', '🐢', '🐍', '🐙', '🦀',
  '🐠', '🐬', '🐳', '🐝', '🐛', '🦋', '🐞', '🐌',
]

const key3 = (c, r, l) => c + ',' + r + ',' + l

function buildPositions(layers) {
  const baseW = layers[0][0]
  const baseH = layers[0][1]
  const pos = []
  layers.forEach(([w, h], layer) => {
    const c0 = (baseW - w) / 2
    const r0 = (baseH - h) / 2
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++) pos.push({ c: c0 + dc, r: r0 + dr, layer })
  })
  return pos.map((p, i) => ({ ...p, id: i }))
}

// Peel two free tiles at a time, assigning each pair a unique face.
function generate(layers) {
  const pos = buildPositions(layers)
  for (let attempt = 0; attempt < 300; attempt++) {
    const present = new Set(pos.map((t) => key3(t.c, t.r, t.layer)))
    const remaining = new Set(pos.map((t) => t.id))
    const face = new Array(pos.length).fill(-1)
    const freeOf = (id) => {
      const t = pos[id]
      if (present.has(key3(t.c, t.r, t.layer + 1))) return false
      const l = present.has(key3(t.c - 1, t.r, t.layer))
      const r = present.has(key3(t.c + 1, t.r, t.layer))
      return !l || !r
    }
    let pair = 0
    let ok = true
    while (remaining.size) {
      const free = [...remaining].filter(freeOf)
      if (free.length < 2) {
        ok = false
        break
      }
      const a = free[(Math.random() * free.length) | 0]
      let b = a
      while (b === a) b = free[(Math.random() * free.length) | 0]
      face[a] = face[b] = pair++
      for (const id of [a, b]) {
        remaining.delete(id)
        const t = pos[id]
        present.delete(key3(t.c, t.r, t.layer))
      }
    }
    if (ok) return pos.map((t) => ({ ...t, face: face[t.id] }))
  }
  return pos.map((t, i) => ({ ...t, face: (i >> 1) })) // fallback (rare)
}

// --- Game state -------------------------------------------------------------

const phase = ref('setup') // setup | play | won
const sel = ref(LEVELS[0])
const level = ref(LEVELS[0])
const tiles = ref([])
const alive = ref([])
const selected = ref(-1)
const hintPair = ref([])
const unit = ref(40)
const elapsed = ref(0)
const solvedCount = ref(0)
const bestTime = ref(0)

const stageRef = ref(null)
let posByKey = new Map()
let baseW = 6
let baseH = 4
let maxLayer = 1
let timer = 0
let startAt = 0
let hintTimer = 0

const timeLabel = computed(() => fmt(elapsed.value))
function fmt(s) {
  const m = Math.floor(s / 60)
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

const th = computed(() => Math.round(unit.value * 1.32))
const dx = computed(() => Math.round(unit.value * 0.16))
const dy = computed(() => Math.round(unit.value * 0.16))
// Breathing room so a selected tile's scale-up and its bottom-right shadow stay
// inside the board box instead of spilling out and forcing the stage to scroll.
const marg = computed(() => Math.round(unit.value * 0.1) + 3)
const boardStyle = computed(() => ({
  width: baseW * unit.value + maxLayer * dx.value + marg.value * 2 + 'px',
  height: baseH * th.value + maxLayer * dy.value + marg.value * 2 + 'px',
}))
const remaining = computed(() => alive.value.reduce((n, a) => n + (a ? 1 : 0), 0))

function isFree(id) {
  if (!alive.value[id]) return false
  const t = tiles.value[id]
  const up = posByKey.get(key3(t.c, t.r, t.layer + 1))
  if (up != null && alive.value[up]) return false
  const l = posByKey.get(key3(t.c - 1, t.r, t.layer))
  const r = posByKey.get(key3(t.c + 1, t.r, t.layer))
  const lb = l != null && alive.value[l]
  const rb = r != null && alive.value[r]
  return !lb || !rb
}

function tileStyle(t) {
  return {
    left: marg.value + maxLayer * dx.value + t.c * unit.value - t.layer * dx.value + 'px',
    top: marg.value + maxLayer * dy.value + t.r * th.value - t.layer * dy.value + 'px',
    width: unit.value + 'px',
    height: th.value + 'px',
    zIndex: t.layer * 1000 + t.r * 40 + t.c,
    fontSize: unit.value * 0.56 + 'px',
  }
}
function tileClass(t) {
  return {
    'is-free': isFree(t.id),
    'is-sel': selected.value === t.id,
    'is-hint': hintPair.value.includes(t.id),
  }
}

// --- Interaction ------------------------------------------------------------

function tap(id) {
  if (phase.value !== 'play' || !isFree(id)) return
  hintPair.value = []
  if (selected.value === id) return (selected.value = -1)
  if (selected.value === -1) return (selected.value = id)
  if (tiles.value[selected.value].face === tiles.value[id].face) {
    alive.value[selected.value] = false
    alive.value[id] = false
    selected.value = -1
    sfx.tick()
    if (remaining.value === 0) win()
  } else {
    selected.value = id // switch selection
  }
}

// Any two currently-free tiles that share a face.
function hint() {
  if (phase.value !== 'play') return
  const free = tiles.value.filter((t) => isFree(t.id))
  const byFace = new Map()
  for (const t of free) {
    if (byFace.has(t.face)) {
      hintPair.value = [byFace.get(t.face), t.id]
      clearTimeout(hintTimer)
      hintTimer = setTimeout(() => (hintPair.value = []), 1500)
      return
    }
    byFace.set(t.face, t.id)
  }
}

// --- Lifecycle --------------------------------------------------------------

function computeUnit() {
  const avail = (stageRef.value ? stageRef.value.clientWidth : 340) - 6
  // Board box ≈ unit·(cols + 0.16·layers + 0.2) + 6 — the +0.2·unit+6 covers the
  // layer offsets and the selection margin, so it never overflows the stage.
  const byW = Math.floor((avail - 6) / (baseW + 0.16 * maxLayer + 0.2))
  // Reserve room for the bars, tip and tools so the board fits vertically too.
  const byH = Math.floor((window.innerHeight - 306) / (baseH * 1.32 + 0.16 * maxLayer + 0.2))
  return clamp(Math.min(byW, byH), 20, 52)
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
function layout() {
  unit.value = computeUnit()
}

function deal() {
  const lv = level.value
  baseW = lv.layers[0][0]
  baseH = lv.layers[0][1]
  maxLayer = lv.layers.length - 1
  const t = generate(lv.layers)
  tiles.value = t
  alive.value = t.map(() => true)
  posByKey = new Map()
  for (const tile of t) posByKey.set(key3(tile.c, tile.r, tile.layer), tile.id)
  selected.value = -1
  hintPair.value = []
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
  timer = setInterval(() => (elapsed.value = Math.floor((Date.now() - startAt) / 1000)), 1000)
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
  clearTimeout(hintTimer)
  window.removeEventListener('resize', layout)
})
</script>

<template>
  <div class="mahjong">
    <div class="panel">
      <section class="screen">
        <!-- ===== Setup ===== -->
        <template v-if="phase === 'setup'">
          <p class="brand">MAH<span class="brand__accent">JONG</span></p>
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
          <p class="setup__info">Cocokkan pasangan ubin bebas · SELESAI {{ solvedCount }}</p>
          <button class="cta" type="button" @click="start">Mulai ▸</button>
        </template>

        <!-- ===== Play / Won ===== -->
        <template v-else>
          <div class="topbar">
            <button class="mini" type="button" @click="toSetup">← Tingkat</button>
            <span class="status">SISA {{ remaining }}</span>
            <button class="mini" type="button" @click="newGame">Baru</button>
          </div>

          <div class="solobar hud">
            <span>WAKTU <b>{{ timeLabel }}</b></span>
            <span>TERBAIK {{ bestTime ? fmt(bestTime) : '—' }}</span>
            <span class="solobar__best">SELESAI {{ solvedCount }}</span>
          </div>

          <div class="stage" ref="stageRef">
            <div class="board" :style="boardStyle">
              <div
                v-for="t in tiles"
                v-show="alive[t.id]"
                :key="t.id"
                class="tile"
                :class="tileClass(t)"
                :style="tileStyle(t)"
                role="button"
                @click="tap(t.id)"
              >
                {{ EMOJI[t.face % EMOJI.length] }}
              </div>
            </div>
          </div>

          <p class="tip">Ubin bebas: tak tertindih & satu sisi terbuka · yang redup terkunci.</p>

          <div class="tools">
            <button class="mini" type="button" @click="hint">Petunjuk</button>
            <button class="mini" type="button" @click="newGame">Baru</button>
          </div>

          <div v-if="phase === 'won'" class="result">
            <p class="result__title">Bersih!</p>
            <p class="result__streak">WAKTU {{ timeLabel }} · SELESAI {{ solvedCount }}</p>
            <button class="cta" type="button" @click="newGame">Main lagi ▸</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/mini/topbar/status/picker/
   pick/solobar/result come from src/styles.css. */
.mahjong {
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 4px max(12px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(12px, env(safe-area-inset-left));
}
.panel {
  padding: 22px 16px 26px;
}
.brand {
  font-size: 28px;
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
  letter-spacing: 0.04em;
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
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
  overflow-x: auto;
}
.board {
  position: relative;
  flex: none;
}
.tile {
  position: absolute;
  display: grid;
  place-items: center;
  padding: 0;
  line-height: 1;
  background: var(--cream);
  border: 2px solid var(--ink);
  border-radius: 6px;
  /* the little 3-D lip on the bottom-right gives the stacked-tile look */
  box-shadow: 2px 2px 0 rgba(44, 19, 56, 0.55), inset -2px -2px 0 rgba(44, 19, 56, 0.12);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.06s ease;
}
/* Locked tiles read as dimmer so the playable ones pop. */
.tile:not(.is-free) {
  filter: brightness(0.82) saturate(0.7);
  cursor: default;
}
.tile.is-free {
  cursor: pointer;
}
.tile.is-sel {
  background: var(--sun);
  transform: scale(1.06);
  outline: 2px solid var(--ink);
}
.tile.is-hint {
  background: var(--aqua);
}

/* ---- Tip + tools + result ---- */
.tip {
  margin: 0 0 12px;
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
  padding-top: 12px;
}
.result__streak {
  margin: 6px 0 14px;
}
</style>
