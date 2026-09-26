// O som da Memória, procedural: nenhum arquivo de áudio, só osciladores. O
// AudioContext é do host (no RoqueOS, o compartilhado com os apps de música;
// fora dele, um próprio), e o jogo só toca quando o contexto já está rodando,
// porque tocar num contexto suspenso enfileira som que sai tudo junto depois.

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12)

/**
 * @param {{ contexto: () => AudioContext | null }} audio a capacidade `audio` do host
 * @param {() => boolean} estaMudo
 */
export function criarSom(audio, estaMudo) {
  let volume = null
  let dono = null

  const contexto = () => {
    if (estaMudo()) return null
    try {
      const c = audio.contexto()
      if (!c || c.state !== 'running') return null
      // O ganho mestre pertence a UM contexto. Se o host trocar de contexto
      // (o iOS fecha o antigo ao voltar do fundo), recria em vez de ligar num
      // nó morto.
      if (dono !== c) {
        volume = c.createGain()
        volume.gain.value = 0.5
        volume.connect(c.destination)
        dono = c
      }
      return c
    } catch {
      return null
    }
  }

  const envelope = (c, t0, pico, queda) => {
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(pico, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + queda)
    g.connect(volume)
    return g
  }

  // Uma sequência de notas de triângulo, cada uma `passo` segundos depois da
  // anterior: o acerto, a subida de nível e a fanfarra são todos assim.
  const arpejo = (notas, passo, pico, queda, duracao) => {
    const c = contexto()
    if (!c) return
    const agora = c.currentTime
    notas.forEach((midi, i) => {
      const t0 = agora + i * passo
      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.value = hz(midi)
      o.connect(envelope(c, t0, pico, queda))
      o.start(t0)
      o.stop(t0 + duracao)
    })
  }

  return {
    virar() {
      const c = contexto()
      if (!c) return
      const agora = c.currentTime
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(520, agora)
      o.frequency.exponentialRampToValueAtTime(760, agora + 0.05)
      o.connect(envelope(c, agora, 0.08, 0.08))
      o.start(agora)
      o.stop(agora + 0.1)
    },
    /** @param {number} combo quantos pares seguidos; o tom sobe com ele */
    acertar(combo) {
      const semitons = [0, 4, 7, 11, 12]
      const raiz = 60 + Math.min(24, (combo - 1) * 2)
      const notas = [0, 1].map((i) => raiz + semitons[Math.min(semitons.length - 1, i + combo - 1)])
      arpejo(notas, 0.05, 0.16, 0.32, 0.34)
    },
    errar() {
      const c = contexto()
      if (!c) return
      const agora = c.currentTime
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(260, agora)
      o.frequency.exponentialRampToValueAtTime(150, agora + 0.18)
      o.connect(envelope(c, agora, 0.09, 0.2))
      o.start(agora)
      o.stop(agora + 0.22)
    },
    subirDeNivel() {
      arpejo([67, 72, 76], 0.07, 0.15, 0.34, 0.36)
    },
    fanfarra() {
      arpejo([60, 64, 67, 72, 76, 79], 0.08, 0.18, 0.45, 0.46)
    },
  }
}
