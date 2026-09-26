// A Memória inteira, montada pelo contrato do jogo-sdk com o host falso.
//
// Nenhum mock de store, de analytics ou de i18n do RoqueOS: se o jogo ainda
// alcançasse algo do RoqueOS, este arquivo não rodaria fora dele. Os sete casos
// do teste que rodava no front antes da extração, em 25/09/2026, estão aqui,
// mais os do contrato.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { VERSAO_DO_CONTRATO } from '@roqueos-games/jogo-sdk'
import { criarHostFalso } from '@roqueos-games/jogo-sdk/host-falso'
import jogo from '../src/index.js'
import { MAX_LEVEL, computeScore } from '../src/engine.js'
import ptBR from '../i18n/pt-BR.json'
import enUS from '../i18n/en-US.json'
import manifesto from '../jogo.json'
import tela from '../src/JogoMemoria.vue?raw'

let el = null
let host = null
let montagem = null

// O relógio do jogo anda no requestAnimationFrame. Aqui ele só anda quando o
// teste manda, e o cancelamento é de verdade: um laço parado e religado não
// pode deixar o quadro velho rodando junto.
let quadros = new Map()
let proximoQuadro = 0
let agora = 0
const passarQuadros = (n, ms = 50) => {
  for (let i = 0; i < n; i++) {
    const fila = [...quadros.values()]
    quadros = new Map()
    agora += ms
    for (const fn of fila) fn(agora)
  }
}

const palco = () => {
  el = document.createElement('div')
  document.body.appendChild(el)
  return el
}
const montou = () =>
  vi.waitFor(() => {
    if (!el.querySelector('.ros-memory')) throw new Error('a Memória ainda não montou')
  })
const montarCom = async (h, { ativo = true } = {}) => {
  host = h
  montagem = jogo.mount(palco(), host, { windowId: 'w1', ativo })
  // O app só monta com o texto do idioma carregado.
  await montou()
  await nextTick()
}
const montar = ({ ativo = true, ...opcoesDoHost } = {}) =>
  montarCom(criarHostFalso({ jogoId: 'memory', ...opcoesDoHost }), { ativo })
const $ = (sel) => el.querySelector(sel)
const $$ = (sel) => el.querySelectorAll(sel)
const eventos = (nome) =>
  host.chamadas.filter((c) => c.capacidade === 'metricas' && c.args[0] === nome)
const st = () => window.__memory.state
const pontosNoHud = () => Number($('.ros-memory__stat-val').textContent)

// Match every pair on the CURRENT board (greedy — never mismatches).
const clearBoard = async () => {
  let guard = 0
  while (st().matches < st().pairs && guard++ < 200) {
    const un = st()
      .cards.map((c, i) => ({ ...c, i }))
      .filter((c) => !c.matched)
    const a = un[0]
    const b = un.find((c) => c.i !== a.i && c.symbol === a.symbol)
    window.__memory.flip(a.i)
    window.__memory.flip(b.i)
    await nextTick()
  }
}
// Vira duas cartas diferentes e espera o tempo de elas voltarem.
const errarUmPar = () => {
  const cartas = st().cards
  const outra = cartas.findIndex((c) => c.symbol !== cartas[0].symbol)
  window.__memory.flip(0)
  window.__memory.flip(outra)
  vi.advanceTimersByTime(820)
}
const vencerNoUltimoNivel = async () => {
  window.__memory.start()
  await nextTick()
  st().level = MAX_LEVEL // pretend this board is the last
  await clearBoard()
  await nextTick()
}

