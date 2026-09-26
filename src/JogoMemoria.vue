<template>
  <div
    ref="rootRef"
    class="ros-memory"
    :class="{ 'ros-memory--low': modoLeve }"
    :dir="estado.idioma === 'ar-AR' ? 'rtl' : 'ltr'"
  >
    <!-- top-right controls -->
    <div v-if="status !== 'ready'" class="ros-memory__top-actions">
      <button class="ros-memory__icon-btn" :aria-label="txt('menu')" @click="toMenu">
        <Icone nome="grade" :tamanho="18" />
      </button>
      <button
        class="ros-memory__icon-btn"
        :aria-label="muted ? txt('soundOff') : txt('soundOn')"
        @click="toggleMute"
      >
        <Icone :nome="muted ? 'mudo' : 'som'" :tamanho="18" />
      </button>
    </div>

    <!-- Start screen -->
    <div v-if="status === 'ready'" class="ros-memory__start">
      <div class="ros-memory__hero" aria-hidden="true">
        <span v-for="(g, i) in heroCards" :key="i" class="ros-memory__hero-card" :style="g.style">
          {{ g.glyph }}
        </span>
      </div>
      <div class="ros-memory__logo">{{ txt('title') }}</div>
      <div class="ros-memory__tagline">{{ txt('tagline') }}</div>
      <button class="ros-memory__play" @click="start()">
        <Icone nome="jogar" :tamanho="22" />
        {{ txt('play') }}
      </button>
      <div v-if="best" class="ros-memory__best">👑 {{ best }}</div>
    </div>

    <!-- Playing / won board -->
    <template v-if="status !== 'ready'">
      <div class="ros-memory__hud" aria-hidden="true">
        <div class="ros-memory__stat">
          <span class="ros-memory__stat-label">{{ txt('score') }}</span>
          <span class="ros-memory__stat-val">{{ liveScore }}</span>
        </div>
        <div class="ros-memory__stat">
          <span class="ros-memory__stat-label">{{ txt('moves') }}</span>
          <span class="ros-memory__stat-val">{{ moves }}</span>
        </div>
        <div class="ros-memory__stat ros-memory__stat--level">
          <span class="ros-memory__stat-label">{{ txt('level') }}</span>
          <span class="ros-memory__stat-val">{{ level }}</span>
        </div>
        <div class="ros-memory__progress" :aria-label="`${matches}/${pairs}`">
          <div
            class="ros-memory__progress-fill"
            :style="{ width: `${(matches / pairs) * 100}%` }"
          />
          <span class="ros-memory__progress-txt">{{ matches }}/{{ pairs }}</span>
        </div>
        <transition name="mem-combo">
          <div v-if="combo >= 2" class="ros-memory__combo">🔥 ×{{ combo }}</div>
        </transition>
      </div>

      <!-- The felt/wood table with the tilted card grid -->
      <div ref="stageRef" class="ros-memory__stage">
        <div class="ros-memory__table">
          <div
            class="ros-memory__grid"
            :style="gridStyle"
            :class="{ 'ros-memory__grid--busy': status !== 'playing' }"
          >
            <button
              v-for="(card, i) in board"
              :key="i"
              class="ros-memory__card"
              :class="{
                'ros-memory__card--up': card.flipped || card.matched,
                'ros-memory__card--matched': card.matched,
              }"
              :aria-label="txt('card')"
              @click="onCard(i)"
            >
              <span class="ros-memory__card-inner">
                <span class="ros-memory__face ros-memory__face--back" aria-hidden="true">
                  <span class="ros-memory__crest" />
                </span>
                <span class="ros-memory__face ros-memory__face--front">
                  <span class="ros-memory__glyph">{{ glyph(card.symbol) }}</span>
                  <span v-if="card.matched" class="ros-memory__check" aria-hidden="true">✓</span>
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Level-up transition -->
      <transition name="mem-pop">
        <div v-if="levelUpText" class="ros-memory__levelup" aria-hidden="true">
          <div class="ros-memory__levelup-badge">
            <div class="ros-memory__levelup-lvl">{{ txt('level') }} {{ level }}</div>
            <div class="ros-memory__levelup-sub">{{ pairs }} {{ txt('pairs') }}</div>
          </div>
        </div>
      </transition>
    </template>

    <!-- Win overlay (final level cleared) -->
    <transition name="mem-pop">
      <div v-if="status === 'won'" class="ros-memory__win">
        <div class="ros-memory__confetti" aria-hidden="true">
          <i v-for="p in confetti" :key="p.id" :style="p.style" />
        </div>
        <div class="ros-memory__win-title">
          {{ isRecord ? txt('newRecord') : txt('win') }}
        </div>
        <div class="ros-memory__win-score">{{ winTotal }}</div>
        <div class="ros-memory__win-meta">
          {{ txt('level') }} {{ level }} · {{ moves }} {{ txt('moves') }} · 👑 {{ best }}
        </div>
        <div class="ros-memory__win-actions">
          <button class="ros-memory__btn ros-memory__btn--ghost" @click="toMenu">
            {{ txt('menu') }}
          </button>
          <button class="ros-memory__btn" @click="start()">
            <Icone nome="reiniciar" :tamanho="19" />
            {{ txt('again') }}
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
// A Memória. Fala com o sistema só pelo `host` do jogo-sdk: placar, áudio,
// modo leve, métricas e armazenamento chegam por ele, e é por isso que o mesmo
// arquivo roda dentro do RoqueOS, no `yarn dev` do repo e no teste.
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { emModoE2E } from '@roqueos-games/jogo-sdk'
import {
  createGame,
  startGame,
  advanceLevel,
  isFinalLevel,
  flip,
  resolveMismatch,
  computeScore,
} from './engine.js'
import { fitBoard } from './layout.js'
import { criarSom } from './som.js'
import { traduzir } from './textos.js'
import Icone from './Icone.vue'

