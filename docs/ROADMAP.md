# WarBit — roteiro de trabalho

Ordem = prioridade do dono. Faça uma tarefa por vez, com `npm run typecheck && npm test` verdes e conferência visual antes de passar para a próxima. Leia `AGENTS.md` primeiro.

Legenda de tamanho: P (horas), M (1–2 dias), G (vários dias).

## 1. Mapa com mais detalhe — G
Especificação completa em [`TAREFA-MAPA.md`](TAREFA-MAPA.md): moitas amassadas, ruas de verdade, casas inacabadas, indústrias, detalhe do terreno.

## 2. Áudio — M
Já feito (`packages/client/src/audio.ts`): tiros e explosões em 3D (`gunshot`, `boomAt`, `setListener`: HRTF para direção, queda e abafamento por distância, atraso pela velocidade do som, abafado atrás de parede), sons de compra (`purchase(kind)`).
Falta:
- **Passos e motor em 3D.** `footstep()` e o motor do veículo ainda usam pan estéreo simples (`burst` com `pan`). Migrar para `spatial()`; motor de **outros** jogadores hoje não toca.
- **Zunido de bala passando perto** (estalo supersônico quando o traçante passa a < 3 m da câmera) — é o que mais ajuda a "sentir" de onde vem o tiro. O traçante é criado em `main.ts → remoteShot`.
- **Impacto** (bala em parede/terra/metal perto do jogador), **recarga em etapas** (tirar/pôr carregador/ferrolho), sons de **interface** (clique de aba, erro de compra), **ambiente** (vento, pássaros; indústria com zumbido).
- **Controle de volume** no menu (geral / efeitos) salvo em `localStorage`.
- O dono achou os efeitos fracos: revise timbres ouvindo no jogo. Se o som procedural não chegar lá, a alternativa é usar amostras CC0 (combinar com o dono; ver regra 5 do `AGENTS.md`).

## 3. Construções com interior e escada — G
Prédios da vila são blocos sólidos. Passar para modulares: paredes finas, cômodos, escadas (degraus de 0,25 m; `STEP_HEIGHT` = 0,6 já sobe), 2–4 andares.
- Física: hoje **não existe colisão de teto** ao pular/subir (só a checagem ao levantar da postura em `movement.ts`). Adicionar em `stepMove`.
- `groundAt()` já escolhe a laje sob os pés. Testes de determinismo novos: subir escada, andar no 2º andar, não atravessar teto.

## 4. Navegação dos bots (A*) — G
Hoje: linha reta + desvio por raios + regra especial de portão da base (`Bots.ts`). Sintoma: alguns bots prendem dentro de casas (o teste `botsim` tolera média < 6 presos; a meta é < 1).
- Criar `packages/server/src/game/Nav.ts`: grade de 1 m gerada das caixas do `World` (livre/bloqueado, portas como passagem, por andar quando existir a tarefa 3), A* com suavização, cálculo fatiado por tick e cache por destino.
- Substituir `steerAround` e a regra do portão. Recalcular se não avançar em 2 s.
- Depois: comportamento tático (segurar janela, avançar em dupla, médico prioriza caídos).

## 5. Bonecos e armas realistas — G
Hoje os soldados são peças geradas em código (`render/soldiers.ts`) com animação procedural. O dono quer visual mais realista (referências: soldado preto com braçadeira vermelha, camuflado com verde, jaqueta azul com azul; mochilas visíveis).
- Trocar por modelo com esqueleto (glTF) e animações capturadas (parado, andar, correr, agachar, deitar, mirar, recarregar, cair, reanimar). **Precisa baixar assets CC0 — peça autorização ao dono antes.**
- Desempenho: esqueleto completo só perto (< 60 m), meia taxa até 150 m, e o boneco instanciado atual como LOD distante.
- Manter: cor/braçadeira por time (`TEAM_LOOK`), equipamento comprado visível (colete, capacete, mochila), camuflagem na moita.

## 6. Iluminação e materiais — M
Sombras do sol (desligáveis), céu com gradiente, correção de cor, texturas procedurais ou CC0 em paredes/telhados. Três níveis de qualidade no menu já existem como escala de resolução (`quality`); ampliar para ligar/desligar sombra e grama distante.

## 7. Veículos — M/G
Existe o quadriciclo (`shared/vehicles.ts`, `client/render/vehicles.ts`, compra no vendedor da base). Na loja há itens marcados `soon` (jipe, blindado, tanque, metralhadoras, fumaça, coquetel, detonador, kit de reparo, caixa de munição). Implementar por ordem de impacto: jipe com passageiros → metralhadoras → granada de fumaça.

## 8. Online e contas — M
- Hoje: convidado com token no navegador + SQLite no servidor. No Render gratuito **o disco não persiste**: cash/XP somem a cada reinício, e o serviço dorme sem tráfego. Opções: disco pago, banco externo (Postgres), ou VPS (ver `DEPLOY.md`).
- Login de verdade, várias partidas por servidor, anti-trapaça além do servidor autoritativo, HTTPS em VPS próprio.

## Pequenos consertos conhecidos
- `packages/client/src/ui.ts` tinha uma chamada a `magazineIcon()` sem a função existir (corrigido; função em `render/gearIcons.ts`). Vale revisar o restante da loja nova com `npm run typecheck`.
- O teste `botsim` é aleatório e ocasionalmente oscila; se falhar, rode de novo antes de investigar.
- `CLAUDE.md` e `DEPLOY.md` descrevem parte do estado antigo (ex.: spawn pela loja); atualize quando mexer nessas áreas.

## Como entregar cada tarefa
1. Diga o que mudou em linguagem simples (o dono não é programador) e **o que não foi verificado**.
2. `npm run typecheck` e `npm test` verdes; print ou descrição do que foi visto no navegador.
3. Commit pequeno e descritivo. **Push só quando o dono pedir** (push publica no Render).
