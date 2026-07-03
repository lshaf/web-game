<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { sfx } from '../sound.js'

// Tebak Warna — a Mastermind-style code breaker.
//   Solo: pick code length + attempts, the code is random.
//   2 Pemain: Player 1 builds any-length code + sets attempts, then hands over.
// Feedback per guess: filled pegs = right color & spot, ring pegs = right color
// wrong spot (classic Mastermind scoring with duplicate handling).

const PALETTE = [
  { id: 'a', name: 'Merah', hex: '#ff3b3b' },
  { id: 'b', name: 'Koral', hex: '#ff7a5c' },
  { id: 'c', name: 'Oranye', hex: '#ff9f1c' },
  { id: 'd', name: 'Kuning', hex: '#ffd23f' },
  { id: 'e', name: 'Hijau muda', hex: '#b3e024' },
  { id: 'f', name: 'Hijau', hex: '#43c96b' },
  { id: 'g', name: 'Toska', hex: '#23c9ad' },
  { id: 'h', name: 'Sian', hex: '#2bd2e8' },
  { id: 'i', name: 'Biru langit', hex: '#4aa3ff' },
  { id: 'j', name: 'Biru', hex: '#3a5bff' },
  { id: 'k', name: 'Ungu', hex: '#7b5be6' },
  { id: 'l', name: 'Magenta', hex: '#b64bd4' },
  { id: 'm', name: 'Merah muda', hex: '#ff6fd0' },
  { id: 'n', name: 'Cokelat', hex: '#9b5b3a' },
  { id: 'o', name: 'Abu', hex: '#6c7a99' },
]
const LEN_OPTS = [3, 4, 5, 6]
const ATT_OPTS = [6, 8, 10, 12]
const MAX_MULTI = 8
const bestKey = 'dusk-tebakwarna-best'

const phase = ref('mode') // mode | config | setup | handoff | play | won | lost
const mode = ref('solo') // solo | duo

const codeLen = ref(4)
const maxAttempts = ref(8)
const code = ref([]) // array of palette ids (the secret)
const guesses = ref([]) // { colors: id[], exact, present }
const slots = ref([]) // current guess row: id | null

const codeDraft = ref([]) // multi: P1's code being built
const attemptsDraft = ref(8)

const streak = ref(0)
const best = ref(0)
const shaking = ref(false)

const hex = (id) => PALETTE.find((p) => p.id === id)?.hex || 'transparent'
const left = computed(() => maxAttempts.value - guesses.value.length)
const isFull = computed(() => slots.value.every((s) => s !== null))
const history = computed(() => [...guesses.value].reverse())
const boardMax = computed(() => Math.min(468, codeLen.value * 50 + (codeLen.value - 1) * 8))

function randomCode(n) {
  const out = []
  for (let i = 0; i < n; i++) out.push(PALETTE[Math.floor(Math.random() * PALETTE.length)].id)
  return out
}

function chooseMode(m) {
  mode.value = m
  if (m === 'solo') {
    phase.value = 'config'
  } else {
    codeDraft.value = []
    attemptsDraft.value = 8
    phase.value = 'setup'
  }
}

function startSolo() {
  code.value = randomCode(codeLen.value)
  guesses.value = []
  slots.value = Array(codeLen.value).fill(null)
  phase.value = 'play'
}

function lockMulti() {
  if (codeDraft.value.length < 2) return
  code.value = [...codeDraft.value]
  codeLen.value = code.value.length
  maxAttempts.value = attemptsDraft.value
  guesses.value = []
  slots.value = Array(codeLen.value).fill(null)
  phase.value = 'handoff'
}

function beginPlay() {
  phase.value = 'play'
}

function draftPush(id) {
  if (codeDraft.value.length < MAX_MULTI) {
    codeDraft.value.push(id)
    sfx.tick()
  }
}
function draftRemove(i) {
  codeDraft.value.splice(i, 1)
}

function placeColor(id) {
  if (phase.value !== 'play') return
  const i = slots.value.findIndex((s) => s === null)
  if (i === -1) return
  slots.value[i] = id
  sfx.tick()
}
function removeSlot(i) {
  if (phase.value !== 'play' || slots.value[i] === null) return
  slots.value[i] = null
}
function clearSlots() {
  slots.value = Array(codeLen.value).fill(null)
}

