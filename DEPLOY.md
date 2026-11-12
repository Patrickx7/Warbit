# Publicar o WarBit para jogar online

O jogo tem duas partes:

| Parte | O que é | Onde pode rodar |
|---|---|---|
| **Cliente** | a página do jogo (Three.js) | Vercel, Netlify, qualquer host estático |
| **Servidor** | partida, bots, economia, SQLite (processo ligado o tempo todo, WebSocket) | Railway, Render, Fly.io, VPS |

**A Vercel não serve para o servidor**: ela não mantém um processo e conexões WebSocket abertos, e o jogo precisa disso 30 vezes por segundo.

## Opção A — o jeito mais simples: tudo num lugar só (sem Vercel)

O `Dockerfile` compila o cliente e o servidor entrega a página **e** o jogo no mesmo endereço.

1. Suba o projeto para um repositório no GitHub.
2. Crie um serviço a partir do repositório em **Railway** (ou **Render**). Eles detectam o `Dockerfile`.
3. Adicione um **volume** montado em `/data` (guarda o banco com cash e XP dos jogadores).
4. Abra o endereço público que o serviço gerar (já vem com HTTPS). Pronto: é só compartilhar o link.

## Opção B — cliente na Vercel + servidor em outro lugar

1. Publique o servidor como na opção A e anote o endereço, por exemplo `warbit.up.railway.app`.
2. Na Vercel, importe o mesmo repositório. O `vercel.json` já define build e pasta de saída.
3. Em **Settings → Environment Variables** da Vercel crie:
   `VITE_WS_URL = wss://warbit.up.railway.app/ws`
4. Faça o deploy. Quem abrir o site da Vercel joga no servidor do passo 1.

## Variáveis do servidor

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `8080` | porta (Railway/Render já definem) |
| `DB_PATH` | `data/warbit.sqlite` | arquivo do banco (no Docker: `/data/warbit.sqlite`) |
| `SEED` | `20261112` | seed do mapa |
| `BOTS` | ligado | `BOTS=0` desliga os bots |

## Limites (leia antes de divulgar)

- Um servidor Node comporta **uma partida de 100 jogadores** (o teste de carga fechou 100 conexões com ~1 ms de tick). Para várias partidas ao mesmo tempo é preciso rodar mais servidores.
- Jogadores são **convidados**: o cash e o XP ficam ligados ao navegador (token). Quem limpar os dados do navegador perde o perfil.
- Não há proteção contra trapaça além do servidor ser quem decide tudo (movimento, tiro, dinheiro).
- A latência depende de onde o servidor fica: escolha uma região perto dos jogadores (para o Brasil, São Paulo).
