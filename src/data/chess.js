// Minimal but complete chess engine for the Catur mate puzzles, plus a library
// of positions verified by that engine (see scripts): every Mudah position is a
// mate in 1, every Sedang/Sulit position a forced mate in 2. The board is an
// Array(64), index 0 = a8 … 63 = h1. Pieces: uppercase = white (PNBRQK),
// lowercase = black, '' = empty. Move generation is perft-correct (initial,
// Kiwipete, and the standard edge positions all match), so the mate search built
// on it is sound.

export const rankOf = (i) => i >> 3 // 0 = rank 8
export const fileOf = (i) => i & 7 // 0 = file a
const idx = (r, f) => r * 8 + f
const onBoard = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8
const isWhitePiece = (p) => p >= 'A' && p <= 'Z'
const isBlackPiece = (p) => p >= 'a' && p <= 'z'
const sameColor = (p, white) => p !== '' && (white ? isWhitePiece(p) : isBlackPiece(p))
const enemyColor = (p, white) => p !== '' && (white ? isBlackPiece(p) : isWhitePiece(p))

export function squareName(i) {
  return 'abcdefgh'[fileOf(i)] + (8 - rankOf(i))
}

export function parseFen(fen) {
  const [placement, active, castling, ep] = fen.trim().split(/\s+/)
  const board = new Array(64).fill('')
  let i = 0
  for (const ch of placement) {
    if (ch === '/') continue
    if (ch >= '1' && ch <= '8') i += Number(ch)
    else board[i++] = ch
  }
  return {
    board,
    white: active === 'w',
    castling: {
      K: castling.includes('K'),
      Q: castling.includes('Q'),
      k: castling.includes('k'),
      q: castling.includes('q'),
    },
    ep: ep && ep !== '-' ? 'abcdefgh'.indexOf(ep[0]) + (8 - Number(ep[1])) * 8 : null,
  }
}

const ROOK_DIRS = [-8, 8, -1, 1]
const BISHOP_DIRS = [-9, -7, 7, 9]
const KNIGHT = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
]
const KING = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
]

// Is square `sq` attacked by the given colour (attackerWhite)?
export function isAttacked(board, sq, attackerWhite) {
  const r = rankOf(sq)
  const f = fileOf(sq)
  const pr = attackerWhite ? r + 1 : r - 1
  const pawn = attackerWhite ? 'P' : 'p'
  for (const df of [-1, 1]) if (onBoard(pr, f + df) && board[idx(pr, f + df)] === pawn) return true
  const knight = attackerWhite ? 'N' : 'n'
  for (const [dr, df] of KNIGHT) if (onBoard(r + dr, f + df) && board[idx(r + dr, f + df)] === knight) return true
  const king = attackerWhite ? 'K' : 'k'
  for (const [dr, df] of KING) if (onBoard(r + dr, f + df) && board[idx(r + dr, f + df)] === king) return true
  const rook = attackerWhite ? 'R' : 'r'
  const queen = attackerWhite ? 'Q' : 'q'
  const bishop = attackerWhite ? 'B' : 'b'
  for (const [dr, df, straight] of [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, 0], [-1, 1, 0], [1, -1, 0], [1, 1, 0],
  ]) {
    let rr = r + dr
    let ff = f + df
    while (onBoard(rr, ff)) {
      const p = board[idx(rr, ff)]
      if (p !== '') {
        if (p === queen || (straight ? p === rook : p === bishop)) return true
        break
      }
      rr += dr
      ff += df
    }
  }
  return false
}

function kingSquare(board, white) {
  const k = white ? 'K' : 'k'
  for (let i = 0; i < 64; i++) if (board[i] === k) return i
  return -1
}

export function isCheck(state) {
  return isAttacked(state.board, kingSquare(state.board, state.white), !state.white)
}

