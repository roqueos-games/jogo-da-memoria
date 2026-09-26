import { describe, it, expect } from 'vitest'
import { fitBoard, CARD_ASPECT } from '../src/layout.js'

describe('memory/layout — fitBoard', () => {
  it('returns {0,0} for a degenerate box or grid', () => {
    expect(fitBoard(0, 500, 4, 4)).toEqual({ w: 0, h: 0 })
    expect(fitBoard(500, 0, 4, 4)).toEqual({ w: 0, h: 0 })
    expect(fitBoard(500, 500, 0, 4)).toEqual({ w: 0, h: 0 })
    expect(fitBoard(500, 500, 4, 0)).toEqual({ w: 0, h: 0 })
  })

  it('never exceeds the box (minus margin) in either dimension', () => {
    for (const [c, r] of [
      [2, 2],
      [3, 2],
      [4, 3],
      [6, 5],
    ]) {
      const box = { w: 400, h: 700 }
      const { w, h } = fitBoard(box.w, box.h, c, r, 0.9)
      expect(w).toBeLessThanOrEqual(Math.round(box.w * 0.9) + 1)
      expect(h).toBeLessThanOrEqual(Math.round(box.h * 0.9) + 1)
    }
  })

  it('keeps the grid aspect = (cols/rows)*cardAspect so cards stay ~3:4', () => {
    const cols = 4
    const rows = 3
    const { w, h } = fitBoard(600, 600, cols, rows)
    expect(w / h).toBeCloseTo((cols / rows) * CARD_ASPECT, 2)
  })

  it('is width-bound on a wide box and height-bound on a tall box', () => {
    // wide 6×2 grid in a square box → limited by height
    const wide = fitBoard(500, 500, 6, 2)
    expect(wide.w).toBeGreaterThan(wide.h)
    // tall 2×6 grid in a square box → limited by width
    const tall = fitBoard(500, 500, 2, 6)
    expect(tall.h).toBeGreaterThan(tall.w)
    // both contained
    expect(Math.max(wide.w, wide.h)).toBeLessThanOrEqual(450)
    expect(Math.max(tall.w, tall.h)).toBeLessThanOrEqual(450)
  })

  it('scales with the margin', () => {
    const full = fitBoard(400, 400, 4, 4, 1)
    const snug = fitBoard(400, 400, 4, 4, 0.8)
    expect(snug.w).toBeLessThan(full.w)
    expect(snug.h).toBeLessThan(full.h)
  })
})

describe('fitBoard: a caixa degenerada sai zerada pela própria conta', () => {
  it('largura, altura ou as duas em zero devolvem {0,0}', () => {
    expect(fitBoard(0, 500, 4, 4)).toEqual({ w: 0, h: 0 })
    expect(fitBoard(500, 0, 4, 4)).toEqual({ w: 0, h: 0 })
    expect(fitBoard(0, 0, 4, 4)).toEqual({ w: 0, h: 0 })
    expect(fitBoard(-500, 500, 4, 4)).toEqual({ w: 0, h: 0 })
  })

  it('sem coluna ou sem linha também', () => {
    // Esse é o caso que a guarda realmente cobre: sem linhas, o aspecto seria
    // uma divisão por zero.
    expect(fitBoard(500, 500, 0, 4)).toEqual({ w: 0, h: 0 })
    expect(fitBoard(500, 500, 4, 0)).toEqual({ w: 0, h: 0 })
  })

  it('cabe pelo lado que apertar primeiro, e o encaixe exato dá o mesmo par', () => {
    // Caixa larga: quem limita é a altura.
    const largo = fitBoard(10000, 500, 4, 4)
    expect(largo.h).toBe(Math.round(500 * 0.9))
    // Caixa alta: quem limita é a largura.
    const alto = fitBoard(500, 10000, 4, 4)
    expect(alto.w).toBe(Math.round(500 * 0.9))
    // E nos dois casos a proporção é a do tabuleiro.
    const aspecto = (4 / 4) * CARD_ASPECT
    expect(largo.w / largo.h).toBeCloseTo(aspecto, 1)
    expect(alto.w / alto.h).toBeCloseTo(aspecto, 1)
  })
})
