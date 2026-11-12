// Teste de carga: conecta N clientes WebSocket reais, compra o kit grátis, anda e atira.
// Uso: npm run loadtest            (60 clientes, 30 s, servidor em localhost:8080)
//      CLIENTS=50 SECONDS=60 URL=ws://host:8080/ws npm run loadtest
import WebSocket from 'ws';
import { BTN_FIRE, BTN_FWD, BTN_SPRINT, encodeInput } from '@warbit/shared';

const N = Number(process.env.CLIENTS ?? 60);
const SECONDS = Number(process.env.SECONDS ?? 30);
const URL = process.env.URL ?? 'ws://localhost:8080/ws';
const HTTP = URL.replace(/^ws/, 'http').replace(/\/ws$/, '');

let bytes = 0, snaps = 0, connected = 0, full = 0;
const sockets: WebSocket[] = [];

for (let i = 0; i < N; i++) {
  setTimeout(() => {
    const ws = new WebSocket(URL);
    sockets.push(ws);
    let seq = 0, yaw = Math.random() * Math.PI * 2, timer: NodeJS.Timeout | null = null;
    ws.on('open', () => { connected++; ws.send(JSON.stringify({ t: 'hello', name: `Carga${i}` })); });
    ws.on('message', (data, bin) => {
      const len = (data as Buffer).length;
      bytes += len;
      if (bin) { snaps++; return; }
      const m = JSON.parse(data.toString());
      if (m.t === 'msg' && m.text === 'Servidor cheio') full++;
      if (m.t === 'welcome' || (m.t === 'life' && m.life === 0)) setTimeout(() => ws.send(JSON.stringify({ t: 'spawn', items: [] })), 500);
      if (m.t === 'welcome' && !timer) {
        timer = setInterval(() => {
          if (ws.readyState !== ws.OPEN) return;
          if (Math.random() < 0.02) yaw += (Math.random() - 0.5) * 2;
          const fire = Math.random() < 0.3 ? BTN_FIRE : 0;
          ws.send(Buffer.from(encodeInput({ seq: ++seq, buttons: BTN_FWD | BTN_SPRINT | fire, buttons2: 0, buttons3: 0, yaw, pitch: 0, renderTick: 0 })));
        }, 1000 / 30);
      }
    });
    ws.on('close', () => { if (timer) clearInterval(timer); });
    ws.on('error', () => {});
  }, i * 20);
}

const t0 = Date.now();
const report = setInterval(async () => {
  const s = (Date.now() - t0) / 1000;
  let stats = '';
  try { const r = await fetch(`${HTTP}/api/stats`); const j = await r.json() as { tickMsAvg: number; tickMsMax: number; humans: number; bots: number }; stats = `tick médio ${j.tickMsAvg} ms (máx ${j.tickMsMax}) · humanos ${j.humans} · bots ${j.bots}`; } catch { stats = 'stats indisponível'; }
  console.log(`[${s.toFixed(0)}s] conectados ${connected}/${N}${full ? ` (${full} recusados: cheio)` : ''} · ${(bytes * 8 / 1000 / Math.max(1, connected) / s).toFixed(0)} kbps por cliente · ${(snaps / Math.max(1, connected) / s).toFixed(1)} snapshots/s por cliente · ${stats}`);
  if (s >= SECONDS) { clearInterval(report); for (const w of sockets) w.close(); setTimeout(() => process.exit(0), 300); }
}, 5000);
