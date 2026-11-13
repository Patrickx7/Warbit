# WarBit

FPS multiplayer leve no navegador: 60 jogadores, 3 times, Control Zone + Hot Zone (x2), economia de compra por vida no estilo WarDogs.

## Comandos
- `npm run dev` — servidor (8080) + cliente Vite (5173). Abra http://localhost:5173
- `npm test` — testes (Vitest) de shared e server
- `npm run typecheck`
- `npm run loadtest` — 60 clientes WebSocket reais contra o servidor rodando (`CLIENTS`, `SECONDS`, `URL`)
- `http://localhost:5173/?bench=1` — benchmark de render com 100 soldados (`&r=5` câmera de perto)
  - `&guns=1` catálogo lateral de todas as armas (`&d=3.4` aproxima) · `&vm=1&gun=<id>&sight=<id>&ads=1` arma em 1ª pessoa · `&bush=1` moita com soldados dentro
  - `&quad=1` cockpit do quadriciclo em 1ª pessoa (`&steer=0.8&speed=14&hp=0.5`) · `&quad=2` quadriciclo por fora com piloto e garupa sentados (`&a=<ângulo>&d=<distância>`); use `&at=2` para campo aberto
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
- **Troca de time no jogo**: menu de pausa (Esc) → "Trocar de time". O jogador assume a vaga de um bot do outro time (`Match.switchTeam`; o time de cada vaga é fixo), recebe o valor do equipamento de volta e espera o tempo de renascer; intervalo mínimo de 15 s.
- **Comerciante em passos**: 1 Mochila → 2 Colete → 3 Arma → 4 Munição → 5 Mira → 6 Proteção (capacete/armadura) → 7 Itens (mochila e colete primeiro porque definem quantos carregadores cabem), com painel "o que falta" e botão Próximo. Escolher a arma leva à munição dela (botão "Encher os espaços livres"). Mira só aparece se servir na arma principal. Sair sem confirmar a compra ou com a arma sem carregadores pede confirmação. Sem kits prontos.
- **A loja nunca vem pré-selecionada** — o jogador clica item por item. **Recomprar último equipamento** existe só no comerciante: restaura o último equipamento e os carregadores comprados para revisão, e cobra ao confirmar. Não aparece na tela de renascimento. Miras são itens à venda.
- **FOB** (tecla F, item Kit de FOB): caixa de suprimentos do time com munição e cura; não é ponto de nascimento.
- **Jogador caído espera sem limite de tempo** pela reanimação; tiros adicionais não removem o corpo. Espaço desiste e libera o renascimento. A rodada nova encerra a espera.
- **Bot caído renasce na hora** se o time dele tem ≤3 vivos na Control Zone (`BOT_RESPAWN_MAX_IN_ZONE`); caso contrário desiste após `DOWNED_SECONDS`.
- **Loot (tecla X)**: abre as armas do corpo inimigo para trocar principal/reserva com as balas e acessórios, ou pegar carregadores compatíveis. A arma anterior fica no corpo. Quem desiste deixa uma mochila de carregadores por 2 min (`BACKPACK_SECONDS`). Corpo de aliado não é lootável. O servidor verifica distância, visibilidade e revisão do inventário.
- **Control Zone** (raio 230) tem centro sorteado no corredor urbano entre a vila e a indústria, aproximadas do centro do mapa; bases permanecem fixas. A diferença entre a maior e menor distância em linha reta até a borda é de até 15% da média (`CZ_BALANCE_MAX_SPREAD`). O limite não mede rotas reais. A **Hot Zone não teleporta**: desliza a 1,5 m/s (`HZ_DRIFT_SPEED`) até um ponto da CZ e então segue para outro.
- **Quadriciclo** leva 2 (piloto + garupa; garupa só do mesmo time, pode atirar; se o piloto desce, a garupa assume). **Não há veículo grátis**: todo veículo é comprado no vendedor (`Match.buyVehicle`). **Metade de cada time (10 bots) vai de quadriciclo**: 5 compram e pilotam (`BotBrain.buyer`), 5 vão de garupa (o piloto espera até 8 s); 2 pilotos por time vão direto à Hot Zone (`toHot`), os outros desembarcam dentro da Control Zone. Ao chegar, **o quadriciclo de bots some** (`Match.despawnVehicle`); veículo largado sem aliado perto some em 2 min. Direção dos bots: `BotBrain.driveButtons` (portão da base, 3 raios, desvio com compromisso, ré com carência). Guidão em 1ª pessoa: `render/handlebars.ts`; o cliente do piloto mantém a predição do veículo e não aceita o estado (atrasado) que o servidor manda a cada 6 ticks, a menos que divirja > 6 m.
- Lag compensation: o cliente manda o `renderTick` com o atraso real de interpolação de quem está sob a mira (`aimDelay`); antes errava headshot em alvo distante em movimento.
- Montados no quadriciclo os soldados ficam **sentados** (`SoldierPose.seat`: 1 piloto com as mãos no guidão, 2 garupa girando o tronco para mirar). Veículos dos outros andam por conta própria entre os pacotes (5/s) e são suavizados no `VehicleRenderer`. **Som do motor é 3D por veículo** (`Sfx.updateEngines`), cai com a distância.
- HUD: a linha sob o placar é a **barra do próximo ponto** — enche na cor de quem domina a CZ até +1 ponto, troca de cor quando outro time assume, fica cinza no empate.
- HUD: o número de jogadores sob o minimapa conta só **vivos dentro da Control Zone** (`counts` no `state`).
- HUD: minimapa **quadrado** no canto inferior esquerdo (circular é só a zona) e, logo abaixo, por time: jogadores vivos · pontos · barra de progresso.
- Minimapa gira com o jogador; **N** troca o zoom (Shift+N inverte).
- **Não usar Ctrl como tecla de jogo** (Ctrl+W fecha a aba). Tela cheia é opcional no menu — neste navegador embutido ela derruba a aba.
- Plano de evolução (visual realista mantendo a web) em `C:\Users\Patrick\.claude\plans\quero-um-jogo-no-drifting-starlight.md`.

## Regras
- Movimento e física de granada ficam em `shared` e precisam continuar determinísticos (há teste).
- Cash/XP só mudam no servidor. Valores ajustáveis em `config.ts`, `items.ts`, `rewards.ts`.
- Nomes de itens, mapa e visual são próprios do WarBit — não usar nomes/arte do WarDogs.
