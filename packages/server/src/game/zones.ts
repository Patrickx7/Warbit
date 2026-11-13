import { CZ_BALANCE_MAX_SPREAD, CZ_CENTER_JITTER, type Point2, type Zone } from '@warbit/shared';

/** Compara a caminhada até a borda da zona, não apenas até o centro. */
export function chooseControlZone(bases: Point2[], radius: number, random: () => number): Zone {
  const center = bases.reduce((c, b) => ({ x: c.x + b.x / bases.length, z: c.z + b.z / bases.length }), { x: 0, z: 0 });
  for (let i = 0; i < 128; i++) {
    const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * CZ_CENTER_JITTER;
    const x = center.x + Math.cos(angle) * distance, z = center.z + Math.sin(angle) * distance;
    const approaches = bases.map(b => Math.max(0, Math.hypot(b.x - x, b.z - z) - radius));
    const mean = approaches.reduce((a, b) => a + b, 0) / approaches.length;
    if (Math.max(...approaches) - Math.min(...approaches) <= mean * CZ_BALANCE_MAX_SPREAD) return { x, z, r: radius };
  }
  return { ...center, r: radius };
}
