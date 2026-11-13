# Tarefa 1 — Mapa com mais detalhe (prioridade máxima)

## Reclamações do dono (palavras dele)
- "O mapa está muito feio e sem detalhes"
- "falta ruas"
- "as moitas tinham ficado legais porém muito grandes, agora estão amassadas"
- "casas inacabadas"
- "quero que tenha indústrias"
- Antes: área industrial com pouco mato e bastante cobertura (já feito — manter).

## Onde mexer
- **Geração (colisão e layout):** `packages/shared/src/world.ts`. Pontos de interesse em `generate()`: `buildBases`, `buildTown` (Vila Central), `buildIndustrial`, `buildFarm`, `buildOutpost`, `buildCountryside`, `buildForests`, `buildRocks`, `buildBushes`. Utilitários: `house()` (casa oca com porta/janelas), `block()`/`solid()` (caixa sólida), `areaFree()`, `roadDist()`, `paintRect/paintCircle` (tipo de chão em `surface[]`).
- **Desenho:** `packages/client/src/render/scene.ts` — `buildTerrain` (cor por vértice a partir de `world.surface`), `buildBoxes` (todas as caixas numa geometria), `buildRoofs`, `buildTrees`, `buildRocks`, `buildBushes`, e `render/grass.ts`.
- **Minimapa:** `ui.ts` → `setWorld()` desenha o mapa-base a partir de `surfaceAt` e das caixas. Se criar estruturas novas, confira que aparecem.

Veja como está antes de começar: `http://localhost:5173/?bench=1&at=0&r=75` (vila), `&at=1` (indústria), `&at=2` (fazenda), `&at=3` (posto).

## Subtarefas, em ordem

### 1.1 Moitas "amassadas" (rápido — faça primeiro)
Causa: em `world.ts`, `buildBushes → tryBush`, a altura virou `h: 0.45 + rnd() * 0.35` e o raio continua `(1.4 + rnd() * 1.1) * big`. Resultado: discos largos e baixos.
- Ajuste para raio **1.0–1.6 m** e altura **1.2–1.8 m** (cobre um soldado agachado; em pé a cabeça aparece). O dono achou o tamanho original (raio até 2.5) grande demais.
- `scene.ts → buildBushes` escala a instância por `(r*1.1, h, r*1.1)`; confira no `&bush=1` que a folhagem parece um arbusto, não um disco.
- Regras de camuflagem dependem de `world.inBush()` (raio) e `bushBlocks()` (altura): rode os testes `moitas` em `shared.test.ts`.
- Aceite: print de `?bench=1&bush=1&bd=6` com um soldado em pé ao lado mostrando a moita na altura do peito.

### 1.2 Ruas de verdade
Hoje "rua" é só cor de vértice numa grade de ~5,9 m (`Surface.Road`), então fica borrada e serrilhada, sem cara de rua.
- **Estradas de terra/asfalto entre os pontos:** `world.roads` já tem os segmentos (`{ax,az,bx,bz}`). No cliente, gere uma **faixa de malha** seguindo os segmentos (largura ~6 m, 0,05 m acima do terreno, amostrando `heightAt` a cada ~3 m para acompanhar o relevo), com: cor de asfalto/terra, bordas mais escuras, e **faixa central tracejada** (quads claros) nas estradas principais. Use `polygonOffset` ou o pequeno deslocamento em Y para não "piscar" (z-fighting).
- **Ruas da vila:** em `buildTown` as ruas são `paintRect`. Exporte-as numa lista nova no `World` (ex.: `streets: {x0,z0,x1,z1}[]`, sem consumir `rnd()`) e desenhe no cliente: asfalto, **calçadas** (faixa clara de 1,2 m, 0,12 m mais alta — só visual, ou como caixa baixa de 0,12 m que o `STEP_HEIGHT` sobe), faixas de pedestre nos cruzamentos, e **postes** (decoração instanciada).
- Mantenha `Surface.Road` como está (grama não nasce, bots e moitas respeitam `roadDist`).
- Aceite: de cima (`&at=0&r=75`) dá para ler o traçado das ruas; no chão, a rua tem borda nítida.