const props = defineProps({
  /** O host do contrato v1 do jogo-sdk. */
  host: { type: Object, required: true },
  /** `{ ativo, idioma, textos }`, reativo; quem escreve é o `montar` do jogo. */
  estado: { type: Object, required: true },
})

const host = props.host
const txt = (chave, valores) => traduzir(props.estado.textos, chave, valores)

const GLYPHS = [
  '🍒',
  '🍋',
  '🍇',
  '🥝',
  '🫐',
  '🍑',
  '🍊',
  '🍓',
  '🥥',
  '🍍',
  '🥭',
  '🍏',
  '🍉',
  '🍅',
  '🫒',
]

// ── Reactive UI ──────────────────────────────────────────────────────────────
const rootRef = ref(null)
const stageRef = ref(null)
const gridPx = ref({ w: 0, h: 0 }) // measured fit — the board always fits the viewport
const status = ref('ready') // 'ready' | 'playing' | 'won'
const level = ref(1)
const cols = ref(2)
const rows = ref(2)
const pairs = ref(2)
const board = ref([]) // view-model mirror of the engine cards
const moves = ref(0)
const matches = ref(0)
const combo = ref(0)
const timeDisplay = ref('0:00')
const muted = ref(false)
const best = ref(0)
const winTotal = ref(0)
const isRecord = ref(false)
const confetti = ref([])
const levelUpText = ref(false)
const modoLeve = ref(false)

// ── Engine (plain) + loop ────────────────────────────────────────────────────
let game = null
let bankedScoreRaw = 0
const bankedScore = ref(0)
// Os pontos do tabuleiro em jogo, espelhados num ref. O `game` é objeto cru, e
// um `computed` que lia `computeScore(game)` direto só recalculava quando o
// banco mudava: o placar do HUD ficava parado o nível inteiro, sem descontar
// jogada nem tempo, e na vitória somava o último tabuleiro duas vezes (o banco
// já o incluía). Defeito do componente antigo, achado na extração em
// 25/09/2026.
const boardScore = ref(0)

// running total = banked score from cleared levels + this board's live score
const liveScore = computed(() => bankedScore.value + boardScore.value)
let rafId = 0
let running = false
let lastT = 0
let pararIdentidade = null

const pendingTimers = new Set()
const later = (fn, ms) => {
  const id = setTimeout(() => {
    pendingTimers.delete(id)
    fn()
  }, ms)
  pendingTimers.add(id)
  return id
}
const clearTimers = () => {
  for (const id of pendingTimers) clearTimeout(id)
  pendingTimers.clear()
}

const glyph = (s) => GLYPHS[s % GLYPHS.length]

// decorative fanned cards on the start hero
const heroCards = computed(() =>
  [0, 6, 12].map((s, i) => ({
    glyph: GLYPHS[s % GLYPHS.length],
    style: { transform: `rotate(${(i - 1) * 12}deg) translateY(${Math.abs(i - 1) * 8}px)` },
  })),
)

// ── Audio ────────────────────────────────────────────────────────────────────
const som = criarSom(host.audio, () => muted.value)
// Chamado de dentro do gesto (toque, clique), sem `await` antes: o iOS só
// libera o áudio assim.
const primeAudio = () => {
  try {
    host.audio.destravar()?.catch?.(() => {})
  } catch {
    /* best-effort */
  }
}

const buzz = (p) => {
  try {
    navigator.vibrate?.(p)
  } catch {
    /* best-effort */
  }
}

// As chaves `muted` e `best` viram `roqueos:memory:muted` e
// `roqueos:memory:best` no host, as mesmas de antes da extração: quem já
// jogava não perde o recorde nem a escolha do som.
const toggleMute = () => {
  muted.value = !muted.value
  host.armazenamento.gravar('muted', muted.value ? '1' : '0')
}

// ── View sync ────────────────────────────────────────────────────────────────
const syncView = () => {
  board.value = game.cards.map((c) => ({
    symbol: c.symbol,
    flipped: c.flipped,
    matched: c.matched,
  }))
  moves.value = game.moves
  matches.value = game.matches
  combo.value = game.combo
  level.value = game.level
  cols.value = game.cols
  rows.value = game.rows
  pairs.value = game.pairs
  bankedScore.value = bankedScoreRaw
  boardScore.value = computeScore(game)
}

