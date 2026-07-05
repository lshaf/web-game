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
let primed = false

function makeCtx() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

// Resume a suspended context. The browser only honors this from a user gesture,
// which is why unlock() below is wired to the first tap/key — resuming from a
// timer or rAF (where most blips fire) is silently ignored.
function resume() {
  if (ctx && ctx.state === 'suspended') {
    try {
      ctx.resume()
    } catch (e) {
      /* not resumable right now; a later gesture will retry */
    }
  }
}

function audio() {
  const c = makeCtx()
  if (!c) return null
  resume()
  return c
}

// A master gain feeding a tanh soft-clipper, so the synthesized blips — quiet on
// their own, and quieter still on Android phone speakers — come out loud and
// clear. Driving 4× into a smooth tanh curve raises the average level (what the
// ear reads as loudness) while mathematically bounding the output to ±0.95, so
// it can never hard-clip even when several blips overlap. A plain limiter lets
// transient peaks slip past 1.0 (audible distortion) once you push it this hard;
// the soft-clipper doesn't. Measured ~30% louder (RMS) than the previous
// limiter setup, with peaks staying near 0.86.
let master = null
function output() {
  const c = makeCtx()
  if (!c) return null
  if (!master) {
    master = c.createGain()
    master.gain.value = 4.0 // drive into the soft clipper
    const shaper = c.createWaveShaper()
    const n = 2048
    const curve = new Float32Array(n)
    const drive = 1.5
    const norm = Math.tanh(drive)
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1
      curve[i] = (0.95 * Math.tanh(drive * x)) / norm // ceiling 0.95, smooth knee
    }
    shaper.curve = curve
    shaper.oversample = '2x' // tame aliasing from the clipping
    master.connect(shaper)
    shaper.connect(c.destination)
  }
  return master
}

// Installed (standalone) PWAs enforce the autoplay policy strictly: the
// AudioContext starts suspended and only a real user gesture can resume it.
// Most game blips fire from timers/rAF rather than directly from a tap, so
// without this priming those sounds are dropped and audio "often doesn't come
// out" after install. A zero-gain blip also fully unlocks WebAudio on iOS.
function unlock() {
  const c = makeCtx()
  if (!c) return
  resume()
  if (primed) return
  try {
    const osc = c.createOscillator()
    const g = c.createGain()
    g.gain.value = 0
    osc.connect(g).connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + 0.03)
    primed = true
  } catch (e) {
    /* priming failed; the resume above still helps */
  }
}

if (typeof window !== 'undefined') {
  // Prime on the first real gesture, and keep listening so a context that gets
  // re-suspended (e.g. after the PWA is backgrounded) is revived on the next
  // tap or key. Capture + passive so it never interferes with game controls.
  for (const ev of ['pointerdown', 'touchend', 'keydown']) {
    window.addEventListener(ev, unlock, { passive: true, capture: true })
  }
  // Returning to the foreground re-suspends the context on many platforms; try
  // to resume as soon as the app is visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resume()
  })
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
  osc.connect(g).connect(output() || c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.03)
}

function sequence(notes, opts = {}) {
  const step = opts.step ?? 0.12
  notes.forEach((f, i) => blip(f, { ...opts, delay: i * step }))
}

// Fire a haptic pulse alongside the big moments. Gated on the same mute toggle
// as sound; navigator.vibrate is a harmless no-op on desktop / unsupported
// browsers (e.g. iOS Safari).
function buzz(pattern) {
  if (muted.value) return
  try {
    navigator.vibrate?.(pattern)
  } catch (e) {
    /* vibration blocked/unsupported; ignore */
  }
}

export const sfx = {
  // A quick upward chirp for a Dino jump.
  jump: () => blip(0, { type: 'square', from: 240, to: 520, dur: 0.14, gain: 0.16 }),
  // A soft, short flutter for a Flappy flap.
  flap: () => blip(0, { type: 'triangle', from: 420, to: 240, dur: 0.09, gain: 0.14 }),
  // A low buzzer + short buzz for a wrong letter / wrong arrangement.
  wrong: () => {
    buzz(45)
    blip(190, { type: 'sawtooth', dur: 0.14, gain: 0.13 })
    blip(130, { type: 'sawtooth', dur: 0.18, gain: 0.13, delay: 0.09 })
  },
  // A rising major arpeggio + celebratory buzz on a win.
  win: () => {
    buzz([25, 40, 30])
    sequence([523, 659, 784, 1047], { type: 'square', dur: 0.15, gain: 0.14, step: 0.11 })
  },
  // A falling figure + one buzz on a loss.
  lose: () => {
    buzz(70)
    sequence([392, 330, 262], { type: 'triangle', dur: 0.22, gain: 0.14, step: 0.15 })
  },
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