function pseudoMoves(state) {
  const { board, white } = state
  const moves = []
  const add = (from, to, promo) => moves.push({ from, to, promo: promo || null })
  for (let from = 0; from < 64; from++) {
    const p = board[from]
    if (p === '' || !sameColor(p, white)) continue
    const r = rankOf(from)
    const f = fileOf(from)
    const type = p.toUpperCase()
    if (type === 'P') {
      const dir = white ? -1 : 1
      const startRank = white ? 6 : 1
      const promoRank = white ? 0 : 7
      if (onBoard(r + dir, f) && board[idx(r + dir, f)] === '') {
        if (r + dir === promoRank) for (const pr of 'QRBN') add(from, idx(r + dir, f), white ? pr : pr.toLowerCase())
        else add(from, idx(r + dir, f))
        if (r === startRank && board[idx(r + 2 * dir, f)] === '') add(from, idx(r + 2 * dir, f))
      }
      for (const df of [-1, 1]) {
        if (!onBoard(r + dir, f + df)) continue
        const to = idx(r + dir, f + df)
        if (enemyColor(board[to], white)) {
          if (r + dir === promoRank) for (const pr of 'QRBN') add(from, to, white ? pr : pr.toLowerCase())
          else add(from, to)
        } else if (to === state.ep) add(from, to)
      }
    } else if (type === 'N') {
      for (const [dr, df] of KNIGHT) if (onBoard(r + dr, f + df) && !sameColor(board[idx(r + dr, f + df)], white)) add(from, idx(r + dr, f + df))
    } else if (type === 'K') {
      for (const [dr, df] of KING) if (onBoard(r + dr, f + df) && !sameColor(board[idx(r + dr, f + df)], white)) add(from, idx(r + dr, f + df))
      const rights = state.castling
      const backRank = white ? 7 : 0
      if (r === backRank && f === 4 && !isAttacked(board, from, !white)) {
        const ks = white ? rights.K : rights.k
        const qs = white ? rights.Q : rights.q
        if (ks && board[idx(backRank, 5)] === '' && board[idx(backRank, 6)] === '' &&
          !isAttacked(board, idx(backRank, 5), !white) && !isAttacked(board, idx(backRank, 6), !white)) add(from, idx(backRank, 6))
        if (qs && board[idx(backRank, 3)] === '' && board[idx(backRank, 2)] === '' && board[idx(backRank, 1)] === '' &&
          !isAttacked(board, idx(backRank, 3), !white) && !isAttacked(board, idx(backRank, 2), !white)) add(from, idx(backRank, 2))
      }
    } else {
      const dirs = type === 'R' ? ROOK_DIRS : type === 'B' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS]
      for (const d of dirs) {
        const dr = d === 8 ? 1 : d === -8 ? -1 : d === -9 || d === -7 ? -1 : d === 7 || d === 9 ? 1 : 0
        const df = d === 1 ? 1 : d === -1 ? -1 : d === -9 || d === 7 ? -1 : d === -7 || d === 9 ? 1 : 0
        let rr = r
        let ff = f
        while (true) {
          rr += dr
          ff += df
          if (!onBoard(rr, ff)) break
          const t = board[idx(rr, ff)]
          if (sameColor(t, white)) break
          add(from, idx(rr, ff))
          if (t !== '') break
        }
      }
    }
  }
  return moves
}

export function applyMove(state, m) {
  const board = state.board.slice()
  const castling = { ...state.castling }
  const p = board[m.from]
  const white = state.white
  const type = p.toUpperCase()
  let ep = null
  if (type === 'P' && m.to === state.ep && fileOf(m.from) !== fileOf(m.to)) board[idx(rankOf(m.from), fileOf(m.to))] = ''
  board[m.to] = m.promo ? m.promo : p
  board[m.from] = ''
  if (type === 'P' && Math.abs(rankOf(m.to) - rankOf(m.from)) === 2) ep = idx((rankOf(m.from) + rankOf(m.to)) / 2, fileOf(m.from))
  if (type === 'K' && Math.abs(fileOf(m.to) - fileOf(m.from)) === 2) {
    const br = rankOf(m.from)
    if (fileOf(m.to) === 6) { board[idx(br, 5)] = board[idx(br, 7)]; board[idx(br, 7)] = '' }
    else { board[idx(br, 3)] = board[idx(br, 0)]; board[idx(br, 0)] = '' }
  }
  if (type === 'K') { if (white) { castling.K = false; castling.Q = false } else { castling.k = false; castling.q = false } }
  const touch = (sq) => {
    if (sq === 63) castling.K = false
    if (sq === 56) castling.Q = false
    if (sq === 7) castling.k = false
    if (sq === 0) castling.q = false
  }
  touch(m.from)
  touch(m.to)
  return { board, white: !white, castling, ep }
}

export function generateLegalMoves(state) {
  const out = []
  for (const m of pseudoMoves(state)) {
    const next = applyMove(state, m)
    if (!isAttacked(next.board, kingSquare(next.board, state.white), !state.white)) out.push(m)
  }
  return out
}