function scoreGuess(guess) {
  let exact = 0
  const gl = {}
  const cl = {}
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === code.value[i]) {
      exact++
    } else {
      gl[guess[i]] = (gl[guess[i]] || 0) + 1
      cl[code.value[i]] = (cl[code.value[i]] || 0) + 1
    }
  }
  let present = 0
  for (const k in gl) present += Math.min(gl[k], cl[k] || 0)
  return { exact, present }
}

function shake() {
  shaking.value = true
  setTimeout(() => (shaking.value = false), 400)
}

function submit() {
  if (phase.value !== 'play') return
  if (!isFull.value) {
    shake()
    return
  }
  const guess = [...slots.value]
  const { exact, present } = scoreGuess(guess)
  guesses.value.push({ colors: guess, exact, present })
  slots.value = Array(codeLen.value).fill(null)
  if (exact === codeLen.value) {
    phase.value = 'won'
    sfx.win()
    if (mode.value === 'solo') {
      streak.value++
      if (streak.value > best.value) {
        best.value = streak.value
        try {
          localStorage.setItem(bestKey, String(best.value))
        } catch (e) {
          /* storage may be blocked */
        }
      }
    }
  } else if (guesses.value.length >= maxAttempts.value) {
    phase.value = 'lost'
    sfx.lose()
    if (mode.value === 'solo') streak.value = 0
  }
}

function newGame() {
  if (mode.value === 'solo') {
    startSolo()
  } else {
    codeDraft.value = []
    phase.value = 'setup'
  }
}

function backToModes() {
  phase.value = 'mode'
}

