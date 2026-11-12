# WarBit

FPS multiplayer leve no navegador: 100 jogadores, 3 times, Control Zone + Hot Zone (x2), economia de compra por vida no estilo WarDogs.

## Comandos
- `npm run dev` — servidor (8080) + cliente Vite (5173). Abra http://localhost:5173
- `npm test` — testes (Vitest) de shared e server
- `npm run typecheck`
- `npm run loadtest` — 100 clientes WebSocket reais contra o servidor rodando (`CLIENTS`, `SECONDS`, `URL`)
- `http://localhost:5173/?bench=1` — benchmark de render com 100 soldados (`&r=5` câmera de perto)

## Estrutura
- `packages/shared` — roda igual no cliente e no servidor: `config.ts` (constantes de jogo), `world.ts` (mapa por seed, colisão, raycast, moitas), `movement.ts` (controlador determinístico), `items.ts` (loja e preços), `rewards.ts` (XP/cash), `scoring.ts`, `protocol.ts` (binário + JSON)
- `packages/server` — Node + `ws`, autoritativo a 30 Hz. `game/Match.ts` (partida, combate, lag compensation, ferramentas, snapshots), `game/Bots.ts`, `db.ts` (SQLite nativo `node:sqlite`, perfis de convidado)
- `packages/client` — Three.js. `render/soldiers.ts` (soldado low-poly instanciado por parte, animação procedural), `render/scene.ts`, `main.ts` (rede, predição, interpolação), `ui.ts` (HUD e loja)

## Regras
- Movimento e física de granada ficam em `shared` e precisam continuar determinísticos (há teste).
- Cash/XP só mudam no servidor. Valores ajustáveis em `config.ts`, `items.ts`, `rewards.ts`.
- Nomes de itens, mapa e visual são próprios do WarBit — não usar nomes/arte do WarDogs.
