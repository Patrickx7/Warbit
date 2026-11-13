# WarBit — guia para IAs que vão mexer no código

Leia este arquivo inteiro antes de editar. Depois leia `CLAUDE.md` (regras de jogo decididas pelo dono) e `docs/ROADMAP.md` (o que fazer, em ordem).

## O que é
FPS multiplayer no navegador, ritmo de simulador (inspirado nas mecânicas do WarDogs): 60 jogadores, 3 times, uma Control Zone com Hot Zone móvel (conta em dobro), primeiro a 100 pontos vence. Economia: cash persistente, equipamento comprado e perdido ao morrer. Online em https://warbit.onrender.com (Render, deploy a partir do GitHub `Patrickx7/Warbit`, branch `main`).

## Rodar e verificar (obrigatório antes de dizer que terminou)
```bash
npm install
npm run dev          # servidor :8080 + cliente :5173
npm run typecheck    # os 3 pacotes — o build do Vite NÃO checa tipos, então rode sempre
npm test             # Vitest (shared + server + client)
```
- **Erro de tipo não quebra o build, quebra o jogo em produção.** Já aconteceu: uma função inexistente (`magazineIcon`) foi para o ar. Sempre `npm run typecheck`.
- Páginas de inspeção, sem servidor: `http://localhost:5173/?bench=1` com `&at=0..3` (centro em Vila/Indústria/Fazenda/Posto), `&r=75` (distância da câmera), `&guns=1&d=3.4` (catálogo de armas), `&bush=1` (moita de perto), `&vm=1&gun=<id>&sight=<id>&ads=1` (arma em 1ª pessoa).
- `npm run loadtest` com o servidor ligado mede tick e banda.

## Arquitetura (monorepo npm workspaces, TypeScript)
| Pacote | Papel | Arquivos-chave |
|---|---|---|
| `packages/shared` | Roda **idêntico** no cliente e no servidor | `config.ts` (todas as constantes), `world.ts` (mapa por seed, colisão, raycast, moitas), `movement.ts` (controlador a pé), `vehicles.ts` (física do quadriciclo), `items.ts` (loja), `inventory.ts`, `rewards.ts`, `scoring.ts`, `protocol.ts` (binário + JSON) |
| `packages/server` | Autoritativo, 30 Hz, Node + `ws`, SQLite nativo (`node:sqlite`, exige Node ≥ 22.5) | `game/Match.ts` (partida, combate, lag compensation, compras, veículos, snapshots), `game/Bots.ts`, `game/Player.ts`, `db.ts`, `index.ts` |
| `packages/client` | Three.js + Vite | `main.ts` (rede, predição, loop), `ui.ts` (HUD, loja, minimapa), `audio.ts` (som procedural), `render/scene.ts` (terreno, construções, moitas), `render/soldiers.ts`, `render/guns.ts`, `render/vehicles.ts`, `render/viewmodel.ts`, `render/fx.ts`, `render/grass.ts`, `render/itemIcons.ts` + `render/gearIcons.ts` |

### Regras que não podem ser quebradas
1. **Determinismo do `shared`.** `World` é gerado por seed com um PRNG (`this.rnd`). Cliente e servidor precisam gerar o mesmo mundo: nada de `Math.random()`, `Date`, ou ordem dependente de plataforma dentro de `world.ts`, `movement.ts`, `vehicles.ts`, `nade.ts`. Qualquer chamada nova a `rnd()` muda o mapa inteiro dali para frente — tudo bem, desde que seja a mesma nos dois lados (é, porque o código é compartilhado).
2. **Colisão = caixas alinhadas aos eixos** (`Box` em `world.ts`). Não existe colisão rotacionada nem cilindro. Formas visuais diferentes (telhado, cilindro, chaminé) são **decoração no cliente** por cima de uma caixa de colisão. Veja `world.roofs` e `world.rocks` como exemplo do padrão "lista de decoração no `World` + desenho em `scene.ts`".
3. **Servidor decide tudo.** Cash, XP, dano, compras e posição são do servidor; o cliente só prediz o próprio movimento. Nunca confie em valor vindo do cliente.
4. **Protocolo.** Mudou `protocol.ts` (campo novo em snapshot/entidade/mensagem)? Atualize codificador, decodificador, servidor, cliente e o teste de ida-e-volta em `packages/shared/test/shared.test.ts`. Snapshots são binários e apertados (bits contados): leia o layout antes.
5. **Sem arquivos de arte.** Tudo é gerado em código (geometria, texturas em canvas, som em WebAudio). Se for introduzir arquivos (modelos glTF, texturas), só com licença livre (CC0) e depois de combinar com o dono — isso é a etapa "bonecos realistas" do roadmap.
6. **Identidade própria.** Mecânicas do gênero podem ser iguais às do WarDogs; nomes de armas/itens, mapas, arte e interface não. Não copie nomes nem assets de outros jogos.
7. **Decisões de jogo do dono estão em `CLAUDE.md`** (sem cruz de mira, nascer só na base, loja nunca pré-selecionada, Ctrl não é tecla de jogo, etc.). Não reverta sem ele pedir.

## Estilo e cuidados
- Português nos comentários e textos de interface. Comentário só onde o código não é óbvio.
- Constantes de balanceamento vão em `shared/config.ts`, `items.ts`, `rewards.ts` — não espalhe números mágicos.
- Parte do código recente (`ui.ts`, `Match.ts`, `inventory.ts`, `itemIcons.ts`) está em linhas muito longas e compactadas. Ao editar esses trechos, **leia a região com atenção** e prefira edições pequenas; não reformate o arquivo inteiro (gera diff ilegível).
- Desempenho importa: soldados, árvores, moitas e grama são `InstancedMesh`; construções estáticas são uma única geometria mesclada. Não crie um `Mesh` por objeto para coisas que existem às centenas.
- Bots produzem inputs como jogadores (`BotBrain.think` → `match.processInput`). Não mova bots "teleportando" estado.
- Testes dos bots (`packages/server/test/botsim.test.ts`) são simulações aleatórias: rode 3 vezes antes de concluir que passou ou falhou.

## Publicar
`git push origin main` → o Render reconstrói pelo `Dockerfile` (que compila o cliente e o servidor entrega tudo num endereço só). Detalhes e alternativas em `DEPLOY.md`. **Só faça push quando o dono pedir**: push = vai para o ar.

## Estado atual resumido
Feito: movimento com 3 posturas e fôlego, combate com lag compensation, mira obrigatória (ADS), miras e silenciadores, loja com comerciante e carregadores, mochilas, FOB, sacos de areia, quadriciclo, bots (cobertura, flanco, revive), moitas com camuflagem, minimapa, **som 3D dos tiros e explosões**, **sons de compra** (caixa + engatilhar / zíper / chaves), **ícones para todos os itens**.

Pendente e priorizado: ver `docs/ROADMAP.md`. A primeira tarefa (a que mais incomoda o dono) é o mapa: `docs/TAREFA-MAPA.md`.