// ── Board fit (measure the stage → size the grid so it ALWAYS fits) ──────────
let boardRO = null
const measureBoard = () => {
  const el = stageRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  gridPx.value = fitBoard(r.width, r.height, cols.value, rows.value, modoLeve.value ? 0.94 : 0.9)
}
const gridStyle = computed(() => {
  const s = { '--cols': cols.value, '--rows': rows.value }
  if (gridPx.value.w > 0 && gridPx.value.h > 0) {
    s.width = `${gridPx.value.w}px`
    s.height = `${gridPx.value.h}px`
  }
  return s
})
// re-fit whenever the board shape changes or it (re)appears
watch(
  () => [status.value, cols.value, rows.value],
  () => nextTick(measureBoard),
)

// ── Timer loop (rAF; no 1s interval — see rule 86) ───────────────────────────
// O relógio só anda na janela ativa: no RoqueOS, a janela sem foco não gasta
// tempo de quem está jogando em outra.
const loop = (now) => {
  if (!running) return
  const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0
  lastT = now
  if (status.value === 'playing' && props.estado.ativo && !document.hidden) {
    game.elapsedMs += dt * 1000
    const s = Math.floor(game.elapsedMs / 1000)
    const disp = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    if (timeDisplay.value !== disp) {
      timeDisplay.value = disp
      boardScore.value = computeScore(game)
    }
  }
  rafId = requestAnimationFrame(loop)
}
const startLoop = () => {
  if (running) return
  running = true
  lastT = 0
  rafId = requestAnimationFrame(loop)
}
const stopLoop = () => {
  running = false
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

// ── Game flow ────────────────────────────────────────────────────────────────
const start = () => {
  primeAudio()
  clearTimers()
  bankedScoreRaw = 0
  game = createGame(Math.floor(Math.random() * 1e9) || 1, { level: 1 })
  startGame(game)
  status.value = 'playing'
  isRecord.value = false
  levelUpText.value = false
  timeDisplay.value = '0:00'
  syncView()
  startLoop()
  host.metricas.evento('game_start', { mode: 'levels' })
}

const toMenu = () => {
  clearTimers()
  status.value = 'ready'
  confetti.value = []
  levelUpText.value = false
}

const onCard = (i) => {
  primeAudio()
  if (status.value !== 'playing' || game.locked || levelUpText.value) return
  const res = flip(game, i)
  if (!res.ok) return
  som.virar()
  buzz(5)
  syncView()
  if (res.type === 'match') {
    som.acertar(game.combo)
    buzz([8, 18])
    if (res.won) onBoardCleared()
  } else if (res.type === 'mismatch') {
    later(() => {
      resolveMismatch(game)
      som.errar()
      buzz(12)
      syncView()
    }, 820)
  }
}

// A board is cleared: either advance to a bigger level, or (at the cap) win.
const onBoardCleared = () => {
  if (isFinalLevel(game)) return win()
  som.subirDeNivel()
  buzz([12, 30])
  levelUpText.value = true
  later(() => {
    advanceLevel(game) // banks this board's score internally + re-deals bigger
    bankedScoreRaw = game.totalScore
    levelUpText.value = false
    syncView()
  }, 1150)
}

const win = () => {
  status.value = 'won'
  bankedScoreRaw = (game.totalScore || 0) + computeScore(game)
  bankedScore.value = bankedScoreRaw
  // O último tabuleiro acabou de entrar no banco; somá-lo de novo no HUD
  // mostraria um placar maior que o da vitória.
  boardScore.value = 0
  winTotal.value = bankedScoreRaw
  isRecord.value = winTotal.value > best.value
  if (isRecord.value) {
    best.value = winTotal.value
    persistScore()
  }
  som.fanfarra()
  buzz([20, 40, 20, 60])
  spawnConfetti()
  stopLoop()
  host.metricas.evento('game_over', { mode: 'levels', score: winTotal.value, level: level.value })
}

const spawnConfetti = () => {
  if (modoLeve.value) return
  const colors = ['#22d3ee', '#a855f7', '#f472b6', '#facc15', '#4ade80', '#fb923c']
  confetti.value = Array.from({ length: 34 }, (_, id) => ({
    id,
    style: {
      left: `${Math.random() * 100}%`,
      background: colors[id % colors.length],
      animationDelay: `${Math.random() * 0.5}s`,
      animationDuration: `${1.4 + Math.random() * 1.2}s`,
      transform: `rotate(${Math.random() * 360}deg)`,
    },
  }))
}

// ── Persistence (best = highest total score reached in a run) ────────────────
const loadLocal = () => {
  muted.value = host.armazenamento.ler('muted') === '1'
  best.value = parseInt(host.armazenamento.ler('best'), 10) || 0
}

const persistScore = () => {
  host.armazenamento.gravar('best', String(best.value))
  Promise.resolve()
    .then(() => host.placar.salvar({ best: best.value }))
    .catch(() => {})
}

// O recorde da conta só desce: maior que o local, ele vem para a tela e para a
// chave local. Convidado não tem placar na conta: o host devolve null.
const syncRemote = async () => {
  try {
    const remote = await host.placar.carregar()
    if (!remote) return
    const rv = Number(remote.best) || 0
    if (rv > best.value) {
      best.value = rv
      host.armazenamento.gravar('best', String(rv))
    }
  } catch (err) {
    console.error('[Memory] Score sync failed:', err)
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
watch(
  () => props.estado.ativo,
  (active) => {
    if (!active) stopLoop()
    else if (status.value === 'playing') startLoop()
  },
)

const onVisibility = () => {
  if (document.hidden) stopLoop()
  else if (props.estado.ativo && status.value === 'playing') startLoop()
}

onMounted(() => {
  modoLeve.value = Boolean(host.desempenho.modoLeve())
  loadLocal()
  syncRemote()
  // Quem entra na conta com o jogo aberto vê o recorde da conta sem reabrir.
  pararIdentidade = host.identidade.aoMudar(() => syncRemote())
  document.addEventListener('visibilitychange', onVisibility)
  // Keep the board fitted to the window/app size (no panning ever needed).
  boardRO = new ResizeObserver(() => measureBoard())
  if (rootRef.value) boardRO.observe(rootRef.value)
  nextTick(measureBoard)

  if (emModoE2E()) {
    window.__memory = {
      get state() {
        return game
      },
      start,
      flip: (i) => onCard(i),
      // Cover aid: a lively mid-run board (level 5, colourful faces up).
      stage: () => {
        start()
        // jump to a photogenic mid-level board
        game.level = 5
        const g = createGame(1234, { level: 5 })
        startGame(g)
        game = g
        bankedScoreRaw = 2400
        // match the first several pairs; leave two face-up + the rest down.
        const seen = new Map()
        let matchedPairs = 0
        const target = Math.max(2, Math.floor(game.pairs / 2))
        game.cards.forEach((c, i) => {
          if (matchedPairs >= target) return
          if (seen.has(c.symbol)) {
            const j = seen.get(c.symbol)
            game.cards[i].matched = true
            game.cards[i].flipped = true
            game.cards[j].matched = true
            game.cards[j].flipped = true
            matchedPairs++
            seen.delete(c.symbol)
          } else {
            seen.set(c.symbol, i)
          }
        })
        const down = game.cards.map((c, i) => ({ c, i })).filter((x) => !x.c.flipped)
        if (down[0]) game.cards[down[0].i].flipped = true
        if (down[1]) game.cards[down[1].i].flipped = true
        game.matches = matchedPairs
        game.moves = matchedPairs + 3
        syncView()
      },
    }
  }
})

onUnmounted(() => {
  stopLoop()
  clearTimers()
  boardRO?.disconnect()
  boardRO = null
  pararIdentidade?.()
  document.removeEventListener('visibilitychange', onVisibility)
  if (emModoE2E()) delete window.__memory
})
</script>

<style scoped lang="scss">
.ros-memory {
  // Cores de identidade do jogo, como custom property para que um tema consiga
  // alcançá-las. As que vêm do sistema herdam o token do RoqueOS quando ele
  // existe e caem no valor do tema padrão quando o jogo roda sozinho, porque
  // fora do RoqueOS não há `tokens-root.scss` nenhum carregado.
  --ros-memory-texto: var(--ros-text, rgba(255, 255, 255, 0.95));
  --ros-memory-texto-100: var(--ros-text-100, #ffffff);
  --ros-memory-linha-14: var(--ros-line-14, rgba(255, 255, 255, 0.14));
  --ros-memory-preenchimento-08: var(--ros-fill-08, rgba(255, 255, 255, 0.08));
  --ros-memory-sombra-30: var(--ros-shadow-30, rgba(0, 0, 0, 0.3));
  --ros-memory-sombra-50: var(--ros-shadow-50, rgba(0, 0, 0, 0.5));
  --ros-memory-veu-50: var(--ros-scrim-50, rgba(0, 0, 0, 0.5));
  --ros-memory-branco-rgb: var(--ros-white-rgb, 255, 255, 255);
  --ros-memory-preto-rgb: var(--ros-black-rgb, 0, 0, 0);
  --ros-memory-bg-1: rgba(60, 120, 70, 0);
  --ros-memory-bg-2: rgba(20, 44, 26, 0.55);
  --ros-memory-bg-3: #2a1c12;
  --ros-memory-bg-4: #3c2817;
  --ros-memory-bg-5: #4a3119;
  --ros-memory-bg-6: #38240f;
  --ros-memory-bg-7: rgba(0, 0, 0, 0.06);
  --ros-memory-bg-8: rgba(255, 255, 255, 0.025);
  --ros-memory-bg-9: rgba(0, 0, 0, 0.05);
  --ros-memory-bg-10: #43301c;
  --ros-memory-bg-11: #33220f;
  --ros-memory-bg-12: rgba(20, 14, 8, 0.5);
  --ros-memory-bg-13: rgba(40, 28, 16, 0.7);
  --ros-memory-bg-14: #f7f0e0;
  --ros-memory-bg-15: #e6d8bd;
  --ros-memory-line-1: #caa24e;
  --ros-memory-shadow-1: rgba(0, 0, 0, 0.45);
  --ros-memory-shadow-2: rgba(255, 255, 255, 0.4);
  --ros-memory-bg-16: #ffe6a8;
  --ros-memory-bg-17: #e9b949;
  --ros-memory-fg-1: rgba(255, 244, 224, 0.7);
  --ros-memory-fg-2: #2a1a06;
  --ros-memory-bg-18: #ffdd8e;
  --ros-memory-bg-19: #e6b445;
  --ros-memory-shadow-3: rgba(180, 120, 20, 0.45);
  --ros-memory-shadow-4: rgba(255, 255, 255, 0.6);
  --ros-memory-shadow-5: rgba(180, 120, 20, 0.55);
  --ros-memory-fg-3: #ffd76b;
  --ros-memory-bg-20: rgba(24, 16, 8, 0.5);
  --ros-memory-line-2: rgba(255, 220, 160, 0.16);
  --ros-memory-shadow-6: rgba(0, 0, 0, 0.35);
  --ros-memory-shadow-7: rgba(255, 255, 255, 0.06);
  --ros-memory-fg-4: rgba(255, 236, 200, 0.6);
  --ros-memory-fg-5: #fff6e6;
  --ros-memory-bg-21: rgba(20, 12, 6, 0.55);
  --ros-memory-bg-22: #ffe08a;
  --ros-memory-bg-23: #ff7a45;
  --ros-memory-bg-24: #f43f5e;
  --ros-memory-shadow-8: rgba(244, 63, 94, 0.5);
  --ros-memory-shadow-9: rgba(0, 0, 0, 0.4);
  --ros-memory-shadow-10: rgba(74, 222, 128, 0.92);
  --ros-memory-shadow-11: rgba(255, 255, 255, 0.5);
  --ros-memory-shadow-12: rgba(74, 222, 128, 0.45);
  --ros-memory-fg-6: #0b3d1a;
  --ros-memory-bg-25: #bbf7d0;
  --ros-memory-bg-26: #22c55e;
  --ros-memory-shadow-13: rgba(0, 0, 0, 0.2);
  --ros-memory-bg-27: #8a1524;
  --ros-memory-bg-28: #5c0e1a;
  --ros-memory-bg-29: #3a0812;
  --ros-memory-bg-30: #6c1120;
  --ros-memory-bg-31: #45091a;
  --ros-memory-shadow-14: rgba(224, 178, 92, 0.85);
  --ros-memory-shadow-15: rgba(90, 20, 30, 0.9);
  --ros-memory-shadow-16: rgba(224, 178, 92, 0.45);
  --ros-memory-bg-32: rgba(224, 178, 92, 0.28);
  --ros-memory-bg-33: rgba(224, 178, 92, 0);
  --ros-memory-bg-34: rgba(224, 178, 92, 0.16);
  --ros-memory-bg-35: #e0b25c;
  --ros-memory-bg-36: #b5883a;
  --ros-memory-shadow-17: rgba(0, 0, 0, 0.5);
  --ros-memory-bg-37: #f9f2e2;
  --ros-memory-bg-38: #ece0c4;
  --ros-memory-shadow-18: rgba(202, 162, 78, 0.9);
  --ros-memory-shadow-19: rgba(255, 255, 255, 0.55);
  --ros-memory-bg-39: rgba(24, 16, 8, 0.62);
  --ros-memory-line-3: rgba(224, 178, 92, 0.55);
  --ros-memory-fg-7: rgba(255, 236, 200, 0.75);
  --ros-memory-bg-40: rgba(18, 10, 4, 0.72);
  --ros-memory-shadow-20: rgba(230, 180, 69, 0.4);
  --ros-memory-fg-8: rgba(255, 236, 200, 0.72);
  --ros-memory-fg-9: #ffe6b8;
  --ros-memory-line-4: rgba(255, 220, 160, 0.28);
}

.ros-memory {
  // relative (not absolute) so it fills the window CONTENT area and never
  // overlays the window header/traffic-light controls — the peer-game pattern
  // (Snake/Prisma/Nexo). The inner layers stay absolute against this root.
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  user-select: none;
  color: var(--ros-memory-texto);
  // felt-topped wooden table receding into the distance
  background: radial-gradient(
      120% 90% at 50% 118%,
      var(--ros-memory-bg-1) 40%,
      var(--ros-memory-bg-2) 100%
    ),
    linear-gradient(
      180deg,
      var(--ros-memory-bg-3) 0%,
      var(--ros-memory-bg-4) 30%,
      var(--ros-memory-bg-5) 62%,
      var(--ros-memory-bg-6) 100%
    );

  // subtle wood grain
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.5;
    background: repeating-linear-gradient(
      92deg,
      var(--ros-memory-bg-7) 0 2px,
      var(--ros-memory-bg-8) 2px 5px,
      var(--ros-memory-bg-9) 5px 9px
    );
  }

  &--low {
    background: linear-gradient(
      180deg,
      var(--ros-memory-bg-3) 0%,
      var(--ros-memory-bg-10) 60%,
      var(--ros-memory-bg-11) 100%
    );
    &::before {
      display: none;
    }
  }
}

// ── Top actions ───────────────────────────────────────────────────────────────
.ros-memory__top-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 8px;
  z-index: 6;
}

.ros-memory__icon-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  border: 1px solid var(--ros-memory-linha-14);
  background: var(--ros-memory-bg-12);
  color: rgba(var(--ros-memory-branco-rgb), 0.86);
  backdrop-filter: blur(10px);
  cursor: pointer;
  transition: background 0.15s ease;
  &:hover {
    background: var(--ros-memory-bg-13);
  }
}

// ── Start screen ──────────────────────────────────────────────────────────────
.ros-memory__start {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  z-index: 5;
  text-align: center;
  padding: 20px;
}

.ros-memory__hero {
  display: flex;
  gap: -6px;
  margin-bottom: 6px;
  perspective: 600px;
}
.ros-memory__hero-card {
  width: 62px;
  height: 84px;
  margin: 0 -4px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-size: 34px;
  background: linear-gradient(160deg, var(--ros-memory-bg-14), var(--ros-memory-bg-15));
  border: 2px solid var(--ros-memory-line-1);
  box-shadow:
    0 10px 22px var(--ros-memory-shadow-1),
    inset 0 0 0 2px var(--ros-memory-shadow-2);
}

.ros-memory__logo {
  font-size: 34px;
  font-weight: 800;
  letter-spacing: 1px;
  background: linear-gradient(
    120deg,
    var(--ros-memory-bg-16),
    var(--ros-memory-bg-17) 60%,
    var(--ros-memory-line-1)
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 2px 10px var(--ros-memory-sombra-30);
}
.ros-memory__tagline {
  font-size: 13.5px;
  color: var(--ros-memory-fg-1);
  max-width: 300px;
}
.ros-memory__play {
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 30px;
  font-size: 16px;
  font-weight: 700;
  border: none;
  border-radius: 14px;
  color: var(--ros-memory-fg-2);
  background: linear-gradient(160deg, var(--ros-memory-bg-18), var(--ros-memory-bg-19));
  box-shadow:
    0 12px 26px var(--ros-memory-shadow-3),
    inset 0 1px 0 var(--ros-memory-shadow-4);
  cursor: pointer;
  transition:
    transform 0.14s ease,
    box-shadow 0.14s ease;
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 32px var(--ros-memory-shadow-5);
  }
  &:active {
    transform: translateY(0);
  }
}
.ros-memory__best {
  font-size: 14px;
  font-weight: 700;
  color: var(--ros-memory-fg-3);
}

// ── HUD ───────────────────────────────────────────────────────────────────────
.ros-memory__hud {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 58px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 4;
  pointer-events: none;
  flex-wrap: wrap;
}
.ros-memory__stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 13px;
  border-radius: 13px;
  background: var(--ros-memory-bg-20);
  border: 1px solid var(--ros-memory-line-2);
  box-shadow:
    0 6px 16px var(--ros-memory-shadow-6),
    inset 0 1px 0 var(--ros-memory-shadow-7);
  backdrop-filter: blur(12px) saturate(150%);
  &--level .ros-memory__stat-val {
    color: var(--ros-memory-fg-3);
  }
}
.ros-memory__stat-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--ros-memory-fg-4);
}
.ros-memory__stat-val {
  font-size: 19px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--ros-memory-fg-5);
}
.ros-memory__progress {
  position: relative;
  flex: 1;
  min-width: 80px;
  height: 22px;
  border-radius: 11px;
  overflow: hidden;
  background: var(--ros-memory-bg-21);
  border: 1px solid var(--ros-memory-line-2);
}
.ros-memory__progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 11px;
  background: linear-gradient(90deg, var(--ros-memory-bg-22), var(--ros-memory-bg-19));
  transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.ros-memory__progress-txt {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 800;
  color: var(--ros-memory-fg-2);
  mix-blend-mode: hard-light;
  font-variant-numeric: tabular-nums;
}
.ros-memory__combo {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 800;
  color: var(--ros-memory-texto-100);
  background: linear-gradient(120deg, var(--ros-memory-bg-23), var(--ros-memory-bg-24));
  box-shadow: 0 6px 16px var(--ros-memory-shadow-8);
}

