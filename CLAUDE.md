# WarBit

FPS multiplayer leve no navegador: 60 jogadores, 3 times, Control Zone + Hot Zone (x2), economia de compra por vida no estilo WarDogs.

## Comandos
- `npm run dev` — servidor (8080) + cliente Vite (5173). Abra http://localhost:5173
- `npm test` — testes (Vitest) de shared e server
- `npm run typecheck`
- `npm run loadtest` — 60 clientes WebSocket reais contra o servidor rodando (`CLIENTS`, `SECONDS`, `URL`)
- `http://localhost:5173/?bench=1` — benchmark de render com 100 soldados (`&r=5` câmera de perto)
  - `&guns=1` catálogo lateral de todas as armas (`&d=3.4` aproxima) · `&vm=1&gun=<id>&sight=<id>&ads=1` arma em 1ª pessoa · `&bush=1` moita com soldados dentro
- Publicar online: ver `DEPLOY.md` (servidor em host com processo ligado; cliente pode ir para a Vercel com `VITE_WS_URL`)

## Estrutura
- `packages/shared` — roda igual no cliente e no servidor: `config.ts` (constantes de jogo), `world.ts` (mapa por seed, colisão, raycast, moitas), `movement.ts` (controlador determinístico), `items.ts` (loja e preços), `rewards.ts` (XP/cash), `scoring.ts`, `protocol.ts` (binário + JSON)
- `packages/server` — Node + `ws`, autoritativo a 30 Hz. `game/Match.ts` (partida, combate, lag compensation, ferramentas, snapshots), `game/Bots.ts`, `db.ts` (SQLite nativo `node:sqlite`, perfis de convidado)
- `packages/client` — Three.js. `render/soldiers.ts` (soldado low-poly instanciado por parte, animação procedural), `render/scene.ts`, `main.ts` (rede, predição, interpolação), `ui.ts` (HUD e loja)

## Controles e regras de jogo (decisões do dono do projeto)
- Ritmo de simulador, como o WarDogs: **todos nascem na base** e vão a pé até a zona; sem escolha de local de spawn. Jogadores podem renascer sem espera após desistir da reanimação. Bots mantêm seus kits, munição e intervalo anterior de renascimento. Fôlego limita a corrida; não se atira correndo.
- **Jogadores nascem desarmados**, sem fuzil nem pistola automáticos; equipam-se no comerciante ou saqueiam armas de corpos inimigos. Bots continuam comprando seus kits ao nascer.
- **Sem cruz de mira**: o tiro só é preciso mirando com o **botão direito**. A mira de ferro/óptica alinha de verdade no centro da tela; o recuo volta ao ponto de origem.
- Posturas: **C** agacha, **Z** deita (3 posturas, hitbox próprio do deitado no servidor).
- **A loja nunca vem pré-selecionada** — o jogador clica item por item. **Recomprar último equipamento** existe só no comerciante: restaura o último equipamento e os carregadores comprados para revisão, e cobra ao confirmar. Não aparece na tela de renascimento. Miras são itens à venda.
- **FOB** (tecla F, item Kit de FOB): caixa de suprimentos do time com munição e cura; não é ponto de nascimento.
- Minimapa gira com o jogador; **N** troca o zoom (Shift+N inverte).
- **Não usar Ctrl como tecla de jogo** (Ctrl+W fecha a aba). Tela cheia é opcional no menu — neste navegador embutido ela derruba a aba.
- Plano de evolução (visual realista mantendo a web) em `C:\Users\Patrick\.claude\plans\quero-um-jogo-no-drifting-starlight.md`.

## Regras
- Movimento e física de granada ficam em `shared` e precisam continuar determinísticos (há teste).
- Cash/XP só mudam no servidor. Valores ajustáveis em `config.ts`, `items.ts`, `rewards.ts`.
- Nomes de itens, mapa e visual são próprios do WarBit — não usar nomes/arte do WarDogs.
