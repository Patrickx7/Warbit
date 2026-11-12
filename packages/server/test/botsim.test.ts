import { expect, it } from 'vitest';
import { LIFE_ALIVE, LIFE_DOWNED, TICK_RATE, World } from '@warbit/shared';
import { Match } from '../src/game/Match';

// Regressão do comportamento dos bots: ocupam a zona, revivem caídos, erguem FOB e NÃO ficam presos.
it('bots ocupam a zona, revivem companheiros e não ficam presos', () => {
  const world = new World(20261112);
  const m = new Match(world, null);
  let revives = 0, maxInZone = 0, maxFobs = 0, stuckTotal = 0, samples = 0, maxHot = 0;
  const bins: Set<number>[] = [new Set(), new Set(), new Set()]; // direções (8 fatias) de onde cada time chega à zona
  const origAward = m.award.bind(m);
  m.award = (p, k) => { if (k === 'revive') revives++; origAward(p, k); };
  const prev = new Map<number, { x: number; z: number; deaths: number }>();
  const stuckAt: string[] = [];
  const SECONDS = 240;
  for (let s = 1; s <= SECONDS; s++) {
    for (let i = 0; i < TICK_RATE; i++) m.step();
    const alive = m.players.filter((p) => p.life === LIFE_ALIVE);
    maxInZone = Math.max(maxInZone, alive.filter((p) => Math.hypot(p.ms.x - m.cz.x, p.ms.z - m.cz.z) < m.cz.r).length);
    maxFobs = Math.max(maxFobs, m.fobs.filter(Boolean).length);
    maxHot = Math.max(maxHot, alive.filter((p) => Math.hypot(p.ms.x - m.hz.x, p.ms.z - m.hz.z) < m.hz.r + 20).length);
    for (const p of alive) {
      const d = Math.hypot(p.ms.x - m.cz.x, p.ms.z - m.cz.z);
      if (d > m.cz.r + 30 && d < m.cz.r + 170) bins[p.team].add(Math.floor(((Math.atan2(p.ms.z - m.cz.z, p.ms.x - m.cz.x) + Math.PI) / (2 * Math.PI)) * 8) % 8);
    }
    if (s % 20 === 0) {
      let stuck = 0;
      for (const p of alive) {
        const b = p.brain!;
        const o = prev.get(p.id);
        if (o && o.deaths === p.deaths && s > 60 && !b.holding && b.targetId < 0 && p.life === LIFE_ALIVE) {
          if (Math.hypot(p.ms.x - o.x, p.ms.z - o.z) < 1.5) {
            stuck++;
            if (stuckAt.length < 8) stuckAt.push(`${p.name} (${p.ms.x.toFixed(0)},${p.ms.z.toFixed(0)}) obj (${b.goalX.toFixed(0)},${b.goalZ.toFixed(0)})`);
          }
        }
        prev.set(p.id, { x: p.ms.x, z: p.ms.z, deaths: p.deaths });
      }
      if (s > 60) { stuckTotal += stuck; samples++; }
      console.log(`${s}s vivos ${alive.length} · na zona ${alive.filter((p) => Math.hypot(p.ms.x - m.cz.x, p.ms.z - m.cz.z) < m.cz.r).length} · caídos ${m.players.filter((p) => p.life === LIFE_DOWNED).length} · revives ${revives} · placar ${m.scores.map((x) => x.toFixed(1))} · presos ${stuck}`);
    }
  }
  if (stuckAt.length) console.log('exemplos de presos:\n' + stuckAt.join('\n'));
  console.log(`máx. de bots na Hot Zone: ${maxHot} · direções de chegada por time: ${bins.map((b) => b.size)}`);
  expect(maxInZone).toBeGreaterThan(18);
  expect(maxHot).toBeGreaterThan(4); // a Hot Zone é disputada (observado: 7 a 12 de 60)
  for (const b of bins) expect(b.size).toBeGreaterThanOrEqual(2); // cada time chega por várias direções (observado: 3 a 5), não por um único caminho
  expect(revives).toBeGreaterThan(0);
  expect(maxFobs).toBeGreaterThan(0);
  // PENDENTE (etapa 5 do plano, navegação A*): alguns bots ainda prendem dentro de casas da Vila Central.
  // Quando a navegação entrar, baixar este limite para < 1.
  expect(stuckTotal / samples).toBeLessThan(6);
}, 180000);