// ── The tilted card table ────────────────────────────────────────────────────
.ros-memory__stage {
  position: absolute;
  inset: 64px 12px 20px;
  display: grid;
  place-items: center;
  perspective: 1400px;
  z-index: 2;
}
.ros-memory__table {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  // A gentle recline reads as a 3D card table but keeps every card fully in
  // view and a usable size — the founder shouldn't need to pan to reach cards.
  transform: rotateX(20deg);
  transform-style: preserve-3d;
  will-change: transform;
}
.ros-memory__grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  gap: clamp(5px, 1.4vmin, 13px);
  transform-style: preserve-3d;
  // Size is measured in JS (fitBoard) and set inline as an exact px w×h that
  // fits the stage in BOTH dimensions, so the board can never overflow the
  // viewport. Cells are pre-shaped ~3:4 so cards fill them without distortion.
}

.ros-memory__card {
  position: relative;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  transform-style: preserve-3d;
  // grounded shadow on the felt
  &::after {
    content: '';
    position: absolute;
    left: 8%;
    right: 8%;
    bottom: -7%;
    height: 22%;
    border-radius: 50%;
    background: radial-gradient(
      ellipse,
      var(--ros-memory-veu-50),
      rgba(var(--ros-memory-preto-rgb), 0)
    );
    transform: translateZ(-2px);
    pointer-events: none;
  }
}
.ros-memory__card-inner {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform 0.42s cubic-bezier(0.34, 1.3, 0.5, 1);
  transform: translateZ(3px) rotateY(0deg);
}
.ros-memory__card--up .ros-memory__card-inner {
  transform: translateZ(3px) rotateY(180deg);
}
.ros-memory__card--matched .ros-memory__card-inner {
  transform: translateZ(2px) rotateY(180deg) scale(0.9);
}
.ros-memory__card:not(.ros-memory__card--up):hover .ros-memory__card-inner {
  transform: translateZ(9px) rotateY(0deg);
}
// Solved cards read unmistakably "done": a green ring + glow + a ✓ badge, and
// they stay face-up for the rest of the level so it's always clear what's matched.
.ros-memory__card--matched .ros-memory__face--front {
  box-shadow:
    0 2px 6px var(--ros-memory-shadow-9),
    inset 0 0 0 2px var(--ros-memory-shadow-10),
    inset 0 0 0 3.5px var(--ros-memory-shadow-11),
    0 0 18px var(--ros-memory-shadow-12);
}
.ros-memory__card--matched .ros-memory__glyph {
  opacity: 0.82;
}
.ros-memory__check {
  position: absolute;
  right: 6%;
  bottom: 5%;
  width: 32%;
  max-width: 22px;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 66%;
  font-weight: 900;
  color: var(--ros-memory-fg-6);
  background: radial-gradient(
    circle at 40% 35%,
    var(--ros-memory-bg-25),
    var(--ros-memory-bg-26) 72%
  );
  box-shadow:
    0 1px 3px var(--ros-memory-shadow-1),
    inset 0 1px 1px var(--ros-memory-shadow-4);
}

