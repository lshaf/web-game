<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import SuitHand from '../components/SuitHand.vue'
import { sfx } from '../sound.js'

// Batu-Gunting-Kertas. Two modes: vs a random CPU, or pass-and-play (Player 1
// picks in secret, hands over, Player 2 picks). First to 5 rounds wins.
const CHOICES = [
  { key: 'batu', label: 'Batu' },
  { key: 'gunting', label: 'Gunting' },
  { key: 'kertas', label: 'Kertas' },
]
const BEATS = { batu: 'gunting', gunting: 'kertas', kertas: 'batu' }
const TARGET = 5

const mode = ref(null) // null (picker) | 'cpu' | 'duo'
// stage — cpu: 'pick' | 'reveal'; duo: 'p1' | 'handoff' | 'p2' | 'reveal'
const stage = ref('pick')
const pickA = ref(null) // you / Player 1
const pickB = ref(null) // CPU / Player 2
const roundOutcome = ref(null) // 'a' | 'b' | 'seri'
const scoreA = ref(0)
const scoreB = ref(0)

const matchOver = computed(() => scoreA.value >= TARGET || scoreB.value >= TARGET)

const status = computed(() =>
  mode.value === 'cpu'
    ? `Kamu ${scoreA.value} — ${scoreB.value} CPU`
    : `P1 ${scoreA.value} — ${scoreB.value} P2`,
)

const prompt = computed(() => {
  if (stage.value === 'reveal') {
    if (matchOver.value) {
      if (mode.value === 'cpu') return scoreA.value > scoreB.value ? 'Kamu juara!' : 'CPU juara.'
      return scoreA.value > scoreB.value ? 'Pemain 1 juara!' : 'Pemain 2 juara!'
    }
    if (roundOutcome.value === 'seri') return 'Seri!'
    if (mode.value === 'cpu') return roundOutcome.value === 'a' ? 'Kamu menang ronde!' : 'CPU menang ronde'
    return roundOutcome.value === 'a' ? 'Pemain 1 menang ronde!' : 'Pemain 2 menang ronde!'
  }
  if (stage.value === 'handoff') return 'Serahkan ke Pemain 2'
  if (stage.value === 'p1') return 'Pemain 1 — pilih diam-diam'
  if (stage.value === 'p2') return 'Pemain 2 — pilih'
  return 'Pilih lemparanmu'
})

const picking = computed(() => ['pick', 'p1', 'p2'].includes(stage.value))

function judge(a, b) {
  if (a === b) return 'seri'
  return BEATS[a] === b ? 'a' : 'b'
}

function chooseMode(m) {
  mode.value = m
  startMatch()
}
function startMatch() {
  scoreA.value = 0
  scoreB.value = 0
  startRound()
}
function startRound() {
  pickA.value = null
  pickB.value = null
  roundOutcome.value = null
  stage.value = mode.value === 'cpu' ? 'pick' : 'p1'
}

function pick(c) {
  if (stage.value === 'pick') {
    pickA.value = c
    pickB.value = CHOICES[Math.floor(Math.random() * CHOICES.length)].key
    resolve()
  } else if (stage.value === 'p1') {
    pickA.value = c
    stage.value = 'handoff'
  } else if (stage.value === 'p2') {
    pickB.value = c
    resolve()
  }
}

function ready() {
  stage.value = 'p2'
}

function resolve() {
  roundOutcome.value = judge(pickA.value, pickB.value)
  if (roundOutcome.value === 'a') scoreA.value++
  else if (roundOutcome.value === 'b') scoreB.value++
  stage.value = 'reveal'
  if (matchOver.value) {
    if (mode.value === 'cpu' && scoreB.value > scoreA.value) sfx.lose()
    else sfx.win()
  } else {
    sfx.tick()
  }
}

function next() {
  if (matchOver.value) startMatch()
  else startRound()
}

function backToModes() {
  mode.value = null
}

