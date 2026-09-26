/**
 * MEMÓRIA — pure, deterministic engine for the RoqueOS Games gallery.
 *
 * A concentration / matching game: flip two cards; a symbol match locks them
 * face-up and grows the combo, a miss flips them back and breaks it. The board
 * is shuffled from a seed (mulberry32) so runs are reproducible and the engine
 * is fully unit-testable. The component owns rendering, sound, the flip-back
 * timing and the wall-clock; the engine is time-agnostic (score reads
 * `state.elapsedMs`, which the component fills in).
 */

export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const DIFFICULTIES = {
  easy: { cols: 4, rows: 4 }, // 8 pairs
  medium: { cols: 6, rows: 4 }, // 12 pairs
  hard: { cols: 6, rows: 5 }, // 15 pairs
}

export const pairCount = (diff) => {
  const d = DIFFICULTIES[diff] || DIFFICULTIES.medium
  return (d.cols * d.rows) / 2
}

/**
 * Level ramp — the board grows every level so the run "gets harder" (founder:
 * "vai complicando e aumentando a quantidade de cartas de acordo com os
 * níveis"). Card count is always even and pairs never exceed the symbol set
 * (15), so no two pairs ever share a glyph. Level 8 (6×5, 15 pairs) is the cap.
 */
export const LEVEL_GRIDS = [
  { cols: 2, rows: 2 }, // L1 — 2 pairs
  { cols: 3, rows: 2 }, // L2 — 3 pairs
  { cols: 4, rows: 2 }, // L3 — 4 pairs
  { cols: 4, rows: 3 }, // L4 — 6 pairs
  { cols: 4, rows: 4 }, // L5 — 8 pairs
  { cols: 5, rows: 4 }, // L6 — 10 pairs
  { cols: 6, rows: 4 }, // L7 — 12 pairs
  { cols: 6, rows: 5 }, // L8 — 15 pairs (cap)
]
export const MAX_LEVEL = LEVEL_GRIDS.length

/** Grid for a level (1-based), clamped to the ramp. */
export const levelGrid = (level) => LEVEL_GRIDS[Math.min(Math.max(1, level | 0), MAX_LEVEL) - 1]

/** Fisher–Yates using the seeded rng — deterministic for a given seed. */
export function shuffle(arr, rng) {
  const a = arr.slice()
  // `i >= 1` e não `i > 0`: a mesma parada, mas verificável. Com `i > 0` a
  // única variação possível (`i >= 0`) trocaria a[0] por a[0], um passo que não
  // muda nada, e nenhum baralho separaria as duas formas. Com `i >= 1` a
  // variação (`i > 1`) pula a última troca e o baralho sai diferente.
  for (let i = a.length - 1; i >= 1; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function createGame(seed = 1, opts = {}) {
  // Two modes: level-based (a growing run — pass opts.level) or a fixed
  // difficulty (legacy quick game). Level mode is the default flow now.
  const levelMode = opts.level != null || opts.difficulty == null
  const level = Math.max(1, opts.level | 0 || 1)
  const difficulty = DIFFICULTIES[opts.difficulty] ? opts.difficulty : 'medium'
  const { cols, rows } = levelMode ? levelGrid(level) : DIFFICULTIES[difficulty]
  return {
    status: 'idle', // 'idle' | 'playing' | 'won'
    seed: seed >>> 0,
    levelMode,
    level,
    difficulty,
    cols,
    rows,
    pairs: (cols * rows) / 2,
    cards: [], // { symbol, flipped, matched }
    flipped: [], // indices currently face-up + unmatched (≤2)
    locked: false, // true while a mismatch is being shown
    moves: 0,
    matches: 0,
    combo: 0,
    bestCombo: 0,
    elapsedMs: 0,
    totalScore: 0, // accumulated across cleared levels (level mode)
    best: opts.best || 0,
    rng: mulberry32(seed),
  }
}

/**
 * Advance to the next level: bank this board's score, grow the grid, re-deal.
 * Per-board counters reset; `level`/`totalScore` carry. Call after a board is
 * cleared (status 'won') while `level < MAX_LEVEL`. Returns the state.
 */
export function advanceLevel(state, seed) {
  state.totalScore = (state.totalScore || 0) + computeScore(state)
  state.level = Math.min(MAX_LEVEL, (state.level || 1) + 1)
  const { cols, rows } = levelGrid(state.level)
  state.cols = cols
  state.rows = rows
  state.pairs = (cols * rows) / 2
  state.seed = (seed != null ? seed : state.seed + 0x9e3779b1) >>> 0
  return startGame(state)
}

/** True when the just-cleared board was the final (cap) level. */
export const isFinalLevel = (state) => (state.level || 1) >= MAX_LEVEL

export function startGame(state) {
  state.rng = mulberry32(state.seed)
  const symbols = []
  for (let s = 0; s < state.pairs; s++) symbols.push(s, s)
  const deck = shuffle(symbols, state.rng)
  state.cards = deck.map((symbol) => ({ symbol, flipped: false, matched: false }))
  state.flipped = []
  state.locked = false
  state.moves = 0
  state.matches = 0
  state.combo = 0
  state.bestCombo = 0
  state.elapsedMs = 0
  state.status = 'playing'
  return state
}

/**
 * Flip card `index`. Returns { ok, type }:
 *   'first'    → first card of a pair shown
 *   'match'    → the two face-up cards matched (combo grows, maybe win)
 *   'mismatch' → the two differ; the board is now locked until resolveMismatch()
 * Illegal flips (locked, already up/matched, out of range) return { ok:false }.
 */
export function flip(state, index) {
  if (state.status !== 'playing' || state.locked) return { ok: false }
  const card = state.cards[index]
  if (!card || card.matched || card.flipped) return { ok: false }

  card.flipped = true
  state.flipped.push(index)

  if (state.flipped.length < 2) return { ok: true, type: 'first', index }

  state.moves += 1
  const [a, b] = state.flipped
  if (state.cards[a].symbol === state.cards[b].symbol) {
    state.cards[a].matched = true
    state.cards[b].matched = true
    state.matches += 1
    state.combo += 1
    // Math.max: reatribuir um recorde IGUAL não muda nada.
    state.bestCombo = Math.max(state.bestCombo, state.combo)
    state.flipped = []
    if (state.matches === state.pairs) state.status = 'won'
    return { ok: true, type: 'match', indices: [a, b], won: state.status === 'won' }
  }

  state.locked = true
  return { ok: true, type: 'mismatch', indices: [a, b] }
}

/** Flip the two mismatched cards back down and break the combo. */
export function resolveMismatch(state) {
  for (const i of state.flipped) {
    if (state.cards[i]) state.cards[i].flipped = false
  }
  state.flipped = []
  state.locked = false
  state.combo = 0
  return state
}

export const isWon = (state) => state.status === 'won'

/**
 * Score (higher is better): rewards few moves, fast finishes and long combo
 * streaks, scaled by difficulty. Pure — reads state.elapsedMs.
 */
export function computeScore(state) {
  const secs = Math.floor(state.elapsedMs / 1000)
  const base = state.pairs * 120
  const comboBonus = state.bestCombo * 40
  const movePenalty = Math.max(0, state.moves - state.pairs) * 10
  const timePenalty = secs * 2
  const raw = base + comboBonus - movePenalty - timePenalty
  return Math.max(state.pairs * 30, Math.round(raw))
}
