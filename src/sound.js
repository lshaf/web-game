import { ref } from 'vue'

// Tiny Web Audio sound module — every effect is synthesized on the fly, so
// there are no audio files to ship and it all works offline in the PWA.

const muteKey = 'dusk-muted'
let initialMuted = false
try {
  initialMuted = localStorage.getItem(muteKey) === '1'
} catch (e) {
  initialMuted = false
}

// Reactive so a menu/toolbar toggle updates live.
export const muted = ref(initialMuted)

let ctx = null
function audio() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  // Browsers start the context suspended until a user gesture; resume on use.
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// One oscillator blip with an attack/decay envelope. `from`/`to` glide the
// pitch; otherwise it holds `freq`.
function blip(freq, { type = 'square', dur = 0.12, gain = 0.15, from, to, delay = 0 } = {}) {
  const c = audio()
  if (!c || muted.value) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  if (from && to) {
    osc.frequency.setValueAtTime(from, t0)
    osc.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  } else {
    osc.frequency.setValueAtTime(freq, t0)
  }
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.03)
}

function sequence(notes, opts = {}) {
  const step = opts.step ?? 0.12
  notes.forEach((f, i) => blip(f, { ...opts, delay: i * step }))
}

export const sfx = {
  // A quick upward chirp for a Dino jump.
  jump: () => blip(0, { type: 'square', from: 240, to: 520, dur: 0.14, gain: 0.16 }),
  // A soft, short flutter for a Flappy flap.
  flap: () => blip(0, { type: 'triangle', from: 420, to: 240, dur: 0.09, gain: 0.14 }),
  // A low buzzer for a wrong letter / wrong arrangement.
  wrong: () => {
    blip(190, { type: 'sawtooth', dur: 0.14, gain: 0.13 })
    blip(130, { type: 'sawtooth', dur: 0.18, gain: 0.13, delay: 0.09 })
  },
  // A rising major arpeggio on a win.
  win: () => sequence([523, 659, 784, 1047], { type: 'square', dur: 0.15, gain: 0.14, step: 0.11 }),
  // A falling figure on a loss.
  lose: () => sequence([392, 330, 262], { type: 'triangle', dur: 0.22, gain: 0.14, step: 0.15 }),
  // A neutral click for a placed tile / move.
  tick: () => blip(0, { type: 'square', from: 320, to: 380, dur: 0.05, gain: 0.09 }),
}

export function toggleMute() {
  muted.value = !muted.value
  try {
    localStorage.setItem(muteKey, muted.value ? '1' : '0')
  } catch (e) {
    /* storage may be blocked; keep in-memory preference */
  }
  return muted.value
}
