import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { DT, World, decodeInput, type ClientMsg } from '@warbit/shared';
import { ProfileStore } from './db';
import { Match } from './game/Match';
import type { Player } from './game/Player';

const PORT = Number(process.env.PORT ?? 8080);
const SEED = Number(process.env.SEED ?? 20261112);
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const DB_PATH = process.env.DB_PATH ?? join(ROOT, 'data', 'warbit.sqlite');
const CLIENT_DIST = join(ROOT, 'packages', 'client', 'dist');

const world = new World(SEED);
const store = new ProfileStore(DB_PATH);
const match = new Match(world, store, { bots: process.env.BOTS !== '0' });

// estatísticas de tick
let tickMsAvg = 0, tickMsMax = 0, bytesOut = 0;

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const http = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (url === '/api/stats') {
    const humans = match.players.filter((p) => !p.bot).length;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ tick: match.tick, phase: match.phase, scores: match.scores, humans, bots: match.fillBots ? match.players.length - humans : 0, tickMsAvg: +tickMsAvg.toFixed(3), tickMsMax: +tickMsMax.toFixed(3), bytesOut }));
    tickMsMax = 0;
    return;
  }
  // em produção, serve o cliente compilado
  if (existsSync(CLIENT_DIST)) {
    const rel = normalize(url === '/' ? '/index.html' : url).replace(/^([/\\])+/, '');
    const file = join(CLIENT_DIST, rel);
    if (file.startsWith(CLIENT_DIST) && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
      return;
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('WarBit server — use o cliente em http://localhost:5173 (npm run dev)');
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws: WebSocket) => {
  let player: Player | null = null;
  const conn = {
    send(data: string | ArrayBuffer) {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > 512 * 1024) return; // cliente lento: descarta em vez de acumular
      bytesOut += typeof data === 'string' ? data.length : data.byteLength;
      ws.send(data);
    },
  };
  ws.on('message', (data, isBinary) => {
    try {
      if (isBinary) {
        if (!player) return;
        const buf = data as Buffer;
        const inp = decodeInput(new DataView(buf.buffer, buf.byteOffset, buf.byteLength));
        if (inp) match.onInput(player, inp);
        return;
      }
      const m = JSON.parse(data.toString()) as ClientMsg;
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'hello') {
        if (player) return;
        player = match.join(conn, String(m.name ?? ''), typeof m.token === 'string' ? m.token : undefined);
        if (!player) { ws.send(JSON.stringify({ t: 'msg', text: 'Servidor cheio' })); ws.close(); }
        return;
      }
      if (player) match.onJson(player, m);
    } catch {
      /* mensagem inválida: ignora */
    }
  });
  ws.on('close', () => { if (player) { match.leave(player); player = null; } });
  ws.on('error', () => {});
});

// loop de simulação com passo fixo
const stepMs = DT * 1000;
let next = performance.now() + stepMs;
function loop() {
  const now = performance.now();
  let n = 0;
  while (now >= next && n < 5) {
    const t0 = performance.now();
    match.step();
    const dt = performance.now() - t0;
    tickMsAvg = tickMsAvg * 0.98 + dt * 0.02;
    if (dt > tickMsMax) tickMsMax = dt;
    next += stepMs;
    n++;
  }
  if (now - next > 250) next = now + stepMs; // atrasou demais: não tenta recuperar
  setTimeout(loop, Math.max(0, next - performance.now()));
}

http.listen(PORT, () => {
  console.log(`[warbit] servidor em http://localhost:${PORT}  (seed ${SEED}, ${world.boxes.length} caixas, ${world.trees.length} árvores)`);
  loop();
});

function shutdown() {
  match.shutdown();
  store.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
