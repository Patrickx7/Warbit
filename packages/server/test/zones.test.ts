import { expect, it } from 'vitest';
import { CZ_BALANCE_MAX_SPREAD, CZ_RADIUS, World } from '@warbit/shared';
import { chooseControlZone } from '../src/game/zones';

it('sorteia posições variadas junto das construções sem favorecer uma base', () => {
  const world = new World(4321), positions = new Set<string>();
  let seed = 55;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 300; i++) {
    const c = chooseControlZone(world.bases, CZ_RADIUS, random);
    positions.add(`${c.x.toFixed(2)},${c.z.toFixed(2)}`);
    const distances = world.bases.map(b => Math.hypot(b.x - c.x, b.z - c.z) - c.r);
    const mean = distances.reduce((a, b) => a + b) / 3;
    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThanOrEqual(mean * CZ_BALANCE_MAX_SPREAD + .0001);
    for (const poi of world.pois.slice(0, 2)) expect(Math.hypot(poi.x - c.x, poi.z - c.z)).toBeLessThan(c.r);
  }
  expect(positions.size).toBeGreaterThan(290);
});
