// Backgammon engine. points[1..24] signed: +white / -black. White moves 24->1
// (home 1-6, bears off past 0); Black moves 1->24 (home 19-24, bears off past 25).
export function startState() {
  const points = new Array(26).fill(0)
  points[24] = 2; points[13] = 5; points[8] = 3; points[6] = 5 // white +
  points[1] = -2; points[12] = -5; points[17] = -3; points[19] = -5 // black -
  return { points, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, turn: 'w' }
}
const dir = (turn) => (turn === 'w' ? -1 : 1)
const sign = (turn) => (turn === 'w' ? 1 : -1)
const own = (v, turn) => (turn === 'w' ? v > 0 : v < 0)
const opp = (v, turn) => (turn === 'w' ? v < 0 : v > 0)

export function allHome(s, turn) {
  if (s.bar[turn]) return false
  if (turn === 'w') {
    for (let p = 7; p <= 24; p++) if (s.points[p] > 0) return false
  } else {
    for (let p = 1; p <= 18; p++) if (s.points[p] < 0) return false
  }
  return true
}

// Highest pip point still occupied (farthest from off) for bear-off overshoot.
function farthest(s, turn) {
  if (turn === 'w') { for (let p = 6; p >= 1; p--) if (s.points[p] > 0) return p }
  else { for (let p = 19; p <= 24; p++) if (s.points[p] < 0) return p }
  return 0
}

// Legal single moves for one die value. from: 'bar' or point; to: point or 'off'.
export function movesForDie(s, d) {
  const turn = s.turn
  const out = []
  const blocked = (p) => opp(s.points[p], turn) && Math.abs(s.points[p]) >= 2
  if (s.bar[turn] > 0) {
    const e = turn === 'w' ? 25 - d : d
    if (e >= 1 && e <= 24 && !blocked(e)) out.push({ from: 'bar', to: e, hit: opp(s.points[e], turn) })
    return out
  }
  for (let p = 1; p <= 24; p++) {
    if (!own(s.points[p], turn)) continue
    const t = p + dir(turn) * d
    if (t >= 1 && t <= 24) {
      if (!blocked(t)) out.push({ from: p, to: t, hit: opp(s.points[t], turn) })
    } else if (allHome(s, turn)) {
      const exact = turn === 'w' ? p === d : 25 - p === d
      if (exact) out.push({ from: p, to: 'off' })
      else {
        const over = turn === 'w' ? d > p : d > 25 - p
        if (over && farthest(s, turn) === p) out.push({ from: p, to: 'off' })
      }
    }
  }
  return out
}

export function applyMove(s, m) {
  const points = s.points.slice()
  const bar = { ...s.bar }
  const off = { ...s.off }
  const turn = s.turn
  const sg = sign(turn)
  if (m.from === 'bar') bar[turn]--
  else points[m.from] -= sg
  if (m.to === 'off') off[turn]++
  else {
    if (opp(points[m.to], turn)) { points[m.to] = 0; bar[turn === 'w' ? 'b' : 'w']++ } // hit
    points[m.to] += sg
  }
  return { points, bar, off, turn }
}

export function winner(s) {
  if (s.off.w === 15) return 'w'
  if (s.off.b === 15) return 'b'
  return null
}

// pip count (total distance to bear off) for `turn`.
export function pip(s, turn) {
  let total = s.bar[turn] * 25
  for (let p = 1; p <= 24; p++) {
    if (own(s.points[p], turn)) {
      const dist = turn === 'w' ? p : 25 - p
      total += Math.abs(s.points[p]) * dist
    }
  }
  return total
}

// All end-states after playing a turn with `dice`, using the MAXIMUM number of
// dice possible. Returns [{state, moves}]. dice = [a,b] or [d,d,d,d] for doubles.
export function turnEndStates(s0, dice) {
  const results = []
  let maxUsed = 0
  const isDouble = dice.length === 4
  function rec(s, remaining, moves) {
    // try each distinct remaining die
    const tried = new Set()
    let advanced = false
    for (let i = 0; i < remaining.length; i++) {
      const d = remaining[i]
      if (tried.has(d)) continue
      tried.add(d)
      const ms = movesForDie(s, d)
      for (const m of ms) {
        advanced = true
        const rest = remaining.slice()
        rest.splice(i, 1)
        rec(applyMove(s, m), rest, [...moves, { ...m, die: d }])
      }
    }
    if (!advanced) {
      if (moves.length > maxUsed) maxUsed = moves.length
      results.push({ state: s, moves })
    }
  }
  // For non-doubles, also try the reverse order implicitly handled by picking any die each step.
  rec(s0, dice, [])
  const best = results.filter((r) => r.moves.length === maxUsed)
  // dedupe by resulting board signature
  const seen = new Set()
  const uniq = []
  for (const r of best) {
    const sig = r.state.points.join(',') + '|' + r.state.bar.w + ',' + r.state.bar.b + '|' + r.state.off.w + ',' + r.state.off.b
    if (!seen.has(sig)) { seen.add(sig); uniq.push(r) }
  }
  return { states: uniq, maxUsed }
}

// Simple positional eval from `turn`'s view (higher = better).
export function evaluate(s, turn) {
  const me = turn
  const you = turn === 'w' ? 'b' : 'w'
  let score = (pip(s, you) - pip(s, me)) // ahead in the race
  score += (s.off[me] - s.off[you]) * 8
  score += s.bar[you] * 12 - s.bar[me] * 15
  // blots (single checkers) are risky; made points are good
  for (let p = 1; p <= 24; p++) {
    const v = s.points[p]
    if (v === 0) continue
    const cnt = Math.abs(v)
    const isMine = own(v, me)
    if (isMine && cnt === 1) score -= 3
    if (isMine && cnt >= 2) score += 1
  }
  return score
}

export function chooseTurn(s, dice) {
  const { states } = turnEndStates(s, dice)
  if (!states.length) return { state: s, moves: [] }
  let best = states[0]
  let bestV = -Infinity
  for (const r of states) {
    const v = evaluate(r.state, s.turn)
    if (v > bestV) { bestV = v; best = r }
  }
  return best
}

export function rollDice() {
  const a = 1 + ((Math.random() * 6) | 0)
  const b = 1 + ((Math.random() * 6) | 0)
  return a === b ? [a, a, a, a] : [a, b]
}