function onKeydown(e) {
  if (phase.value === 'won' || phase.value === 'lost') {
    if (e.key === 'Enter') {
      e.preventDefault()
      newGame()
    }
    return
  }
  if (phase.value !== 'play') return
  if (e.key === 'Enter') {
    e.preventDefault()
    submit()
    return
  }
  if (e.key === 'Backspace') {
    e.preventDefault()
    for (let i = slots.value.length - 1; i >= 0; i--) {
      if (slots.value[i] !== null) {
        removeSlot(i)
        break
      }
    }
    return
  }
  const n = Number(e.key)
  if (n >= 1 && n <= PALETTE.length) placeColor(PALETTE[n - 1].id)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  try {
    best.value = Number(localStorage.getItem(bestKey)) || 0
  } catch (e) {
    best.value = 0
  }
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="warna">
    <div class="panel">
      <!-- ===== Mode picker ===== -->
      <section v-if="phase === 'mode'" class="screen">
        <p class="brand">TEBAK<span>WARNA</span></p>
        <p class="eyebrow">PECAHKAN KODE WARNA</p>
        <button class="cta" type="button" @click="chooseMode('solo')">Solo ▸</button>
        <button class="cta cta--alt" type="button" @click="chooseMode('duo')">2 Pemain ▸</button>
      </section>

      <!-- ===== Solo config ===== -->
      <section v-else-if="phase === 'config'" class="screen">
        <div class="backbar"><button class="mini" type="button" @click="backToModes">← Mode</button></div>
        <p class="brand">TEBAK<span>WARNA</span></p>
        <p class="eyebrow">ATUR PERMAINAN</p>

        <div class="field">
          <span class="field__label">Jumlah warna</span>
          <div class="picker">
            <button
              v-for="n in LEN_OPTS"
              :key="n"
              class="pick"
              :class="{ 'is-on': codeLen === n }"
              type="button"
              @click="codeLen = n"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <div class="field">
          <span class="field__label">Kesempatan</span>
          <div class="picker">
            <button
              v-for="n in ATT_OPTS"
              :key="n"
              class="pick"
              :class="{ 'is-on': maxAttempts === n }"
              type="button"
              @click="maxAttempts = n"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <button class="cta" type="button" @click="startSolo">Mulai ▸</button>
      </section>

      <!-- ===== Multi setup (Player 1) ===== -->
      <section v-else-if="phase === 'setup'" class="screen">
        <div class="backbar"><button class="mini" type="button" @click="backToModes">← Mode</button></div>
        <p class="brand">TEBAK<span>WARNA</span></p>
        <p class="eyebrow">PEMAIN 1 · SUSUN KODE</p>

        <div class="draft" :class="{ 'is-empty': !codeDraft.length }">
          <button
            v-for="(id, i) in codeDraft"
            :key="i"
            class="chip"
            :style="{ background: hex(id) }"
            title="Ketuk untuk hapus"
            type="button"
            @click="draftRemove(i)"
          />
          <span v-if="!codeDraft.length" class="draft__hint">Ketuk warna untuk menambah</span>
        </div>

        <div class="swatches">
          <button
            v-for="c in PALETTE"
            :key="c.id"
            class="swatch"
            :style="{ background: c.hex }"
            :title="c.name"
            type="button"
            :disabled="codeDraft.length >= MAX_MULTI"
            @click="draftPush(c.id)"
          />
        </div>

        <p class="setup-note">{{ codeDraft.length }}/{{ MAX_MULTI }} · ketuk warna di kode untuk hapus</p>

        <div class="field">
          <span class="field__label">Kesempatan Pemain 2</span>
          <div class="picker">
            <button
              v-for="n in ATT_OPTS"
              :key="n"
              class="pick"
              :class="{ 'is-on': attemptsDraft === n }"
              type="button"
              @click="attemptsDraft = n"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <button class="cta" :disabled="codeDraft.length < 2" type="button" @click="lockMulti">
          Kunci &amp; serahkan ▸
        </button>
      </section>

      <!-- ===== Handoff ===== -->
      <section v-else-if="phase === 'handoff'" class="screen handoff">
        <span class="lock-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.2" />
            <rect x="4.5" y="10" width="15" height="11.5" rx="2.5" fill="currentColor" />
          </svg>
        </span>
        <p class="handoff__title">Kode terkunci</p>
        <p class="handoff__sub">Serahkan ke Pemain 2. Kode disembunyikan.</p>
        <button class="cta" type="button" @click="beginPlay">Pemain 2 siap ▸</button>
      </section>

      <!-- ===== Play ===== -->
      <section v-else-if="phase === 'play'" class="screen play">
        <div class="topbar">
          <button class="mini" type="button" @click="backToModes">Mode</button>
          <span v-if="mode === 'solo'" class="streak">STREAK <b>{{ streak }}</b> · BEST {{ best }}</span>
          <span v-else class="streak">PEMAIN 2</span>
          <span class="left" :class="{ 'is-low': left <= 2 }"><b>{{ left }}</b> sisa</span>
        </div>

        <!-- current guess -->
        <div class="board" :class="{ shake: shaking }" :style="{ maxWidth: boardMax + 'px' }">
          <button
            v-for="(id, i) in slots"
            :key="i"
            class="slot"
            :class="{ 'is-filled': id !== null }"
            :style="id !== null ? { background: hex(id) } : {}"
            type="button"
            @click="removeSlot(i)"
          />
        </div>

        <!-- palette -->
        <div class="swatches">
          <button
            v-for="(c, i) in PALETTE"
            :key="c.id"
            class="swatch"
            :style="{ background: c.hex }"
            :title="i < 9 ? `${c.name} (${i + 1})` : c.name"
            type="button"
            @click="placeColor(c.id)"
          />
        </div>

        <div class="play-actions">
          <button class="cta cta--ghost" type="button" @click="clearSlots">Hapus</button>
          <button class="cta cta--go" :disabled="!isFull" type="button" @click="submit">Tebak ▸</button>
        </div>

        <!-- history -->
        <div v-if="history.length" class="history" :style="{ maxWidth: boardMax + 'px' }">
          <div v-for="(g, r) in history" :key="guesses.length - r" class="hrow">
            <div class="hrow__colors">
              <span v-for="(id, i) in g.colors" :key="i" class="dot" :style="{ background: hex(id) }" />
            </div>
            <span class="pegs">
              <i v-for="k in g.exact" :key="'e' + k" class="peg peg--exact" />
              <i v-for="k in g.present" :key="'p' + k" class="peg peg--present" />
              <i v-for="k in codeLen - g.exact - g.present" :key="'n' + k" class="peg peg--none" />
            </span>
          </div>
        </div>
      </section>

      <!-- ===== Result ===== -->
      <section v-else class="screen result">
        <div class="backbar"><button class="mini" type="button" @click="backToModes">← Mode</button></div>
        <p class="result__title" :class="{ 'is-lost': phase === 'lost' }">
          {{ phase === 'won' ? 'Terpecahkan!' : 'Kesempatan habis' }}
        </p>
        <p class="result__sub">
          {{
            phase === 'won'
              ? `Dalam ${guesses.length} tebakan.`
              : 'Kode rahasianya:'
          }}
        </p>
        <p v-if="mode === 'solo'" class="result__streak">STREAK {{ streak }} · BEST {{ best }}</p>
        <div class="board result__board" :style="{ maxWidth: boardMax + 'px' }">
          <span v-for="(id, i) in code" :key="i" class="slot is-filled" :style="{ background: hex(id) }" />
        </div>
        <button class="cta" type="button" @click="newGame">
          {{ mode === 'solo' ? 'Main lagi ▸' : 'Kode baru ▸' }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.warna {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}

.panel {
  padding: 24px 22px 28px;
}

.brand {
  font-size: 34px;
  color: var(--berry);
}
.brand span {
  color: var(--aqua-deep);
}
.eyebrow {
  letter-spacing: 0.26em;
  color: var(--muted);
}

/* ---- Config pickers ---- */
.field__label {
  letter-spacing: 0.14em;
}
.picker {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.pick {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--ink);
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 12px;
  padding: 11px 0;
  transition: transform 0.1s ease, box-shadow 0.1s ease, background 0.1s ease;
}
.pick.is-on {
  background: var(--sun);
  box-shadow: var(--pop-sm);
  font-weight: 700;
}

/* ---- Swatches (palette) ---- */
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin: 4px 0 14px;
}
.swatch {
  width: 40px;
  height: 40px;
  border: 2.5px solid var(--ink);
  border-radius: 10px;
  box-shadow: 0 3px 0 var(--ink);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.swatch:hover:not(:disabled),
.swatch:focus-visible:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 6px 0 var(--ink);
}
.swatch:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 1px 0 var(--ink);
}
.swatch:disabled {
  opacity: 0.4;
}