describe('Memória pelo jogo-sdk', () => {
  beforeEach(() => {
    window.__ROS_E2E__ = {}
    quadros = new Map()
    agora = 0
    vi.stubGlobal('requestAnimationFrame', (fn) => {
      proximoQuadro += 1
      quadros.set(proximoQuadro, fn)
      return proximoQuadro
    })
    vi.stubGlobal('cancelAnimationFrame', (id) => quadros.delete(id))
  })
  afterEach(() => {
    montagem?.desmontar()
    el?.remove()
    montagem = null
    el = null
    host = null
    delete window.__ROS_E2E__
    delete window.__memory
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('é um jogo do SDK, com o id que o catálogo e o recorde usam', () => {
    expect(jogo.id).toBe('memory')
    expect(jogo.versaoDoContrato).toBe(VERSAO_DO_CONTRATO)
    expect(jogo.capacidades).toEqual([])
    // O manifesto aponta para a mesma chave onde a tela grava o recorde.
    expect(manifesto.id).toBe(jogo.id)
    expect(manifesto.recorde).toEqual({ chave: 'best', maiorEMelhor: true })
  })

  // ── Os sete casos do front ────────────────────────────────────────────────

  it('abre na tela inicial com o botão de jogar, no idioma do host', async () => {
    await montar()
    expect($('.ros-memory__logo').textContent).toBe(ptBR.title)
    expect($('.ros-memory__tagline').textContent).toBe(ptBR.tagline)
    expect($('.ros-memory__play').textContent).toContain(ptBR.play)
    expect($('.ros-memory__grid')).toBeNull()
  })

  it('começar dá o tabuleiro do nível 1 (4 cartas) e registra game_start', async () => {
    await montar()
    $('.ros-memory__play').click()
    await nextTick()
    expect(st().status).toBe('playing')
    expect(st().level).toBe(1)
    expect(st().cards).toHaveLength(4)
    expect($$('.ros-memory__card')).toHaveLength(4)
    expect(eventos('game_start').map((c) => c.args)).toEqual([['game_start', { mode: 'levels' }]])
  })

  it('um par certo fica virado, com o ✓ nas duas cartas', async () => {
    await montar()
    window.__memory.start()
    await nextTick()
    const cards = st().cards
    const twin = cards.findIndex((c, i) => i !== 0 && c.symbol === cards[0].symbol)
    window.__memory.flip(0)
    window.__memory.flip(twin)
    await nextTick()
    expect(st().cards[0].matched).toBe(true)
    expect(st().matches).toBe(1)
    expect($$('.ros-memory__card--matched')).toHaveLength(2)
    // founder fix: matched cards stay face-up AND carry a clear ✓ badge
    expect($$('.ros-memory__check')).toHaveLength(2)
  })

  it('limpar um nível que não é o último sobe para um tabuleiro maior', async () => {
    await montar()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    window.__memory.start()
    await nextTick()
    await clearBoard() // clears the 2×2 level 1
    // it levels up, not wins: no win overlay, the level-up badge is showing
    expect($('.ros-memory__win')).toBeNull()
    expect($('.ros-memory__levelup')).not.toBeNull()
    vi.advanceTimersByTime(1200) // run the level-up transition
    await nextTick()
    expect(st().level).toBe(2)
    expect(st().cards.length).toBeGreaterThan(4)
  })

  it('limpar o ÚLTIMO nível mostra a vitória, grava o recorde e registra game_over', async () => {
    await montar()
    await vencerNoUltimoNivel()
    expect(st().status).toBe('won')
    expect($('.ros-memory__win')).not.toBeNull()
    const total = Number($('.ros-memory__win-score').textContent)
    expect(total).toBeGreaterThan(0)
    expect($('.ros-memory__win-title').textContent.trim()).toBe(ptBR.newRecord)
    // Os nomes e os dados do evento são os de antes da extração.
    expect(eventos('game_over').map((c) => c.args)).toEqual([
      ['game_over', { mode: 'levels', score: total, level: MAX_LEVEL }],
    ])
    expect(host.storage.getItem('roqueos:memory:best')).toBe(String(total))
    await vi.waitFor(async () => expect(await host.placar.carregar()).toEqual({ best: total }))
  })

  it('o som liga e desliga na mesma chave de antes da extração', async () => {
    await montar()
    $('.ros-memory__play').click()
    await nextTick()
    const btns = $$('.ros-memory__icon-btn')
    btns[btns.length - 1].click() // sound is the last top action
    await nextTick()
    expect(host.storage.getItem('roqueos:memory:muted')).toBe('1')
    expect(btns[btns.length - 1].getAttribute('aria-label')).toBe(ptBR.soundOff)
    btns[btns.length - 1].click()
    expect(host.storage.getItem('roqueos:memory:muted')).toBe('0')
  })

  it('desmontar solta tudo: o gancho de QA, a tela e o laço do relógio', async () => {
    await montar()
    expect(window.__memory).toBeTruthy()
    window.__memory.start()
    await nextTick()
    expect(quadros.size).toBe(1)
    montagem.desmontar()
    expect(window.__memory).toBeUndefined()
    expect(el.querySelector('.ros-memory')).toBeNull()
    expect(quadros.size).toBe(0)
    // Desmontar de novo acontece de verdade (a janela fecha e o componente em
    // volta desmonta depois) e não pode lançar.
    expect(() => montagem.desmontar()).not.toThrow()
  })

  // ── O contrato ────────────────────────────────────────────────────────────

  it('fala o idioma do host, e troca quando o host troca', async () => {
    await montar({ idioma: 'en-US' })
    expect($('.ros-memory__logo').textContent).toBe(enUS.title)
    expect($('.ros-memory__play').textContent).toContain(enUS.play)
    host.disparar('idioma', 'pt-BR')
    await vi.waitFor(() => expect($('.ros-memory__logo').textContent).toBe(ptBR.title))
  })

  it('lê o recorde e o som das chaves de antes da extração', async () => {
    const h = criarHostFalso({ jogoId: 'memory' })
    h.storage.setItem('roqueos:memory:best', '777')
    h.storage.setItem('roqueos:memory:muted', '1')
    await montarCom(h)
    expect($('.ros-memory__best').textContent).toContain('777')
    window.__memory.start()
    await nextTick()
    const btns = $$('.ros-memory__icon-btn')
    expect(btns[btns.length - 1].getAttribute('aria-label')).toBe(ptBR.soundOff)
  })

  // A Memória não tem controle de teclado, nem tinha no front. O que o foco da
  // janela governa aqui é o relógio, que desconta ponto: a janela sem foco não
  // pode gastar o tempo de quem está jogando em outra.
  it('só a janela ativa conta o tempo, e tecla nenhuma mexe no jogo', async () => {
    await montar({ ativo: false })
    for (const key of ['Enter', ' ', 'ArrowUp']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }))
    }
    await nextTick()
    expect($('.ros-memory__start')).not.toBeNull()
    expect(eventos('game_start')).toHaveLength(0)

    window.__memory.start()
    await nextTick()
    passarQuadros(40) // dois segundos
    expect(st().elapsedMs).toBe(0)

    montagem.ativar(true)
    await nextTick()
    passarQuadros(40)
    await nextTick()
    const andou = st().elapsedMs
    expect(andou).toBeGreaterThanOrEqual(1900)
    // O placar do HUD desconta o tempo enquanto a partida corre.
    expect(pontosNoHud()).toBe(computeScore(st()))
    expect(pontosNoHud()).toBeLessThan(st().pairs * 120)

    montagem.ativar(false)
    await nextTick()
    passarQuadros(40)
    expect(st().elapsedMs).toBe(andou)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await nextTick()
    expect(st().cards.some((c) => c.flipped)).toBe(false)
  })

  it('o placar do HUD desconta as jogadas, e na vitória é o placar da vitória', async () => {
    await montar()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    window.__memory.start()
    await nextTick()
    const cheio = pontosNoHud()
    expect(cheio).toBe(st().pairs * 120)
    for (let i = 0; i < 3; i++) errarUmPar()
    await nextTick()
    expect(st().moves).toBe(3)
    // 2 pares: 3 jogadas custam uma além do mínimo, 10 pontos.
    expect(pontosNoHud()).toBe(cheio - 10)
    expect(pontosNoHud()).toBe(computeScore(st()))

    st().level = MAX_LEVEL
    await clearBoard()
    await nextTick()
    expect(st().status).toBe('won')
    expect(pontosNoHud()).toBe(Number($('.ros-memory__win-score').textContent))
  })

  it('o recorde da conta maior que o local vem para a tela e para a chave local', async () => {
    const h = criarHostFalso({ jogoId: 'memory', uid: 'u1' })
    await h.placar.salvar({ best: 5000 })
    h.storage.setItem('roqueos:memory:best', '300')
    await montarCom(h)
    await vi.waitFor(() => expect(host.storage.getItem('roqueos:memory:best')).toBe('5000'))
    await nextTick()
    expect($('.ros-memory__best').textContent).toContain('5000')
  })

  it('entrar na conta com o jogo aberto busca o recorde da conta de novo', async () => {
    await montar()
    await vi.waitFor(() => expect(host.contar('placar', 'carregar')).toBe(1))
    host.disparar('identidade', { uid: 'u1', nome: 'Ana' })
    await vi.waitFor(() => expect(host.contar('placar', 'carregar')).toBe(2))
  })

  it('convidado não tem placar na conta: o recorde fica na chave local', async () => {
    // O host do RoqueOS, para convidado, devolve null no `carregar` e false no
    // `salvar`. O host falso guarda qualquer placar, então aqui ele imita o de
    // convidado.
    const h = criarHostFalso({ jogoId: 'memory' })
    const pedidos = []
    h.placar.carregar = async () => null
    h.placar.salvar = async (dados) => {
      pedidos.push(dados)
      return false
    }
    h.storage.setItem('roqueos:memory:best', '100')
    await montarCom(h)
    await nextTick()
    // A conta vazia não apaga o recorde local.
    expect($('.ros-memory__best').textContent).toContain('100')
    await vencerNoUltimoNivel()
    const total = Number($('.ros-memory__win-score').textContent)
    expect(total).toBeGreaterThan(100)
    expect($('.ros-memory__win-title').textContent.trim()).toBe(ptBR.newRecord)
    expect(host.storage.getItem('roqueos:memory:best')).toBe(String(total))
    await vi.waitFor(() => expect(pedidos).toEqual([{ best: total }]))
  })

  it('vitória abaixo do recorde é "Você venceu!", e o recorde fica', async () => {
    const h = criarHostFalso({ jogoId: 'memory' })
    h.storage.setItem('roqueos:memory:best', '999999')
    await montarCom(h)
    await vencerNoUltimoNivel()
    expect($('.ros-memory__win-title').textContent.trim()).toBe(ptBR.win)
    expect(host.storage.getItem('roqueos:memory:best')).toBe('999999')
    expect(host.contar('placar', 'salvar')).toBe(0)
  })

  it('o perfil leve do host chega no jogo: sem confete na vitória', async () => {
    await montar({ modoLeve: true })
    expect($('.ros-memory').classList.contains('ros-memory--low')).toBe(true)
    await vencerNoUltimoNivel()
    expect($$('.ros-memory__confetti i')).toHaveLength(0)
  })

  it('fora do perfil leve a vitória solta o confete', async () => {
    await montar()
    expect($('.ros-memory').classList.contains('ros-memory--low')).toBe(false)
    await vencerNoUltimoNivel()
    expect($$('.ros-memory__confetti i').length).toBeGreaterThan(0)
  })

  it('desmontar antes de o texto chegar não monta nada depois', async () => {
    host = criarHostFalso({ jogoId: 'memory' })
    montagem = jogo.mount(palco(), host, { ativo: true })
    montagem.desmontar()
    await new Promise((r) => setTimeout(r, 50))
    expect(el.querySelector('.ros-memory')).toBeNull()
  })

  it('toda chave que a tela usa existe no pt-BR', () => {
    const usadas = [...tela.matchAll(/txt\('([\w.]+)'/g)].map((m) => m[1])
    expect(usadas.length).toBeGreaterThan(10)
    const faltando = usadas.filter((k) => typeof ptBR[k] !== 'string')
    expect(faltando).toEqual([])
  })
})
