import { describe, it, expect } from 'vitest'
import {
  mulberry32,
  DIFFICULTIES,
  pairCount,
  shuffle,
  createGame,
  startGame,
  flip,
  resolveMismatch,
  isWon,
  computeScore,
  LEVEL_GRIDS,
  MAX_LEVEL,
  levelGrid,
  advanceLevel,
  isFinalLevel,
} from '../src/engine.js'

const play = (seed = 7, difficulty = 'medium') => startGame(createGame(seed, { difficulty }))

// Drive the whole board to victory by pairing symbols greedily (with the
// mismatch flip-back handled inline). Deterministic — no timers.
const solve = (s) => {
  let guard = 0
  while (!isWon(s) && guard++ < 500) {
    // find first two unmatched cards with the same symbol
    const byIndex = s.cards.map((c, i) => ({ ...c, i })).filter((c) => !c.matched)
    const a = byIndex[0]
    const b = byIndex.find((c) => c.i !== a.i && c.symbol === a.symbol)
    flip(s, a.i)
    const res = flip(s, b.i)
    if (res.type === 'mismatch') resolveMismatch(s)
  }
  return s
}

describe('memory/engine — setup', () => {
  it('difficulty tables yield even boards with the right pair count', () => {
    for (const key of Object.keys(DIFFICULTIES)) {
      const { cols, rows } = DIFFICULTIES[key]
      expect((cols * rows) % 2).toBe(0)
      expect(pairCount(key)).toBe((cols * rows) / 2)
    }
  })

  it('start deals exactly two of every symbol, all face-down', () => {
    const s = play(11, 'easy')
    expect(s.status).toBe('playing')
    expect(s.cards).toHaveLength(16)
    const counts = {}
    for (const c of s.cards) {
      counts[c.symbol] = (counts[c.symbol] || 0) + 1
      expect(c.flipped).toBe(false)
      expect(c.matched).toBe(false)
    }
    expect(Object.keys(counts)).toHaveLength(8)
    expect(Object.values(counts).every((n) => n === 2)).toBe(true)
  })
})

describe('memory/engine — determinism', () => {
  it('same seed → identical deck order', () => {
    const a = play(42)
    const b = play(42)
    expect(a.cards.map((c) => c.symbol)).toEqual(b.cards.map((c) => c.symbol))
  })

  it('shuffle is a permutation (no lost/added items)', () => {
    const rng = mulberry32(3)
    const src = [0, 0, 1, 1, 2, 2, 3, 3]
    const out = shuffle(src, rng)
    expect(out.slice().sort()).toEqual(src.slice().sort())
    expect(out).toHaveLength(src.length)
  })
})

describe('memory/engine — flipping', () => {
  it('first flip just shows a card; second matching flip locks the pair', () => {
    const s = play()
    // find a known pair
    const sym = s.cards[0].symbol
    const twin = s.cards.findIndex((c, i) => i !== 0 && c.symbol === sym)
    const r1 = flip(s, 0)
    expect(r1.type).toBe('first')
    const r2 = flip(s, twin)
    expect(r2.type).toBe('match')
    expect(s.cards[0].matched).toBe(true)
    expect(s.cards[twin].matched).toBe(true)
    expect(s.matches).toBe(1)
    expect(s.combo).toBe(1)
    expect(s.moves).toBe(1)
  })

  it('a mismatch locks the board and resolveMismatch flips both back + breaks combo', () => {
    const s = play()
    // pick two cards with different symbols
    const a = 0
    const b = s.cards.findIndex((c, i) => i !== a && c.symbol !== s.cards[a].symbol)
    s.combo = 3 // pretend we were on a streak
    flip(s, a)
    const res = flip(s, b)
    expect(res.type).toBe('mismatch')
    expect(s.locked).toBe(true)
    // further flips are refused while locked
    expect(flip(s, 2).ok).toBe(false)
    resolveMismatch(s)
    expect(s.cards[a].flipped).toBe(false)
    expect(s.cards[b].flipped).toBe(false)
    expect(s.locked).toBe(false)
    expect(s.combo).toBe(0)
  })

  it('refuses illegal flips (already matched / already up / out of range)', () => {
    const s = play()
    const sym = s.cards[0].symbol
    const twin = s.cards.findIndex((c, i) => i !== 0 && c.symbol === sym)
    flip(s, 0)
    flip(s, twin) // matched now
    expect(flip(s, 0).ok).toBe(false) // matched
    expect(flip(s, 999).ok).toBe(false) // out of range
    flip(s, 1)
    expect(flip(s, 1).ok).toBe(false) // already face-up
  })
})

describe('memory/engine — winning', () => {
  it('solving the whole board flags a win with matches === pairs', () => {
    const s = solve(play(5, 'easy'))
    expect(isWon(s)).toBe(true)
    expect(s.matches).toBe(s.pairs)
    expect(s.moves).toBe(s.pairs) // perfect (greedy) solve = one move per pair
    expect(s.bestCombo).toBe(s.pairs)
  })
})

