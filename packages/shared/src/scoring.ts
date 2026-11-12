import { CZ_RADIUS, HOT_ZONE_WEIGHT, HZ_RADIUS, SCORE_PER_PRESENCE_SECOND, TEAM_COUNT } from './config';
import type { ZoneWhere } from './rewards';

export interface Zone { x: number; z: number; r: number }

export function whereIs(x: number, z: number, cz: Zone, hz: Zone): ZoneWhere {
  const dh = (x - hz.x) * (x - hz.x) + (z - hz.z) * (z - hz.z);
  if (dh <= hz.r * hz.r) return 'hz';
  const dc = (x - cz.x) * (x - cz.x) + (z - cz.z) * (z - cz.z);
  return dc <= cz.r * cz.r ? 'cz' : 'out';
}

/** Presença por time: jogador na Control Zone conta 1, na Hot Zone conta 2. */
export function computePresence(players: Iterable<{ team: number; x: number; z: number }>, cz: Zone, hz: Zone): number[] {
  const p = new Array<number>(TEAM_COUNT).fill(0);
  for (const pl of players) {
    const w = whereIs(pl.x, pl.z, cz, hz);
    if (w === 'hz') p[pl.team] += HOT_ZONE_WEIGHT;
    else if (w === 'cz') p[pl.team] += 1;
  }
  return p;
}

/** Time que controla: maior presença estrita. Empate ou zona vazia = -1 (contestada). */
export function controllingTeam(presence: number[]): number {
  let best = -1, bestV = 0, tie = false;
  for (let t = 0; t < presence.length; t++) {
    if (presence[t] > bestV) { best = t; bestV = presence[t]; tie = false; }
    else if (presence[t] === bestV && bestV > 0) tie = true;
  }
  return tie ? -1 : best;
}

/** Pontos ganhos pelo time que controla num intervalo de `seconds`. */
export function pointsFor(presence: number[], seconds: number): { team: number; points: number } {
  const team = controllingTeam(presence);
  if (team < 0) return { team: -1, points: 0 };
  return { team, points: presence[team] * SCORE_PER_PRESENCE_SECOND * seconds };
}

export const DEFAULT_CZ_R = CZ_RADIUS;
export const DEFAULT_HZ_R = HZ_RADIUS;
