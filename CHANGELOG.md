# Changelog

## 0.1.0 (25/09/2026)

- A Memória sai do repositório do RoqueOS e passa a falar com ele só pelo `jogo-sdk` 0.1.0.
- Texto nos dez idiomas em `i18n/`, ícones SVG próprios, som em `src/som.js`, e o jogo roda
  sozinho com `yarn dev`.
- O placar do HUD desconta jogadas e tempo durante o nível. Antes ele ficava parado no valor
  cheio do tabuleiro até o nível acabar, e na vitória somava o último tabuleiro duas vezes.
- O perfil leve vale desde a tela inicial. Antes a classe dele só entrava no primeiro
  redesenho, depois de a partida começar.
- Entrar na conta com o jogo aberto busca o recorde da conta, sem reabrir o jogo.