.ros-memory__face {
  position: absolute;
  inset: 0;
  border-radius: 11px;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  display: grid;
  place-items: center;
  overflow: hidden;
  box-shadow:
    0 2px 5px var(--ros-memory-shadow-6),
    inset 0 0 0 1.5px var(--ros-memory-shadow-13);
}

// ornate back — dark red with a gold filigree frame + center crest
.ros-memory__face--back {
  background: radial-gradient(
      circle at 50% 42%,
      var(--ros-memory-bg-27) 0%,
      var(--ros-memory-bg-28) 55%,
      var(--ros-memory-bg-29) 100%
    ),
    linear-gradient(160deg, var(--ros-memory-bg-30), var(--ros-memory-bg-31));
  box-shadow:
    0 2px 6px var(--ros-memory-shadow-1),
    inset 0 0 0 2px var(--ros-memory-shadow-14),
    inset 0 0 0 4px var(--ros-memory-shadow-15),
    inset 0 0 0 5.5px var(--ros-memory-shadow-16);
  &::before {
    content: '';
    position: absolute;
    inset: 10%;
    border-radius: 8px;
    background: repeating-conic-gradient(
        from 0deg at 50% 50%,
        var(--ros-memory-bg-32) 0deg 6deg,
        var(--ros-memory-bg-33) 6deg 18deg
      ),
      radial-gradient(circle, var(--ros-memory-bg-34) 0 40%, var(--ros-memory-bg-33) 62%);
  }
}
.ros-memory__crest {
  position: relative;
  width: 34%;
  height: 34%;
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 42%,
    var(--ros-memory-bg-16) 0%,
    var(--ros-memory-bg-35) 45%,
    var(--ros-memory-bg-36) 100%
  );
  box-shadow:
    0 1px 3px var(--ros-memory-shadow-17),
    inset 0 1px 1px var(--ros-memory-shadow-4);
  &::before {
    content: '❖';
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 60%;
    color: var(--ros-memory-bg-30);
  }
}

