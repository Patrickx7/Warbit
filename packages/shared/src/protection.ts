import { ARMOR_DURABILITY, HELMET_DURABILITY } from './config';
import { ARMOR_REDUCTION } from './items';

export function protectionCapacity(tier: number, head = false): number {
  return (head ? HELMET_DURABILITY : ARMOR_DURABILITY)[tier] ?? 0;
}

export function protectionPercent(remaining: number, tier: number, head = false): number {
  const capacity = protectionCapacity(tier, head);
  return capacity ? Math.ceil(Math.max(0, Math.min(capacity, remaining)) / capacity * 100) : 0;
}

/** Só o dano absorvido desgasta a peça; esgotada, ela deixa o restante passar. */
export function absorbDamage(damage: number, tier: number, remaining: number, scale = 1) {
  const absorbed = Math.min(Math.max(0, remaining), damage * (ARMOR_REDUCTION[tier] ?? 0) * scale);
  return { damage: damage - absorbed, remaining: Math.max(0, remaining - absorbed) };
}
