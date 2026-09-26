/**
 * MEMÓRIA — board-fit maths (pure, unit-tested; no Vue/DOM).
 *
 * Contain a cols×rows grid of portrait cards (each ~3:4) inside a box, keeping
 * the grid's natural aspect so the cards never distort, and leaving a margin for
 * the felt table + tilt. The component measures the stage and sets the grid
 * element to the returned pixel size. Because the table only tilts (rotateX),
 * which *foreshortens* the on-screen height, a grid that fits the untilted box is
 * always fully visible after the tilt — no panning needed (founder: the board
 * must be reachable without moving the table).
 */

export const CARD_ASPECT = 3 / 4 // one card's width : height

/**
 * Largest {w,h} (px, integers) for a cols×rows card grid that fits inside
 * boxW×boxH after applying `margin` (breathing room for the felt + tilt). The
 * grid keeps its natural aspect `(cols/rows) * CARD_ASPECT`. Returns {0,0} for
 * a degenerate box/grid so the caller can skip styling.
 */
export function fitBoard(boxW, boxH, cols, rows, margin = 0.9) {
  const w0 = Math.max(0, boxW || 0) * margin
  const h0 = Math.max(0, boxH || 0) * margin
  // A guarda cobre só o que a conta não cobre: sem colunas ou sem linhas, o
  // aspecto seria uma divisão por zero. Caixa degenerada não precisa de guarda
  // -- `w0` ou `h0` em zero já sai {0,0} pela própria conta, e a comparação que
  // estava aqui era indistinguível da sua ausência.
  if (!cols || !rows) return { w: 0, h: 0 }
  const aspect = (cols / rows) * CARD_ASPECT // grid width : height
  // Cabe pela largura ou pela altura, o que apertar primeiro. `Math.min` diz
  // isso numa linha e sem comparador solto: no empate as duas formas davam
  // exatamente o mesmo par.
  const h = Math.min(w0 / aspect, h0)
  return { w: Math.round(h * aspect), h: Math.round(h) }
}