// ivory face with gold inner border + big fruit glyph
.ros-memory__face--front {
  transform: rotateY(180deg);
  background: linear-gradient(158deg, var(--ros-memory-bg-37) 0%, var(--ros-memory-bg-38) 100%);
  box-shadow:
    0 2px 6px var(--ros-memory-shadow-9),
    inset 0 0 0 2px var(--ros-memory-shadow-18),
    inset 0 0 0 3.5px var(--ros-memory-shadow-19);
}
.ros-memory__glyph {
  font-size: clamp(20px, 8.5vmin, 46px);
  line-height: 1;
  filter: drop-shadow(0 2px 3px rgba(var(--ros-memory-preto-rgb), 0.28));
}

// ── Level-up transition ───────────────────────────────────────────────────────
.ros-memory__levelup {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 7;
  pointer-events: none;
}
.ros-memory__levelup-badge {
  padding: 20px 40px;
  border-radius: 20px;
  text-align: center;
  background: var(--ros-memory-bg-39);
  border: 1.5px solid var(--ros-memory-line-3);
  box-shadow: 0 20px 50px var(--ros-memory-sombra-50);
  backdrop-filter: blur(16px) saturate(160%);
}
.ros-memory__levelup-lvl {
  font-size: 30px;
  font-weight: 900;
  background: linear-gradient(120deg, var(--ros-memory-bg-16), var(--ros-memory-bg-19));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.ros-memory__levelup-sub {
  font-size: 13px;
  font-weight: 700;
  color: var(--ros-memory-fg-7);
  margin-top: 2px;
}

// ── Win overlay ───────────────────────────────────────────────────────────────
.ros-memory__win {
  position: absolute;
  inset: 0;
  z-index: 8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--ros-memory-bg-40);
  backdrop-filter: blur(10px);
  text-align: center;
  padding: 20px;
}
.ros-memory__win-title {
  font-size: 26px;
  font-weight: 900;
  background: linear-gradient(120deg, var(--ros-memory-bg-16), var(--ros-memory-bg-19));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.ros-memory__win-score {
  font-size: 52px;
  font-weight: 900;
  line-height: 1;
  color: var(--ros-memory-fg-5);
  font-variant-numeric: tabular-nums;
  text-shadow: 0 4px 18px var(--ros-memory-shadow-20);
}
.ros-memory__win-meta {
  font-size: 13px;
  color: var(--ros-memory-fg-8);
}
.ros-memory__win-actions {
  display: flex;
  gap: 12px;
  margin-top: 14px;
}
.ros-memory__btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 11px 22px;
  font-size: 14.5px;
  font-weight: 700;
  border: none;
  border-radius: 12px;
  color: var(--ros-memory-fg-2);
  background: linear-gradient(160deg, var(--ros-memory-bg-18), var(--ros-memory-bg-19));
  box-shadow: 0 10px 22px var(--ros-memory-shadow-3);
  cursor: pointer;
  transition: transform 0.14s ease;
  &:hover {
    transform: translateY(-2px);
  }
  &--ghost {
    color: var(--ros-memory-fg-9);
    background: var(--ros-memory-preenchimento-08);
    border: 1px solid var(--ros-memory-line-4);
    box-shadow: none;
  }
}
.ros-memory__confetti {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  i {
    position: absolute;
    top: -12px;
    width: 9px;
    height: 14px;
    border-radius: 2px;
    animation: mem-fall linear forwards;
  }
}
@keyframes mem-fall {
  to {
    transform: translateY(110%) rotate(540deg);
    opacity: 0.2;
  }
}

