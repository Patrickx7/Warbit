// Tabela de XP e cash por ação. Cash vale o dobro dentro da Hot Zone.

export type RewardKind = 'kill' | 'headshot' | 'assist' | 'revive' | 'heal' | 'build' | 'mark' | 'presence' | 'win' | 'fob' | 'fobKill' | 'resupply';
export type ZoneWhere = 'out' | 'cz' | 'hz';

export interface RewardDef { label: string; xp: number; cash: number; cashCz?: number }

export const REWARDS: Record<RewardKind, RewardDef> = {
  kill: { label: 'Abate', xp: 100, cash: 2000 },
  headshot: { label: 'Headshot', xp: 25, cash: 300 },
  assist: { label: 'Assistência', xp: 50, cash: 500 },
  revive: { label: 'Aliado revivido', xp: 75, cash: 400, cashCz: 800 },
  heal: { label: 'Cura', xp: 10, cash: 150 },
  build: { label: 'Construção', xp: 20, cash: 200 },
  mark: { label: 'Alvo marcado abatido', xp: 25, cash: 300 },
  presence: { label: 'Presença na zona', xp: 10, cash: 250 },
  win: { label: 'Vitória', xp: 1000, cash: 10000 },
  fob: { label: 'FOB erguida', xp: 50, cash: 500 },
  fobKill: { label: 'FOB inimiga destruída', xp: 150, cash: 1500 },
  resupply: { label: 'Aliado reabastecido na FOB', xp: 5, cash: 50 },
};

/** Valor final de uma recompensa conforme onde o jogador está. */
export function rewardFor(kind: RewardKind, where: ZoneWhere): { label: string; xp: number; cash: number } {
  const d = REWARDS[kind];
  if (kind === 'win') return { label: d.label, xp: d.xp, cash: d.cash };
  let cash = where !== 'out' && d.cashCz !== undefined ? d.cashCz : d.cash;
  let xp = d.xp;
  let label = d.label;
  if (where === 'hz') { cash *= 2; xp *= 2; label += ' (Hot Zone x2)'; }
  return { label, xp, cash };
}