export function isCheckmate(state) {
  return isCheck(state) && generateLegalMoves(state).length === 0
}
export function isStalemate(state) {
  return !isCheck(state) && generateLegalMoves(state).length === 0
}

// Can the side to move force checkmate in at most n of its own moves?
export function canForceMate(state, n) {
  const moves = generateLegalMoves(state)
  for (const m of moves) if (isCheckmate(applyMove(state, m))) return true
  if (n <= 1) return false
  for (const m of moves) {
    const s1 = applyMove(state, m)
    if (isCheckmate(s1)) return true
    const replies = generateLegalMoves(s1)
    if (replies.length === 0) continue
    let all = true
    for (const r of replies) if (!canForceMate(applyMove(s1, r), n - 1)) { all = false; break }
    if (all) return true
  }
  return false
}

// Is `move` a key that forces mate within n of the mover's moves? (n=1 → the
// move must checkmate; n=2 → it mates now, or every reply still loses to a mate.)
export function isMatingKey(state, move, n) {
  const s1 = applyMove(state, move)
  if (isCheckmate(s1)) return true
  if (n <= 1 || isStalemate(s1)) return false
  for (const r of generateLegalMoves(s1)) if (!canForceMate(applyMove(s1, r), n - 1)) return false
  return true
}

// Pick a defender's reply for the engine to play — the one that drags the game
// out longest (most legal moves), so it doesn't feel like it resigns instantly.
export function bestReply(state) {
  const replies = generateLegalMoves(state)
  let best = null
  let bestScore = -1
  for (const r of replies) {
    const s = applyMove(state, r)
    const score = generateLegalMoves(s).length
    if (score > bestScore) { bestScore = score; best = r }
  }
  return best
}

// A move (from,to) is legal here if it appears among the generated legal moves;
// returns the full move object (with the right promo) or null.
export function findMove(state, from, to, promo) {
  for (const m of generateLegalMoves(state)) {
    if (m.from === from && m.to === to && (!m.promo || !promo || m.promo.toUpperCase() === promo.toUpperCase())) {
      if (m.promo && promo) return { ...m, promo: state.white ? promo.toUpperCase() : promo.toLowerCase() }
      return m
    }
  }
  return null
}

// --- CPU (alpha-beta negamax with material + piece-square eval) -------------

const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 }
// Piece-square tables, white's view, index 0 = a8 (advancing = toward index 0).
const PST = {
  P: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  N: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  B: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  R: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  Q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  K: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
}
const MATE = 100000

// Static evaluation from the side-to-move's point of view.
export function evaluate(state) {
  let s = 0
  const b = state.board
  for (let i = 0; i < 64; i++) {
    const p = b[i]
    if (p === '') continue
    const white = p <= 'Z'
    const t = white ? p : p.toUpperCase()
    const sc = VALUE[t] + PST[t][white ? i : i ^ 56]
    s += white ? sc : -sc
  }
  return state.white ? s : -s
}

// Captures first (MVV-style) to make alpha-beta prune hard.
function orderMoves(state, moves) {
  const b = state.board
  return moves
    .map((m) => {
      const cap = b[m.to]
      const score = (cap ? 10 * VALUE[cap.toUpperCase()] : 0) + (m.promo ? VALUE[m.promo.toUpperCase()] : 0)
      return { m, score }
    })
    .sort((a, z) => z.score - a.score)
    .map((x) => x.m)
}

function negamax(state, depth, alpha, beta, ply) {
  if (depth <= 0) return evaluate(state)
  const moves = generateLegalMoves(state)
  if (moves.length === 0) return isCheck(state) ? -(MATE - ply) : 0
  let best = -Infinity
  for (const m of orderMoves(state, moves)) {
    const v = -negamax(applyMove(state, m), depth - 1, -beta, -alpha, ply + 1)
    if (v > best) best = v
    if (v > alpha) alpha = v
    if (alpha >= beta) break
  }
  return best
}

// Best move for the side to move at the given search depth. Ties are broken
// randomly (within a small margin) so the CPU isn't perfectly repetitive.
export function searchBestMove(state, depth) {
  const moves = orderMoves(state, generateLegalMoves(state))
  if (!moves.length) return null
  let bestVal = -Infinity
  const scored = []
  let alpha = -Infinity
  for (const m of moves) {
    const v = -negamax(applyMove(state, m), depth - 1, -Infinity, -alpha, 1)
    scored.push({ m, v })
    if (v > bestVal) bestVal = v
    if (v > alpha) alpha = v
  }
  const top = scored.filter((s) => s.v >= bestVal - 12).map((s) => s.m)
  return top[(Math.random() * top.length) | 0]
}