/* ---- Multi draft ---- */
.draft {
  width: 100%;
  min-height: 52px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 2px dashed rgba(44, 19, 56, 0.35);
  border-radius: 14px;
  margin-bottom: 14px;
}
.chip {
  width: 30px;
  height: 30px;
  border: 2.5px solid var(--ink);
  border-radius: 8px;
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.chip:hover,
.chip:focus-visible {
  transform: translateY(-2px);
  box-shadow: 0 3px 0 var(--ink);
}
.chip:active {
  transform: translateY(1px);
}
.draft__hint {
  font-size: 13px;
  color: var(--muted);
}
.setup-note {
  width: 100%;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin: 0 0 16px;
}

/* ---- Top bar (play) ---- */
.play {
  width: 100%;
}
.topbar {
  margin-bottom: 18px;
}
.streak {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--muted);
}
.streak b {
  color: var(--aqua-deep);
}
.left {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
}
.left b {
  font-size: 18px;
  color: var(--ink);
}
.left.is-low b {
  color: var(--berry);
}

/* ---- Board / slots ---- */
.board {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin: 0 auto 16px;
}
.slot {
  flex: 1 1 0;
  min-width: 34px;
  max-width: 50px;
  aspect-ratio: 1;
  border: var(--line) solid var(--ink);
  border-radius: 12px;
  background: var(--paper-lit);
}
.slot.is-filled {
  box-shadow: 0 4px 0 var(--ink);
}

.play-actions {
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: stretch;
  margin-bottom: 6px;
}
/* Zero the CTA's base top margin so both buttons stretch to equal height; the
   ghost sizes to its content while the primary fills the rest of the row. */
.play-actions .cta {
  margin-top: 0;
}
.play-actions .cta--ghost {
  flex: 0 0 auto;
  width: auto;
}
.cta--go {
  flex: 1;
}

/* ---- History ---- */
.history {
  width: 100%;
  margin: 20px auto 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  background: var(--paper-lit);
  border: 2px solid var(--ink);
  border-radius: 12px;
}
.hrow__colors {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.dot {
  width: 20px;
  height: 20px;
  border: 2px solid var(--ink);
  border-radius: 6px;
}
.pegs {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(2, auto);
  grid-auto-columns: min-content;
  gap: 3px;
  flex-shrink: 0;
}
.peg {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid var(--ink);
}
.peg--exact {
  background: var(--ink);
}
.peg--present {
  background: var(--cream);
}
.peg--none {
  background: transparent;
  border-color: rgba(44, 19, 56, 0.3);
}

/* ---- Handoff / Result — per-page overrides only ---- */
.handoff__title {
  font-size: 28px;
}
.result__title {
  font-size: 34px;
}
.result__streak {
  margin: 0 0 14px;
}
</style>