describe('memory/engine — level progression', () => {
  it('the ramp is strictly non-decreasing, even, and never exceeds 15 pairs', () => {
    let prev = 0
    for (const { cols, rows } of LEVEL_GRIDS) {
      const cards = cols * rows
      expect(cards % 2).toBe(0)
      expect(cards).toBeGreaterThanOrEqual(prev) // grows (or holds)
      expect(cards / 2).toBeLessThanOrEqual(15) // never more pairs than symbols
      prev = cards
    }
  })

  it('levelGrid clamps out-of-range levels to the ramp ends', () => {
    expect(levelGrid(1)).toEqual(LEVEL_GRIDS[0])
    expect(levelGrid(0)).toEqual(LEVEL_GRIDS[0])
    expect(levelGrid(-5)).toEqual(LEVEL_GRIDS[0])
    expect(levelGrid(MAX_LEVEL)).toEqual(LEVEL_GRIDS[MAX_LEVEL - 1])
    expect(levelGrid(999)).toEqual(LEVEL_GRIDS[MAX_LEVEL - 1])
  })

  it('createGame defaults to level mode (level 1) when no difficulty is given', () => {
    const s = createGame(1)
    expect(s.levelMode).toBe(true)
    expect(s.level).toBe(1)
    expect(s.cols).toBe(LEVEL_GRIDS[0].cols)
    expect(s.rows).toBe(LEVEL_GRIDS[0].rows)
  })

  it('a fixed difficulty still opts out of level mode (backward compatible)', () => {
    const s = createGame(1, { difficulty: 'hard' })
    expect(s.levelMode).toBe(false)
    expect(s.cols).toBe(DIFFICULTIES.hard.cols)
  })

  it('advanceLevel banks the cleared score, grows the grid and re-deals', () => {
    const s = startGame(createGame(9, { level: 1 }))
    // clear level 1 (2×2)
    while (!isWon(s)) {
      const un = s.cards.map((c, i) => ({ ...c, i })).filter((c) => !c.matched)
      const a = un[0]
      const b = un.find((c) => c.i !== a.i && c.symbol === a.symbol)
      flip(s, a.i)
      const r = flip(s, b.i)
      if (r.type === 'mismatch') resolveMismatch(s)
    }
    expect(isFinalLevel(s)).toBe(false)
    const prevPairs = s.pairs
    advanceLevel(s)
    expect(s.level).toBe(2)
    expect(s.totalScore).toBeGreaterThan(0) // banked the L1 score
    expect(s.pairs).toBeGreaterThan(prevPairs) // bigger board
    expect(s.cards).toHaveLength(s.cols * s.rows)
    expect(s.status).toBe('playing')
    expect(s.matches).toBe(0) // per-board counters reset
  })

  it('isFinalLevel is true only at the cap level', () => {
    expect(isFinalLevel({ level: MAX_LEVEL })).toBe(true)
    expect(isFinalLevel({ level: MAX_LEVEL - 1 })).toBe(false)
  })
})

describe('memory/engine — scoring', () => {
  it('is higher for fewer moves, less time and bigger combos; floored', () => {
    const perfect = solve(play(5, 'easy'))
    perfect.elapsedMs = 10_000
    const good = computeScore(perfect)

    const sloppy = solve(play(5, 'easy'))
    sloppy.moves += 20 // extra misses
    sloppy.bestCombo = 1
    sloppy.elapsedMs = 120_000
    const bad = computeScore(sloppy)

    expect(good).toBeGreaterThan(bad)
    expect(bad).toBeGreaterThanOrEqual(perfect.pairs * 30) // never below the floor
  })
})

describe('memory/engine: o embaralhamento é o baralho exato para a semente', () => {
  /**
   * A partida é reproduzível pela semente: o mesmo número tem que devolver o
   * mesmo baralho, sempre. Um Fisher-Yates que pula a última troca ainda
   * devolve uma permutação válida (o teste de permutação acima passaria), e
   * ainda assim é OUTRO baralho: para o replay e para o placar comparável, isso
   * é um defeito silencioso.
   */
  it('a semente 3 dá exatamente este baralho', () => {
    // Valor de ouro: gravado a partir da implementação atual, e é justamente
    // por isso que ele vale. Qualquer mudança no embaralhamento quebra aqui
    // antes de quebrar um replay salvo.
    expect(shuffle([0, 1, 2, 3, 4, 5, 6, 7], mulberry32(3))).toEqual([7, 4, 1, 3, 6, 2, 0, 5])
  })

  it('o rng constante em zero rotaciona o baralho inteiro, uma casa por passo', () => {
    // Com rng() === 0 toda troca é com o índice 0, e o resultado é conhecido:
    // um deslocamento circular. Pular a última troca (i === 1) deixaria os dois
    // primeiros elementos parados.
    expect(shuffle([0, 1, 2, 3], () => 0)).toEqual([1, 2, 3, 0])
  })
})