// Verified puzzle library. mudah = mate in 1; sedang/sulit = forced mate in 2.
// White is always to move ("Putih melangkah dan skakmat").
export const PUZZLES = {
  mudah: [
    'b7/7K/6Q1/3p4/n7/N7/8/2k5 w - - 0 1', '8/8/1p6/1pk1KQ2/R7/8/8/8 w - - 0 1',
    '5k2/Q7/6K1/1p5p/8/p7/4B3/8 w - - 0 1', '7k/8/6K1/8/5R2/6b1/1n6/8 w - - 0 1',
    'k7/3N4/4Q3/4p3/8/1K2p3/8/8 w - - 0 1', 'k7/2R4b/8/1K6/8/8/8/3Q4 w - - 0 1',
    '8/2p5/Q7/8/4p3/p1N5/8/k1K5 w - - 0 1', '8/6p1/8/Q7/8/p6k/3n1K2/B7 w - - 0 1',
    '8/8/8/2K2b2/8/8/3R2Q1/1k6 w - - 0 1', '3k4/8/1pQ5/4B3/8/8/7K/8 w - - 0 1',
    '3k4/1K5b/8/8/8/8/p4nQ1/4R3 w - - 0 1', '5k2/Q7/8/1p6/3K3R/4p3/5b2/8 w - - 0 1',
    '8/8/1R6/5Q2/8/k7/8/6K1 w - - 0 1', '8/8/p7/8/1K5p/5R2/7R/3k4 w - - 0 1',
    '1K1k4/8/2Q1B3/8/8/7r/8/8 w - - 0 1', '5k2/2R5/3b4/8/8/8/4K2R/8 w - - 0 1',
    '8/8/8/8/8/3B3K/1Q5b/6k1 w - - 0 1', '8/8/6R1/7k/3n4/8/3K3p/6Q1 w - - 0 1',
    '6k1/4R3/8/8/8/1K6/Q7/8 w - - 0 1', '8/2p4k/5B2/6Q1/3K4/p7/1n6/8 w - - 0 1',
    '8/1pK5/1Qp5/8/8/2B5/k6p/8 w - - 0 1', '8/8/8/2p1R3/6K1/3p4/5Q2/2k5 w - - 0 1',
    '2k2n2/2B5/2KQ4/8/8/8/8/8 w - - 0 1', '8/8/8/7R/8/2Q1K1k1/8/8 w - - 0 1',
    '5Q2/3B4/8/8/5K1k/8/8/8 w - - 0 1', '7K/8/8/8/3R4/8/4R1p1/1k6 w - - 0 1',
    '4R3/8/5Kpk/p7/2R5/8/2p5/8 w - - 0 1', '8/1RK2n2/8/8/8/k7/5Qp1/8 w - - 0 1',
    '8/8/8/4R3/2K5/8/1Q6/6k1 w - - 0 1', '1R6/8/8/8/R3K3/p2n4/3b4/k7 w - - 0 1',
    '8/8/8/8/3R4/6K1/8/7k w - - 0 1', '4n3/2bp4/6Q1/2K5/8/8/7k/7B w - - 0 1',
    '8/7b/R7/8/3Q4/2Kn4/2p5/2k5 w - - 0 1', '8/7k/8/1R6/6R1/8/3r2p1/4K3 w - - 0 1',
    '8/8/8/Kpk5/8/8/p7/1R1Q4 w - - 0 1', '8/pp6/8/8/Q7/8/5K1k/8 w - - 0 1',
    '6k1/2R5/2K2p2/4R3/7p/8/4p3/8 w - - 0 1', '8/5K1k/1R6/8/1rp5/2R5/8/8 w - - 0 1',
    '7k/R7/8/5R2/8/7K/8/8 w - - 0 1', '8/5B2/2p4k/8/2p5/8/5KQ1/8 w - - 0 1',
  ],
  sedang: [
    '4Q3/8/6K1/8/8/8/8/k1B5 w - - 0 1', '1K2k3/8/8/2B5/8/1Q6/8/2n5 w - - 0 1',
    '8/k6K/8/8/4B3/6Q1/8/8 w - - 0 1', 'k7/8/3NK3/5p2/2Q5/8/8/8 w - - 0 1',
    '2k5/3RRK2/8/1p6/8/1p6/8/8 w - - 0 1', '8/8/8/1Q1p1K2/4p3/8/k7/5R2 w - - 0 1',
    '4k3/8/8/4K3/8/2Q5/2R4p/8 w - - 0 1', 'B4k2/3K4/1p6/6Q1/7p/8/8/8 w - - 0 1',
    '8/7p/3ppK2/3k4/8/4Q3/8/4R3 w - - 0 1', '8/8/8/R5R1/3K4/8/8/3k4 w - - 0 1',
    '7k/8/8/p1Q3n1/8/8/K3R3/8 w - - 0 1', '5Q2/8/k7/8/B7/8/8/6K1 w - - 0 1',
    '8/8/8/5R2/6Q1/2k5/8/1K6 w - - 0 1', '8/8/8/8/4p1BK/8/1R6/6k1 w - - 0 1',
    '5R2/7K/6p1/8/6Q1/8/8/7k w - - 0 1', '2R5/3p4/pp2R3/8/8/7k/8/1K6 w - - 0 1',
    '7k/8/8/2R5/8/4p3/1K6/3Q4 w - - 0 1', '8/5Kb1/8/7k/1B6/2Q5/8/8 w - - 0 1',
    'K7/3p4/8/8/5R2/n3Q3/8/7k w - - 0 1', 'n7/4Q3/B7/8/5k2/8/5K2/8 w - - 0 1',
    '1k1N3K/8/8/8/6Q1/8/8/8 w - - 0 1', '8/8/8/1R6/8/4RK2/7k/8 w - - 0 1',
    '8/7k/4R3/2R3K1/8/8/8/8 w - - 0 1', '8/8/6B1/6K1/3Q4/8/8/2k5 w - - 0 1',
    '8/4k2p/8/3K2Rp/7Q/4p3/8/8 w - - 0 1', '8/8/2K5/B7/8/8/4Q3/k7 w - - 0 1',
    '8/7R/8/1R6/8/8/8/2k3K1 w - - 0 1', '5K1k/3B4/8/8/8/3N4/6R1/4b3 w - - 0 1',
    '8/6kp/2Q3p1/4p3/8/2K5/5R2/8 w - - 0 1', '8/3R1K2/p5p1/8/6R1/8/8/k7 w - - 0 1',
  ],
  sulit: [
    '8/7p/p7/7k/7n/6Q1/3R4/5K2 w - - 0 1', '4K3/8/8/p1Q5/8/4R3/6r1/5k2 w - - 0 1',
    '8/8/5n2/5p2/3Q4/2K4b/8/k7 w - - 0 1', '3K4/3pp2k/8/3b4/2R5/8/1Q6/8 w - - 0 1',
    '8/8/2p1n3/p3Q3/8/8/3kNK2/8 w - - 0 1', '8/8/2p5/4k3/Q7/2R1K3/p7/7n w - - 0 1',
    '6k1/8/2b3K1/4R3/2R2p2/8/4p3/8 w - - 0 1', '4N3/3Q1p1k/8/8/p5K1/8/8/6b1 w - - 0 1',
    '6R1/2r5/5K2/8/1R6/8/k7/8 w - - 0 1', '1k4n1/5p1p/7Q/8/8/5B2/2K5/8 w - - 0 1',
    '4k3/6K1/1p6/3Q4/8/2n3B1/1p6/8 w - - 0 1', '7k/2pK4/5R2/5Q2/1b6/8/6p1/8 w - - 0 1',
    '8/5Qp1/6K1/8/8/8/r4R2/3k4 w - - 0 1', '8/2K4k/5Q2/p7/3n2p1/8/8/2R5 w - - 0 1',
    '5Q2/8/K5p1/8/7k/8/4p3/5N1b w - - 0 1', 'n6Q/8/6K1/8/5k2/3R4/3p2b1/8 w - - 0 1',
    '2r4B/8/8/4Q3/8/4K3/8/4k3 w - - 0 1', '8/7k/2n2K2/8/8/7p/3Q2b1/8 w - - 0 1',
    '6B1/8/1Qn1p3/8/8/8/1K1p4/3k4 w - - 0 1', '5Q1r/2R5/8/k7/8/K7/8/8 w - - 0 1',
    '8/k1K5/8/5r2/5Q2/8/8/8 w - - 0 1', '4N3/3Q1n1k/8/6pK/p7/8/8/8 w - - 0 1',
    '8/3R4/6k1/8/5K2/4p3/6r1/3R4 w - - 0 1', 'K7/4p3/p5R1/n7/8/1k6/8/2Q5 w - - 0 1',
  ],
}