### 1.3 Casas "inacabadas"
O que provavelmente passa essa impressão (verifique olhando):
- **Ruínas:** dois muros em L (`buildTown`, ramo "terreno baldio", e `buildCountryside`, bloco "ruínas no campo") parecem casa pela metade. Troque por estruturas completas: galpõezinhos/garagens fechados via `house()`, ou ruínas que pareçam ruínas (3–4 paredes de alturas quebradas + entulho de caixas pequenas).
- **Casas sem acabamento:** `house()` gera piso, paredes com vãos e laje; o telhado de duas águas é decoração (`world.roofs`). Faltam: **moldura** em portas e janelas, **rodapé/fundação** de outra cor, **beiral**, chaminé, degrau na porta, e **móveis simples por dentro** (mesa, cama, armário como caixas baixas — dão cobertura e tiram a cara de caixa vazia). Paredes internas dividindo em 2 cômodos nas casas maiores.
- **Prédios da vila** são blocos sólidos com janelas pintadas (`BoxKind.Building`, desenhadas em `scene.ts → buildBoxes`). Mínimo: porta pintada, platibanda no topo, caixas de ar-condicionado/caixa d'água no telhado. Ideal (tarefa 3 do roadmap): prédios com interior e escada.
- Aceite: nenhuma construção parece "faltando parede" a não ser que seja claramente uma ruína.

### 1.4 Indústrias
A área industrial (`buildIndustrial`) tem 3 galpões ocos, escritório, contêineres, barreiras, muretas, caminhões e 3 "tanques" que são caixas. Para parecer indústria:
- **Chaminés** altas (cilindro, 18–30 m) com faixa vermelha/branca; **silos e tanques cilíndricos**; **tubulações** em pórtico (caixas finas a 4–5 m de altura ligando galpão a tanque); **telhado em dente de serra** nos galpões; **guarita** no portão; **esteira/rampa de carga**.
- Padrão para cilindros: crie no `World` uma lista de decoração (ex.: `props: {kind:'chimney'|'silo'|'tank'|'lamp', x,y,z,r,h,color}[]`), adicione **uma caixa de colisão** do mesmo tamanho com `block()`, e no cliente desenhe com `InstancedMesh` de `CylinderGeometry`, **pulando a caixa correspondente** em `buildBoxes` (use um `BoxKind` novo, como já é feito com `Tree` e `Rock`).
- "Indústrias" no plural: além da área principal, crie **2–3 instalações pequenas** à beira das estradas (serraria, usina, depósito: galpão oco + silo + pátio com contêineres), em `buildCountryside`.
- Não reintroduza mato no pátio (teste `área industrial` em `shared.test.ts` cobra < 25 moitas e > 45 peças de cobertura).

### 1.5 Detalhe do terreno
- O terreno é uma grade 256×256 com cor por vértice: de perto fica liso. Aplique uma **textura de detalhe procedural** (canvas com ruído, repetida a cada ~6 m, multiplicando a cor do vértice) em `buildTerrain`; opcionalmente uma segunda oitava a 40 m para quebrar a repetição.
- Transição suave entre tipos de chão (hoje é dura no vértice): interpolar a cor com os vizinhos.
- Extras baratos: pedrinhas/tocos instanciados, cercas, placas, poças; céu com gradiente e sol.

## Restrições
- Determinismo e colisão por caixas (ver `AGENTS.md`).
- Orçamento: manter ≥ 60 fps em GPU intermediária. Meça com `?bench=1` antes e depois (o HUD mostra fps, draw calls e triângulos). Hoje: ~45 draw calls, ~1 M de triângulos na vista da indústria.
- Depois de mudar a geração: `npm run typecheck && npm test` (3 vezes o `botsim`), e confira no jogo que os bots ainda chegam à zona e não ficam presos nas construções novas.
- Bases: os bots saem pelos portões (lógica em `Bots.ts`, procure "portão"). Se mexer no muro/portões da base, ajuste lá.
