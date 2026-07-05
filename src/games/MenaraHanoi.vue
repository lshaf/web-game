<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Menara Hanoi — Tower of Hanoi (solo). Move the whole stack of discs from the
// left peg to the right peg. One disc moves at a time and a disc may never rest
// on a smaller one. The fewest moves possible is 2^n − 1; the best result per
// disc-count is saved. Tap a peg to lift its top disc, tap another to drop it.

const COUNTS = [3, 4, 5, 6]
const PEGS = [0, 1, 2]
const bestKeyFor = (n) => `dusk-hanoi-best-${n}`

// Disc colours cycle by size so each size is visually distinct.
const PALETTE = [
  'var(--berry)',
  'var(--sun)',
  'var(--aqua)',
  'var(--grape)',
  'var(--sun-core)',
  'var(--aqua-deep)',
]

const count = ref(4)
const pegs = ref([[], [], []]) // each peg: bottom→top list of disc sizes (n = biggest)
const held = ref(null) // index of the peg whose top disc is lifted
const moves = ref(0)
const phase = ref('menu') // menu | play | won
const best = ref(null)
const record = ref(false)
const shaking = ref(-1)
let shakeTimer = 0

const minMoves = computed(() => 2 ** count.value - 1)
const perfect = computed(() => phase.value === 'won' && moves.value === minMoves.value)

function loadBest() {
  try {
    const v = localStorage.getItem(bestKeyFor(count.value))
    best.value = v == null || v === '' ? null : Number(v)
  } catch (e) {
    best.value = null
  }
}

// Deal a fresh tower for the chosen disc count and start playing.
function startGame() {
  const n = count.value
  const first = []
  for (let s = n; s >= 1; s--) first.push(s) // biggest at the bottom
  pegs.value = [first, [], []]
  held.value = null
  moves.value = 0
  record.value = false
  phase.value = 'play'
  loadBest()
}

// Back to the disc-count picker.
function toMenu() {
  held.value = null
  phase.value = 'menu'
}

// Top disc size on a peg, or Infinity when empty so any disc may land there.
function topSize(i) {
  const p = pegs.value[i]
  return p.length ? p[p.length - 1] : Infinity
}

function tapPeg(i) {
  if (phase.value !== 'play') return
  if (held.value === null) {
    if (pegs.value[i].length) {
      held.value = i
      sfx.tick()
    }
    return
  }
  if (held.value === i) {
    held.value = null // set it back down
    return
  }
  const disc = topSize(held.value)
  if (disc < topSize(i)) {
    const next = pegs.value.map((p) => p.slice())
    next[held.value].pop()
    next[i].push(disc)
    pegs.value = next
    moves.value++
    held.value = null
    if (pegs.value[2].length === count.value) win()
    else sfx.tick()
  } else {
    sfx.wrong()
    shaking.value = i
    clearTimeout(shakeTimer)
    shakeTimer = setTimeout(() => (shaking.value = -1), 400)
  }
}

function win() {
  phase.value = 'won'
  held.value = null
  sfx.win()
  const beat = best.value == null || moves.value < best.value
  record.value = beat
  if (beat) {
    best.value = moves.value
    try {
      localStorage.setItem(bestKeyFor(count.value), String(moves.value))
    } catch (e) {
      /* storage may be blocked; keep in-memory best */
    }
  }
}

function discColor(size) {
  return PALETTE[(size - 1) % PALETTE.length]
}
// Disc width as a percentage of its peg column — smallest to biggest.
function discWidth(size) {
  const min = 34
  const max = 96
  const t = count.value <= 1 ? 1 : (size - 1) / (count.value - 1)
  return (min + t * (max - min)).toFixed(1) + '%'
}

function onKeydown(e) {
  if (phase.value === 'won') {
    if (e.key === 'Enter') {
      e.preventDefault()
      startGame()
    }
    return
  }
  if (phase.value !== 'play') return
  const n = Number(e.key)
  if (n >= 1 && n <= 3) tapPeg(n - 1)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  loadBest()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(shakeTimer)
})
</script>