function onKeydown(e) {
  if (!mode.value) return
  if (stage.value === 'reveal' && e.key === 'Enter') {
    e.preventDefault()
    next()
    return
  }
  if (stage.value === 'handoff' && e.key === 'Enter') {
    e.preventDefault()
    ready()
    return
  }
  if (picking.value && ['1', '2', '3'].includes(e.key)) {
    pick(CHOICES[Number(e.key) - 1].key)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="suit">
    <div class="panel">
      <!-- Mode picker -->
      <section v-if="!mode" class="screen">
        <p class="brand">SUIT</p>
        <p class="eyebrow">BATU · GUNTING · KERTAS</p>
        <button class="cta" type="button" @click="chooseMode('cpu')">Lawan Komputer ▸</button>
        <button class="cta cta--alt" type="button" @click="chooseMode('duo')">2 Pemain ▸</button>
      </section>

      <!-- Game -->
      <section v-else class="screen">
        <div class="topbar">
          <button class="mini" type="button" @click="backToModes">← Mode</button>
          <span class="status">{{ status }}</span>
          <span class="mini mini--ghost" aria-hidden="true" />
        </div>

        <div class="arena">
          <div class="hand-slot" :class="{ 'is-win': stage === 'reveal' && roundOutcome === 'a' }">
            <SuitHand :choice="stage === 'reveal' ? pickA : null" />
            <span class="hand-slot__name">{{ mode === 'cpu' ? 'Kamu' : 'P1' }}</span>
          </div>
          <span class="arena__vs">VS</span>
          <div class="hand-slot" :class="{ 'is-win': stage === 'reveal' && roundOutcome === 'b' }">
            <SuitHand :choice="stage === 'reveal' ? pickB : null" />
            <span class="hand-slot__name">{{ mode === 'cpu' ? 'CPU' : 'P2' }}</span>
          </div>
        </div>

        <p class="prompt" :class="{ 'is-over': matchOver && stage === 'reveal' }">{{ prompt }}</p>

        <div v-if="picking" class="choices">
          <button v-for="c in CHOICES" :key="c.key" class="choice" type="button" @click="pick(c.key)">
            <SuitHand :choice="c.key" />
            <span>{{ c.label }}</span>
          </button>
        </div>
        <button v-else-if="stage === 'handoff'" class="cta cta--alt" type="button" @click="ready">
          Pemain 2, siap ▸
        </button>
        <button v-else class="cta" type="button" @click="next">
          {{ matchOver ? 'Main lagi ▸' : 'Lanjut ▸' }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.suit {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding: 4px max(14px, env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom))
    max(14px, env(safe-area-inset-left));
}
.panel {
  padding: 26px 22px 28px;
}
.brand {
  font-size: 40px;
}

.arena {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 6px 0 14px;
}
.hand-slot {
  flex: 1;
  max-width: 130px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 10px 8px;
  background: var(--paper-lit);
  border: var(--line) solid var(--ink);
  border-radius: 16px;
  box-shadow: 0 4px 0 var(--ink);
  transition: background 0.15s ease;
}
.hand-slot :deep(.hand) {
  width: 64px;
  height: 64px;
}
.hand-slot__name {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--muted);
}
.hand-slot.is-win {
  background: var(--sun);
}
.arena__vs {
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--berry);
}

.prompt {
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--ink);
  text-align: center;
  margin: 2px 0 16px;
  min-height: 1.2em;
}
.prompt.is-over {
  color: var(--berry);
  font-size: 26px;
}

.choices {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 8px;
  background: var(--cream);
  border: var(--line) solid var(--ink);
  border-radius: 14px;
  box-shadow: 0 4px 0 var(--ink);
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink);
  transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.12s ease;
}
.choice :deep(.hand) {
  width: 46px;
  height: 46px;
}
.choice:hover,
.choice:focus-visible {
  transform: translateY(-2px);
  box-shadow: 0 6px 0 var(--ink);
  background: var(--tile-live);
}
.choice:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 var(--ink);
}
</style>