// transitions
.mem-pop-enter-active,
.mem-pop-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.mem-pop-enter-from,
.mem-pop-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
.mem-combo-enter-active {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.mem-combo-enter-from {
  opacity: 0;
  transform: scale(0.5);
}

// ── Low-end + mobile ──────────────────────────────────────────────────────────
.ros-memory--low {
  .ros-memory__table {
    transform: rotateX(16deg);
  }
  .ros-memory__card-inner {
    transition-duration: 0.2s;
  }
  .ros-memory__stat,
  .ros-memory__icon-btn,
  .ros-memory__levelup-badge,
  .ros-memory__win {
    backdrop-filter: none;
  }
  .ros-memory__card::after {
    display: none;
  }
  .ros-memory__face--back::before {
    display: none;
  }
}

@media (max-width: 600px) {
  .ros-memory__stage {
    // clear the two-row HUD (pills row + full-width progress row)
    inset: 78px 8px 14px;
  }
  .ros-memory__table {
    transform: rotateX(14deg);
  }
  .ros-memory__hud {
    right: 12px;
    gap: 6px 7px;
  }
  .ros-memory__stat {
    padding: 5px 10px;
  }
  .ros-memory__stat-val {
    font-size: 17px;
  }
  // Progress bar drops to its OWN full-width row below the pills, so it never
  // slides under the top-right buttons (the old "0/3 under the grid icon" bug).
  .ros-memory__progress {
    order: 9;
    flex-basis: 100%;
    height: 18px;
  }
  .ros-memory__combo {
    order: 8;
  }
  .ros-memory__logo {
    font-size: 28px;
  }
}
</style>