<template>
  <div class="hanoi">
    <div class="panel">
      <!-- ===== Menu (disc-count picker) ===== -->
      <section v-if="phase === 'menu'" class="screen">
        <p class="brand">MENARA<span class="brand__accent"> HANOI</span></p>
        <p class="eyebrow">PINDAHKAN MENARA KE KANAN</p>

        <div class="field">
          <span class="field__label">Jumlah cakram</span>
          <div class="discs" role="group" aria-label="Jumlah cakram">
            <button
              v-for="n in COUNTS"
              :key="n"
              class="pick"
              :class="{ 'is-on': count === n }"
              type="button"
              :aria-label="n + ' cakram'"
              @click="count = n"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <p class="menu-hint">Butuh minimal {{ minMoves }} langkah untuk {{ count }} cakram.</p>
        <button class="cta" type="button" @click="startGame">Mulai ▸</button>
      </section>

      <!-- ===== Play ===== -->
      <section v-else-if="phase === 'play'" class="screen">
        <div class="topbar">
          <button class="mini" type="button" @click="toMenu">← Ganti</button>
          <span class="status">{{ count }} cakram</span>
          <button class="mini" type="button" @click="startGame">Ulang</button>
        </div>

        <div class="solobar stats">
          <span>LANGKAH <b>{{ moves }}</b></span>
          <span>MINIMAL <b>{{ minMoves }}</b></span>
          <span class="solobar__best">TERBAIK {{ best == null ? '—' : best }}</span>
        </div>

        <div class="stage" role="group" aria-label="Tiga tiang Menara Hanoi">
          <button
            v-for="i in PEGS"
            :key="i"
            class="peg"
            :class="{ 'is-active': held === i, 'is-shake': shaking === i }"
            type="button"
            :aria-label="'Tiang ' + (i + 1)"
            @click="tapPeg(i)"
          >
            <span class="peg__post" aria-hidden="true" />
            <span class="peg__discs">
              <span
                v-for="(size, idx) in pegs[i]"
                :key="size"
                class="disc"
                :class="{ 'is-held': held === i && idx === pegs[i].length - 1 }"
                :style="{ width: discWidth(size), background: discColor(size) }"
              />
            </span>
          </button>
          <span class="stage__base" aria-hidden="true" />
        </div>

        <p class="tip">Ketuk tiang untuk mengangkat cakram, lalu ketuk tiang lain untuk meletakkannya.</p>
      </section>

      <!-- ===== Win ===== -->
      <section v-else class="screen result">
        <p class="brand">MENARA<span class="brand__accent"> HANOI</span></p>
        <p class="result__title">Menara Pindah!</p>
        <p class="result__sub">{{ moves }} langkah · minimal {{ minMoves }}</p>
        <p class="result__streak">
          <template v-if="perfect">SEMPURNA · </template
          ><template v-else-if="record">REKOR BARU · </template>TERBAIK {{ best }} LANGKAH
        </p>
        <button class="cta" type="button" @click="startGame">Main lagi ▸</button>
        <button class="cta cta--ghost replay" type="button" @click="toMenu">Ganti jumlah</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Page-specific only — panel/screen/brand/eyebrow/cta/picker/solobar/result come
   from src/styles.css. */
.hanoi {
  width: 100%;
  max-width: 480px;
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
/* Square disc-count chips, centered (matches the arcade's rounded-square look). */
.discs {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin: 4px 0 14px;
}
.discs .pick {
  width: 46px;
  height: 46px;
  padding: 0;
  display: grid;
  place-items: center;
  font-size: 17px;
}
.stats {
  margin: 2px 0 10px;
}
.stats b {
  color: var(--aqua-deep);
  font-size: 14px;
}

/* Menu hint under the disc picker. */
.menu-hint {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--muted);
  text-align: center;
  margin: 0 0 20px;
}
.replay {
  margin-top: 10px;
}

/* ---- The three pegs, framed in a little sunset scene ---- */
.stage {
  position: relative;
  width: 100%;
  height: 188px;
  display: flex;
  gap: 6px;
  align-items: flex-end;
  padding: 12px 12px 0;
  background: linear-gradient(to bottom, #f3ecff 0%, #ffe7d0 100%);
  border: var(--line) solid var(--ink);
  border-radius: 16px;
  box-shadow: var(--pop);
  overflow: hidden;
  margin: 2px 0 12px;
}
/* One plank spans all three pegs, like a real toy. */
.stage__base {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  height: 13px;
  background: var(--aqua-deep);
  border: 2.4px solid var(--ink);
  border-radius: 5px;
  z-index: 0;
}
.peg {
  position: relative;
  flex: 1;
  height: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
/* The rod rising out of the plank. */
.peg__post {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: 6px;
  height: calc(100% - 28px);
  background: #b79a63;
  border: 2px solid var(--ink);
  border-radius: 4px 4px 0 0;
  z-index: 1;
  transition: background 0.14s ease;
}
/* Discs stack from the bottom up (column-reverse renders the first — biggest —
   disc at the bottom), resting on the plank. */
.peg__discs {
  position: relative;
  z-index: 2;
  width: 100%;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  padding-bottom: 21px;
  gap: 3px;
}
.disc {
  height: 19px;
  border: 2.4px solid var(--ink);
  border-radius: 7px;
  box-shadow: var(--pop-sm);
  transition: transform 0.16s cubic-bezier(0.34, 1.4, 0.64, 1);
}
/* The lifted disc floats above its peg. */
.disc.is-held {
  transform: translateY(-15px) scale(1.03);
  box-shadow: 4px 4px 0 var(--ink);
}
.peg.is-active .peg__post {
  background: var(--sun);
}
.peg.is-shake {
  animation: shake 0.4s ease;
}

.tip {
  font-size: 12px;
  color: var(--muted);
  text-align: center;
  line-height: 1.45;
  margin: 2px auto 14px;
  max-width: 300px;
}

.result .brand {
  margin-bottom: 12px;
}
.result__title {
  animation: geser-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes geser-pop {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
